# API Documentation

Base URL (local): `http://127.0.0.1:5000`

All JSON APIs accept and return `application/json` unless noted otherwise.

## Authentication

Session-based authentication uses HTTP cookies. Authenticated routes return `401` when no valid session exists.

---

## Auth endpoints

### GET `/api/auth/me`

Returns the current signed-in user, or `null`.

**Response 200**

```json
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "User Name",
    "avatar_url": null,
    "default_city": "Kerala",
    "provider": "email",
    "created_at": "2026-07-08T12:00:00+00:00"
  }
}
```

---

### POST `/api/auth/signup`

Create a new account and start a session.

**Body**

```json
{
  "name": "User Name",
  "email": "user@example.com",
  "password": "password123"
}
```

**Response 200** — user object  
**Errors** — `400` validation, `409` email exists

---

### POST `/api/auth/login`

Sign in with email and password.

**Body**

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response 200** — user object  
**Errors** — `401` invalid credentials

---

### POST `/api/auth/logout`

End the current session.

**Response 200**

```json
{ "success": true }
```

---

### POST `/api/auth/forgot-password`

Request a password reset token.

**Body**

```json
{ "email": "user@example.com" }
```

**Response 200**

```json
{
  "message": "If an account with that email exists, password reset instructions have been sent.",
  "reset_url": "http://127.0.0.1:5000/reset-password?token=..."
}
```

`reset_url` is included only when `FLASK_DEBUG=1`.

---

### POST `/api/auth/reset-password`

Reset password using a token.

**Body**

```json
{
  "token": "reset-token",
  "password": "newpassword123"
}
```

**Response 200** — message and user object

---

### PUT `/api/auth/profile`

Update profile (requires auth).

**Body**

```json
{
  "name": "Updated Name",
  "default_city": "Mumbai"
}
```

---

### GET `/api/auth/google/config`

Returns Google OAuth availability.

---

### GET `/api/auth/google`

Redirects to Google OAuth consent screen.

---

### GET `/api/auth/google/callback`

OAuth callback; redirects to `/profile` on success.

---

## User data endpoints (auth required)

### GET `/api/users/me`

Returns user and settings.

**Response 200**

```json
{
  "user": { "...": "..." },
  "settings": {
    "theme": "dark",
    "units": "metric",
    "default_city": "Kerala",
    "notifications_enabled": true,
    "updated_at": "2026-07-08T12:00:00+00:00"
  }
}
```

---

### Favorites

| Method | Path | Description |
|---|---|---|
| GET | `/api/favorites` | List favorite cities |
| POST | `/api/favorites` | Add `{ "city": "Goa" }` |
| PUT | `/api/favorites` | Replace `{ "cities": ["Goa", "Kerala"] }` |
| DELETE | `/api/favorites/<city>` | Remove a favorite |

---

### Search history

| Method | Path | Description |
|---|---|---|
| GET | `/api/search-history` | List recent searches |
| POST | `/api/search-history` | Add `{ "city": "Delhi" }` |
| DELETE | `/api/search-history` | Clear all history |

---

### Weather history

| Method | Path | Description |
|---|---|---|
| GET | `/api/weather-history?limit=50` | List saved lookups |
| POST | `/api/weather-history` | Save `{ "city": "...", "weather": {...} }` |
| DELETE | `/api/weather-history` | Clear all |
| DELETE | `/api/weather-history/<id>` | Delete one entry |

---

### Settings

| Method | Path | Description |
|---|---|---|
| GET | `/api/settings` | Get user settings |
| PUT | `/api/settings` | Update settings |

**PUT body example**

```json
{
  "theme": "dark",
  "units": "metric",
  "default_city": "Kerala",
  "notifications_enabled": true
}
```

---

## Weather endpoints (public)

### GET `/api/weather`

Fetch current weather by city or coordinates.

**Query parameters**

| Param | Required | Description |
|---|---|---|
| `city` | One of city or lat/lng | City name |
| `lat` | One of city or lat/lng | Latitude |
| `lng` | One of city or lat/lng | Longitude |

**Example**

```text
GET /api/weather?city=Kerala
GET /api/weather?lat=10.0&lng=76.0
```

**Response 200**

```json
{
  "weather": {
    "name": "Kochi",
    "country": "IN",
    "temperature": 28,
    "feels_like": 31,
    "humidity": 78,
    "description": "light rain",
    "icon": "10d",
    "lat": 9.93,
    "lng": 76.26,
    "air_quality": { "aqi": 2, "label": "Fair", "...": "..." }
  }
}
```

---

### GET `/api/hourly-forecast`

**Query:** `lat`, `lng`  
**Response:** `{ "forecast": [ ...24 hours... ] }`

---

### GET `/api/daily-forecast`

**Query:** `lat`, `lng`  
**Response:** `{ "forecast": [ ...7 days... ] }`

---

### GET `/api/maps-search`

Search places via SerpAPI.

**Query:** `q` (place name)  
**Response:** `{ "places": [ { "title", "address", "lat", "lng" } ] }`

---

### GET `/api/radar-frames`

Returns radar animation frame timestamps.

**Response**

```json
{
  "frames": [1783519200, "..."],
  "interval_seconds": 600,
  "latest": 1783519200
}
```

---

### GET `/api/weather-tile/<layer>/<z>/<x>/<y>.png`

Proxy for OpenWeather map tiles.

**Layers:** `rain`, `cloud`, `wind`, `temperature`  
**Query (optional):** `date` — Unix timestamp for historical frame

---

## PWA and SEO routes

| Path | Description |
|---|---|
| `/manifest.webmanifest` | PWA manifest |
| `/sw.js` | Service worker |
| `/offline.html` | Offline fallback page |
| `/robots.txt` | Crawler rules |
| `/sitemap.xml` | Sitemap |

---

## Error format

```json
{ "error": "Human-readable error message" }
```

Common status codes: `400`, `401`, `404`, `409`, `500`, `502`.
