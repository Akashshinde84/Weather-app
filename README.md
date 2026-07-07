# Weather + Map App

This Flask app shows weather from OpenWeather and an interactive Leaflet map.

- Use **Current Location** (browser GPS) and drop a marker
- Search places via **SerpAPI Google Maps engine** and drop a marker for a selected result
- Keep API keys on the Flask backend instead of exposing them in browser JavaScript

## Project structure

```text
server.py              Flask app and API routes
weather.py             Optional command-line weather lookup
templates/index.html   Main page template
static/css/styles.css  App styles
static/js/script.js    Browser interaction logic
requirements.txt       Python dependencies
```

## Run locally (Windows / PowerShell)

From the project folder:

```powershell
python -m pip install -r requirements.txt
$env:OPENWEATHER_API_KEY="YOUR_OPENWEATHER_KEY"
$env:SERPAPI_KEY="YOUR_SERPAPI_KEY"
python server.py
```

Then open `http://127.0.0.1:5000/`.

## Optional CLI weather check

`weather.py` uses the same `OPENWEATHER_API_KEY` environment variable:

```powershell
python weather.py
```
