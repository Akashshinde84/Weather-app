const weatherInfoEl = document.getElementById('weatherInfo');
const loadingEl = document.getElementById('loading');
const buttonEl = document.getElementById('getWeather');
const cityEl = document.getElementById('city');
const useCurrentLocationEl = document.getElementById('useCurrentLocation');
const placeQueryEl = document.getElementById('placeQuery');
const searchPlaceEl = document.getElementById('searchPlace');
const placesEl = document.getElementById('places');
const mapEl = document.getElementById('map');
const themeToggleEl = document.getElementById('themeToggle');
const searchPanelEl = document.querySelector('.search-panel');
const searchSuggestionsEl = document.getElementById('searchSuggestions');
const quickSuggestionsEl = document.getElementById('quickSuggestions');
const recentSearchesEl = document.getElementById('recentSearches');
const favoriteCitiesEl = document.getElementById('favoriteCities');
const clearSearchHistoryEl = document.getElementById('clearSearchHistory');
const radarLayerButtons = document.querySelectorAll('[data-radar-layer]');
const radarOpacityEl = document.getElementById('radarOpacity');
const radarTimelineEl = document.getElementById('radarTimeline');
const radarPlayPauseEl = document.getElementById('radarPlayPause');
const radarStatusEl = document.getElementById('radarStatus');
const radarLegendEl = document.getElementById('radarLegend');

let map;
let marker;
let currentLocationMarker;
let fullscreenControl;
let weatherRequestController;
let placeRequestController;
let forecastRequestController;
let dailyForecastRequestController;
let currentBackgroundDescription = 'weather,sky,clouds';
let activeSuggestionIndex = -1;
let currentSuggestions = [];
let currentWeatherData = null;
let currentHourlyForecast = [];
let currentDailyForecast = [];
let usingRealAiInsights = false;
let radarLayer;
let activeRadarLayer = 'rain';
let radarAnimationEnabled = true;
let radarFrames = [];
let radarFrameIndex = 0;
let radarAnimationTimer = null;
let radarFadeTimer = null;
let radarPaneCreated = false;
let radarTileLayers = { primary: null, secondary: null };
const RADAR_ANIMATION_INTERVAL_MS = 900;
const weatherCharts = new Map();
const THEME_STORAGE_KEY = 'weather-theme';
const RECENT_SEARCHES_STORAGE_KEY = 'weather-recent-searches';
const FAVORITE_CITIES_STORAGE_KEY = 'weather-favorite-cities';
const DEFAULT_CITY_SUGGESTIONS = [
    'Kerala', 'Mumbai', 'Delhi', 'Bengaluru', 'Chennai', 'Hyderabad', 'Kolkata', 'Pune',
    'Ahmedabad', 'Jaipur', 'Surat', 'Lucknow', 'Kanpur', 'Nagpur', 'Indore', 'Bhopal',
    'Patna', 'Vadodara', 'Ludhiana', 'Agra', 'Nashik', 'Faridabad', 'Meerut', 'Rajkot',
    'Varanasi', 'Srinagar', 'Aurangabad', 'Dhanbad', 'Amritsar', 'Prayagraj', 'Ranchi',
    'Coimbatore', 'Kochi', 'Thiruvananthapuram', 'Mysuru', 'Mangalore', 'Goa', 'Shimla',
    'Manali', 'Darjeeling', 'Gangtok', 'New York', 'Los Angeles', 'Chicago', 'Houston',
    'Phoenix', 'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'San Jose', 'Austin',
    'Seattle', 'Boston', 'Miami', 'Denver', 'Atlanta', 'London', 'Paris', 'Tokyo',
    'Singapore', 'Dubai', 'Sydney', 'Toronto', 'Berlin', 'Rome', 'Madrid', 'Amsterdam'
];
const OPEN_METEO_GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const OPEN_METEO_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const IS_GITHUB_PAGES = window.location.hostname.endsWith('github.io');
const STATIC_LOCATION_ALIASES = {
    kerala: {
        name: 'Kerala',
        country: 'IN',
        lat: 10.8505,
        lng: 76.2711,
        timezone: 'Asia/Kolkata'
    }
};
const RADAR_LAYERS = {
    rain: { label: 'Rain', paneClass: 'radar-rain' },
    cloud: { label: 'Cloud', paneClass: 'radar-cloud' },
    wind: { label: 'Wind', paneClass: 'radar-wind' },
    temperature: { label: 'Temperature', paneClass: 'radar-temperature' }
};
const ALERT_DEFINITIONS = [
    { id: 'storm', label: 'Storm', icon: '&#9928;' },
    { id: 'rain', label: 'Rain', icon: '&#127783;' },
    { id: 'cyclone', label: 'Cyclone', icon: '&#127744;' },
    { id: 'heatwave', label: 'Heatwave', icon: '&#127777;' },
    { id: 'flood', label: 'Flood', icon: '&#127754;' },
    { id: 'lightning', label: 'Lightning', icon: '&#9889;' }
];
const ALERT_LEVEL_LABELS = {
    clear: 'All clear',
    watch: 'Watch',
    warning: 'Warning',
    severe: 'Severe'
};

function getRadarOpacity() {
    return Number(radarOpacityEl?.value || 65) / 100;
}

function formatRadarFrameTime(unixSeconds) {
    if (!unixSeconds) return 'Live';

    return new Intl.DateTimeFormat(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    }).format(new Date(unixSeconds * 1000));
}

function updateRadarStatus() {
    if (!radarStatusEl) return;

    const layerMeta = RADAR_LAYERS[activeRadarLayer];
    const frame = radarFrames[radarFrameIndex];
    const frameLabel = frame ? formatRadarFrameTime(frame) : 'Live';
    const animationLabel = radarAnimationEnabled ? 'Playing' : 'Paused';
    radarStatusEl.textContent = `${layerMeta?.label || 'Radar'} · ${frameLabel} · ${animationLabel}`;
}

function updateRadarLayerButtons() {
    radarLayerButtons.forEach((button) => {
        button.classList.toggle('is-active', button.dataset.radarLayer === activeRadarLayer);
    });
}

function updateRadarLegend() {
    if (radarLegendEl) radarLegendEl.dataset.radarLayer = activeRadarLayer;
}

function updateRadarTimelineControl() {
    if (!radarTimelineEl) return;

    const maxIndex = Math.max(radarFrames.length - 1, 0);
    radarTimelineEl.max = String(maxIndex);
    radarTimelineEl.value = String(Math.min(radarFrameIndex, maxIndex));
}

function ensureRadarPane(currentMap) {
    if (radarPaneCreated || !currentMap) return;

    currentMap.createPane('radarPane');
    const pane = currentMap.getPane('radarPane');
    pane.style.zIndex = 450;
    pane.style.pointerEvents = 'none';
    radarPaneCreated = true;
}

function buildRadarTileUrl(layer, frameTimestamp) {
    const params = new URLSearchParams();
    if (frameTimestamp) params.set('date', String(frameTimestamp));
    const query = params.toString();
    return `/api/weather-tile/${layer}/{z}/{x}/{y}.png${query ? `?${query}` : ''}`;
}

function createRadarTileLayer(layer, frameTimestamp, opacity) {
    return window.L.tileLayer(buildRadarTileUrl(layer, frameTimestamp), {
        opacity,
        pane: 'radarPane',
        maxZoom: 19,
        maxNativeZoom: 12,
        className: `radar-tile-layer ${RADAR_LAYERS[layer]?.paneClass || ''}`
    });
}

function removeRadarTileLayers(currentMap) {
    [radarTileLayers.primary, radarTileLayers.secondary].forEach((tileLayer) => {
        if (tileLayer) currentMap.removeLayer(tileLayer);
    });
    radarTileLayers.primary = null;
    radarTileLayers.secondary = null;
}

function applyRadarLayer(currentMap) {
    ensureRadarPane(currentMap);
    removeRadarTileLayers(currentMap);

    const timestamp = radarFrames[radarFrameIndex] || null;
    radarTileLayers.primary = createRadarTileLayer(activeRadarLayer, timestamp, getRadarOpacity());
    radarTileLayers.primary.addTo(currentMap);
}

function setRadarOpacity(opacity) {
    radarTileLayers.primary?.setOpacity(opacity);
    if ((radarTileLayers.secondary?.options?.opacity ?? 0) > 0) {
        radarTileLayers.secondary.setOpacity(opacity);
    }
}

function goToRadarFrame(index, animate = false) {
    const currentMap = ensureMap();
    if (!currentMap || radarFrames.length === 0) return;

    const nextIndex = Math.min(Math.max(index, 0), radarFrames.length - 1);
    if (!animate || nextIndex === radarFrameIndex) {
        radarFrameIndex = nextIndex;
        applyRadarLayer(currentMap);
        updateRadarTimelineControl();
        updateRadarStatus();
        return;
    }

    if (radarFadeTimer) {
        window.clearInterval(radarFadeTimer);
        radarFadeTimer = null;
    }

    const nextTimestamp = radarFrames[nextIndex];
    const opacity = getRadarOpacity();
    const nextLayer = createRadarTileLayer(activeRadarLayer, nextTimestamp, 0);
    nextLayer.addTo(currentMap);

    let step = 0;
    const steps = 8;
    radarFadeTimer = window.setInterval(() => {
        step += 1;
        const progress = step / steps;
        nextLayer.setOpacity(opacity * progress);
        radarTileLayers.primary?.setOpacity(opacity * (1 - progress));

        if (step >= steps) {
            window.clearInterval(radarFadeTimer);
            radarFadeTimer = null;
            if (radarTileLayers.primary) currentMap.removeLayer(radarTileLayers.primary);
            radarTileLayers.primary = nextLayer;
            radarFrameIndex = nextIndex;
            updateRadarTimelineControl();
            updateRadarStatus();
        }
    }, 50);
}

function advanceRadarFrame() {
    if (radarFrames.length <= 1) return;
    goToRadarFrame((radarFrameIndex + 1) % radarFrames.length, true);
}

function startRadarAnimation() {
    stopRadarAnimation();
    if (!radarAnimationEnabled || radarFrames.length <= 1) return;
    radarAnimationTimer = window.setInterval(advanceRadarFrame, RADAR_ANIMATION_INTERVAL_MS);
}

function stopRadarAnimation() {
    if (radarAnimationTimer) {
        window.clearInterval(radarAnimationTimer);
        radarAnimationTimer = null;
    }
}

function toggleRadarAnimation() {
    radarAnimationEnabled = !radarAnimationEnabled;

    if (radarPlayPauseEl) {
        radarPlayPauseEl.textContent = radarAnimationEnabled ? 'Pause animation' : 'Play animation';
        radarPlayPauseEl.setAttribute('aria-pressed', String(radarAnimationEnabled));
    }

    if (radarAnimationEnabled) {
        startRadarAnimation();
    } else {
        stopRadarAnimation();
    }

    updateRadarStatus();
}

function setActiveRadarLayer(layer) {
    if (!RADAR_LAYERS[layer]) return;

    activeRadarLayer = layer;
    updateRadarLayerButtons();
    updateRadarLegend();

    const currentMap = ensureMap();
    if (currentMap) {
        applyRadarLayer(currentMap);
        if (radarAnimationEnabled) startRadarAnimation();
    }

    updateRadarStatus();
}

async function fetchRadarFrames() {
    try {
        const data = await fetchJson('/api/radar-frames');
        radarFrames = Array.isArray(data.frames) ? data.frames : [];
    } catch {
        radarFrames = [];
    }

    if (radarFrames.length === 0) {
        radarFrames = [Math.floor(Date.now() / 1000)];
    }

    radarFrameIndex = radarFrames.length - 1;
    updateRadarTimelineControl();
}

async function initializeRadar() {
    const currentMap = ensureMap();
    if (!currentMap) return;

    await fetchRadarFrames();
    applyRadarLayer(currentMap);
    updateRadarLayerButtons();
    updateRadarLegend();
    updateRadarStatus();
    startRadarAnimation();
}

function bindRadarEvents() {
    radarLayerButtons.forEach((button) => {
        button.addEventListener('click', () => {
            setActiveRadarLayer(button.dataset.radarLayer || 'rain');
        });
    });

    radarOpacityEl?.addEventListener('input', () => {
        const opacity = getRadarOpacity();
        setRadarOpacity(opacity);
        radarOpacityEl.setAttribute('aria-valuetext', `${radarOpacityEl.value}%`);
    });

    radarTimelineEl?.addEventListener('input', () => {
        stopRadarAnimation();
        goToRadarFrame(Number(radarTimelineEl.value), false);
    });

    radarTimelineEl?.addEventListener('change', () => {
        if (radarAnimationEnabled) startRadarAnimation();
    });

    radarPlayPauseEl?.addEventListener('click', toggleRadarAnimation);
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function normalizeCityName(value) {
    return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function getStoredList(key) {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) || '[]');
        return Array.isArray(parsed) ? parsed.filter(Boolean).map(normalizeCityName) : [];
    } catch {
        return [];
    }
}

function setStoredList(key, values) {
    localStorage.setItem(key, JSON.stringify(values.map(normalizeCityName).filter(Boolean)));
}

