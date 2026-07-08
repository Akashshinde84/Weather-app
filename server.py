from __future__ import annotations

import os
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import requests
from flask import Flask, Response, jsonify, render_template, request, send_from_directory

from auth import create_auth_blueprint
from database import get_database
from user_api import create_user_data_blueprint


OPENWEATHER_URL = "https://api.openweathermap.org/data/2.5/weather"
OPENWEATHER_AIR_POLLUTION_URL = "https://api.openweathermap.org/data/2.5/air_pollution"
OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
SERPAPI_URL = "https://serpapi.com/search"
REQUEST_TIMEOUT_SECONDS = 15
CACHE_TTL_SECONDS = 300

_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_binary_cache: dict[str, tuple[float, bytes, str]] = {}
WEATHER_TILE_LAYERS = {
    "rain": "precipitation_new",
    "cloud": "clouds_new",
    "wind": "wind_new",
    "temperature": "temp_new",
}


def create_app() -> Flask:
    app = Flask(__name__)
    app.secret_key = os.environ.get("SECRET_KEY", "dev-weather-app-secret-change-me")
    app.config["SESSION_COOKIE_HTTPONLY"] = True
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
    app.config["SESSION_COOKIE_SECURE"] = os.environ.get("SESSION_COOKIE_SECURE", "").lower() in {"1", "true", "yes"}
    app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=14)
    app.config["SEND_FILE_MAX_AGE_DEFAULT"] = int(os.environ.get("STATIC_MAX_AGE", "31536000"))

    auth = create_auth_blueprint(get_database())
    app.register_blueprint(auth)
    app.register_blueprint(create_user_data_blueprint(auth.current_user, get_database()))

    @app.after_request
    def add_response_headers(response: Response):
        path = request.path
        if path.startswith("/static/"):
            response.headers.setdefault("Cache-Control", "public, max-age=31536000, immutable")
        elif path in {"/sw.js", "/manifest.webmanifest"}:
            response.headers.setdefault("Cache-Control", "no-cache")
        elif path.startswith("/api/"):
            response.headers.setdefault("Cache-Control", "private, no-store")

        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "geolocation=(self), camera=(), microphone=()")
        response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        if os.environ.get("ENABLE_HSTS", "").lower() in {"1", "true", "yes"}:
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return response

    @app.get("/robots.txt")
    def robots_txt():
        base = (os.environ.get("APP_BASE_URL") or request.url_root).rstrip("/")
        content = f"User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: {base}/sitemap.xml\n"
        return Response(content, mimetype="text/plain")

    @app.get("/sitemap.xml")
    def sitemap_xml():
        base = (os.environ.get("APP_BASE_URL") or request.url_root).rstrip("/")
        pages = ["/", "/profile"]
        urls = "\n".join(
            f"  <url><loc>{base}{page}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>"
            for page in pages
        )
        xml = (
            '<?xml version="1.0" encoding="UTF-8"?>'
            f'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{urls}</urlset>'
        )
        return Response(xml, mimetype="application/xml")

    @app.get("/")
    def index():
        return render_template("index.html")

    @app.get("/profile")
    def profile_page():
        user = auth.current_user()
        if not user:
            return render_template("login_required.html", next_path="/profile")
        return render_template("profile.html", user=user)

    @app.get("/reset-password")
    def reset_password_page():
        return render_template("reset_password.html", token=request.args.get("token", ""))

    @app.get("/sw.js")
    def service_worker():
        response = send_from_directory(app.static_folder, "sw.js", mimetype="application/javascript")
        response.headers["Cache-Control"] = "no-cache"
        return response

    @app.get("/manifest.webmanifest")
    def manifest():
        return send_from_directory(
            app.static_folder,
            "manifest.webmanifest",
            mimetype="application/manifest+json",
        )

    @app.get("/offline.html")
    def offline_page():
        return send_from_directory(app.static_folder, "offline.html")

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
            weather_payload = _normalize_weather(payload)
            weather_payload["air_quality"] = _fetch_air_quality(
                lat=weather_payload.get("lat"),
                lng=weather_payload.get("lng"),
                api_key=api_key,
            )
            return jsonify({"weather": weather_payload})
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

    @app.get("/api/hourly-forecast")
    def hourly_forecast():
        lat = request.args.get("lat")
        lng = request.args.get("lng")

        if not _valid_coordinate_pair(lat, lng):
            return jsonify({"error": "Provide valid lat/lng coordinates."}), 400

        params = {
            "latitude": lat,
            "longitude": lng,
            "hourly": "temperature_2m,precipitation_probability,wind_speed_10m,weather_code",
            "forecast_days": "2",
            "timezone": "auto",
        }

        try:
            payload = _cached_get(OPEN_METEO_FORECAST_URL, params)
            return jsonify({"forecast": _normalize_hourly_forecast(payload)})
        except requests.RequestException:
            return jsonify({"error": "Hourly forecast service is currently unavailable."}), 502

    @app.get("/api/daily-forecast")
    def daily_forecast():
        lat = request.args.get("lat")
        lng = request.args.get("lng")

        if not _valid_coordinate_pair(lat, lng):
            return jsonify({"error": "Provide valid lat/lng coordinates."}), 400

        params = {
            "latitude": lat,
            "longitude": lng,
            "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max",
            "hourly": "relative_humidity_2m",
            "forecast_days": "7",
            "timezone": "auto",
        }

        try:
            payload = _cached_get(OPEN_METEO_FORECAST_URL, params)
            return jsonify({"forecast": _normalize_daily_forecast(payload)})
        except requests.RequestException:
            return jsonify({"error": "7-day forecast service is currently unavailable."}), 502

    @app.get("/api/radar-frames")
    def radar_frames():
        now = int(time.time())
        interval = 600
        latest = now - (now % interval)
        frame_count = 12
        frames = [latest - (frame_count - 1 - index) * interval for index in range(frame_count)]
        return jsonify({
            "frames": frames,
            "interval_seconds": interval,
            "latest": latest,
        })

    @app.get("/api/weather-tile/<layer>/<int:z>/<int:x>/<int:y>.png")
    def weather_tile(layer: str, z: int, x: int, y: int):
        tile_layer = WEATHER_TILE_LAYERS.get(layer)
        if tile_layer is None:
            return jsonify({"error": "Unknown radar layer."}), 404

        api_key = os.environ.get("OPENWEATHER_API_KEY")
        if not api_key:
            return jsonify({"error": "OPENWEATHER_API_KEY is not configured on the server."}), 500

        url = f"https://tile.openweathermap.org/map/{tile_layer}/{z}/{x}/{y}.png"
        params = {"appid": api_key}
        date = request.args.get("date")
        if date:
            try:
                params["date"] = str(int(date))
            except ValueError:
                return jsonify({"error": "Invalid date parameter."}), 400

        try:
            content, content_type = _cached_binary_get(url, params)
        except requests.HTTPError as exc:
            status_code = exc.response.status_code if exc.response is not None else 502
            return jsonify({"error": "Weather radar tile unavailable."}), status_code
        except requests.RequestException:
            return jsonify({"error": "Weather radar service is currently unavailable."}), 502

        return Response(content, mimetype=content_type)

    return app


