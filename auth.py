from __future__ import annotations

import os
import secrets
import time
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlencode

import requests
from flask import Blueprint, abort, jsonify, redirect, request, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash

from database import Database, get_database

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"
RESET_TOKEN_TTL_SECONDS = 3600


def create_auth_blueprint(database: Database | None = None) -> Blueprint:
    auth = Blueprint("auth", __name__)
    db = database or get_database()

    def connect():
        return db.connect()

    def init_db() -> None:
        db.init_db()

    def create_default_settings(user_id: int) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with connect() as connection:
            connection.execute(
                """
                INSERT OR IGNORE INTO user_settings (
                    user_id, theme, units, default_city, notifications_enabled, updated_at
                ) VALUES (?, 'system', 'metric', NULL, 1, ?)
                """,
                (user_id, now),
            )
            connection.commit()

    def public_user(row: Any) -> dict[str, Any] | None:
        if row is None:
            return None
        return {
            "id": row["id"],
            "email": row["email"],
            "name": row["name"],
            "avatar_url": row["avatar_url"],
            "default_city": row["default_city"],
            "provider": "google" if row["google_id"] else "email",
            "created_at": row["created_at"],
        }

    def get_user_by_id(user_id: int) -> Any:
        with connect() as connection:
            return connection.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()

    def get_user_by_email(email: str) -> Any:
        with connect() as connection:
            return connection.execute(
                "SELECT * FROM users WHERE lower(email) = lower(?)",
                (email.strip(),),
            ).fetchone()

    def get_user_by_google_id(google_id: str) -> Any:
        with connect() as connection:
            return connection.execute("SELECT * FROM users WHERE google_id = ?", (google_id,)).fetchone()

    def login_user(user_id: int) -> None:
        session.clear()
        session["user_id"] = user_id
        session.permanent = True

    def current_user() -> dict[str, Any] | None:
        user_id = session.get("user_id")
        if not user_id:
            return None
        return public_user(get_user_by_id(int(user_id)))

    def app_base_url() -> str:
        configured = os.environ.get("APP_BASE_URL", "").strip()
        if configured:
            return configured.rstrip("/")
        return request.url_root.rstrip("/")

    def google_redirect_uri() -> str:
        return f"{app_base_url()}/api/auth/google/callback"

    init_db()

    @auth.get("/api/auth/me")
    def me():
        user = current_user()
        if not user:
            return jsonify({"user": None})
        return jsonify({"user": user})

    @auth.post("/api/auth/signup")
    def signup():
        payload = request.get_json(silent=True) or {}
        name = str(payload.get("name") or "").strip()
        email = str(payload.get("email") or "").strip().lower()
        password = str(payload.get("password") or "")

        if not name or not email or not password:
            return jsonify({"error": "Name, email, and password are required."}), 400
        if len(password) < 8:
            return jsonify({"error": "Password must be at least 8 characters."}), 400
        if get_user_by_email(email):
            return jsonify({"error": "An account with this email already exists."}), 409

        password_hash = generate_password_hash(password)
        created_at = datetime.now(timezone.utc).isoformat()
        with connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO users (email, name, password_hash, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (email, name, password_hash, created_at),
            )
            connection.commit()
            user_id = int(cursor.lastrowid)

        create_default_settings(user_id)
        login_user(user_id)
        return jsonify({"user": public_user(get_user_by_id(user_id))})

    @auth.post("/api/auth/login")
    def login():
        payload = request.get_json(silent=True) or {}
        email = str(payload.get("email") or "").strip().lower()
        password = str(payload.get("password") or "")

        if not email or not password:
            return jsonify({"error": "Email and password are required."}), 400

        user = get_user_by_email(email)
        if not user or not user["password_hash"] or not check_password_hash(user["password_hash"], password):
            return jsonify({"error": "Invalid email or password."}), 401

        create_default_settings(int(user["id"]))
        login_user(int(user["id"]))
        return jsonify({"user": public_user(user)})

    @auth.post("/api/auth/logout")
    def logout():
        session.clear()
        return jsonify({"success": True})

    @auth.post("/api/auth/forgot-password")
    def forgot_password():
        payload = request.get_json(silent=True) or {}
        email = str(payload.get("email") or "").strip().lower()
        if not email:
            return jsonify({"error": "Email is required."}), 400

        user = get_user_by_email(email)
        response = {
            "message": "If an account with that email exists, password reset instructions have been sent."
        }

        if user and user["password_hash"]:
            token = secrets.token_urlsafe(32)
            expires = time.time() + RESET_TOKEN_TTL_SECONDS
            with connect() as connection:
                connection.execute(
                    "UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?",
                    (token, expires, user["id"]),
                )
                connection.commit()

            reset_url = f"{app_base_url()}/reset-password?token={token}"
            if os.environ.get("FLASK_DEBUG", "").lower() in {"1", "true", "yes"}:
                response["reset_url"] = reset_url

        return jsonify(response)

    @auth.post("/api/auth/reset-password")
    def reset_password():
        payload = request.get_json(silent=True) or {}
        token = str(payload.get("token") or "").strip()
        password = str(payload.get("password") or "")

        if not token or not password:
            return jsonify({"error": "Token and new password are required."}), 400
        if len(password) < 8:
            return jsonify({"error": "Password must be at least 8 characters."}), 400

        with connect() as connection:
            user = connection.execute(
                "SELECT * FROM users WHERE reset_token = ?",
                (token,),
            ).fetchone()

            if not user or not user["reset_token_expires"] or user["reset_token_expires"] < time.time():
                return jsonify({"error": "Invalid or expired reset token."}), 400

            connection.execute(
                """
                UPDATE users
                SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL
                WHERE id = ?
                """,
                (generate_password_hash(password), user["id"]),
            )
            connection.commit()

        login_user(int(user["id"]))
        return jsonify({
            "message": "Password updated successfully.",
            "user": public_user(get_user_by_id(int(user["id"]))),
        })

    @auth.put("/api/auth/profile")
    def update_profile():
        user = current_user()
        if not user:
            return jsonify({"error": "Authentication required."}), 401

        payload = request.get_json(silent=True) or {}
        name = str(payload.get("name") or user["name"]).strip()
        default_city = str(payload.get("default_city") or "").strip()

        if not name:
            return jsonify({"error": "Name is required."}), 400

        now = datetime.now(timezone.utc).isoformat()
        with connect() as connection:
            connection.execute(
                "UPDATE users SET name = ?, default_city = ? WHERE id = ?",
                (name, default_city or None, user["id"]),
            )
            connection.execute(
                """
                UPDATE user_settings
                SET default_city = ?, updated_at = ?
                WHERE user_id = ?
                """,
                (default_city or None, now, user["id"]),
            )
            connection.commit()

        return jsonify({"user": public_user(get_user_by_id(user["id"]))})

    @auth.get("/api/auth/google/config")
    def google_config():
        client_id = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
        return jsonify({
            "enabled": bool(client_id),
            "client_id": client_id,
            "auth_url": url_for("auth.google_login") if client_id else None,
        })

    @auth.get("/api/auth/google")
    def google_login():
        client_id = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
        if not client_id:
            return jsonify({"error": "Google login is not configured."}), 503

        params = {
            "client_id": client_id,
            "redirect_uri": google_redirect_uri(),
            "response_type": "code",
            "scope": "openid email profile",
            "access_type": "online",
            "prompt": "select_account",
        }
        return redirect(f"{GOOGLE_AUTH_URL}?{urlencode(params)}")

    @auth.get("/api/auth/google/callback")
    def google_callback():
        client_id = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
        client_secret = os.environ.get("GOOGLE_CLIENT_SECRET", "").strip()
        if not client_id or not client_secret:
            abort(503)

        error = request.args.get("error")
        if error:
            return redirect(f"/?auth_error={error}")

        code = request.args.get("code")
        if not code:
            return redirect("/?auth_error=missing_code")

        try:
            token_response = requests.post(
                GOOGLE_TOKEN_URL,
                data={
                    "code": code,
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "redirect_uri": google_redirect_uri(),
                    "grant_type": "authorization_code",
                },
                timeout=15,
            )
            token_response.raise_for_status()
            access_token = token_response.json().get("access_token")
            if not access_token:
                return redirect("/?auth_error=token_failed")

            profile_response = requests.get(
                GOOGLE_USERINFO_URL,
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=15,
            )
            profile_response.raise_for_status()
            profile = profile_response.json()
        except requests.RequestException:
            return redirect("/?auth_error=google_unavailable")

        google_id = profile.get("sub")
        email = str(profile.get("email") or "").strip().lower()
        name = str(profile.get("name") or email.split("@")[0] or "Google User").strip()
        avatar_url = profile.get("picture")

        if not google_id or not email:
            return redirect("/?auth_error=profile_incomplete")

        user = get_user_by_google_id(google_id)
        if not user:
            existing = get_user_by_email(email)
            if existing:
                with connect() as connection:
                    connection.execute(
                        """
                        UPDATE users
                        SET google_id = ?, avatar_url = COALESCE(avatar_url, ?)
                        WHERE id = ?
                        """,
                        (google_id, avatar_url, existing["id"]),
                    )
                    connection.commit()
                user_id = int(existing["id"])
            else:
                created_at = datetime.now(timezone.utc).isoformat()
                with connect() as connection:
                    cursor = connection.execute(
                        """
                        INSERT INTO users (email, name, google_id, avatar_url, created_at)
                        VALUES (?, ?, ?, ?, ?)
                        """,
                        (email, name, google_id, avatar_url, created_at),
                    )
                    connection.commit()
                    user_id = int(cursor.lastrowid)
        else:
            user_id = int(user["id"])
            with connect() as connection:
                connection.execute(
                    "UPDATE users SET avatar_url = COALESCE(?, avatar_url), name = ? WHERE id = ?",
                    (avatar_url, name, user_id),
                )
                connection.commit()

        create_default_settings(user_id)
        login_user(user_id)
        return redirect("/profile")

    auth.init_db = init_db
    auth.current_user = current_user
    auth.database = db
    return auth