function uniqueCityList(values) {
    const seen = new Set();
    return values.filter((value) => {
        const city = normalizeCityName(value);
        const key = city.toLowerCase();
        if (!city || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function getRecentSearches() {
    if (window.UserData?.isLoggedIn()) {
        return window.UserData.getRecentSearches();
    }
    return getStoredList(RECENT_SEARCHES_STORAGE_KEY);
}

function setRecentSearches(values) {
    if (window.UserData?.isLoggedIn()) {
        return;
    }
    setStoredList(RECENT_SEARCHES_STORAGE_KEY, uniqueCityList(values).slice(0, 8));
}

function getFavoriteCities() {
    if (window.UserData?.isLoggedIn()) {
        return window.UserData.getFavorites();
    }
    return getStoredList(FAVORITE_CITIES_STORAGE_KEY);
}

function setFavoriteCities(values) {
    if (window.UserData?.isLoggedIn()) {
        return;
    }
    setStoredList(FAVORITE_CITIES_STORAGE_KEY, uniqueCityList(values).slice(0, 12));
}

function saveRecentSearch(city) {
    const normalizedCity = normalizeCityName(city);
    if (!normalizedCity) return;

    if (window.UserData?.isLoggedIn()) {
        window.UserData.addRecentSearch(normalizedCity)
            .then(() => renderSearchAssist())
            .catch(() => renderSearchAssist());
        return;
    }

    setRecentSearches([normalizedCity, ...getRecentSearches()]);
    renderSearchAssist();
}

function isFavoriteCity(city) {
    const key = normalizeCityName(city).toLowerCase();
    return getFavoriteCities().some((favorite) => favorite.toLowerCase() === key);
}

function toggleFavoriteCity(city) {
    const normalizedCity = normalizeCityName(city);
    if (!normalizedCity) return;

    if (window.UserData?.isLoggedIn()) {
        window.UserData.toggleFavorite(normalizedCity)
            .then(() => {
                renderSearchAssist();
                renderAutocomplete();
            })
            .catch(() => {
                renderSearchAssist();
                renderAutocomplete();
            });
        return;
    }

    const favorites = getFavoriteCities();
    const exists = favorites.some((favorite) => favorite.toLowerCase() === normalizedCity.toLowerCase());
    setFavoriteCities(exists
        ? favorites.filter((favorite) => favorite.toLowerCase() !== normalizedCity.toLowerCase())
        : [normalizedCity, ...favorites]);
    renderSearchAssist();
    renderAutocomplete();
}

function getSuggestionPool() {
    return uniqueCityList([
        ...getFavoriteCities(),
        ...getRecentSearches(),
        ...DEFAULT_CITY_SUGGESTIONS
    ]);
}

function getCitySuggestions(query = '') {
    const normalizedQuery = normalizeCityName(query).toLowerCase();
    const pool = getSuggestionPool();

    if (!normalizedQuery) {
        return uniqueCityList([
            ...getFavoriteCities(),
            ...getRecentSearches(),
            ...DEFAULT_CITY_SUGGESTIONS
        ]).slice(0, 8);
    }

    return pool
        .filter((city) => city.toLowerCase().includes(normalizedQuery))
        .sort((a, b) => {
            const aText = a.toLowerCase();
            const bText = b.toLowerCase();
            const aStarts = aText.startsWith(normalizedQuery) ? 0 : 1;
            const bStarts = bText.startsWith(normalizedQuery) ? 0 : 1;
            return aStarts - bStarts || a.localeCompare(b);
        })
        .slice(0, 8);
}

function renderSearchChip(city, options = {}) {
    const favorite = isFavoriteCity(city);
    const label = options.label || city;
    const favoriteLabel = favorite ? `Remove ${city} from favorites` : `Add ${city} to favorites`;

    return `
        <span class="search-chip">
            <button class="chip-city" type="button" data-city="${escapeHtml(city)}">${escapeHtml(label)}</button>
            <button class="chip-favorite ${favorite ? 'is-favorite' : ''}" type="button" data-favorite-city="${escapeHtml(city)}" aria-label="${escapeHtml(favoriteLabel)}">${favorite ? '&#9733;' : '&#9734;'}</button>
        </span>
    `;
}

function bindChipEvents(container) {
    container?.querySelectorAll('[data-city]').forEach((button) => {
        button.addEventListener('click', () => selectCity(button.dataset.city || ''));
    });

    container?.querySelectorAll('[data-favorite-city]').forEach((button) => {
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            toggleFavoriteCity(button.dataset.favoriteCity || '');
        });
    });
}

function renderSearchAssist() {
    const suggestions = getCitySuggestions(cityEl?.value || '').slice(0, 5);
    const recents = getRecentSearches();
    const favorites = getFavoriteCities();

    if (quickSuggestionsEl) {
        quickSuggestionsEl.innerHTML = suggestions.length
            ? suggestions.map((city) => renderSearchChip(city)).join('')
            : '<span class="empty-chip">Type to see city matches</span>';
        bindChipEvents(quickSuggestionsEl);
    }

    if (recentSearchesEl) {
        recentSearchesEl.innerHTML = recents.length
            ? recents.map((city) => renderSearchChip(city)).join('')
            : '<span class="empty-chip">Recent searches appear here</span>';
        bindChipEvents(recentSearchesEl);
    }

    if (favoriteCitiesEl) {
        favoriteCitiesEl.innerHTML = favorites.length
            ? favorites.map((city) => renderSearchChip(city)).join('')
            : '<span class="empty-chip">Star a city to keep it here</span>';
        bindChipEvents(favoriteCitiesEl);
    }

    if (clearSearchHistoryEl) {
        clearSearchHistoryEl.disabled = recents.length === 0;
    }
}

function setActiveSuggestion(index) {
    activeSuggestionIndex = index;
    searchSuggestionsEl?.querySelectorAll('.suggestion-item').forEach((item, itemIndex) => {
        const isActive = itemIndex === activeSuggestionIndex;
        item.classList.toggle('is-active', isActive);
        item.setAttribute('aria-selected', String(isActive));
    });
}

function closeAutocomplete() {
    if (!searchSuggestionsEl) return;

    searchSuggestionsEl.classList.add('hidden');
    cityEl?.setAttribute('aria-expanded', 'false');
    activeSuggestionIndex = -1;
}

function renderAutocomplete() {
    if (!searchSuggestionsEl || !cityEl) return;

    currentSuggestions = getCitySuggestions(cityEl.value);
    if (currentSuggestions.length === 0) {
        closeAutocomplete();
        return;
    }

    searchSuggestionsEl.innerHTML = currentSuggestions.map((city, index) => `
        <button class="suggestion-item" type="button" role="option" data-index="${index}" aria-selected="false">
            <span>${escapeHtml(city)}</span>
            <small>${isFavoriteCity(city) ? 'Favorite' : getRecentSearches().includes(city) ? 'Recent' : 'Suggested'}</small>
        </button>
    `).join('');
    searchSuggestionsEl.classList.remove('hidden');
    cityEl.setAttribute('aria-expanded', 'true');
    setActiveSuggestion(-1);

    searchSuggestionsEl.querySelectorAll('.suggestion-item').forEach((button) => {
        button.addEventListener('click', () => {
            const city = currentSuggestions[Number(button.dataset.index)];
            selectCity(city);
        });
    });
}

function selectCity(city) {
    const normalizedCity = normalizeCityName(city);
    if (!normalizedCity || !cityEl) return;

    cityEl.value = normalizedCity;
    closeAutocomplete();
    renderSearchAssist();
    fetchWeather();
}

function clearSearchHistory() {
    if (window.UserData?.isLoggedIn()) {
        window.UserData.clearRecentSearches()
            .then(() => {
                renderSearchAssist();
                renderAutocomplete();
            })
            .catch(() => {
                renderSearchAssist();
                renderAutocomplete();
            });
        return;
    }

    setRecentSearches([]);
    renderSearchAssist();
    renderAutocomplete();
}

function triggerSearchPulse() {
    if (!searchPanelEl) return;

    searchPanelEl.classList.remove('search-pulse');
    void searchPanelEl.offsetWidth;
    searchPanelEl.classList.add('search-pulse');
}

function setLoading(isLoading) {
    if (!loadingEl) return;

    loadingEl.classList.toggle('hidden', !isLoading);
    loadingEl.setAttribute('aria-hidden', String(!isLoading));
    searchPanelEl?.classList.toggle('is-searching', isLoading);

    if (buttonEl) buttonEl.disabled = isLoading;
}

function setPlacesLoading() {
    if (!placesEl) return;

    placesEl.innerHTML = '<div class="loading"><div class="spinner" aria-hidden="true"></div><div class="loading-text">Searching places...</div></div>';
}

function getInitialTheme() {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getWeatherGradient() {
    const isDark = document.documentElement.dataset.theme === 'dark';

    return isDark
        ? 'linear-gradient(135deg, rgba(3, 13, 28, 0.9), rgba(9, 48, 82, 0.76))'
        : 'linear-gradient(135deg, rgba(12, 124, 206, 0.72), rgba(127, 209, 255, 0.58))';
}

function applyTheme(theme) {
    const normalizedTheme = theme === 'dark' ? 'dark' : 'light';
    const isDark = normalizedTheme === 'dark';

    document.documentElement.dataset.theme = normalizedTheme;
    document.body.dataset.theme = normalizedTheme;

    if (themeToggleEl) {
        themeToggleEl.setAttribute('aria-pressed', String(isDark));
        themeToggleEl.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
        themeToggleEl.querySelector('.theme-toggle-icon').textContent = isDark ? '\u2600' : '\u263e';
        themeToggleEl.querySelector('.theme-toggle-text').textContent = isDark ? 'Light' : 'Dark';
    }

    updateBackground(currentBackgroundDescription);

    if (window.UserData?.isLoggedIn()) {
        window.UserData.saveSettings({ theme: normalizedTheme }).catch(() => {});
    }
}

window.applyTheme = applyTheme;

function toggleTheme() {
    const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    applyTheme(nextTheme);
}

function swapWeatherContent(html) {
    if (!weatherInfoEl) return;

    weatherInfoEl.classList.remove('is-entering');

    if (weatherInfoEl.innerHTML.trim().length > 0) {
        weatherInfoEl.classList.add('is-leaving');
        window.setTimeout(() => {
            weatherInfoEl.classList.remove('is-leaving');
            weatherInfoEl.innerHTML = html;
            void weatherInfoEl.offsetWidth;
            weatherInfoEl.classList.add('is-entering');
        }, 180);
        return;
    }

    weatherInfoEl.innerHTML = html;
    void weatherInfoEl.offsetWidth;
    weatherInfoEl.classList.add('is-entering');
}

function showWeatherError(message, retryHandler = null) {
    const retryButton = retryHandler
        ? '<button id="weatherRetry" class="text-button weather-retry" type="button">Try again</button>'
        : '';

    swapWeatherContent(`
        <div class="weather-error-panel" role="alert" aria-live="assertive">
            <p class="weather-error">${escapeHtml(message)}</p>
            ${retryButton}
        </div>
    `);

    if (retryHandler) {
        document.getElementById('weatherRetry')?.addEventListener('click', retryHandler);
    }
}

let mapReadyPromise = null;
let mapInteractionsBound = false;

async function lazyInitializeMap() {
    if (map) return map;

    if (!mapReadyPromise) {
        mapReadyPromise = (async () => {
            if (!window.LazyLoader) {
                throw new Error('Map loader unavailable.');
            }
            await window.LazyLoader.loadLeaflet();
            const initializedMap = ensureMap();
            if (!initializedMap) {
                throw new Error('Map failed to initialize.');
            }
            if (!mapInteractionsBound) {
                bindMapInteractions(initializedMap);
                mapInteractionsBound = true;
            }
            await initializeRadar();
            return initializedMap;
        })().catch((error) => {
            mapReadyPromise = null;
            if (placesEl) {
                placesEl.innerHTML = `<div class="map-error">${escapeHtml(error.message || 'Map failed to load.')}</div>`;
            }
            throw error;
        });
    }

    return mapReadyPromise;
}

function observeMapSection() {
    const mapCard = document.querySelector('.map-card');
    if (!mapCard || !('IntersectionObserver' in window)) {
        lazyInitializeMap().catch(() => {});
        return;
    }

    const observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
            lazyInitializeMap().catch(() => {});
            observer.disconnect();
        }
    }, { rootMargin: '240px' });

    observer.observe(mapCard);
}

function ensureMap() {
    if (!mapEl) return null;
    if (map) return map;

    if (!window.L) {
        if (placesEl) placesEl.innerHTML = '<div class="map-error">Map library failed to load.</div>';
        return null;
    }

    map = window.L.map(mapEl, {
        zoomControl: false,
        zoomAnimation: true,
        fadeAnimation: true,
        markerZoomAnimation: true
    }).setView([20.5937, 78.9629], 4);
    window.L.control.zoom({ position: 'topright' }).addTo(map);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    addFullscreenControl(map);
    marker = createMapMarker([20.5937, 78.9629], 'weather').addTo(map);
    return map;
}

function createMarkerIcon(type = 'weather') {
    return window.L.divIcon({
        className: '',
        html: `
            <div class="app-marker app-marker-${escapeHtml(type)}">
                <span class="marker-pulse"></span>
                <span class="marker-pin"></span>
            </div>
        `,
        iconSize: [42, 42],
        iconAnchor: [21, 38],
        popupAnchor: [0, -34]
    });
}

function createMapMarker(coords, type = 'weather') {
    return window.L.marker(coords, {
        icon: createMarkerIcon(type),
        riseOnHover: true,
        keyboard: true
    });
}

function addFullscreenControl(currentMap) {
    if (fullscreenControl || !window.L) return;

    const FullscreenControl = window.L.Control.extend({
        options: { position: 'topright' },
        onAdd() {
            const button = window.L.DomUtil.create('button', 'leaflet-control map-fullscreen-control');
            button.type = 'button';
            button.title = 'Toggle fullscreen map';
            button.setAttribute('aria-label', 'Toggle fullscreen map');
            button.textContent = '⛶';

            window.L.DomEvent.disableClickPropagation(button);
            window.L.DomEvent.on(button, 'click', () => toggleMapFullscreen());
            return button;
        }
    });

    fullscreenControl = new FullscreenControl();
    fullscreenControl.addTo(currentMap);
}

function toggleMapFullscreen() {
    if (!mapEl) return;

    if (document.fullscreenElement === mapEl) {
        document.exitFullscreen?.();
    } else {
        mapEl.requestFullscreen?.();
    }
}

function formatCoordinate(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(4) : '--';
}

function buildMarkerPopup(label, lat, lng, details = {}) {
    const title = label || 'Selected location';
    const subtitle = details.subtitle || `${formatCoordinate(lat)}, ${formatCoordinate(lng)}`;
    const temp = details.temperature != null ? `<span>${escapeHtml(details.temperature)}&deg;C</span>` : '';
    const description = details.description ? `<span>${escapeHtml(details.description)}</span>` : '';

    return `
        <div class="map-popup">
            <strong>${escapeHtml(title)}</strong>
            <small>${escapeHtml(subtitle)}</small>
            ${(temp || description) ? `<div class="map-popup-weather">${temp}${description}</div>` : ''}
        </div>
    `;
}

function setMarker(lat, lng, label, options = {}) {
    const currentMap = ensureMap();
    if (!currentMap) return;

    const markerType = options.type || 'weather';
    if (!marker) {
        marker = createMapMarker([lat, lng], markerType).addTo(currentMap);
    }

    marker.setLatLng([lat, lng]);
    marker.setIcon(createMarkerIcon(markerType));
    marker.bindPopup(buildMarkerPopup(label, lat, lng, options), {
        className: 'weather-map-popup',
        maxWidth: 240
    });
    if (options.openPopup !== false) marker.openPopup();

    if (typeof currentMap.flyTo === 'function') {
        currentMap.flyTo([lat, lng], options.zoom || 13, { animate: true, duration: 0.9 });
    } else {
        currentMap.setView([lat, lng], options.zoom || 13, { animate: true });
    }

    window.setTimeout(() => currentMap.invalidateSize?.(true), 0);
}