def _build_weather_params(city: str, lat: str | None, lng: str | None) -> dict[str, str] | None:
    if city:
        return {"q": city}

    if not _valid_coordinate_pair(lat, lng):
        return None

    return {"lat": lat, "lon": lng}


def _valid_coordinate_pair(lat: str | None, lng: str | None) -> bool:
    if lat is None or lng is None:
        return False

    try:
        lat_number = float(lat)
        lng_number = float(lng)
    except ValueError:
        return False

    return -90 <= lat_number <= 90 and -180 <= lng_number <= 180


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


def _cached_binary_get(url: str, params: dict[str, str]) -> tuple[bytes, str]:
    key = _cache_key(url, params)
    now = time.time()
    cached = _binary_cache.get(key)

    if cached and now - cached[0] < CACHE_TTL_SECONDS:
        return cached[1], cached[2]

    response = requests.get(url, params=params, timeout=REQUEST_TIMEOUT_SECONDS)
    response.raise_for_status()
    content_type = response.headers.get("Content-Type") or "image/png"
    _binary_cache[key] = (now, response.content, content_type)
    return response.content, content_type


def _fetch_air_quality(lat: Any, lng: Any, api_key: str) -> dict[str, Any] | None:
    if lat is None or lng is None:
        return None

    params = {
        "lat": str(lat),
        "lon": str(lng),
        "appid": api_key,
    }

    try:
        payload = _cached_get(OPENWEATHER_AIR_POLLUTION_URL, params)
    except requests.RequestException:
        return None

    return _normalize_air_quality(payload)


