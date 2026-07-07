from __future__ import annotations

import os

import requests


OPENWEATHER_URL = "https://api.openweathermap.org/data/2.5/weather"
REQUEST_TIMEOUT_SECONDS = 15


def get_weather(city: str, api_key: str) -> dict:
    response = requests.get(
        OPENWEATHER_URL,
        params={"q": city, "appid": api_key, "units": "metric"},
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    return response.json()


def print_weather(data: dict) -> None:
    main = data["main"]
    weather_desc = data["weather"][0]["description"]

    print(f"Temperature: {main['temp']} C")
    print(f"Humidity: {main['humidity']}%")
    print(f"Weather Description: {weather_desc}")


def main() -> None:
    api_key = os.environ.get("OPENWEATHER_API_KEY")
    if not api_key:
        raise SystemExit("Set OPENWEATHER_API_KEY before running this script.")

    city_name = input("Enter city name: ").strip()
    if not city_name:
        raise SystemExit("City name is required.")

    try:
        print_weather(get_weather(city_name, api_key))
    except requests.HTTPError as exc:
        if exc.response is not None and exc.response.status_code == 404:
            raise SystemExit("City not found.") from exc
        raise SystemExit("Weather request failed.") from exc
    except requests.RequestException as exc:
        raise SystemExit("Weather service is currently unavailable.") from exc


if __name__ == "__main__":
    main()