function setCurrentLocationMarker(lat, lng) {
    const currentMap = ensureMap();
    if (!currentMap) return;

    if (!currentLocationMarker) {
        currentLocationMarker = createMapMarker([lat, lng], 'current-dot').addTo(currentMap);
    } else {
        currentLocationMarker.setLatLng([lat, lng]);
        currentLocationMarker.setIcon(createMarkerIcon('current-dot'));
    }

    currentLocationMarker.bindPopup(buildMarkerPopup('Current location', lat, lng, {
        subtitle: 'Your browser location'
    }), {
        className: 'weather-map-popup current-location-popup',
        maxWidth: 240
    });
}

function updateBackground(description) {
    currentBackgroundDescription = description || 'weather,sky,clouds';
    const bgQuery = encodeURIComponent(String(description ?? 'weather').replace(/\s+/g, ',').toLowerCase());
    document.body.style.backgroundImage =
        `${getWeatherGradient()}, url('https://source.unsplash.com/1800x1200/?${bgQuery},weather')`;
}

function formatNumber(value, digits = 0) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '--';

    return new Intl.NumberFormat(undefined, {
        maximumFractionDigits: digits,
        minimumFractionDigits: 0
    }).format(number);
}

function formatTemperature(value) {
    return `${formatNumber(value)}&deg;C`;
}

function formatWindSpeed(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '--';

    return `${formatNumber(number * 3.6, 1)} km/h`;
}

function formatVisibility(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '--';

    return `${formatNumber(number / 1000, 1)} km`;
}

function formatPollutant(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '--';

    return `${formatNumber(number, 1)} micrograms/m3`;
}

function formatLocationTime(timestamp, timezoneOffset) {
    const seconds = Number(timestamp);
    const offset = Number(timezoneOffset);
    if (!Number.isFinite(seconds)) return '--';

    const adjustedMs = (seconds + (Number.isFinite(offset) ? offset : 0)) * 1000;
    return new Intl.DateTimeFormat(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'UTC'
    }).format(new Date(adjustedMs));
}

function getAnimatedWeatherClass(icon = '', description = '') {
    const code = String(icon).toLowerCase();
    const text = String(description).toLowerCase();

    if (code.startsWith('11') || text.includes('storm') || text.includes('thunder')) return 'storm';
    if (code.startsWith('09') || code.startsWith('10') || text.includes('rain') || text.includes('drizzle')) return 'rain';
    if (code.startsWith('13') || text.includes('snow')) return 'snow';
    if (code.startsWith('50') || text.includes('mist') || text.includes('fog') || text.includes('haze')) return 'mist';
    if (code.startsWith('01')) return 'sunny';
    if (code.startsWith('02') || code.startsWith('03') || code.startsWith('04') || text.includes('cloud')) return 'cloudy';

    return 'sunny';
}

function renderMetric(label, value, detail = '') {
    const metricMarks = {
        'Feels Like': 'FL',
        Humidity: '%',
        Pressure: 'hPa',
        'Wind Speed': 'km/h',
        Visibility: 'km',
        Sunrise: 'AM',
        Sunset: 'PM',
        Clouds: '%'
    };
    const mark = metricMarks[label] || label.slice(0, 2).toUpperCase();

    return `
        <div class="weather-metric">
            <div class="metric-header">
                <span class="metric-mark" aria-hidden="true">${escapeHtml(mark)}</span>
                <span class="metric-label">${escapeHtml(label)}</span>
            </div>
            <span class="metric-value">${value}</span>
            ${detail ? `<span class="metric-detail">${escapeHtml(detail)}</span>` : ''}
        </div>
    `;
}

function getAqiClass(aqi) {
    const index = Number(aqi);
    if (!Number.isFinite(index)) return 'aqi-unknown';

    return `aqi-${Math.min(Math.max(Math.round(index), 1), 5)}`;
}

function renderAirQuality(data) {
    const airQuality = data.air_quality;

    if (!airQuality) {
        return `
            <section class="air-quality-card aqi-unknown" aria-label="Air quality">
                <div class="air-quality-main">
                    <div>
                        <span class="eyebrow">Air quality</span>
                        <h3>Currently unavailable</h3>
                    </div>
                    <div class="aqi-badge">--</div>
                </div>
                <p class="air-advice">Air quality data is unavailable for this location.</p>
            </section>
        `;
    }

    const components = airQuality.components || {};
    const aqiClass = getAqiClass(airQuality.aqi);

    return `
        <section class="air-quality-card ${escapeHtml(aqiClass)}" aria-label="Air quality">
            <div class="air-quality-main">
                <div>
                    <span class="eyebrow">Air quality</span>
                    <h3>${escapeHtml(airQuality.label || 'AQI')}</h3>
                </div>
                <div class="aqi-badge">
                    <span>AQI</span>
                    <strong>${escapeHtml(airQuality.aqi ?? '--')}</strong>
                </div>
            </div>
            <div class="aqi-indicator" aria-hidden="true">
                <span></span>
            </div>
            <div class="pollutant-grid" aria-label="Air pollutant readings">
                ${renderPollutant('PM2.5', components.pm2_5)}
                ${renderPollutant('PM10', components.pm10)}
                ${renderPollutant('CO', components.co)}
                ${renderPollutant('SO2', components.so2)}
                ${renderPollutant('NO2', components.no2)}
            </div>
            <p class="air-advice">${escapeHtml(airQuality.advice)}</p>
        </section>
    `;
}

function renderPollutant(label, value) {
    return `
        <div class="pollutant-item">
            <span>${escapeHtml(label)}</span>
            <strong>${formatPollutant(value)}</strong>
        </div>
    `;
}

async function ensureChartJs() {
    if (window.Chart) return window.Chart;
    if (!window.LazyLoader) return null;
    return window.LazyLoader.loadChartJs();
}

function renderChartsShell() {
    const charts = [
        ['temperatureChart', 'Temperature'],
        ['humidityChart', 'Humidity'],
        ['pressureChart', 'Pressure'],
        ['windChart', 'Wind'],
        ['rainChart', 'Rain'],
        ['aqiChart', 'AQI']
    ];

    return `
        <section class="weather-charts" aria-label="Weather charts">
            <div class="forecast-header">
                <div>
                    <span class="eyebrow">Charts</span>
                    <h3>Weather trends</h3>
                </div>
                <span id="chartStatus" class="forecast-count">Animated</span>
            </div>
            <div class="chart-grid">
                ${charts.map(([id, title]) => `
                    <article class="chart-card">
                        <div class="chart-card-header">
                            <h4>${escapeHtml(title)}</h4>
                        </div>
                        <div class="chart-canvas-wrap">
                            <canvas id="${escapeHtml(id)}" aria-label="${escapeHtml(title)} chart"></canvas>
                        </div>
                    </article>
                `).join('')}
            </div>
        </section>
    `;
}

function getChartTheme() {
    const isDark = document.documentElement.dataset.theme === 'dark';
    return {
        text: isDark ? '#d8e7f7' : '#314255',
        muted: isDark ? 'rgba(216, 231, 247, 0.52)' : 'rgba(49, 66, 85, 0.28)',
        grid: isDark ? 'rgba(216, 231, 247, 0.12)' : 'rgba(49, 66, 85, 0.12)'
    };
}

function chartDataset(label, values, color, options = {}) {
    return {
        label,
        data: values,
        borderColor: color,
        backgroundColor: options.fill ? `${color}2e` : color,
        borderWidth: 3,
        tension: 0.38,
        fill: Boolean(options.fill),
        pointRadius: values.length > 1 ? 2.5 : 5,
        pointHoverRadius: 5
    };
}

async function renderChart(id, config) {
    const canvas = document.getElementById(id);
    if (!canvas) return;

    await ensureChartJs();
    if (!window.Chart) return;

    const existingChart = weatherCharts.get(id);
    if (existingChart) existingChart.destroy();

    const theme = getChartTheme();
    const chart = new window.Chart(canvas, {
        type: config.type || 'line',
        data: {
            labels: config.labels,
            datasets: config.datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 900,
                easing: 'easeOutQuart'
            },
            plugins: {
                legend: {
                    display: config.datasets.length > 1,
                    labels: {
                        color: theme.text,
                        boxWidth: 10,
                        font: { weight: '700' }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (context) => `${context.dataset.label}: ${context.formattedValue}${config.unit || ''}`
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: theme.grid },
                    ticks: { color: theme.text, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 }
                },
                y: {
                    beginAtZero: config.beginAtZero !== false,
                    grid: { color: theme.grid },
                    ticks: {
                        color: theme.text,
                        callback: (value) => `${value}${config.unit || ''}`
                    }
                }
            }
        }
    });

    weatherCharts.set(id, chart);
}

function destroyWeatherCharts() {
    weatherCharts.forEach((chart) => chart.destroy());
    weatherCharts.clear();
}