def _normalize_air_quality(payload: dict[str, Any]) -> dict[str, Any] | None:
    items = payload.get("list") or []
    if not items:
        return None

    current = items[0] or {}
    main = current.get("main") or {}
    components = current.get("components") or {}
    aqi = main.get("aqi")

    return {
        "aqi": aqi,
        "label": _aqi_label(aqi),
        "advice": _aqi_health_advice(aqi),
        "components": {
            "pm2_5": components.get("pm2_5"),
            "pm10": components.get("pm10"),
            "co": components.get("co"),
            "so2": components.get("so2"),
            "no2": components.get("no2"),
        },
    }


def _aqi_label(aqi: Any) -> str:
    try:
        index = int(aqi)
    except (TypeError, ValueError):
        return "Unavailable"

    labels = {
        1: "Good",
        2: "Fair",
        3: "Moderate",
        4: "Poor",
        5: "Very Poor",
    }
    return labels.get(index, "Unavailable")


def _aqi_health_advice(aqi: Any) -> str:
    try:
        index = int(aqi)
    except (TypeError, ValueError):
        return "Air quality data is unavailable for this location."

    advice = {
        1: "Air quality looks good. Outdoor plans are comfortable for most people.",
        2: "Air quality is acceptable. Sensitive people may want to keep intense outdoor activity moderate.",
        3: "Air quality is moderate. Sensitive groups should consider shorter outdoor exposure.",
        4: "Air quality is poor. Reduce long or intense outdoor activity, especially if you are sensitive to pollution.",
        5: "Air quality is very poor. Limit outdoor exertion and keep windows closed when possible.",
    }
    return advice.get(index, "Air quality data is unavailable for this location.")


def _normalize_weather(payload: dict[str, Any]) -> dict[str, Any]:
    main = payload.get("main") or {}
    weather_items = payload.get("weather") or [{}]
    weather = weather_items[0] if weather_items else {}
    coord = payload.get("coord") or {}
    sys = payload.get("sys") or {}
    wind = payload.get("wind") or {}
    clouds = payload.get("clouds") or {}
    description = weather.get("description") or "No description available"
    temperature = main.get("temp")
    feels_like = main.get("feels_like")
    humidity = main.get("humidity")
    wind_speed = wind.get("speed")
    cloud_cover = clouds.get("all")

    return {
        "name": payload.get("name") or "Unknown location",
        "country": sys.get("country") or "",
        "temperature": temperature,
        "feels_like": feels_like,
        "humidity": humidity,
        "pressure": main.get("pressure"),
        "wind_speed": wind_speed,
        "visibility": payload.get("visibility"),
        "sunrise": sys.get("sunrise"),
        "sunset": sys.get("sunset"),
        "timezone": payload.get("timezone"),
        "clouds": cloud_cover,
        "description": description,
        "icon": weather.get("icon") or "01d",
        "summary": _build_weather_summary(
            description=description,
            temperature=temperature,
            feels_like=feels_like,
            humidity=humidity,
            wind_speed=wind_speed,
            clouds=cloud_cover,
        ),
        "lat": coord.get("lat"),
        "lng": coord.get("lon"),
    }


def _format_optional_number(value: Any, suffix: str = "") -> str:
    if value is None:
        return "unknown"

    try:
        number = float(value)
    except (TypeError, ValueError):
        return "unknown"

    rounded = round(number)
    return f"{rounded:g}{suffix}"


def _build_weather_summary(
    *,
    description: str,
    temperature: Any,
    feels_like: Any,
    humidity: Any,
    wind_speed: Any,
    clouds: Any,
) -> str:
    temp_text = _format_optional_number(temperature, " C")
    feels_text = _format_optional_number(feels_like, " C")
    humidity_text = _format_optional_number(humidity, "%")
    wind_text = _format_optional_number(wind_speed, " m/s")
    cloud_text = _format_optional_number(clouds, "%")

    return (
        f"{description.capitalize()} with a temperature near {temp_text}, "
        f"feeling like {feels_text}. Humidity is {humidity_text}, "
        f"winds are around {wind_text}, and cloud cover is {cloud_text}."
    )


