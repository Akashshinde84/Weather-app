# Architecture, ER Diagram, and Flowcharts

This document describes the system architecture, database design, and key application flows.

---

## System architecture

```mermaid
flowchart TB
    subgraph Client["Browser (PWA)"]
        UI["HTML / CSS UI"]
        JS["JavaScript Modules"]
        SW["Service Worker"]
        LS["localStorage (guests)"]
    end

    subgraph Server["Flask Backend"]
        APP["server.py"]
        AUTH["auth.py"]
        USER["user_api.py"]
        DB["database.py"]
    end

    subgraph Storage["Local Storage"]
        SQLITE[("SQLite\nweather.db")]
    end

    subgraph External["External APIs"]
        OW["OpenWeather"]
        OM["Open-Meteo"]
        SERP["SerpAPI"]
        GOOG["Google OAuth"]
    end

    UI --> JS
    JS --> SW
    JS -->|REST / fetch| APP
    JS -->|REST / fetch| AUTH
    JS -->|REST / fetch| USER
    JS --> LS

    APP --> OW
    APP --> OM
    APP --> SERP
    AUTH --> GOOG
    AUTH --> DB
    USER --> DB
    DB --> SQLITE

    SW -->|cache| APP
```

### Layer summary

| Layer | Technology | Responsibility |
|---|---|---|
| Presentation | HTML, CSS, JavaScript | Weather UI, maps, radar, auth modal, PWA |
| Application | Flask blueprints | Routing, session auth, API proxy, caching |
| Data | SQLite | Users, favorites, history, settings |
| External | OpenWeather, Open-Meteo, SerpAPI, Google | Weather, forecasts, maps search, OAuth |

---

## Entity-relationship diagram

```mermaid
erDiagram
    USERS ||--o{ FAVORITE_CITIES : has
    USERS ||--o{ SEARCH_HISTORY : has
    USERS ||--o{ WEATHER_HISTORY : has
    USERS ||--|| USER_SETTINGS : has

    USERS {
        int id PK
        string email UK
        string name
        string password_hash
        string google_id UK
        string avatar_url
        string default_city
        string reset_token
        float reset_token_expires
        string created_at
    }

    FAVORITE_CITIES {
        int id PK
        int user_id FK
        string city
        string created_at
    }

    SEARCH_HISTORY {
        int id PK
        int user_id FK
        string city
        string searched_at
    }

    WEATHER_HISTORY {
        int id PK
        int user_id FK
        string city
        string location_name
        string country
        float temperature
        string description
        string icon
        float lat
        float lng
        text payload
        string recorded_at
    }

    USER_SETTINGS {
        int user_id PK_FK
        string theme
        string units
        string default_city
        int notifications_enabled
        string updated_at
    }
```

### Relationships

- One **user** has many **favorite cities**, **search history** entries, and **weather history** entries.
- One **user** has exactly one **settings** row (1:1).
- All child tables use `ON DELETE CASCADE` when a user is removed.

---

## Weather search flow

```mermaid
flowchart TD
    A[User enters city or uses GPS] --> B{Logged in?}
    B -->|Yes| C[POST /api/search-history]
    B -->|No| D[Save to localStorage]
    C --> E[GET /api/weather]
    D --> E
    E --> F{Cache hit?}
    F -->|Yes| G[Return cached response]
    F -->|No| H[Call OpenWeather API]
    H --> I[Fetch air pollution data]
    I --> J[Return weather JSON]
    G --> K[Render dashboard]
    J --> K
    K --> L[Lazy load map and charts]
    L --> M[Evaluate alerts and AI summary]
    M --> N{Logged in?}
    N -->|Yes| O[POST /api/weather-history]
    N -->|No| P[Skip server history]
```

---

## Authentication flow

```mermaid
flowchart TD
    A[User opens auth modal] --> B{Action?}
    B -->|Sign up| C[POST /api/auth/signup]
    B -->|Login| D[POST /api/auth/login]
    B -->|Google| E[GET /api/auth/google]
    B -->|Forgot password| F[POST /api/auth/forgot-password]

    C --> G[Create user in SQLite]
    G --> H[Set session cookie]
    D --> I[Verify password hash]
    I --> H
    E --> J[Google OAuth redirect]
    J --> K[GET /api/auth/google/callback]
    K --> L[Link or create user]
    L --> H
    F --> M[Generate reset token]
    M --> N[User visits /reset-password]
    N --> O[POST /api/auth/reset-password]

    H --> P[Migrate localStorage to SQLite]
    P --> Q[Load favorites and settings from API]
```

---

## PWA offline flow

```mermaid
flowchart TD
    A[First visit] --> B[Register service worker]
    B --> C[Cache app shell and static assets]
    C --> D[User browses weather]
    D --> E[Network-first API cache]
    E --> F{Online?}
    F -->|Yes| G[Fetch live data]
    F -->|No| H[Show offline banner]
    H --> I[Serve cached API response]
    G --> J[Update cache]
    I --> K[Display last known weather]
    J --> K
```

---

## Radar and map flow

```mermaid
flowchart LR
    A[Map enters viewport] --> B[lazy-loader.js loads Leaflet]
    B --> C[Initialize map]
    C --> D[User selects radar layer]
    D --> E[GET /api/radar-frames]
    E --> F[Animate tile timestamps]
    F --> G[GET /api/weather-tile/layer/z/x/y.png]
    G --> H[OpenWeather tile proxy]
    H --> I[Render overlay on map]
```

---

## Security architecture

```mermaid
flowchart LR
    A[Browser request] --> B[Flask after_request]
    B --> C[Security headers]
    C --> D{API route?}
    D -->|Auth required| E[Session cookie check]
    D -->|Public weather| F[Rate-limited cache]
    E -->|Valid| G[Process request]
    E -->|Invalid| H[401 Unauthorized]
    F --> G
    G --> I[No-store for private data]
```

Key measures:

- API keys stored server-side only
- HttpOnly, SameSite session cookies
- Security headers on all responses
- Private cache control for authenticated APIs