function numericOrZero(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function getAqiValue(data) {
    return numericOrZero(data?.air_quality?.aqi);
}

async function renderCurrentCharts(data) {
    currentWeatherData = data;

    await ensureChartJs();
    if (!window.Chart) {
        const status = document.getElementById('chartStatus');
        if (status) status.textContent = 'Charts loading...';
        return;
    }

    const label = data?.name || 'Now';
    renderChart('temperatureChart', {
        labels: [label],
        datasets: [chartDataset('Temperature', [numericOrZero(data?.temperature)], '#ef4444', { fill: true })],
        unit: ' C',
        beginAtZero: false
    });
    renderChart('humidityChart', {
        labels: [label],
        datasets: [chartDataset('Humidity', [numericOrZero(data?.humidity)], '#0ea5e9', { fill: true })],
        unit: '%'
    });
    renderChart('pressureChart', {
        labels: [label],
        datasets: [chartDataset('Pressure', [numericOrZero(data?.pressure)], '#8b5cf6', { fill: true })],
        unit: ' hPa',
        beginAtZero: false
    });
    renderChart('windChart', {
        labels: [label],
        datasets: [chartDataset('Wind', [numericOrZero(data?.wind_speed) * 3.6], '#14b8a6', { fill: true })],
        unit: ' km/h'
    });
    renderChart('rainChart', {
        type: 'bar',
        labels: [label],
        datasets: [chartDataset('Rain chance', [0], '#2563eb')],
        unit: '%'
    });
    renderChart('aqiChart', {
        type: 'bar',
        labels: [label],
        datasets: [chartDataset('AQI', [getAqiValue(data)], '#f59e0b')],
        unit: ''
    });
}

async function updateHourlyCharts(forecast) {
    if (!forecast || forecast.length === 0 || !currentWeatherData) return;
    await ensureChartJs();
    if (!window.Chart) return;

    const hours = forecast.slice(0, 24);
    const labels = hours.map((hour) => formatForecastTime(hour.time));
    renderChart('temperatureChart', {
        labels,
        datasets: [chartDataset('Temperature', hours.map((hour) => numericOrZero(hour.temperature)), '#ef4444', { fill: true })],
        unit: ' C',
        beginAtZero: false
    });
    if (hours.some((hour) => Number.isFinite(Number(hour.humidity)))) {
        renderChart('humidityChart', {
            labels,
            datasets: [chartDataset('Humidity', hours.map((hour) => numericOrZero(hour.humidity)), '#0ea5e9', { fill: true })],
            unit: '%'
        });
    }
    if (hours.some((hour) => Number.isFinite(Number(hour.pressure)))) {
        renderChart('pressureChart', {
            labels,
            datasets: [chartDataset('Pressure', hours.map((hour) => numericOrZero(hour.pressure)), '#8b5cf6', { fill: true })],
            unit: ' hPa',
            beginAtZero: false
        });
    }
    renderChart('windChart', {
        labels,
        datasets: [chartDataset('Wind', hours.map((hour) => numericOrZero(hour.wind_speed)), '#14b8a6', { fill: true })],
        unit: ' km/h'
    });
    renderChart('rainChart', {
        type: 'bar',
        labels,
        datasets: [chartDataset('Rain chance', hours.map((hour) => numericOrZero(hour.rain_chance)), '#2563eb')],
        unit: '%'
    });

    const status = document.getElementById('chartStatus');
    if (status) status.textContent = `${hours.length}h trend`;
}

async function updateDailyCharts(forecast) {
    if (!forecast || forecast.length === 0 || !currentWeatherData) return;
    await ensureChartJs();
    if (!window.Chart) return;

    if (currentHourlyForecast.some((hour) => Number.isFinite(Number(hour.humidity)))) {
        return;
    }

    const labels = forecast.map((day) => formatForecastDay(day.date));
    renderChart('humidityChart', {
        labels,
        datasets: [chartDataset('Humidity', forecast.map((day) => numericOrZero(day.humidity)), '#0ea5e9', { fill: true })],
        unit: '%'
    });

    const status = document.getElementById('chartStatus');
    if (status) status.textContent = `${forecast.length}d trend`;
}

function getForecastIconClass(icon) {
    const normalizedIcon = String(icon || 'cloudy').toLowerCase();
    if (['sunny', 'cloudy', 'rain', 'snow', 'storm', 'mist'].includes(normalizedIcon)) {
        return normalizedIcon;
    }

    return 'cloudy';
}

function renderAnimatedWeatherIcon(iconClass, extraClass = '') {
    return `
        <div class="animated-weather-icon ${escapeHtml(iconClass)} ${escapeHtml(extraClass)}" aria-hidden="true">
            <span class="sun"></span>
            <span class="cloud"></span>
            <span class="cloud cloud-small"></span>
            <span class="rain rain-one"></span>
            <span class="rain rain-two"></span>
            <span class="rain rain-three"></span>
            <span class="snow snow-one"></span>
            <span class="snow snow-two"></span>
            <span class="bolt"></span>
            <span class="mist mist-one"></span>
            <span class="mist mist-two"></span>
        </div>
    `;
}

function renderForecastShell(state = 'idle', message = '') {
    const statusContent = message
        ? `<div class="forecast-status">${escapeHtml(message)}</div>`
        : '';

    return `
        <section class="hourly-forecast" aria-label="Next 24 hours forecast">
            <div class="forecast-header">
                <div>
                    <span class="eyebrow">Hourly forecast</span>
                    <h3>Next 24 hours</h3>
                </div>
                <span id="forecastCount" class="forecast-count">${state === 'loaded' ? '24 hours' : 'Updating'}</span>
            </div>
            <div id="hourlyForecastTrack" class="forecast-track ${state === 'loading' ? 'is-loading' : ''}" aria-label="Scrollable hourly forecast cards" aria-live="polite">
                ${statusContent}
            </div>
        </section>
    `;
}

function renderDailyForecastShell(state = 'idle', message = '') {
    const statusContent = message
        ? `<div class="daily-status">${escapeHtml(message)}</div>`
        : '';

    return `
        <section class="daily-forecast" aria-label="7-day forecast">
            <div class="forecast-header">
                <div>
                    <span class="eyebrow">7-day forecast</span>
                    <h3>Week ahead</h3>
                </div>
                <span id="dailyForecastCount" class="forecast-count">${state === 'loaded' ? '7 days' : 'Updating'}</span>
            </div>
            <div id="dailyForecastGrid" class="daily-grid ${state === 'loading' ? 'is-loading' : ''}" aria-live="polite">
                ${statusContent}
            </div>
        </section>
    `;
}

function isStormCondition(icon = '', description = '') {
    const code = String(icon).toLowerCase();
    const text = String(description).toLowerCase();
    return code.startsWith('11') || text.includes('storm') || text.includes('thunder');
}

function isRainCondition(icon = '', description = '') {
    const code = String(icon).toLowerCase();
    const text = String(description).toLowerCase();
    return code.startsWith('09') || code.startsWith('10') || text.includes('rain') || text.includes('drizzle') || text.includes('shower');
}

function isLightningCondition(icon = '', description = '') {
    const code = String(icon).toLowerCase();
    const text = String(description).toLowerCase();
    return code.startsWith('11') || text.includes('lightning') || text.includes('thunder');
}

function maxForecastRainChance(hourly = [], hours = 12) {
    return hourly.slice(0, hours).reduce((max, hour) => {
        const value = Number(hour.rain_chance);
        return Number.isFinite(value) ? Math.max(max, value) : max;
    }, 0);
}

function maxForecastWindKmh(hourly = [], daily = []) {
    const hourlyMax = hourly.reduce((max, hour) => {
        const value = Number(hour.wind_speed);
        return Number.isFinite(value) ? Math.max(max, value) : max;
    }, 0);
    const dailyMax = daily.reduce((max, day) => {
        const value = Number(day.wind_speed);
        return Number.isFinite(value) ? Math.max(max, value) : max;
    }, 0);
    return Math.max(hourlyMax, dailyMax);
}

function sustainedHighRainHours(hourly = [], threshold = 80) {
    return hourly.slice(0, 12).filter((hour) => Number(hour.rain_chance) >= threshold).length;
}

function heatwaveDaysAhead(daily = [], threshold = 38) {
    return daily.filter((day) => Number(day.high) >= threshold).length;
}

function evaluateWeatherAlerts(weather = {}, hourly = [], daily = []) {
    const description = weather.description || '';
    const icon = weather.icon || '';
    const temp = Number(weather.temperature);
    const feelsLike = Number(weather.feels_like);
    const humidity = Number(weather.humidity);
    const windMs = Number(weather.wind_speed);
    const windKmh = Number.isFinite(windMs) ? windMs * 3.6 : 0;
    const rainNow = isRainCondition(icon, description);
    const stormNow = isStormCondition(icon, description);
    const lightningNow = isLightningCondition(icon, description);
    const peakRain = maxForecastRainChance(hourly);
    const peakWind = maxForecastWindKmh(hourly, daily);
    const heavyRainHours = sustainedHighRainHours(hourly);
    const hotDays = heatwaveDaysAhead(daily);
    const stormHours = hourly.slice(0, 12).filter((hour) => isStormCondition(hour.icon, hour.description)).length;
    const lightningHours = hourly.slice(0, 12).filter((hour) => isLightningCondition(hour.icon, hour.description)).length;

    const alerts = {};

    if (stormNow || stormHours >= 3) {
        alerts.storm = {
            level: stormNow ? 'severe' : stormHours >= 2 ? 'warning' : 'watch',
            message: stormNow
                ? 'Active storm conditions detected. Stay indoors if possible.'
                : `Storms possible across the next ${stormHours} hours.`
        };
    } else if (stormHours > 0) {
        alerts.storm = { level: 'watch', message: 'Storm activity may develop later today.' };
    } else {
        alerts.storm = { level: 'clear', message: 'No storm alerts for this location.' };
    }

    if (rainNow && peakRain >= 70) {
        alerts.rain = { level: 'warning', message: 'Heavy rain is falling with high chance continuing.' };
    } else if (rainNow || peakRain >= 80) {
        alerts.rain = { level: 'warning', message: 'Significant rainfall expected in the next 12 hours.' };
    } else if (peakRain >= 55) {
        alerts.rain = { level: 'watch', message: `Rain chance up to ${Math.round(peakRain)}% in the forecast.` };
    } else {
        alerts.rain = { level: 'clear', message: 'No significant rain alert at this time.' };
    }

    if (peakWind >= 120 || windKmh >= 115) {
        alerts.cyclone = { level: 'severe', message: 'Extreme winds consistent with cyclone-strength systems.' };
    } else if (peakWind >= 90 || windKmh >= 90) {
        alerts.cyclone = { level: 'warning', message: 'Very strong winds expected. Secure loose objects outdoors.' };
    } else if (peakWind >= 62 || windKmh >= 62) {
        alerts.cyclone = { level: 'watch', message: 'Elevated winds detected. Monitor local advisories.' };
    } else {
        alerts.cyclone = { level: 'clear', message: 'No cyclone-scale wind threat detected.' };
    }

    if (temp >= 42 || feelsLike >= 44 || hotDays >= 3) {
        alerts.heatwave = {
            level: 'severe',
            message: 'Extreme heat in effect. Limit outdoor exposure and stay hydrated.'
        };
    } else if (temp >= 38 || feelsLike >= 40 || hotDays >= 2) {
        alerts.heatwave = { level: 'warning', message: 'Heatwave conditions likely. Avoid peak afternoon sun.' };
    } else if (temp >= 35 || feelsLike >= 37) {
        alerts.heatwave = { level: 'watch', message: 'Hot conditions building. Plan cooling breaks.' };
    } else {
        alerts.heatwave = { level: 'clear', message: 'No heatwave alert for this location.' };
    }

    if (heavyRainHours >= 6 && humidity >= 85) {
        alerts.flood = { level: 'severe', message: 'Prolonged heavy rain raises flood risk in low-lying areas.' };
    } else if (heavyRainHours >= 4 || (peakRain >= 90 && humidity >= 80)) {
        alerts.flood = { level: 'warning', message: 'Heavy rainfall may cause localized flooding.' };
    } else if (peakRain >= 75) {
        alerts.flood = { level: 'watch', message: 'Monitor drainage and travel routes during downpours.' };
    } else {
        alerts.flood = { level: 'clear', message: 'No flood alert currently active.' };
    }

    if (lightningNow) {
        alerts.lightning = { level: 'severe', message: 'Lightning detected nearby. Move indoors immediately.' };
    } else if (lightningHours >= 2) {
        alerts.lightning = { level: 'warning', message: 'Lightning likely in the next few hours.' };
    } else if (lightningHours > 0 || stormHours > 0) {
        alerts.lightning = { level: 'watch', message: 'Thunderstorm activity could produce lightning later.' };
    } else {
        alerts.lightning = { level: 'clear', message: 'No lightning alert at this time.' };
    }

    return alerts;
}

function getActiveAlertSummary(alerts) {
    const entries = ALERT_DEFINITIONS.map(({ id, label }) => ({
        id,
        label,
        ...alerts[id]
    }));

    const severe = entries.filter((alert) => alert.level === 'severe');
    const warnings = entries.filter((alert) => alert.level === 'warning');

    if (severe.length > 0) {
        return {
            show: true,
            level: 'severe',
            title: 'Emergency weather alert',
            message: severe.length === 1
                ? `${severe[0].label}: ${severe[0].message}`
                : `${severe.length} severe alerts active including ${severe.map((alert) => alert.label).join(', ')}.`
        };
    }

    if (warnings.length >= 2) {
        return {
            show: true,
            level: 'warning',
            title: 'Weather advisory',
            message: `${warnings.length} warnings active: ${warnings.map((alert) => alert.label).join(', ')}.`
        };
    }

    if (warnings.length === 1) {
        return {
            show: true,
            level: 'warning',
            title: `${warnings[0].label} warning`,
            message: warnings[0].message
        };
    }

    return { show: false };
}

function renderEmergencyBanner(alerts) {
    const summary = getActiveAlertSummary(alerts);
    if (!summary.show) {
        return '<div id="emergencyBanner" class="emergency-banner hidden" role="alert" aria-hidden="true"></div>';
    }

    return `
        <div id="emergencyBanner" class="emergency-banner emergency-banner-${escapeHtml(summary.level)}" role="alert">
            <div class="emergency-banner-icon" aria-hidden="true">&#9888;</div>
            <div class="emergency-banner-copy">
                <strong>${escapeHtml(summary.title)}</strong>
                <p>${escapeHtml(summary.message)}</p>
            </div>
        </div>
    `;
}

function renderAlertCard(alertDef, alert) {
    const level = alert?.level || 'clear';
    const message = alert?.message || 'Conditions are being monitored.';
    const statusLabel = ALERT_LEVEL_LABELS[level] || 'All clear';

    return `
        <article class="alert-card alert-${escapeHtml(alertDef.id)} alert-level-${escapeHtml(level)}" aria-label="${escapeHtml(alertDef.label)} alert">
            <div class="alert-card-icon" aria-hidden="true">${alertDef.icon}</div>
            <div class="alert-card-body">
                <div class="alert-card-top">
                    <span class="alert-card-label">${escapeHtml(alertDef.label)}</span>
                    <span class="alert-card-status">${escapeHtml(statusLabel)}</span>
                </div>
                <p class="alert-card-message">${escapeHtml(message)}</p>
            </div>
        </article>
    `;
}

function renderAlertsSection(alerts) {
    const activeCount = ALERT_DEFINITIONS.filter(({ id }) => {
        const level = alerts[id]?.level || 'clear';
        return level === 'warning' || level === 'severe';
    }).length;

    return `
        <section class="weather-alerts" aria-label="Weather alerts">
            <div class="forecast-header">
                <div>
                    <span class="eyebrow">Safety alerts</span>
                    <h3>Weather alert cards</h3>
                </div>
                <span id="alertCount" class="forecast-count">${activeCount ? `${activeCount} active` : 'All clear'}</span>
            </div>
            <div id="alertCards" class="alert-grid">
                ${ALERT_DEFINITIONS.map((def) => renderAlertCard(def, alerts[def.id])).join('')}
            </div>
        </section>
    `;
}

function updateWeatherAlerts() {
    if (!currentWeatherData) return;

    const alerts = evaluateWeatherAlerts(currentWeatherData, currentHourlyForecast, currentDailyForecast);
    const banner = document.getElementById('emergencyBanner');
    const cards = document.getElementById('alertCards');
    const count = document.getElementById('alertCount');

    if (banner) {
        const bannerHtml = renderEmergencyBanner(alerts);
        banner.outerHTML = bannerHtml;
    }

    if (cards) {
        cards.innerHTML = ALERT_DEFINITIONS.map((def) => renderAlertCard(def, alerts[def.id])).join('');
    }

    if (count) {
        const activeCount = ALERT_DEFINITIONS.filter(({ id }) => {
            const level = alerts[id]?.level || 'clear';
            return level === 'warning' || level === 'severe';
        }).length;
        count.textContent = activeCount ? `${activeCount} active` : 'All clear';
    }
}

const AI_SUMMARY_ITEMS = [
    { id: 'today', label: "Today's weather", icon: '&#9728;' },
    { id: 'travel', label: 'Travel advice', icon: '&#128652;' },
    { id: 'clothing', label: 'Clothing suggestion', icon: '&#128085;' },
    { id: 'outdoor', label: 'Outdoor activity', icon: '&#127795;' },
    { id: 'driving', label: 'Driving advice', icon: '&#128663;' },
    { id: 'workout', label: 'Workout suggestion', icon: '&#127947;' }
];

function roundTemp(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number) : null;
}

function getHourlyTrend(hourly = []) {
    const temps = hourly.slice(0, 8).map((hour) => Number(hour.temperature)).filter(Number.isFinite);
    if (temps.length < 2) return 'steady';

    const delta = temps[temps.length - 1] - temps[0];
    if (delta >= 2) return 'warming';
    if (delta <= -2) return 'cooling';
    return 'steady';
}

