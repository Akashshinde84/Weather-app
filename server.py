from __future__ import annotations

import os
import time
from typing import Any

import requests
from flask import Flask, jsonify, render_template, request


OPENWEATHER_URL = "https://api.openweathermap.org/data/2.5/weather"
SERPAPI_URL = "https://serpapi.com/search"
REQUEST_TIMEOUT_SECONDS = 15
CACHE_TTL_SECONDS = 300

_cache: dict[str, tuple[float, dict[str, Any]]] = {}


def create_app() -> Flask:
    app = Flask(__name__)

    @app.get("/")
    def index():
        return render_template("index.html")

    @app.get("/api/weather")
    def weather():
        city = (request.args.get("city") or "").strip()
        lat = request.args.get("lat")
        lng = request.args.get("lng")

        params = _build_weather_params(city=city, lat=lat, lng=lng)
        if params is None:
            return jsonify({"error": "Provide either city or lat/lng."}), 400

        api_key = os.environ.get("OPENWEATHER_API_KEY")
        if not api_key:
            return jsonify({"error": "OPENWEATHER_API_KEY is not configured on the server."}), 500

        params["appid"] = api_key
        params["units"] = "metric"

        try:
            payload = _cached_get(OPENWEATHER_URL, params)
            return jsonify({"weather": _normalize_weather(payload)})
        except requests.HTTPError as exc:
            status_code = exc.response.status_code if exc.response is not None else 502
            message = "City not found" if status_code == 404 else "OpenWeather request failed"
            return jsonify({"error": message}), 404 if status_code == 404 else 502
        except requests.RequestException:
            return jsonify({"error": "Weather service is currently unavailable."}), 502

    @app.get("/api/maps-search")
    def maps_search():
        q = (request.args.get("q") or "").strip()
        if not q:
            return jsonify({"error": "Missing query parameter: q"}), 400

        api_key = os.environ.get("SERPAPI_KEY")
        if not api_key:
            return jsonify({"error": "SERPAPI_KEY is not configured on the server."}), 500

        params = {
            "engine": "google_maps",
            "q": q,
            "api_key": api_key,
        }

        try:
            data = _cached_get(SERPAPI_URL, params)
            return jsonify({"places": _normalize_places(data)})
        except requests.RequestException:
            return jsonify({"error": "Place search service is currently unavailable."}), 502

    return app


def _build_weather_params(city: str, lat: str | None, lng: str | None) -> dict[str, str] | None:
    if city:
        return {"q": city}

    if lat is None or lng is None:
        return None

    try:
        float(lat)
        float(lng)
    except ValueError:
        return None

    return {"lat": lat, "lon": lng}


def _cache_key(url: str, params: dict[str, str]) -> str:
    public_params = {key: value for key, value in params.items() if key != "api_key" and key != "appid"}
    parts = "&".join(f"{key}={public_params[key]}" for key in sorted(public_params))
    return f"{url}?{parts}"


def _cached_get(url: str, params: dict[str, str]) -> dict[str, Any]:
    key = _cache_key(url, params)
    now = time.time()
    cached = _cache.get(key)

    if cached and now - cached[0] < CACHE_TTL_SECONDS:
        return cached[1]

    response = requests.get(url, params=params, timeout=REQUEST_TIMEOUT_SECONDS)
    response.raise_for_status()
    data = response.json()
    _cache[key] = (now, data)
    return data


def _normalize_weather(payload: dict[str, Any]) -> dict[str, Any]:
    main = payload.get("main") or {}
    weather_items = payload.get("weather") or [{}]
    weather = weather_items[0] if weather_items else {}
    coord = payload.get("coord") or {}
    sys = payload.get("sys") or {}

    return {
        "name": payload.get("name") or "Unknown location",
        "country": sys.get("country") or "",
        "temperature": main.get("temp"),
        "humidity": main.get("humidity"),
        "description": weather.get("description") or "No description available",
        "icon": weather.get("icon") or "01d",
        "lat": coord.get("lat"),
        "lng": coord.get("lon"),
    }


def _normalize_places(payload: dict[str, Any]) -> list[dict[str, Any]]:
    places: list[dict[str, Any]] = []

    for result in payload.get("local_results") or []:
        gps = result.get("gps_coordinates") or {}
        lat = gps.get("latitude")
        lng = gps.get("longitude")

        if lat is None or lng is None:
            continue

        places.append(
            {
                "title": result.get("title") or result.get("name") or "Place",
                "address": result.get("address") or result.get("formatted_address") or "",
                "lat": lat,
                "lng": lng,
            }
        )

    return places


app = create_app()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)

