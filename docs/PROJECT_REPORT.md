# Project Report

## Weather Intelligence Web Application

**Project type:** Full-stack weather dashboard with maps, radar, user accounts, and PWA support  
**Stack:** Python (Flask), SQLite, HTML/CSS/JavaScript, Leaflet, Chart.js  
**Date:** July 2026

---

## 1. Introduction

### 1.1 Background

Weather information affects daily decisions—from travel and clothing to farming and outdoor activities. Most weather sites either show basic forecasts or overload users with raw data. This project delivers a unified dashboard that combines live weather, interactive maps, radar animation, intelligent summaries, and personalized storage in a installable progressive web app.

### 1.2 Problem statement

Users need a single application that:

- Shows accurate, location-aware weather and forecasts
- Visualizes conditions on an interactive map with radar layers
- Provides actionable advice (travel, farming, safety alerts)
- Remembers favorites and search history across sessions
- Works offline after initial load

### 1.3 Objectives

1. Build a Flask backend that proxies third-party APIs and keeps secrets server-side
2. Create a responsive frontend with maps, charts, and radar animation
3. Implement user authentication and SQLite-backed personalization
4. Add PWA capabilities for install and offline use
5. Apply performance, accessibility, and security best practices

---

## 2. System design

### 2.1 Architecture

The application follows a three-tier architecture:

| Tier | Components |
|---|---|
| Client | Browser UI, JavaScript modules, service worker |
| Server | Flask routes, auth blueprint, user data APIs |
| Data | SQLite database; external weather and maps APIs |

See [ARCHITECTURE.md](./ARCHITECTURE.md) for diagrams.

### 2.2 Technology choices

| Choice | Rationale |
|---|---|
| **Flask** | Lightweight, ideal for API proxy and template serving |
| **SQLite** | Zero-config local database suitable for demos and small deployments |
| **Leaflet** | Open-source maps with tile overlay support for radar |
| **OpenWeather + Open-Meteo** | Reliable weather and forecast data |
| **SerpAPI** | Structured place search without exposing keys in the browser |
| **PWA** | Offline resilience and installability without native app overhead |

---

## 3. Features implemented

### 3.1 Weather dashboard

- Current conditions: temperature, humidity, wind, UV, air quality
- Hourly forecast (24 hours) and daily forecast (7 days)
- Weather charts using Chart.js (lazy loaded)
- City search and browser geolocation

### 3.2 Interactive map and radar

- Leaflet map with marker placement
- SerpAPI-powered place search
- Radar layers: rain, cloud, wind, temperature
- Timeline animation with opacity control

### 3.3 Intelligent sections

- **Weather alerts:** storm, rain, cyclone, heatwave, flood, lightning cards with emergency banner
- **AI summary:** natural-language today’s weather with clothing, travel, outdoor, driving, and workout advice
- **Travel guide:** best travel time, packing list, tourist tips, road conditions
- **Farming guide:** crop recommendations, rain prediction, soil moisture, irrigation, harvest advice

### 3.4 Authentication and user data

- Email/password signup and login
- Google OAuth sign-in (optional)
- Forgot password and reset flow
- Profile page for name and default city
- SQLite storage for favorites, search history, weather history, and settings
- Guest mode with localStorage; data migrates on login

### 3.5 Progressive Web App

- Web app manifest and install prompt
- Service worker with stale-while-revalidate for shell, network-first for APIs
- Offline banner and cached fallback pages

### 3.6 Quality and optimization

- Lazy loading for map and chart libraries
- Server-side response caching (5-minute TTL)
- Fetch retries and user-facing error recovery
- Accessibility: skip link, focus trap, reduced motion
- SEO: meta tags, JSON-LD, robots.txt, sitemap.xml
- Security headers and HttpOnly session cookies

---

## 4. Database design

SQLite database: `data/weather.db`

| Table | Purpose |
|---|---|
| `users` | Account credentials and profile |
| `favorite_cities` | Saved cities per user |
| `search_history` | Recent searches per user |
| `weather_history` | Weather lookup snapshots |
| `user_settings` | Theme, units, default city, notifications |

Entity-relationship diagram: [ARCHITECTURE.md](./ARCHITECTURE.md#entity-relationship-diagram)

---

## 5. API design

RESTful JSON APIs grouped by domain:

- **Auth:** `/api/auth/*` — signup, login, logout, profile, password reset, Google OAuth
- **User data:** `/api/favorites`, `/api/search-history`, `/api/weather-history`, `/api/settings`
- **Weather:** `/api/weather`, `/api/hourly-forecast`, `/api/daily-forecast`, `/api/maps-search`
- **Radar:** `/api/radar-frames`, `/api/weather-tile/...`

Full reference: [API.md](./API.md)

---

## 6. Testing and validation

Manual testing performed:

| Area | Result |
|---|---|
| City search and weather display | Pass |
| Geolocation and map markers | Pass |
| Radar layer switching and animation | Pass |
| Auth signup/login/logout | Pass |
| Password reset flow (dev mode) | Pass |
| Favorites and search history sync | Pass |
| PWA manifest and service worker | Pass |
| Offline cached responses | Pass |
| Security headers on responses | Pass |

---

## 7. Challenges and solutions

| Challenge | Solution |
|---|---|
| Exposing API keys in browser | Proxy all external calls through Flask |
| Slow initial page load | Defer scripts; lazy load Leaflet and Chart.js |
| Guest vs logged-in data | localStorage for guests; SQLite sync on login |
| Offline weather access | Service worker network-first cache for API routes |
| Radar tile CORS | Server-side tile proxy with binary caching |

---

## 8. Future enhancements

- Email delivery for password reset (SMTP integration)
- Push notifications for severe weather alerts
- Multi-language support
- Deployment guide for Render, Railway, or AWS
- Automated test suite (pytest + Playwright)

---

## 9. Conclusion

This project demonstrates a production-minded weather application combining real-time data, geospatial visualization, user personalization, and offline-capable PWA delivery. The modular Flask backend, documented REST APIs, and comprehensive frontend features provide a complete submission-ready codebase suitable for academic evaluation and GitHub portfolio use.

---

## 10. References

- OpenWeather API — https://openweathermap.org/api
- Open-Meteo — https://open-meteo.com/
- Leaflet — https://leafletjs.com/
- Flask — https://flask.palletsprojects.com/
- SerpAPI — https://serpapi.com/
- MDN Progressive Web Apps — https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps

---

## Appendix: Documentation index

| Document | Location |
|---|---|
| Installation Guide | [INSTALLATION.md](./INSTALLATION.md) |
| API Documentation | [API.md](./API.md) |
| Folder Structure | [FOLDER_STRUCTURE.md](./FOLDER_STRUCTURE.md) |
| Architecture & Diagrams | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| README | [../README.md](../README.md) |