function generateAiSummary(weather = {}, hourly = [], daily = []) {
    const name = weather.name || 'your area';
    const description = weather.description || 'variable conditions';
    const temp = Number(weather.temperature);
    const feelsLike = Number(weather.feels_like);
    const humidity = Number(weather.humidity);
    const windKmh = Number.isFinite(Number(weather.wind_speed)) ? Number(weather.wind_speed) * 3.6 : null;
    const visibilityKm = Number.isFinite(Number(weather.visibility)) ? Number(weather.visibility) / 1000 : null;
    const aqi = Number(weather.air_quality?.aqi);
    const rainNow = isRainCondition(weather.icon, description);
    const stormNow = isStormCondition(weather.icon, description);
    const peakRain = maxForecastRainChance(hourly);
    const peakWind = maxForecastWindKmh(hourly, daily);
    const today = daily[0] || {};
    const high = Number(today.high);
    const low = Number(today.low);
    const trend = getHourlyTrend(hourly);
    const tempRounded = roundTemp(temp);
    const feelsRounded = roundTemp(feelsLike);

    let todayText = `${name} is ${description}`;
    if (tempRounded != null) todayText += ` at ${tempRounded}\u00b0C`;
    if (feelsRounded != null && feelsRounded !== tempRounded) todayText += ` (feels like ${feelsRounded}\u00b0C)`;
    todayText += '.';
    if (Number.isFinite(high) && Number.isFinite(low)) {
        todayText += ` Expect a high near ${roundTemp(high)}\u00b0C and a low around ${roundTemp(low)}\u00b0C.`;
    }
    if (peakRain >= 35) todayText += ` Rain chances may reach ${Math.round(peakRain)}% later today.`;
    if (trend === 'warming') todayText += ' Temperatures should climb through the day.';
    else if (trend === 'cooling') todayText += ' Conditions should cool off as the day progresses.';
    else todayText += ' Temperatures look fairly steady over the next several hours.';

    let travel;
    if (stormNow || peakWind >= 90) {
        travel = 'Postpone non-essential travel if you can. High winds and storms can disrupt roads and transit.';
    } else if (rainNow || peakRain >= 75) {
        travel = 'Allow extra travel time and keep a rain layer handy. Wet roads and reduced visibility are likely.';
    } else if (visibilityKm != null && visibilityKm < 2) {
        travel = 'Low visibility makes travel slower. Use headlights and increase following distance.';
    } else if (tempRounded != null && tempRounded >= 38) {
        travel = 'Heat can strain vehicles and passengers. Travel early or late and carry water.';
    } else if (peakRain >= 45) {
        travel = 'A few showers are possible, so pack an umbrella and plan flexible departure times.';
    } else {
        travel = 'Travel conditions look generally favorable. Standard timing should work well today.';
    }

    let clothing;
    if (rainNow || peakRain >= 60) {
        clothing = 'Wear a waterproof jacket or carry an umbrella, with quick-dry layers underneath.';
    } else if (tempRounded != null && tempRounded <= 10) {
        clothing = 'Bundle up with a warm coat, layers, and a hat. Cold conditions persist through the day.';
    } else if (tempRounded != null && tempRounded <= 18) {
        clothing = 'Reach for a light jacket or sweater. Layers will help as temperatures shift.';
    } else if (tempRounded != null && tempRounded >= 32) {
        clothing = 'Choose light, breathable fabrics, sun protection, and plenty of hydration.';
    } else if (windKmh != null && windKmh >= 35) {
        clothing = 'A windbreaker over comfortable layers will keep you at ease outdoors.';
    } else {
        clothing = 'Comfortable casual layers should be enough for today\u2019s mild conditions.';
    }

    let outdoor;
    if (stormNow || peakRain >= 85) {
        outdoor = 'Keep outdoor plans indoors today. Storms and heavy rain make open-air activities risky.';
    } else if (aqi >= 4) {
        outdoor = 'Limit long outdoor exposure because of poor air quality. Short walks are fine if you are not sensitive.';
    } else if (tempRounded != null && (tempRounded >= 38 || tempRounded <= 5)) {
        outdoor = 'Extreme temperatures make extended outdoor time uncomfortable. Prefer shaded or indoor options.';
    } else if (rainNow || peakRain >= 65) {
        outdoor = 'Short outdoor breaks are fine, but keep backup plans for rain if you are heading out.';
    } else if (tempRounded != null && tempRounded >= 18 && tempRounded <= 30 && peakRain < 40) {
        outdoor = 'Great day for parks, walks, or patio time. Conditions support most outdoor plans.';
    } else {
        outdoor = 'Outdoor time is manageable with light preparation. Watch the forecast for afternoon changes.';
    }

    let driving;
    if (stormNow || peakRain >= 80) {
        driving = 'Drive slowly on wet roads, avoid flooded stretches, and postpone trips if conditions worsen.';
    } else if (visibilityKm != null && visibilityKm < 3) {
        driving = 'Use low beams, reduce speed, and leave extra space. Fog or haze is limiting visibility.';
    } else if (rainNow || peakRain >= 55) {
        driving = 'Roads may be slick when showers arrive. Increase following distance and brake gently.';
    } else if (windKmh != null && windKmh >= 50) {
        driving = 'Strong gusts can push high-profile vehicles. Keep both hands on the wheel and slow down.';
    } else if (tempRounded != null && tempRounded >= 35) {
        driving = 'Heat stress is possible on long drives. Check tire pressure and keep water in the car.';
    } else {
        driving = 'Driving conditions appear routine. Stay alert for typical local traffic and weather shifts.';
    }

    let workout;
    if (stormNow || rainNow && peakRain >= 70) {
        workout = 'Move your workout indoors. Yoga, strength training, or a gym session are safer picks today.';
    } else if (aqi >= 4) {
        workout = 'Choose indoor cardio or lighter activity. Air quality is not ideal for intense outdoor exertion.';
    } else if (tempRounded != null && tempRounded >= 34) {
        workout = 'Exercise early morning or indoors. Midday heat makes outdoor workouts taxing.';
    } else if (tempRounded != null && tempRounded <= 5) {
        workout = 'Warm up thoroughly if training outside, or opt for an indoor session to stay comfortable.';
    } else if (humidity >= 80 && tempRounded != null && tempRounded >= 28) {
        workout = 'Humidity is high, so favor shorter outdoor sessions or indoor training with good ventilation.';
    } else if (tempRounded != null && tempRounded >= 15 && tempRounded <= 28 && peakRain < 50 && aqi <= 3) {
        workout = 'Strong day for a run, ride, or outdoor class. Hydrate and use sunscreen if skies are clear.';
    } else {
        workout = 'Moderate outdoor workouts are fine. Adjust intensity based on rain bursts and how you feel.';
    }

    const narrativeParts = [
        `Today in ${name}, expect ${description}${tempRounded != null ? ` near ${tempRounded}\u00b0C` : ''}.`
    ];
    if (Number.isFinite(high) && Number.isFinite(low)) {
        narrativeParts.push(`The day should span ${roundTemp(low)}\u00b0C to ${roundTemp(high)}\u00b0C.`);
    }
    if (peakRain >= 50) narrativeParts.push(`Showers are in the mix with rain chances up to ${Math.round(peakRain)}%.`);
    else if (stormNow) narrativeParts.push('Stormy weather may interrupt outdoor plans.');
    else if (tempRounded != null && tempRounded >= 32) narrativeParts.push('Heat will be the main factor shaping your day.');
    narrativeParts.push(travel.split('.')[0] + '.');
    narrativeParts.push(clothing.split('.')[0] + '.');

    return {
        today: todayText,
        travel,
        clothing,
        outdoor,
        driving,
        workout,
        narrative: narrativeParts.join(' ')
    };
}

function renderAiSummaryCard(item, text) {
    return `
        <article class="ai-summary-card">
            <div class="ai-summary-card-icon" aria-hidden="true">${item.icon}</div>
            <div class="ai-summary-card-body">
                <h4>${escapeHtml(item.label)}</h4>
                <p>${escapeHtml(text)}</p>
            </div>
        </article>
    `;
}

function renderAiSummarySection(summary, state = 'ready') {
    const narrative = summary?.narrative || 'Your personalized weather summary will appear here after conditions load.';
    const statusLabel = state === 'loading' ? 'Generating' : 'Ready';

    return `
        <section class="ai-summary" aria-label="AI weather summary">
            <div class="forecast-header">
                <div>
                    <span class="eyebrow">AI summary</span>
                    <h3>Personalized guidance</h3>
                </div>
                <span id="aiSummaryStatus" class="forecast-count">${statusLabel}</span>
            </div>
            <div class="ai-summary-narrative">
                <span class="ai-summary-badge">Natural language summary</span>
                <p id="aiSummaryNarrative">${escapeHtml(narrative)}</p>
            </div>
            <div id="aiSummaryGrid" class="ai-summary-grid ${state === 'loading' ? 'is-loading' : ''}">
                ${state === 'loading'
                    ? '<div class="ai-summary-loading">Building your weather guidance...</div>'
                    : AI_SUMMARY_ITEMS.map((item) => renderAiSummaryCard(item, summary?.[item.id] || 'Updating...')).join('')}
            </div>
        </section>
    `;
}

function updateAiSummary() {
    if (usingRealAiInsights) return;
    if (!currentWeatherData) return;

    const summary = generateAiSummary(currentWeatherData, currentHourlyForecast, currentDailyForecast);
    const narrative = document.getElementById('aiSummaryNarrative');
    const grid = document.getElementById('aiSummaryGrid');
    const status = document.getElementById('aiSummaryStatus');

    if (narrative) narrative.textContent = summary.narrative;
    if (grid) {
        grid.classList.remove('is-loading');
        grid.innerHTML = AI_SUMMARY_ITEMS.map((item) => renderAiSummaryCard(item, summary[item.id])).join('');
    }
    if (status) status.textContent = 'Ready';
}

const TRAVEL_SECTION_ITEMS = [
    { id: 'bestTime', label: 'Best travel time', icon: '&#128197;' },
    { id: 'packing', label: 'Packing list', icon: '&#127890;' },
    { id: 'tourist', label: 'Tourist recommendation', icon: '&#128205;' },
    { id: 'weatherTips', label: 'Weather tips', icon: '&#128161;' },
    { id: 'roadCondition', label: 'Road condition', icon: '&#128739;' }
];

function findBestTravelWindow(hourly = []) {
    if (!hourly.length) return null;

    let bestIndex = 0;
    let bestScore = -Infinity;

    hourly.slice(0, 12).forEach((hour, index) => {
        const temp = Number(hour.temperature);
        const rain = Number(hour.rain_chance);
        const wind = Number(hour.wind_speed);
        if (!Number.isFinite(temp)) return;

        let score = 100;
        if (Number.isFinite(rain)) score -= rain * 0.8;
        if (Number.isFinite(wind)) score -= wind * 1.2;
        score -= Math.abs(temp - 24) * 2;
        if (isStormCondition(hour.icon, hour.description)) score -= 40;
        if (isRainCondition(hour.icon, hour.description)) score -= 25;

        if (score > bestScore) {
            bestScore = score;
            bestIndex = index;
        }
    });

    const bestHour = hourly[bestIndex];
    const start = formatForecastTime(bestHour?.time);
    const endHour = hourly[Math.min(bestIndex + 2, hourly.length - 1)];
    const end = formatForecastTime(endHour?.time);
    return { start, end, hour: bestHour };
}

function buildPackingList(weather = {}, hourly = [], daily = []) {
    const temp = roundTemp(Number(weather.temperature));
    const peakRain = maxForecastRainChance(hourly);
    const peakWind = maxForecastWindKmh(hourly, daily);
    const description = weather.description || '';
    const rainNow = isRainCondition(weather.icon, description);
    const stormNow = isStormCondition(weather.icon, description);
    const aqi = Number(weather.air_quality?.aqi);
    const items = new Set(['Travel documents', 'Phone charger']);

    if (rainNow || peakRain >= 40) {
        items.add('Umbrella');
        items.add('Waterproof jacket');
    }
    if (peakRain >= 60) items.add('Waterproof shoes');
    if (temp != null && temp <= 12) {
        items.add('Warm coat');
        items.add('Scarf or gloves');
    } else if (temp != null && temp <= 20) {
        items.add('Light jacket');
    }
    if (temp != null && temp >= 28) {
        items.add('Sunscreen');
        items.add('Sunglasses');
        items.add('Reusable water bottle');
    }
    if (temp != null && temp >= 32) items.add('Hat');
    if (peakWind >= 40) items.add('Windbreaker');
    if (stormNow) items.add('Portable power bank');
    if (aqi >= 3) items.add('Face mask');
    if (Number(weather.humidity) >= 75) items.add('Light breathable clothes');

    return [...items];
}

function generateTravelGuide(weather = {}, hourly = [], daily = []) {
    const name = weather.name || 'this destination';
    const description = weather.description || 'variable conditions';
    const temp = Number(weather.temperature);
    const tempRounded = roundTemp(temp);
    const visibilityKm = Number.isFinite(Number(weather.visibility)) ? Number(weather.visibility) / 1000 : null;
    const windKmh = Number.isFinite(Number(weather.wind_speed)) ? Number(weather.wind_speed) * 3.6 : null;
    const rainNow = isRainCondition(weather.icon, description);
    const stormNow = isStormCondition(weather.icon, description);
    const peakRain = maxForecastRainChance(hourly);
    const peakWind = maxForecastWindKmh(hourly, daily);
    const window = findBestTravelWindow(hourly);
    const packing = buildPackingList(weather, hourly, daily);

    let bestTime;
    if (stormNow || peakRain >= 85) {
        bestTime = 'Avoid peak storm hours. If travel is essential, use the briefest dry window and stay flexible.';
    } else if (window?.start && window?.end && window.start !== '--') {
        bestTime = `The most comfortable window looks like ${window.start} to ${window.end}, with lower rain and milder conditions.`;
    } else if (tempRounded != null && tempRounded >= 34) {
        bestTime = 'Travel early morning or after sunset when temperatures are cooler and sightseeing is easier.';
    } else if (peakRain >= 55) {
        bestTime = 'Plan movement between shower breaks. Mid-morning or late afternoon often works best.';
    } else {
        bestTime = 'Most of the day looks suitable for travel. Midday offers the steadiest conditions overall.';
    }

    let tourist;
    if (stormNow || peakRain >= 80) {
        tourist = `Explore indoor highlights in ${name}\u2014museums, covered markets, and local caf\u00e9s are better bets today.`;
    } else if (rainNow || peakRain >= 60) {
        tourist = `Mix sheltered sights with short outdoor stops in ${name}. Temples, galleries, and food halls work well between showers.`;
    } else if (tempRounded != null && tempRounded >= 34) {
        tourist = `Visit ${name} in the early morning or evening. Coastal viewpoints, heritage walks, and shaded gardens are ideal before heat builds.`;
    } else if (tempRounded != null && tempRounded <= 10) {
        tourist = `Warm up with ${name}\u2019s indoor culture spots, then catch brief outdoor landmarks when winds stay calm.`;
    } else if (description.includes('clear') || description.includes('sun') || (peakRain < 30 && tempRounded != null && tempRounded >= 18)) {
        tourist = `Excellent day to explore ${name} outdoors\u2014waterfronts, old town walks, parks, and open-air viewpoints should shine.`;
    } else {
        tourist = `Balance outdoor landmarks with flexible indoor plans in ${name} in case clouds or light rain appear later.`;
    }

    const tips = [];
    if (peakRain >= 50) tips.push('Keep rain gear accessible even if skies look clear at departure.');
    if (tempRounded != null && tempRounded >= 32) tips.push('Schedule water breaks and seek shade during midday hours.');
    if (tempRounded != null && tempRounded <= 8) tips.push('Layer up for cold snaps, especially after sunset.');
    if (Number(weather.humidity) >= 80) tips.push('High humidity can feel warmer than the thermometer suggests.');
    if (Number(weather.air_quality?.aqi) >= 4) tips.push('Air quality is poor\u2014limit long outdoor exposure if you are sensitive.');
    if (windKmh != null && windKmh >= 40) tips.push('Windy conditions can make open areas feel colder and slow walking tours.');
    if (visibilityKm != null && visibilityKm < 3) tips.push('Fog or haze may reduce scenic views. Confirm transport schedules early.');
    if (tips.length === 0) tips.push('Check the hourly forecast before heading out and carry a light layer for changing temperatures.');

    let roadCondition;
    let roadLevel = 'good';
    if (stormNow || peakRain >= 85) {
        roadCondition = 'Hazardous. Expect flooded patches, debris, and slower traffic. Avoid unnecessary road trips.';
        roadLevel = 'hazardous';
    } else if (peakRain >= 65 || rainNow) {
        roadCondition = 'Wet and slick. Increase following distance and watch for standing water on low-lying roads.';
        roadLevel = 'wet';
    } else if (visibilityKm != null && visibilityKm < 3) {
        roadCondition = 'Reduced visibility. Fog or haze may slow highway speeds and complicate night driving.';
        roadLevel = 'caution';
    } else if (windKmh != null && windKmh >= 55) {
        roadCondition = 'Wind-affected. High-profile vehicles should reduce speed on exposed bridges and coastal routes.';
        roadLevel = 'caution';
    } else if (peakRain >= 40) {
        roadCondition = 'Mostly dry with shower risk. Roads should be passable, but brief slick spots are possible.';
        roadLevel = 'fair';
    } else {
        roadCondition = 'Good. Dry pavement and routine traffic conditions are expected across main routes.';
        roadLevel = 'good';
    }

    return {
        bestTime,
        packing,
        tourist,
        weatherTips: tips,
        roadCondition,
        roadLevel
    };
}

