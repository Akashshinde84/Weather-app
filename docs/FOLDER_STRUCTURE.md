# Folder Structure

```text
weather app/
├── server.py                 # Flask application entry point and weather/radar APIs
├── auth.py                   # Authentication blueprint (signup, login, OAuth, reset)
├── database.py               # SQLite schema and connection helper
├── user_api.py               # REST APIs for favorites, history, settings
├── weather.py                # Optional CLI weather lookup
├── requirements.txt          # Python dependencies
├── .env.example              # Environment variable template
├── .gitignore                # Git ignore rules
├── README.md                 # Project overview and quick start
│
├── docs/                     # Submission documentation
│   ├── INSTALLATION.md       # Setup and run instructions
│   ├── PROJECT_REPORT.md     # Project report for submission
│   ├── API.md                # REST API reference
│   ├── FOLDER_STRUCTURE.md   # This file
│   └── ARCHITECTURE.md       # Architecture, ER, and flow diagrams
│
├── data/                     # Runtime data (gitignored)
│   └── weather.db            # SQLite database (auto-created)
│
├── templates/                # Jinja2 HTML templates
│   ├── index.html            # Main weather dashboard
│   ├── profile.html          # User profile page
│   ├── reset_password.html   # Password reset form
│   └── login_required.html   # Auth gate for protected pages
│
├── static/                   # Served static assets (Flask primary)
│   ├── css/
│   │   └── styles.css        # Application styles
│   ├── js/
│   │   ├── script.js         # Main frontend logic
│   │   ├── auth.js           # Auth modal and profile UI
│   │   ├── user-data.js      # SQLite sync for logged-in users
│   │   ├── pwa.js            # Service worker registration
│   │   └── lazy-loader.js    # Lazy load Leaflet and Chart.js
│   ├── icons/                # PWA icons (SVG)
│   ├── manifest.webmanifest  # PWA manifest
│   ├── sw.js                 # Service worker
│   └── offline.html          # Offline fallback page
│
├── index.html                # Standalone HTML (non-Flask fallback)
├── script.js                 # Standalone JS mirror of static/js/script.js
├── styles.css                # Standalone CSS mirror
├── auth.js                   # Standalone auth JS mirror
├── user-data.js              # Standalone user-data mirror
├── pwa.js                    # Standalone PWA mirror
├── lazy-loader.js            # Standalone lazy-loader mirror
├── manifest.webmanifest      # Root manifest copy
└── sw.js                     # Root service worker copy
```

## Directory roles

| Path | Role |
|---|---|
| **Root Python modules** | Backend logic split by concern: server, auth, database, user APIs |
| **`templates/`** | Server-rendered pages used by Flask |
| **`static/`** | CSS, JS, PWA assets served at `/static/...` |
| **`docs/`** | Submission and developer documentation |
| **`data/`** | Local SQLite storage; excluded from version control |
| **Root HTML/JS/CSS** | Legacy or standalone copies for opening without Flask |

## Recommended entry points

| Use case | Start here |
|---|---|
| Run full app | `python server.py` → `templates/index.html` + `static/` |
| Read API routes | `server.py`, `auth.py`, `user_api.py` |
| Frontend logic | `static/js/script.js` |
| Database schema | `database.py` |

## Files excluded from Git

See `.gitignore`:

- `__pycache__/`, virtual environments
- `.env` and secrets
- `data/*.db` (local user data)
