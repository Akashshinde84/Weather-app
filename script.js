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

let map;
let marker;
let weatherRequestController;
let placeRequestController;
let currentBackgroundDescription = 'weather,sky,clouds';
const THEME_STORAGE_KEY = 'weather-theme';

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function setLoading(isLoading) {
    if (!loadingEl) return;

    loadingEl.classList.toggle('hidden', !isLoading);
    loadingEl.setAttribute('aria-hidden', String(!isLoading));

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
        themeToggleEl.querySelector('.theme-toggle-icon').textContent = isDark ? '☀' : '☾';
        themeToggleEl.querySelector('.theme-toggle-text').textContent = isDark ? 'Light' : 'Dark';
    }

    updateBackground(currentBackgroundDescription);
}

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

function showWeatherError(message) {
    swapWeatherContent(`<p class="weather-error">Error: ${escapeHtml(message)}</p>`);
}

function ensureMap() {
    if (!mapEl) return null;
    if (map) return map;

    if (!window.L) {
        if (placesEl) placesEl.innerHTML = '<div class="map-error">Map library failed to load.</div>';
        return null;
    }

    map = window.L.map(mapEl, { zoomControl: true }).setView([20.5937, 78.9629], 4);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    marker = window.L.marker([20.5937, 78.9629]).addTo(map);
    return map;
}

function setMarker(lat, lng, label) {
    const currentMap = ensureMap();
    if (!currentMap || !marker) return;

    marker.setLatLng([lat, lng]);
    if (label) marker.bindPopup(escapeHtml(label)).openPopup();

    if (typeof currentMap.flyTo === 'function') {
        currentMap.flyTo([lat, lng], 13, { animate: true, duration: 0.8 });
    } else {
        currentMap.setView([lat, lng], 13, { animate: true });
    }

    window.setTimeout(() => currentMap.invalidateSize?.(true), 0);
}

function updateBackground(description) {
    currentBackgroundDescription = description || 'weather,sky,clouds';
    const bgQuery = encodeURIComponent(String(description ?? 'weather').replace(/\s+/g, ',').toLowerCase());
    document.body.style.backgroundImage =
        `${getWeatherGradient()}, url('https://source.unsplash.com/1800x1200/?${bgQuery},weather')`;
}

function renderWeather(data, customTitle) {
    const description = data.description || 'Weather';
    const title = customTitle || `${data.name}, ${data.country}`;
    const iconUrl = `https://openweathermap.org/img/wn/${encodeURIComponent(data.icon)}@2x.png`;

    updateBackground(description);

    if (marker) {
        marker.bindPopup(`<strong>${escapeHtml(data.name)}, ${escapeHtml(data.country)}</strong><br>${escapeHtml(data.temperature)}&deg;C`).openPopup();
    }

    swapWeatherContent(`
        <div class="weather-data">
            <img src="${iconUrl}" alt="${escapeHtml(description)}" class="weather-icon">
            <h2>${escapeHtml(title)}</h2>
            <div class="weather-details">
                <div>
                    <p><strong>Temperature</strong><br>${escapeHtml(data.temperature)}&deg;C</p>
                </div>
                <div>
                    <p><strong>Humidity</strong><br>${escapeHtml(data.humidity)}%</p>
                </div>
                <div>
                    <p><strong>Description</strong><br>${escapeHtml(description)}</p>
                </div>
            </div>
        </div>
    `);

    if (cityEl && data.name) cityEl.value = data.name;
}

async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.error || 'Request failed');
    }

    return data;
}

async function fetchWeatherFromApi(params, label) {
    weatherRequestController?.abort();
    weatherRequestController = new AbortController();

    try {
        setLoading(true);

        const data = await fetchJson(`/api/weather?${params.toString()}`, {
            signal: weatherRequestController.signal
        });

        renderWeather(data.weather, label);
        return data.weather;
    } catch (error) {
        if (error.name !== 'AbortError') showWeatherError(error.message);
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

    const weather = await fetchWeatherFromApi(new URLSearchParams({ city }));
    if (weather?.lat != null && weather?.lng != null) {
        setMarker(weather.lat, weather.lng, `${weather.name}, ${weather.country}`);
    }
}

function useCurrentLocation() {
    ensureMap();

    if (!navigator.geolocation) {
        if (placesEl) placesEl.innerHTML = '<div class="map-error">Geolocation is not supported in this browser.</div>';
        return;
    }

    if (useCurrentLocationEl) useCurrentLocationEl.disabled = true;

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const { latitude, longitude } = pos.coords;
            setMarker(latitude, longitude, 'Current location');
            fetchWeatherByCoords(latitude, longitude, 'Current location');
            if (placesEl) placesEl.innerHTML = '';
            if (useCurrentLocationEl) useCurrentLocationEl.disabled = false;
        },
        (err) => {
            if (placesEl) placesEl.innerHTML = `<div class="map-error">Could not access location: ${escapeHtml(err.message)}</div>`;
            if (useCurrentLocationEl) useCurrentLocationEl.disabled = false;
        },
        { enableHighAccuracy: true, timeout: 10000 }
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
                setMarker(lat, lng, place.title);
                fetchWeatherByCoords(lat, lng, place.title);
            }
        });
    });
}

async function searchPlace() {
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
            setMarker(first.lat, first.lng, first.title ?? q);
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

    buttonEl?.addEventListener('click', fetchWeather);
    useCurrentLocationEl?.addEventListener('click', useCurrentLocation);
    searchPlaceEl?.addEventListener('click', searchPlace);
    themeToggleEl?.addEventListener('click', toggleTheme);

    cityEl?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') fetchWeather();
    });

    placeQueryEl?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') searchPlace();
    });
}

function initializeMap() {
    const initializedMap = ensureMap();
    if (!initializedMap) return;

    initializedMap.on('click', (event) => {
        const { lat, lng } = event.latlng;
        setMarker(lat, lng, 'Selected location');
        fetchWeatherByCoords(lat, lng, 'Selected location');
    });
}

bindEvents();
window.addEventListener('load', initializeMap);
