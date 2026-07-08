from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable

from flask import Blueprint, jsonify, request

from database import Database, dumps_json, loads_json, row_to_dict

MAX_FAVORITES = 12
MAX_SEARCH_HISTORY = 8
MAX_WEATHER_HISTORY = 100


def create_user_data_blueprint(
    current_user: Callable[[], dict[str, Any] | None],
    database: Database,
) -> Blueprint:
    api = Blueprint("user_data", __name__)

    def connect():
        return database.connect()

    def require_user() -> tuple[dict[str, Any] | None, tuple[Any, int] | None]:
        user = current_user()
        if not user:
            return None, (jsonify({"error": "Authentication required."}), 401)
        return user, None

    def normalize_city(value: Any) -> str:
        return " ".join(str(value or "").strip().split())

    def ensure_settings(user_id: int) -> dict[str, Any]:
        with connect() as connection:
            row = connection.execute(
                "SELECT * FROM user_settings WHERE user_id = ?",
                (user_id,),
            ).fetchone()
            if row:
                return row_to_dict(row) or {}

            now = datetime.now(timezone.utc).isoformat()
            connection.execute(
                """
                INSERT INTO user_settings (user_id, theme, units, default_city, notifications_enabled, updated_at)
                VALUES (?, 'system', 'metric', NULL, 1, ?)
                """,
                (user_id, now),
            )
            connection.commit()
            row = connection.execute(
                "SELECT * FROM user_settings WHERE user_id = ?",
                (user_id,),
            ).fetchone()
        return row_to_dict(row) or {}

    def public_settings(row: dict[str, Any] | None) -> dict[str, Any]:
        if not row:
            return {
                "theme": "system",
                "units": "metric",
                "default_city": None,
                "notifications_enabled": True,
                "updated_at": None,
            }
        return {
            "theme": row.get("theme") or "system",
            "units": row.get("units") or "metric",
            "default_city": row.get("default_city"),
            "notifications_enabled": bool(row.get("notifications_enabled", 1)),
            "updated_at": row.get("updated_at"),
        }

    @api.get("/api/users/me")
    def users_me():
        user, error = require_user()
        if error:
            return error
        settings = public_settings(ensure_settings(user["id"]))
        return jsonify({"user": user, "settings": settings})

    @api.get("/api/favorites")
    def list_favorites():
        user, error = require_user()
        if error:
            return error

        with connect() as connection:
            rows = connection.execute(
                """
                SELECT id, city, created_at
                FROM favorite_cities
                WHERE user_id = ?
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (user["id"], MAX_FAVORITES),
            ).fetchall()

        favorites = [row_to_dict(row) for row in rows]
        return jsonify({"favorites": favorites})

    @api.post("/api/favorites")
    def add_favorite():
        user, error = require_user()
        if error:
            return error

        payload = request.get_json(silent=True) or {}
        city = normalize_city(payload.get("city"))
        if not city:
            return jsonify({"error": "City is required."}), 400

        now = datetime.now(timezone.utc).isoformat()
        with connect() as connection:
            connection.execute(
                """
                INSERT INTO favorite_cities (user_id, city, created_at)
                VALUES (?, ?, ?)
                ON CONFLICT(user_id, city) DO UPDATE SET created_at = excluded.created_at
                """,
                (user["id"], city, now),
            )
            connection.execute(
                """
                DELETE FROM favorite_cities
                WHERE user_id = ?
                  AND id NOT IN (
                      SELECT id FROM favorite_cities
                      WHERE user_id = ?
                      ORDER BY created_at DESC
                      LIMIT ?
                  )
                """,
                (user["id"], user["id"], MAX_FAVORITES),
            )
            connection.commit()
            row = connection.execute(
                """
                SELECT id, city, created_at
                FROM favorite_cities
                WHERE user_id = ? AND lower(city) = lower(?)
                """,
                (user["id"], city),
            ).fetchone()

        return jsonify({"favorite": row_to_dict(row)})

    @api.put("/api/favorites")
    def replace_favorites():
        user, error = require_user()
        if error:
            return error

        payload = request.get_json(silent=True) or {}
        cities = payload.get("cities")
        if not isinstance(cities, list):
            return jsonify({"error": "cities must be an array."}), 400

        seen: set[str] = set()
        normalized: list[str] = []
        for item in cities:
            city = normalize_city(item)
            key = city.lower()
            if not city or key in seen:
                continue
            seen.add(key)
            normalized.append(city)
            if len(normalized) >= MAX_FAVORITES:
                break

        now = datetime.now(timezone.utc).isoformat()
        with connect() as connection:
            connection.execute("DELETE FROM favorite_cities WHERE user_id = ?", (user["id"],))
            for city in normalized:
                connection.execute(
                    "INSERT INTO favorite_cities (user_id, city, created_at) VALUES (?, ?, ?)",
                    (user["id"], city, now),
                )
            connection.commit()
            rows = connection.execute(
                """
                SELECT id, city, created_at
                FROM favorite_cities
                WHERE user_id = ?
                ORDER BY created_at DESC
                """,
                (user["id"],),
            ).fetchall()

        return jsonify({"favorites": [row_to_dict(row) for row in rows]})

    @api.delete("/api/favorites/<path:city>")
    def delete_favorite(city: str):
        user, error = require_user()
        if error:
            return error

        normalized = normalize_city(city)
        if not normalized:
            return jsonify({"error": "City is required."}), 400

        with connect() as connection:
            connection.execute(
                "DELETE FROM favorite_cities WHERE user_id = ? AND lower(city) = lower(?)",
                (user["id"], normalized),
            )
            connection.commit()

        return jsonify({"success": True})

    @api.get("/api/search-history")
    def list_search_history():
        user, error = require_user()
        if error:
            return error

        with connect() as connection:
            rows = connection.execute(
                """
                SELECT id, city, searched_at
                FROM search_history
                WHERE user_id = ?
                ORDER BY searched_at DESC
                LIMIT ?
                """,
                (user["id"], MAX_SEARCH_HISTORY),
            ).fetchall()

        return jsonify({"searches": [row_to_dict(row) for row in rows]})

    @api.post("/api/search-history")
    def add_search_history():
        user, error = require_user()
        if error:
            return error

        payload = request.get_json(silent=True) or {}
        city = normalize_city(payload.get("city"))
        if not city:
            return jsonify({"error": "City is required."}), 400

        now = datetime.now(timezone.utc).isoformat()
        with connect() as connection:
            connection.execute(
                "DELETE FROM search_history WHERE user_id = ? AND lower(city) = lower(?)",
                (user["id"], city),
            )
            connection.execute(
                "INSERT INTO search_history (user_id, city, searched_at) VALUES (?, ?, ?)",
                (user["id"], city, now),
            )
            connection.execute(
                """
                DELETE FROM search_history
                WHERE user_id = ?
                  AND id NOT IN (
                      SELECT id FROM search_history
                      WHERE user_id = ?
                      ORDER BY searched_at DESC
                      LIMIT ?
                  )
                """,
                (user["id"], user["id"], MAX_SEARCH_HISTORY),
            )
            connection.commit()
            row = connection.execute(
                """
                SELECT id, city, searched_at
                FROM search_history
                WHERE user_id = ? AND lower(city) = lower(?)
                """,
                (user["id"], city),
            ).fetchone()

        return jsonify({"search": row_to_dict(row)})

    @api.delete("/api/search-history")
    def clear_search_history():
        user, error = require_user()
        if error:
            return error

        with connect() as connection:
            connection.execute("DELETE FROM search_history WHERE user_id = ?", (user["id"],))
            connection.commit()

        return jsonify({"success": True})

    @api.get("/api/weather-history")
    def list_weather_history():
        user, error = require_user()
        if error:
            return error

        limit = request.args.get("limit", "50")
        try:
            limit_value = max(1, min(int(limit), MAX_WEATHER_HISTORY))
        except ValueError:
            limit_value = 50

        with connect() as connection:
            rows = connection.execute(
                """
                SELECT id, city, location_name, country, temperature, description, icon,
                       lat, lng, payload, recorded_at
                FROM weather_history
                WHERE user_id = ?
                ORDER BY recorded_at DESC
                LIMIT ?
                """,
                (user["id"], limit_value),
            ).fetchall()

        history = []
        for row in rows:
            item = row_to_dict(row) or {}
            item["payload"] = loads_json(item.pop("payload", None))
            history.append(item)

        return jsonify({"history": history})

    @api.post("/api/weather-history")
    def add_weather_history():
        user, error = require_user()
        if error:
            return error

        payload = request.get_json(silent=True) or {}
        weather = payload.get("weather") or payload
        city = normalize_city(payload.get("city") or weather.get("name"))
        if not city:
            return jsonify({"error": "City is required."}), 400

        now = datetime.now(timezone.utc).isoformat()
        with connect() as connection:
            connection.execute(
                """
                INSERT INTO weather_history (
                    user_id, city, location_name, country, temperature, description, icon,
                    lat, lng, payload, recorded_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    user["id"],
                    city,
                    weather.get("name"),
                    weather.get("country"),
                    weather.get("temperature"),
                    weather.get("description"),
                    weather.get("icon"),
                    weather.get("lat"),
                    weather.get("lng"),
                    dumps_json(weather),
                    now,
                ),
            )
            connection.execute(
                """
                DELETE FROM weather_history
                WHERE user_id = ?
                  AND id NOT IN (
                      SELECT id FROM weather_history
                      WHERE user_id = ?
                      ORDER BY recorded_at DESC
                      LIMIT ?
                  )
                """,
                (user["id"], user["id"], MAX_WEATHER_HISTORY),
            )
            connection.commit()
            row = connection.execute(
                """
                SELECT id, city, location_name, country, temperature, description, icon,
                       lat, lng, payload, recorded_at
                FROM weather_history
                WHERE user_id = ?
                ORDER BY recorded_at DESC
                LIMIT 1
                """,
                (user["id"],),
            ).fetchone()

        item = row_to_dict(row) or {}
        item["payload"] = loads_json(item.pop("payload", None))
        return jsonify({"entry": item})

    @api.delete("/api/weather-history")
    def clear_weather_history():
        user, error = require_user()
        if error:
            return error

        with connect() as connection:
            connection.execute("DELETE FROM weather_history WHERE user_id = ?", (user["id"],))
            connection.commit()

        return jsonify({"success": True})

    @api.delete("/api/weather-history/<int:entry_id>")
    def delete_weather_history(entry_id: int):
        user, error = require_user()
        if error:
            return error

        with connect() as connection:
            connection.execute(
                "DELETE FROM weather_history WHERE user_id = ? AND id = ?",
                (user["id"], entry_id),
            )
            connection.commit()

        return jsonify({"success": True})

    @api.get("/api/settings")
    def get_settings():
        user, error = require_user()
        if error:
            return error

        settings = public_settings(ensure_settings(user["id"]))
        return jsonify({"settings": settings})

    @api.put("/api/settings")
    def update_settings():
        user, error = require_user()
        if error:
            return error

        payload = request.get_json(silent=True) or {}
        current = ensure_settings(user["id"])

        theme = str(payload.get("theme", current.get("theme") or "system")).strip().lower()
        if theme not in {"light", "dark", "system"}:
            return jsonify({"error": "theme must be light, dark, or system."}), 400

        units = str(payload.get("units", current.get("units") or "metric")).strip().lower()
        if units not in {"metric", "imperial"}:
            return jsonify({"error": "units must be metric or imperial."}), 400

        default_city = normalize_city(payload.get("default_city", current.get("default_city") or ""))
        notifications_enabled = payload.get("notifications_enabled", current.get("notifications_enabled", 1))
        now = datetime.now(timezone.utc).isoformat()

        with connect() as connection:
            connection.execute(
                """
                INSERT INTO user_settings (
                    user_id, theme, units, default_city, notifications_enabled, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                    theme = excluded.theme,
                    units = excluded.units,
                    default_city = excluded.default_city,
                    notifications_enabled = excluded.notifications_enabled,
                    updated_at = excluded.updated_at
                """,
                (
                    user["id"],
                    theme,
                    units,
                    default_city or None,
                    1 if notifications_enabled else 0,
                    now,
                ),
            )
            if default_city:
                connection.execute(
                    "UPDATE users SET default_city = ? WHERE id = ?",
                    (default_city, user["id"]),
                )
            connection.commit()
            row = connection.execute(
                "SELECT * FROM user_settings WHERE user_id = ?",
                (user["id"],),
            ).fetchone()

        return jsonify({"settings": public_settings(row_to_dict(row))})

    return api