function renderTravelCard(item, travel) {
    if (item.id === 'packing') {
        const items = travel.packing || [];
        return `
            <article class="travel-card travel-card-packing">
                <div class="travel-card-icon" aria-hidden="true">${item.icon}</div>
                <div class="travel-card-body">
                    <h4>${escapeHtml(item.label)}</h4>
                    <ul class="travel-packing-list">
                        ${items.map((entry) => `<li>${escapeHtml(entry)}</li>`).join('')}
                    </ul>
                </div>
            </article>
        `;
    }

    if (item.id === 'weatherTips') {
        const tips = travel.weatherTips || [];
        return `
            <article class="travel-card travel-card-tips">
                <div class="travel-card-icon" aria-hidden="true">${item.icon}</div>
                <div class="travel-card-body">
                    <h4>${escapeHtml(item.label)}</h4>
                    <ul class="travel-tip-list">
                        ${tips.map((tip) => `<li>${escapeHtml(tip)}</li>`).join('')}
                    </ul>
                </div>
            </article>
        `;
    }

    const text = item.id === 'roadCondition'
        ? travel.roadCondition
        : travel[item.id];
    const extraClass = item.id === 'roadCondition' ? ` travel-road-${escapeHtml(travel.roadLevel || 'good')}` : '';

    return `
        <article class="travel-card${extraClass}">
            <div class="travel-card-icon" aria-hidden="true">${item.icon}</div>
            <div class="travel-card-body">
                <h4>${escapeHtml(item.label)}</h4>
                <p>${escapeHtml(text || 'Updating travel guidance...')}</p>
            </div>
        </article>
    `;
}

function renderTravelSection(travel) {
    return `
        <section class="travel-section" aria-label="Travel guide">
            <div class="forecast-header">
                <div>
                    <span class="eyebrow">Travel guide</span>
                    <h3>Plan your trip</h3>
                </div>
                <span id="travelStatus" class="forecast-count">Ready</span>
            </div>
            <div id="travelGrid" class="travel-grid">
                ${TRAVEL_SECTION_ITEMS.map((item) => renderTravelCard(item, travel)).join('')}
            </div>
        </section>
    `;
}

function updateTravelSection() {
    if (usingRealAiInsights) return;
    if (!currentWeatherData) return;

    const travel = generateTravelGuide(currentWeatherData, currentHourlyForecast, currentDailyForecast);
    const grid = document.getElementById('travelGrid');
    const status = document.getElementById('travelStatus');

    if (grid) {
        grid.innerHTML = TRAVEL_SECTION_ITEMS.map((item) => renderTravelCard(item, travel)).join('');
    }
    if (status) status.textContent = 'Ready';
}

const FARMING_SECTION_ITEMS = [
    { id: 'cropRecommendation', label: 'Crop recommendation', icon: '&#127807;' },
    { id: 'rainPrediction', label: 'Rain prediction', icon: '&#127783;' },
    { id: 'soilMoisture', label: 'Soil moisture', icon: '&#127756;' },
    { id: 'irrigation', label: 'Irrigation suggestion', icon: '&#128167;' },
    { id: 'harvest', label: 'Harvest advice', icon: '&#127806;' }
];

function estimateSoilMoisture(weather = {}, hourly = [], daily = []) {
    const humidity = Number(weather.humidity);
    const rainNow = isRainCondition(weather.icon, weather.description || '');
    const peakRain = maxForecastRainChance(hourly);
    const avgDailyRain = daily.slice(0, 3).reduce((sum, day) => sum + (Number(day.rain_chance) || 0), 0) / Math.max(daily.slice(0, 3).length, 1);

    let score = 35;
    if (Number.isFinite(humidity)) score += humidity * 0.35;
    if (rainNow) score += 18;
    if (peakRain >= 70) score += 15;
    else if (peakRain >= 45) score += 8;
    score += avgDailyRain * 0.12;
    score = Math.min(Math.max(Math.round(score), 0), 100);

    let level;
    let label;
    if (score >= 80) {
        level = 'saturated';
        label = 'Saturated';
    } else if (score >= 60) {
        level = 'moist';
        label = 'Moist';
    } else if (score >= 40) {
        level = 'moderate';
        label = 'Moderate';
    } else {
        level = 'dry';
        label = 'Dry';
    }

    return { score, level, label };
}

function recommendCrops(weather = {}, hourly = [], daily = []) {
    const temp = Number(weather.temperature);
    const humidity = Number(weather.humidity);
    const peakRain = maxForecastRainChance(hourly);
    const moisture = estimateSoilMoisture(weather, hourly, daily);

    if (temp >= 28 && humidity >= 70 && peakRain >= 45) {
        return ['Rice', 'Coconut', 'Banana', 'Rubber', 'Black pepper'];
    }
    if (temp >= 30 && peakRain < 35) {
        return ['Cotton', 'Millet', 'Groundnut', 'Sunflower', 'Chickpea'];
    }
    if (temp >= 20 && temp < 30 && peakRain >= 30 && peakRain < 70) {
        return ['Wheat', 'Maize', 'Soybean', 'Vegetables', 'Pulses'];
    }
    if (temp >= 15 && temp < 25) {
        return ['Wheat', 'Barley', 'Potato', 'Mustard', 'Peas'];
    }
    if (temp < 15) {
        return ['Winter wheat', 'Barley', 'Oats', 'Potato', 'Cabbage'];
    }
    if (moisture.level === 'dry') {
        return ['Millet', 'Sorghum', 'Pigeon pea', 'Castor', 'Sesame'];
    }
    return ['Vegetables', 'Pulses', 'Maize', 'Okra', 'Green gram'];
}

function generateFarmingGuide(weather = {}, hourly = [], daily = []) {
    const name = weather.name || 'your region';
    const rainNow = isRainCondition(weather.icon, weather.description || '');
    const stormNow = isStormCondition(weather.icon, weather.description || '');
    const peakRain = maxForecastRainChance(hourly);
    const moisture = estimateSoilMoisture(weather, hourly, daily);
    const crops = recommendCrops(weather, hourly, daily);
    const next24RainHours = hourly.slice(0, 24).filter((hour) => Number(hour.rain_chance) >= 50).length;
    const next7DayRainDays = daily.slice(0, 7).filter((day) => Number(day.rain_chance) >= 50).length;
    const dryDaysAhead = daily.slice(0, 5).filter((day) => Number(day.rain_chance) < 35).length;

    let rainPrediction;
    if (stormNow || peakRain >= 85) {
        rainPrediction = `Heavy rain likely in ${name} over the next 24 hours. Expect ${next24RainHours || 'several'} high-chance rain periods and ${next7DayRainDays} wet days this week.`;
    } else if (peakRain >= 60 || rainNow) {
        rainPrediction = `Rain is expected soon with peaks near ${Math.round(peakRain)}%. About ${next24RainHours} hours may see meaningful rainfall in the next day.`;
    } else if (peakRain >= 35) {
        rainPrediction = `Scattered showers possible with rain chances up to ${Math.round(peakRain)}%. Roughly ${next7DayRainDays} days this week may bring light rain.`;
    } else {
        rainPrediction = `Limited rainfall expected. Only ${next7DayRainDays} day(s) this week show notable rain chances, with a peak near ${Math.round(peakRain)}%.`;
    }

    let soilMoistureText = `Estimated soil moisture is ${moisture.label.toLowerCase()} (${moisture.score}%). `;
    if (moisture.level === 'saturated') {
        soilMoistureText += 'Fields may be waterlogged. Improve drainage before field work.';
    } else if (moisture.level === 'moist') {
        soilMoistureText += 'Good moisture for most crops. Monitor low-lying plots after showers.';
    } else if (moisture.level === 'moderate') {
        soilMoistureText += 'Adequate for many crops, but shallow roots may need watching.';
    } else {
        soilMoistureText += 'Soil is drying out. Crop stress may appear without irrigation or incoming rain.';
    }

    let irrigation;
    if (moisture.level === 'saturated' || peakRain >= 75) {
        irrigation = 'Hold irrigation. Incoming rain should replenish fields and excess water may cause runoff.';
    } else if (moisture.level === 'moist' && peakRain >= 45) {
        irrigation = 'Reduce irrigation to maintenance levels. Forecast rain should sustain current moisture.';
    } else if (moisture.level === 'dry' && peakRain < 40) {
        irrigation = 'Irrigate soon, preferably early morning or evening. Prioritize fruiting plots and newly sown beds.';
    } else if (moisture.level === 'moderate' && peakRain < 35) {
        irrigation = 'Light irrigation may help root zones. Focus on sandy soils and water-sensitive crops.';
    } else {
        irrigation = 'Use moderate irrigation as needed. Adjust based on crop stage and tomorrow\u2019s rain outlook.';
    }

    let harvest;
    if (stormNow || peakRain >= 80) {
        harvest = 'Delay harvest if possible. Wet crops reduce grain quality and field access may be difficult.';
    } else if (dryDaysAhead >= 3 && peakRain < 40) {
        harvest = `Good harvest window ahead with about ${dryDaysAhead} drier days expected. Plan cutting and drying accordingly.`;
    } else if (rainNow) {
        harvest = 'Pause harvest during active rain. Resume when fields drain and heads or pods are dry enough.';
    } else if (Number(weather.temperature) >= 35) {
        harvest = 'Harvest early morning to avoid heat stress on workers and crop spoilage during midday drying.';
    } else {
        harvest = 'Harvest conditions are fair. Watch the hourly forecast and finish drying before the next shower.';
    }

    return {
        cropRecommendation: crops,
        rainPrediction,
        soilMoisture: soilMoistureText,
        soilMoistureLevel: moisture.level,
        soilMoistureScore: moisture.score,
        irrigation,
        harvest
    };
}

function renderFarmingCard(item, farming) {
    if (item.id === 'cropRecommendation') {
        const crops = farming.cropRecommendation || [];
        return `
            <article class="farming-card farming-card-crops">
                <div class="farming-card-icon" aria-hidden="true">${item.icon}</div>
                <div class="farming-card-body">
                    <h4>${escapeHtml(item.label)}</h4>
                    <ul class="farming-crop-list">
                        ${crops.map((crop) => `<li>${escapeHtml(crop)}</li>`).join('')}
                    </ul>
                </div>
            </article>
        `;
    }

    if (item.id === 'soilMoisture') {
        const score = farming.soilMoistureScore ?? 0;
        return `
            <article class="farming-card farming-moisture-${escapeHtml(farming.soilMoistureLevel || 'moderate')}">
                <div class="farming-card-icon" aria-hidden="true">${item.icon}</div>
                <div class="farming-card-body">
                    <h4>${escapeHtml(item.label)}</h4>
                    <div class="farming-moisture-meter" aria-hidden="true">
                        <span style="width: ${Math.min(Math.max(score, 0), 100)}%"></span>
                    </div>
                    <p>${escapeHtml(farming.soilMoisture || 'Estimating soil moisture...')}</p>
                </div>
            </article>
        `;
    }

    const text = farming[item.id];
    return `
        <article class="farming-card">
            <div class="farming-card-icon" aria-hidden="true">${item.icon}</div>
            <div class="farming-card-body">
                <h4>${escapeHtml(item.label)}</h4>
                <p>${escapeHtml(text || 'Updating farming guidance...')}</p>
            </div>
        </article>
    `;
}

function renderFarmingSection(farming) {
    return `
        <section class="farming-section" aria-label="Farming guide">
            <div class="forecast-header">
                <div>
                    <span class="eyebrow">Farming guide</span>
                    <h3>Field planning</h3>
                </div>
                <span id="farmingStatus" class="forecast-count">Ready</span>
            </div>
            <div id="farmingGrid" class="farming-grid">
                ${FARMING_SECTION_ITEMS.map((item) => renderFarmingCard(item, farming)).join('')}
            </div>
        </section>
    `;
}

function updateFarmingSection() {
    if (usingRealAiInsights) return;
    if (!currentWeatherData) return;

    const farming = generateFarmingGuide(currentWeatherData, currentHourlyForecast, currentDailyForecast);
    const grid = document.getElementById('farmingGrid');
    const status = document.getElementById('farmingStatus');

    if (grid) {
        grid.innerHTML = FARMING_SECTION_ITEMS.map((item) => renderFarmingCard(item, farming)).join('');
    }
    if (status) status.textContent = 'Ready';
}

function renderWeather(data, customTitle) {
    const description = data.description || 'Weather';
    const title = customTitle || `${data.name}, ${data.country}`;
    const iconUrl = `https://openweathermap.org/img/wn/${encodeURIComponent(data.icon)}@2x.png`;
    const animatedIconClass = getAnimatedWeatherClass(data.icon, description);
    const summary = data.summary || `${description} in ${title}.`;
    const cloudText = Number.isFinite(Number(data.clouds)) ? `${formatNumber(data.clouds)}% cover` : '';
    const alerts = evaluateWeatherAlerts(data, currentHourlyForecast, currentDailyForecast);
    const aiSummary = generateAiSummary(data, currentHourlyForecast, currentDailyForecast);
    const travelGuide = generateTravelGuide(data, currentHourlyForecast, currentDailyForecast);
    const farmingGuide = generateFarmingGuide(data, currentHourlyForecast, currentDailyForecast);

    destroyWeatherCharts();
    updateBackground(description);

    if (marker) {
        marker.bindPopup(buildMarkerPopup(`${data.name}, ${data.country}`, data.lat, data.lng, {
            temperature: data.temperature,
            description,
            subtitle: 'Live weather'
        }), {
            className: 'weather-map-popup weather-popup',
            maxWidth: 260
        }).openPopup();
    }

    swapWeatherContent(`
        <div class="weather-data">
            ${renderEmergencyBanner(alerts)}
            <div class="weather-current">
                <div>
                    <span class="eyebrow">Current weather</span>
                    <h2>${escapeHtml(title)}</h2>
                    <p class="weather-summary">${escapeHtml(summary)}</p>
                </div>
                <div class="weather-visual" aria-label="${escapeHtml(description)}">
                    ${renderAnimatedWeatherIcon(animatedIconClass)}
                    <img src="${iconUrl}" alt="${escapeHtml(description)} icon" class="weather-icon" width="78" height="78" loading="lazy" decoding="async">
                </div>
            </div>

            <div class="temperature-row">
                <div>
                    <span class="temp-label">Temperature</span>
                    <div class="temp-value">${formatTemperature(data.temperature)}</div>
                </div>
                <div class="condition-chip">${escapeHtml(description)}</div>
            </div>

            <div class="weather-details" aria-label="Detailed weather information">
                ${renderMetric('Feels Like', formatTemperature(data.feels_like))}
                ${renderMetric('Humidity', `${formatNumber(data.humidity)}%`)}
                ${renderMetric('Pressure', `${formatNumber(data.pressure)} hPa`)}
                ${renderMetric('Wind Speed', formatWindSpeed(data.wind_speed), 'OpenWeather wind')}
                ${renderMetric('Visibility', formatVisibility(data.visibility))}
                ${renderMetric('Sunrise', escapeHtml(formatLocationTime(data.sunrise, data.timezone)), 'Local time')}
                ${renderMetric('Sunset', escapeHtml(formatLocationTime(data.sunset, data.timezone)), 'Local time')}
                ${renderMetric('Clouds', Number.isFinite(Number(data.clouds)) ? `${formatNumber(data.clouds)}%` : '--', cloudText)}
            </div>

            ${renderAiSummarySection(aiSummary, 'ready')}
            ${renderTravelSection(travelGuide)}
            ${renderFarmingSection(farmingGuide)}
            ${renderAlertsSection(alerts)}
            ${renderAirQuality(data)}
            ${renderChartsShell()}
            ${renderForecastShell('loading', 'Loading next 24 hours...')}
            ${renderDailyForecastShell('loading', 'Loading 7-day forecast...')}
        </div>
    `);

    if (cityEl && data.name) cityEl.value = data.name;
    currentWeatherData = data;
    window.requestAnimationFrame(() => {
        renderCurrentCharts(data).catch(() => {});
    });
}

