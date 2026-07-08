# Installation Guide

This guide explains how to set up and run the Weather App on a local machine for development or demonstration.

## Prerequisites

| Requirement | Version |
|---|---|
| Python | 3.10 or higher recommended |
| pip | Latest |
| Web browser | Chrome, Edge, or Firefox (PWA install supported) |
| Internet | Required for live weather data |

### API keys

| Service | Purpose | Sign up |
|---|---|---|
| OpenWeather | Current weather, air quality, radar tiles | https://openweathermap.org/api |
| SerpAPI | Google Maps place search | https://serpapi.com/ |
| Google OAuth | Optional Google sign-in | https://console.cloud.google.com/ |

## 1. Clone the repository

```powershell
git clone <your-repository-url>
cd "weather app"
```

## 2. Create a virtual environment (recommended)

**Windows (PowerShell)**

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

**macOS / Linux**

```bash
python3 -m venv .venv
source .venv/bin/activate
```

## 3. Install dependencies

```powershell
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

Dependencies:

- `flask` — web server and routing
- `requests` — external API calls

## 4. Configure environment variables

Copy the example file and edit values:

```powershell
copy .env.example .env
```

**Windows (PowerShell)**

```powershell
$env:SECRET_KEY="your-long-random-secret"
$env:OPENWEATHER_API_KEY="your_openweather_key"
$env:SERPAPI_KEY="your_serpapi_key"
$env:APP_BASE_URL="http://127.0.0.1:5000"
```

**macOS / Linux**

```bash
export SECRET_KEY="your-long-random-secret"
export OPENWEATHER_API_KEY="your_openweather_key"
export SERPAPI_KEY="your_serpapi_key"
export APP_BASE_URL="http://127.0.0.1:5000"
```

### Optional: Google login

```powershell
$env:GOOGLE_CLIENT_ID="your-client-id"
$env:GOOGLE_CLIENT_SECRET="your-client-secret"
```

Set this redirect URI in Google Cloud Console:

```text
http://127.0.0.1:5000/api/auth/google/callback
```

## 5. Run the application

```powershell
python server.py
```

Open in your browser:

```text
http://127.0.0.1:5000/
```

The SQLite database is created automatically at `data/weather.db` on first run.

## 6. Verify the installation

1. Search for a city (e.g. **Kerala**) and confirm weather loads.
2. Open the map section and confirm radar layers appear.
3. Create an account via **Sign up** in the navbar.
4. Visit `/profile` and update your default city.
5. Install the PWA using **Install app** (Chrome/Edge) and test offline mode.

## Optional: CLI weather check

```powershell
python weather.py
```

Uses the same `OPENWEATHER_API_KEY` environment variable.

## Production notes

For deployment:

- Set `SESSION_COOKIE_SECURE=1` and `ENABLE_HSTS=1` behind HTTPS.
- Use a strong `SECRET_KEY` (never commit it).
- Set `FLASK_DEBUG=0`.
- Configure `APP_BASE_URL` to your public domain.
- Store API keys in your hosting provider's secret manager.

## Troubleshooting

| Issue | Solution |
|---|---|
| `OPENWEATHER_API_KEY is not configured` | Set the environment variable and restart the server |
| Map does not load | Scroll to the map section; Leaflet loads lazily on first view |
| Google login missing | Configure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` |
| Password reset link not received | In dev mode (`FLASK_DEBUG=1`), the reset URL is returned in the API response |
| Offline mode shows stale data | Expected behavior; service worker serves cached API responses |