def _normalize_hourly_forecast(payload: dict[str, Any]) -> list[dict[str, Any]]:
    hourly = payload.get("hourly") or {}
    times = hourly.get("time") or []
    temperatures = hourly.get("temperature_2m") or []
    rain_chances = hourly.get("precipitation_probability") or []
    wind_speeds = hourly.get("wind_speed_10m") or []
    weather_codes = hourly.get("weather_code") or []
    forecast: list[dict[str, Any]] = []
    start_index = _next_hour_start_index(times, payload.get("utc_offset_seconds"))

    for index in range(start_index, min(start_index + 24, len(times))):
        time_value = times[index]
        code = _get_indexed(weather_codes, index)
        condition = _weather_code_description(code)

        forecast.append(
            {
                "time": time_value,
                "temperature": _get_indexed(temperatures, index),
                "rain_chance": _get_indexed(rain_chances, index),
                "wind_speed": _get_indexed(wind_speeds, index),
                "weather_code": code,
                "description": condition["description"],
                "icon": condition["icon"],
            }
        )

    return forecast


def _normalize_daily_forecast(payload: dict[str, Any]) -> list[dict[str, Any]]:
    daily = payload.get("daily") or {}
    times = daily.get("time") or []
    highs = daily.get("temperature_2m_max") or []
    lows = daily.get("temperature_2m_min") or []
    rain_chances = daily.get("precipitation_probability_max") or []
    wind_speeds = daily.get("wind_speed_10m_max") or []
    weather_codes = daily.get("weather_code") or []
    humidity_by_day = _average_hourly_humidity_by_day(payload)
    forecast: list[dict[str, Any]] = []

    for index in range(min(7, len(times))):
        day = times[index]
        high = _get_indexed(highs, index)
        low = _get_indexed(lows, index)
        code = _get_indexed(weather_codes, index)
        condition = _weather_code_description(code)

        forecast.append(
            {
                "date": day,
                "temperature": _average_temperature(high, low),
                "high": high,
                "low": low,
                "rain_chance": _get_indexed(rain_chances, index),
                "wind_speed": _get_indexed(wind_speeds, index),
                "humidity": humidity_by_day.get(day),
                "weather_code": code,
                "description": condition["description"],
                "icon": condition["icon"],
            }
        )

    return forecast


def _average_hourly_humidity_by_day(payload: dict[str, Any]) -> dict[str, int]:
    hourly = payload.get("hourly") or {}
    times = hourly.get("time") or []
    humidity_values = hourly.get("relative_humidity_2m") or []
    daily_values: dict[str, list[float]] = {}

    for index, time_value in enumerate(times):
        humidity = _get_indexed(humidity_values, index)
        try:
            number = float(humidity)
        except (TypeError, ValueError):
            continue

        day = str(time_value).split("T", 1)[0]
        daily_values.setdefault(day, []).append(number)

    return {
        day: round(sum(values) / len(values))
        for day, values in daily_values.items()
        if values
    }


def _average_temperature(high: Any, low: Any) -> float | None:
    try:
        return round((float(high) + float(low)) / 2, 1)
    except (TypeError, ValueError):
        return None


def _next_hour_start_index(times: list[str], utc_offset_seconds: Any) -> int:
    try:
        offset = int(utc_offset_seconds or 0)
    except (TypeError, ValueError):
        offset = 0

    location_now = datetime.now(timezone.utc) + timedelta(seconds=offset)
    current_hour = location_now.replace(minute=0, second=0, microsecond=0, tzinfo=None)

    for index, time_value in enumerate(times):
        try:
            forecast_hour = datetime.fromisoformat(time_value)
        except (TypeError, ValueError):
            continue

        if forecast_hour >= current_hour:
            return index

    return 0


def _get_indexed(values: list[Any], index: int) -> Any:
    return values[index] if index < len(values) else None


def _weather_code_description(code: Any) -> dict[str, str]:
    try:
        weather_code = int(code)
    except (TypeError, ValueError):
        weather_code = -1

    if weather_code == 0:
        return {"description": "Clear sky", "icon": "sunny"}
    if weather_code in {1, 2}:
        return {"description": "Partly cloudy", "icon": "cloudy"}
    if weather_code == 3:
        return {"description": "Overcast", "icon": "cloudy"}
    if weather_code in {45, 48}:
        return {"description": "Fog", "icon": "mist"}
    if weather_code in {51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82}:
        return {"description": "Rain likely", "icon": "rain"}
    if weather_code in {71, 73, 75, 77, 85, 86}:
        return {"description": "Snow", "icon": "snow"}
    if weather_code in {95, 96, 99}:
        return {"description": "Thunderstorm", "icon": "storm"}

    return {"description": "Mixed conditions", "icon": "cloudy"}


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