function formatForecastTime(value) {
    if (!value) return '--';

    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) return '--';

    return new Intl.DateTimeFormat(undefined, {
        hour: 'numeric',
        hour12: true
    }).format(parsedDate);
}

function formatForecastDay(value) {
    if (!value) return '--';

    const parsedDate = new Date(`${value}T12:00:00`);
    if (Number.isNaN(parsedDate.getTime())) return '--';

    return new Intl.DateTimeFormat(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
    }).format(parsedDate);
}

function renderForecastCards(forecast) {
    const track = document.getElementById('hourlyForecastTrack');
    const count = document.getElementById('forecastCount');
    if (!track) return;

    if (!forecast || forecast.length === 0) {
        track.classList.remove('is-loading');
        track.innerHTML = '<div class="forecast-status">No hourly forecast available.</div>';
        if (count) count.textContent = 'No data';
        return;
    }

    track.classList.remove('is-loading');
    if (count) count.textContent = `${forecast.length} hours`;
    track.innerHTML = forecast.map((hour, index) => {
        const iconClass = getForecastIconClass(hour.icon);
        const rainChance = Number.isFinite(Number(hour.rain_chance)) ? `${formatNumber(hour.rain_chance)}%` : '--';
        const windSpeed = Number.isFinite(Number(hour.wind_speed)) ? `${formatNumber(hour.wind_speed, 1)} km/h` : '--';

        return `
            <article class="forecast-card" style="--forecast-index: ${index}">
                <time class="forecast-time" datetime="${escapeHtml(hour.time)}">${escapeHtml(formatForecastTime(hour.time))}</time>
                ${renderAnimatedWeatherIcon(iconClass, 'forecast-icon')}
                <div class="forecast-temp">${formatTemperature(hour.temperature)}</div>
                <div class="forecast-condition">${escapeHtml(hour.description)}</div>
                <div class="forecast-card-metrics">
                    <span>Rain chance ${escapeHtml(rainChance)}</span>
                    <span>Wind ${escapeHtml(windSpeed)}</span>
                </div>
            </article>
        `;
    }).join('');
    track.scrollTo({ left: 0, behavior: 'smooth' });
    currentHourlyForecast = forecast;
    updateHourlyCharts(forecast);
    updateWeatherAlerts();
    updateAiSummary();
    updateTravelSection();
    updateFarmingSection();
}

function renderForecastError(message) {
    const track = document.getElementById('hourlyForecastTrack');
    const count = document.getElementById('forecastCount');
    if (!track) return;

    track.classList.remove('is-loading');
    if (count) count.textContent = 'Unavailable';
    track.innerHTML = `<div class="forecast-status forecast-error">${escapeHtml(message)}</div>`;
}

function renderDailyForecastCards(forecast) {
    const grid = document.getElementById('dailyForecastGrid');
    const count = document.getElementById('dailyForecastCount');
    if (!grid) return;

    if (!forecast || forecast.length === 0) {
        grid.classList.remove('is-loading');
        grid.innerHTML = '<div class="daily-status">No 7-day forecast available.</div>';
        if (count) count.textContent = 'No data';
        return;
    }

    grid.classList.remove('is-loading');
    if (count) count.textContent = `${forecast.length} days`;
    grid.innerHTML = forecast.map((day, index) => {
        const iconClass = getForecastIconClass(day.icon);
        const rainChance = Number.isFinite(Number(day.rain_chance)) ? `${formatNumber(day.rain_chance)}%` : '--';
        const windSpeed = Number.isFinite(Number(day.wind_speed)) ? `${formatNumber(day.wind_speed, 1)} km/h` : '--';
        const humidity = Number.isFinite(Number(day.humidity)) ? `${formatNumber(day.humidity)}%` : '--';

        return `
            <article class="daily-card" style="--daily-index: ${index}">
                <div class="daily-card-top">
                    <time class="daily-day" datetime="${escapeHtml(day.date)}">${escapeHtml(formatForecastDay(day.date))}</time>
                    <span class="daily-condition">${escapeHtml(day.description)}</span>
                </div>
                ${renderAnimatedWeatherIcon(iconClass, 'daily-icon')}
                <div class="daily-temp">${formatTemperature(day.temperature)}</div>
                <div class="daily-high-low">
                    <span>High ${formatTemperature(day.high)}</span>
                    <span>Low ${formatTemperature(day.low)}</span>
                </div>
                <div class="daily-metrics">
                    <span>Rain ${escapeHtml(rainChance)}</span>
                    <span>Wind ${escapeHtml(windSpeed)}</span>
                    <span>Humidity ${escapeHtml(humidity)}</span>
                </div>
            </article>
        `;
    }).join('');
    currentDailyForecast = forecast;
    updateDailyCharts(forecast);
    updateWeatherAlerts();
    updateAiSummary();
    updateTravelSection();
    updateFarmingSection();
}

function renderDailyForecastError(message) {
    const grid = document.getElementById('dailyForecastGrid');
    const count = document.getElementById('dailyForecastCount');
    if (!grid) return;

    grid.classList.remove('is-loading');
    if (count) count.textContent = 'Unavailable';
    grid.innerHTML = `<div class="daily-status daily-error">${escapeHtml(message)}</div>`;
}

function openMeteoCondition(code) {
    const weatherCode = Number(code);

    if (weatherCode === 0) return { description: 'Clear sky', icon: 'sunny' };
    if ([1, 2].includes(weatherCode)) return { description: 'Partly cloudy', icon: 'cloudy' };
    if (weatherCode === 3) return { description: 'Overcast', icon: 'cloudy' };
    if ([45, 48].includes(weatherCode)) return { description: 'Fog', icon: 'mist' };
    if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(weatherCode)) {
        return { description: 'Rain likely', icon: 'rain' };
    }
    if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) return { description: 'Snow', icon: 'snow' };
    if ([95, 96, 99].includes(weatherCode)) return { description: 'Thunderstorm', icon: 'storm' };

    return { description: 'Mixed conditions', icon: 'cloudy' };
}

function getOpenMeteoValue(values, index) {
    return Array.isArray(values) && index < values.length ? values[index] : null;
}

function multiplyFinite(value, multiplier) {
    const number = Number(value);
    return Number.isFinite(number) ? number * multiplier : null;
}

function averageNumbers(values) {
    const numbers = values.map(Number).filter(Number.isFinite);
    if (!numbers.length) return null;
    return Math.round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length);
}

async function geocodeCityWithOpenMeteo(city, signal) {
    const alias = STATIC_LOCATION_ALIASES[String(city).trim().toLowerCase()];
    if (alias) return alias;

    const query = new URLSearchParams({
        name: city,
        count: '10',
        language: 'en',
        format: 'json'
    });
    const data = await fetchJson(`${OPEN_METEO_GEOCODING_URL}?${query.toString()}`, { signal }, 0);
    const place = data.results?.[0];

    if (!place) throw new Error('City not found');

    return {
        name: place.name,
        country: place.country_code || place.country || '',
        lat: place.latitude,
        lng: place.longitude,
        timezone: place.timezone
    };
}

async function fetchOpenMeteoForecast(lat, lng, signal) {
    const query = new URLSearchParams({
        latitude: lat,
        longitude: lng,
        current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,cloud_cover,pressure_msl,wind_speed_10m',
        hourly: 'temperature_2m,relative_humidity_2m,precipitation_probability,pressure_msl,wind_speed_10m,weather_code',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset',
        forecast_days: '7',
        timezone: 'auto',
        wind_speed_unit: 'ms'
    });

    return fetchJson(`${OPEN_METEO_FORECAST_URL}?${query.toString()}`, { signal }, 0);
}

function normalizeOpenMeteoWeather(payload, place = {}) {
    const current = payload.current || {};
    const condition = openMeteoCondition(current.weather_code);

    return {
        name: place.name || 'Current location',
        country: place.country || '',
        temperature: current.temperature_2m,
        feels_like: current.apparent_temperature,
        humidity: current.relative_humidity_2m,
        pressure: current.pressure_msl,
        wind_speed: current.wind_speed_10m,
        visibility: null,
        sunrise: Date.parse(payload.daily?.sunrise?.[0]) / 1000 || null,
        sunset: Date.parse(payload.daily?.sunset?.[0]) / 1000 || null,
        timezone: 0,
        clouds: current.cloud_cover,
        description: condition.description,
        icon: condition.icon,
        summary: `${condition.description} with a temperature near ${formatNumber(current.temperature_2m)} C, feeling like ${formatNumber(current.apparent_temperature)} C.`,
        lat: payload.latitude ?? place.lat,
        lng: payload.longitude ?? place.lng,
        air_quality: null
    };
}

function normalizeOpenMeteoHourly(payload) {
    const hourly = payload.hourly || {};
    const times = hourly.time || [];
    const currentTime = payload.current?.time;
    const startIndex = currentTime
        ? times.findIndex((time) => String(time) >= String(currentTime))
        : -1;
    const first = startIndex >= 0 ? startIndex : 0;

    return times.slice(first, first + 24).map((time, offset) => {
        const index = first + offset;
        const condition = openMeteoCondition(getOpenMeteoValue(hourly.weather_code, index));

        return {
            time,
            temperature: getOpenMeteoValue(hourly.temperature_2m, index),
            rain_chance: getOpenMeteoValue(hourly.precipitation_probability, index),
            pressure: getOpenMeteoValue(hourly.pressure_msl, index),
            wind_speed: multiplyFinite(getOpenMeteoValue(hourly.wind_speed_10m, index), 3.6),
            humidity: getOpenMeteoValue(hourly.relative_humidity_2m, index),
            weather_code: getOpenMeteoValue(hourly.weather_code, index),
            description: condition.description,
            icon: condition.icon
        };
    });
}

function normalizeOpenMeteoDaily(payload) {
    const daily = payload.daily || {};
    const hourly = payload.hourly || {};

    return (daily.time || []).slice(0, 7).map((date, index) => {
        const high = getOpenMeteoValue(daily.temperature_2m_max, index);
        const low = getOpenMeteoValue(daily.temperature_2m_min, index);
        const condition = openMeteoCondition(getOpenMeteoValue(daily.weather_code, index));
        const humidityValues = (hourly.time || [])
            .map((time, hourlyIndex) => String(time).startsWith(date) ? getOpenMeteoValue(hourly.relative_humidity_2m, hourlyIndex) : null)
            .filter((value) => value != null);

        return {
            date,
            temperature: Number.isFinite(Number(high)) && Number.isFinite(Number(low)) ? (Number(high) + Number(low)) / 2 : null,
            high,
            low,
            rain_chance: getOpenMeteoValue(daily.precipitation_probability_max, index),
            wind_speed: multiplyFinite(getOpenMeteoValue(daily.wind_speed_10m_max, index), 3.6),
            humidity: averageNumbers(humidityValues),
            weather_code: getOpenMeteoValue(daily.weather_code, index),
            description: condition.description,
            icon: condition.icon
        };
    });
}

async function fetchStaticWeatherFallback(params, signal) {
    let place;

    if (params.get('city')) {
        place = await geocodeCityWithOpenMeteo(params.get('city'), signal);
    } else {
        const lat = Number(params.get('lat'));
        const lng = Number(params.get('lng'));
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('Provide either city or location.');
        place = { name: 'Current location', country: '', lat, lng };
    }

    const forecast = await fetchOpenMeteoForecast(place.lat, place.lng, signal);

    return {
        weather: normalizeOpenMeteoWeather(forecast, place),
        hourly: normalizeOpenMeteoHourly(forecast),
        daily: normalizeOpenMeteoDaily(forecast)
    };
}

async function fetchHourlyForecast(lat, lng) {
    const latitude = Number(lat);
    const longitude = Number(lng);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        renderForecastError('Forecast needs a valid location.');
        return;
    }

    forecastRequestController?.abort();
    forecastRequestController = new AbortController();

    try {
        const params = new URLSearchParams({ lat: latitude, lng: longitude });
        const data = await fetchJson(`/api/hourly-forecast?${params.toString()}`, {
            signal: forecastRequestController.signal
        });

        renderForecastCards(data.forecast);
    } catch (error) {
        if (error.name !== 'AbortError') {
            try {
                const data = await fetchOpenMeteoForecast(latitude, longitude, forecastRequestController.signal);
                renderForecastCards(normalizeOpenMeteoHourly(data));
            } catch (fallbackError) {
                if (fallbackError.name !== 'AbortError') renderForecastError(fallbackError.message);
            }
        }
    }
}

async function fetchDailyForecast(lat, lng) {
    const latitude = Number(lat);
    const longitude = Number(lng);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        renderDailyForecastError('7-day forecast needs a valid location.');
        return;
    }

    dailyForecastRequestController?.abort();
    dailyForecastRequestController = new AbortController();

    try {
        const params = new URLSearchParams({ lat: latitude, lng: longitude });
        const data = await fetchJson(`/api/daily-forecast?${params.toString()}`, {
            signal: dailyForecastRequestController.signal
        });

        renderDailyForecastCards(data.forecast);
    } catch (error) {
        if (error.name !== 'AbortError') {
            try {
                const data = await fetchOpenMeteoForecast(latitude, longitude, dailyForecastRequestController.signal);
                renderDailyForecastCards(normalizeOpenMeteoDaily(data));
            } catch (fallbackError) {
                if (fallbackError.name !== 'AbortError') renderDailyForecastError(fallbackError.message);
            }
        }
    }
}

async function fetchJson(url, options = {}, retries = 1) {
    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            const response = await fetch(url, options);
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || data.message || 'Request failed');
            }

            return data;
        } catch (error) {
            lastError = error;
            if (attempt >= retries) break;
            await new Promise((resolve) => window.setTimeout(resolve, 350 * (attempt + 1)));
        }
    }

    if (!navigator.onLine) {
        throw new Error('You are offline. Showing cached data when available.');
    }

    throw lastError || new Error('Request failed');
}

async function fetchWeatherFromApi(params, label) {
    weatherRequestController?.abort();
    weatherRequestController = new AbortController();

    try {
        setLoading(true);
        usingRealAiInsights = false; // Reset the AI insights flag
        currentHourlyForecast = [];
        currentDailyForecast = [];

        if (IS_GITHUB_PAGES) {
            const fallback = await fetchStaticWeatherFallback(params, weatherRequestController.signal);
            renderWeather(fallback.weather, label);
            renderForecastCards(fallback.hourly);
            renderDailyForecastCards(fallback.daily);
            setMarker(fallback.weather.lat, fallback.weather.lng, `${fallback.weather.name}, ${fallback.weather.country}`, {
                type: 'weather',
                subtitle: 'Live weather',
                temperature: fallback.weather.temperature,
                description: fallback.weather.description
            });
            return fallback.weather;
        }

        const data = await fetchJson(`/api/weather?${params.toString()}`, {
            signal: weatherRequestController.signal
        });

        renderWeather(data.weather, label);
        if (data.weather?.lat != null && data.weather?.lng != null) {
            fetchHourlyForecast(data.weather.lat, data.weather.lng);
            fetchDailyForecast(data.weather.lat, data.weather.lng);
            const city = params.get('city') || data.weather.name;
            fetchWeatherInsights(city, data.weather.lat, data.weather.lng);
        }
        if (window.UserData?.isLoggedIn()) {
            window.UserData.recordWeatherHistory(data.weather?.name || label, data.weather);
        }
        return data.weather;
    } catch (error) {
        if (error.name === 'AbortError') {
            return null;
        }

        try {
            const fallback = await fetchStaticWeatherFallback(params, weatherRequestController.signal);
            renderWeather(fallback.weather, label);
            renderForecastCards(fallback.hourly);
            renderDailyForecastCards(fallback.daily);
            setMarker(fallback.weather.lat, fallback.weather.lng, `${fallback.weather.name}, ${fallback.weather.country}`, {
                type: 'weather',
                subtitle: 'Live weather',
                temperature: fallback.weather.temperature,
                description: fallback.weather.description
            });
            return fallback.weather;
        } catch (fallbackError) {
            if (fallbackError.name !== 'AbortError') {
                showWeatherError(fallbackError.message || error.message, () => fetchWeatherFromApi(params, label));
            }
        }
        return null;
    } finally {
        setLoading(false);
    }
}

async function fetchWeatherByCoords(lat, lng, label) {
    const params = new URLSearchParams({ lat, lng });
    return fetchWeatherFromApi(params, label);
}

async function fetchWeather() {
    const city = (cityEl?.value ?? '').trim();

    if (!city) {
        showWeatherError('Please enter a city name.');
        return;
    }

    triggerSearchPulse();
    closeAutocomplete();
    const weather = await fetchWeatherFromApi(new URLSearchParams({ city }));
    if (weather?.lat != null && weather?.lng != null) {
        saveRecentSearch(weather.name || city);
        setMarker(weather.lat, weather.lng, `${weather.name}, ${weather.country}`, {
            type: 'weather',
            subtitle: 'Live weather',
            temperature: weather.temperature,
            description: weather.description
        });
    }
}

function setCurrentLocationButtonLoading(isLoading) {
    if (!useCurrentLocationEl) return;

    if (!useCurrentLocationEl.dataset.defaultLabel) {
        useCurrentLocationEl.dataset.defaultLabel = useCurrentLocationEl.textContent || 'Use Current Location';
    }

    useCurrentLocationEl.disabled = isLoading;
    useCurrentLocationEl.textContent = isLoading ? 'Locating...' : useCurrentLocationEl.dataset.defaultLabel;
}

function getGeolocationErrorMessage(error) {
    if (!window.isSecureContext && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
        return 'Current location needs HTTPS. Open the deployed GitHub Pages URL with https://.';
    }

    if (error?.code === 1) return 'Location permission was blocked. Allow location access in your browser, then try again.';
    if (error?.code === 2) return 'Your browser could not determine your location. Check location services and try again.';
    if (error?.code === 3) return 'Location lookup timed out. Try again, or search your city manually.';

    return error?.message || 'Could not access your location.';
}

function updateCurrentLocationMap(latitude, longitude) {
    lazyInitializeMap()
        .then(() => {
            setCurrentLocationMarker(latitude, longitude);
            setMarker(latitude, longitude, 'Current location', {
                type: 'current',
                subtitle: 'Live weather for your location',
                zoom: 14
            });
        })
        .catch((error) => {
            if (placesEl) placesEl.innerHTML = `<div class="map-error">${escapeHtml(error.message || 'Map failed to load.')}</div>`;
        });
}

function useCurrentLocation() {
    if (!navigator.geolocation) {
        if (placesEl) placesEl.innerHTML = '<div class="map-error">Geolocation is not supported in this browser.</div>';
        return;
    }

    if (!window.isSecureContext && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
        if (placesEl) placesEl.innerHTML = '<div class="map-error">Current location needs HTTPS. Open the deployed GitHub Pages URL with https://.</div>';
        return;
    }

    setCurrentLocationButtonLoading(true);
    if (placesEl) placesEl.innerHTML = '<div class="map-loading">Finding your location...</div>';

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const { latitude, longitude } = pos.coords;
            updateCurrentLocationMap(latitude, longitude);
            fetchWeatherByCoords(latitude, longitude, 'Current location');
            if (placesEl) placesEl.innerHTML = '<div class="map-loading">Location found. Loading weather...</div>';
            setCurrentLocationButtonLoading(false);
        },
        (err) => {
            if (placesEl) placesEl.innerHTML = `<div class="map-error">${escapeHtml(getGeolocationErrorMessage(err))}</div>`;
            setCurrentLocationButtonLoading(false);
        },
        {
            enableHighAccuracy: false,
            timeout: 20000,
            maximumAge: 300000
        }
    );
}

function renderPlaces(places) {
    if (!placesEl) return;

    if (!places || places.length === 0) {
        placesEl.innerHTML = '<div class="map-error">No results found.</div>';
        return;
    }

    placesEl.innerHTML = places.map((place, index) => {
        const title = place.title ?? `Result ${index + 1}`;
        const subtitle = place.address ?? '';

        return `
            <div class="place-item" data-index="${index}">
                <div class="place-title">${escapeHtml(title)}</div>
                <div class="place-subtitle">${escapeHtml(subtitle)}</div>
            </div>
        `;
    }).join('');

    placesEl.querySelectorAll('.place-item').forEach((el) => {
        el.addEventListener('click', () => {
            const place = places[Number(el.dataset.index)];
            if (!place) return;

            const lat = Number(place.lat);
            const lng = Number(place.lng);

            if (Number.isFinite(lat) && Number.isFinite(lng)) {
                setMarker(lat, lng, place.title, {
                    type: 'place',
                    subtitle: place.address || 'Place search result'
                });
                fetchWeatherByCoords(lat, lng, place.title);
            }
        });
    });
}

async function searchPlace() {
    try {
        await lazyInitializeMap();
    } catch (error) {
        if (placesEl) placesEl.innerHTML = `<div class="map-error">${escapeHtml(error.message)}</div>`;
        return;
    }

    ensureMap();

    const q = (placeQueryEl?.value ?? '').trim();
    if (!q) {
        if (placesEl) placesEl.innerHTML = '<div class="map-error">Type a place to search.</div>';
        return;
    }

    placeRequestController?.abort();
    placeRequestController = new AbortController();

    if (searchPlaceEl) searchPlaceEl.disabled = true;
    setPlacesLoading();

    try {
        const data = await fetchJson(`/api/maps-search?q=${encodeURIComponent(q)}`, {
            signal: placeRequestController.signal
        });

        const places = data.places ?? [];
        renderPlaces(places);

        const first = places[0];
        if (first?.lat != null && first?.lng != null) {
            setMarker(first.lat, first.lng, first.title ?? q, {
                type: 'place',
                subtitle: first.address || 'Place search result'
            });
            fetchWeatherByCoords(first.lat, first.lng, first.title ?? q);
        }
    } catch (error) {
        if (error.name !== 'AbortError' && placesEl) {
            placesEl.innerHTML = `<div class="map-error">${escapeHtml(error.message)}</div>`;
        }
    } finally {
        if (searchPlaceEl) searchPlaceEl.disabled = false;
    }
}

function bindEvents() {
    applyTheme(getInitialTheme());
    renderSearchAssist();
    bindRadarEvents();

    buttonEl?.addEventListener('click', fetchWeather);
    useCurrentLocationEl?.addEventListener('click', useCurrentLocation);
    searchPlaceEl?.addEventListener('click', searchPlace);
    themeToggleEl?.addEventListener('click', toggleTheme);
    clearSearchHistoryEl?.addEventListener('click', clearSearchHistory);

    cityEl?.addEventListener('input', () => {
        renderAutocomplete();
        renderSearchAssist();
    });

    cityEl?.addEventListener('focus', () => {
        renderAutocomplete();
        renderSearchAssist();
    });

    cityEl?.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown' && currentSuggestions.length > 0) {
            event.preventDefault();
            setActiveSuggestion((activeSuggestionIndex + 1) % currentSuggestions.length);
        } else if (event.key === 'ArrowUp' && currentSuggestions.length > 0) {
            event.preventDefault();
            setActiveSuggestion(activeSuggestionIndex <= 0 ? currentSuggestions.length - 1 : activeSuggestionIndex - 1);
        } else if (event.key === 'Enter') {
            event.preventDefault();
            if (activeSuggestionIndex >= 0 && currentSuggestions[activeSuggestionIndex]) {
                selectCity(currentSuggestions[activeSuggestionIndex]);
            } else {
                fetchWeather();
            }
        } else if (event.key === 'Escape') {
            closeAutocomplete();
        }
    });

    document.addEventListener('click', (event) => {
        if (!searchPanelEl?.contains(event.target)) closeAutocomplete();
    });

    placeQueryEl?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') searchPlace();
    });

    window.addEventListener('user-data-synced', () => {
        renderSearchAssist();
        renderAutocomplete();
    });
}

function bindMapInteractions(initializedMap) {
    initializedMap.on('click', (event) => {
        const { lat, lng } = event.latlng;
        setMarker(lat, lng, 'Selected location', {
            type: 'selected',
            subtitle: 'Fetching weather for this point...'
        });
        fetchWeatherByCoords(lat, lng, 'Selected location');
    });

    document.addEventListener('fullscreenchange', () => {
        mapEl?.classList.toggle('is-fullscreen', document.fullscreenElement === mapEl);
        window.setTimeout(() => initializedMap.invalidateSize?.(true), 180);
    });
}

bindEvents();
observeMapSection();

window.addEventListener('unhandledrejection', (event) => {
    if (event.reason?.name === 'AbortError') return;
    console.error('Unhandled promise rejection:', event.reason);
});

window.addEventListener('error', (event) => {
    console.error('Unhandled error:', event.error || event.message);
});

async function fetchWeatherInsights(city, lat, lng) {
    const params = new URLSearchParams();
    if (city) params.set('city', city);
    if (lat != null && lng != null) {
        params.set('lat', lat);
        params.set('lng', lng);
    }

    const aiSummaryStatus = document.getElementById('aiSummaryStatus');
    const travelStatus = document.getElementById('travelStatus');
    const farmingStatus = document.getElementById('farmingStatus');

    if (aiSummaryStatus) aiSummaryStatus.textContent = 'Generating AI summaries...';
    if (travelStatus) travelStatus.textContent = 'Generating AI suggestions...';
    if (farmingStatus) farmingStatus.textContent = 'Generating AI advice...';

    const aiGrid = document.getElementById('aiSummaryGrid');
    const travelGrid = document.getElementById('travelGrid');
    const farmingGrid = document.getElementById('farmingGrid');
    if (aiGrid) aiGrid.classList.add('is-loading');
    if (travelGrid) travelGrid.classList.add('is-loading');
    if (farmingGrid) farmingGrid.classList.add('is-loading');

    try {
        const insights = await fetchJson(`/api/weather-insights?${params.toString()}`);
        if (insights && !insights.error) {
            usingRealAiInsights = true;
            renderRealInsights(insights);
        } else {
            throw new Error(insights?.error || 'Gemini response empty');
        }
    } catch (err) {
        console.warn('Gemini API fallback to local calculations:', err.message);
        usingRealAiInsights = false;
        fallbackToLocalInsights();
    } finally {
        if (aiGrid) aiGrid.classList.remove('is-loading');
        if (travelGrid) travelGrid.classList.remove('is-loading');
        if (farmingGrid) farmingGrid.classList.remove('is-loading');
    }
}

function renderRealInsights(insights) {
    // 1. AI Summary
    const summary = insights.ai_summary;
    const narrative = document.getElementById('aiSummaryNarrative');
    const aiGrid = document.getElementById('aiSummaryGrid');
    const aiStatus = document.getElementById('aiSummaryStatus');

    if (summary) {
        if (narrative) narrative.textContent = summary.narrative;
        if (aiGrid) {
            aiGrid.innerHTML = AI_SUMMARY_ITEMS.map((item) => renderAiSummaryCard(item, summary[item.id])).join('');
        }
        if (aiStatus) aiStatus.textContent = 'AI Live';
    }

    // 2. Travel Guide
    const travel = insights.travel_guide;
    const travelGrid = document.getElementById('travelGrid');
    const travelStatus = document.getElementById('travelStatus');

    if (travel) {
        if (travelGrid) {
            travelGrid.innerHTML = TRAVEL_SECTION_ITEMS.map((item) => renderTravelCard(item, travel)).join('');
        }
        if (travelStatus) travelStatus.textContent = 'AI Live';
    }

    // 3. Farming Guide
    const farming = insights.farming_guide;
    const farmingGrid = document.getElementById('farmingGrid');
    const farmingStatus = document.getElementById('farmingStatus');

    if (farming) {
        if (farmingGrid) {
            farmingGrid.innerHTML = FARMING_SECTION_ITEMS.map((item) => renderFarmingCard(item, farming)).join('');
        }
        if (farmingStatus) farmingStatus.textContent = 'AI Live';
    }
}

function fallbackToLocalInsights() {
    updateAiSummary();
    updateTravelSection();
    updateFarmingSection();
}
