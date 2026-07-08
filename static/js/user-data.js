(() => {
    let favorites = [];
    let recentSearches = [];
    let settings = null;
    let weatherHistory = [];

    async function apiFetch(url, options = {}) {
        const response = await fetch(url, {
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {})
            },
            ...options
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || data.message || 'Request failed');
        }
        return data;
    }

    function isLoggedIn() {
        return Boolean(window.AuthApp?.getCurrentUser?.());
    }

    function normalizeCity(value) {
        return String(value ?? '').trim().replace(/\s+/g, ' ');
    }

    function uniqueCities(values) {
        const seen = new Set();
        return values.map(normalizeCity).filter((city) => {
            const key = city.toLowerCase();
            if (!city || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function getLocalList(key) {
        try {
            const parsed = JSON.parse(localStorage.getItem(key) || '[]');
            return Array.isArray(parsed) ? uniqueCities(parsed) : [];
        } catch {
            return [];
        }
    }

    function getFavorites() {
        if (isLoggedIn()) return [...favorites];
        return getLocalList('weather-favorite-cities');
    }

    function getRecentSearches() {
        if (isLoggedIn()) return [...recentSearches];
        return getLocalList('weather-recent-searches');
    }

    function getSettings() {
        return settings ? { ...settings } : null;
    }

    function getWeatherHistory() {
        return [...weatherHistory];
    }

    async function syncFromServer() {
        if (!isLoggedIn()) return;

        const [favoritesData, historyData, settingsData, weatherData] = await Promise.all([
            apiFetch('/api/favorites'),
            apiFetch('/api/search-history'),
            apiFetch('/api/settings'),
            apiFetch('/api/weather-history?limit=20')
        ]);

        favorites = uniqueCities((favoritesData.favorites || []).map((item) => item.city)).slice(0, 12);
        recentSearches = uniqueCities((historyData.searches || []).map((item) => item.city)).slice(0, 8);
        settings = settingsData.settings || null;
        weatherHistory = weatherData.history || [];

        if (settings?.theme && settings.theme !== 'system' && typeof window.applyTheme === 'function') {
            window.applyTheme(settings.theme);
        }
        if (settings?.default_city) {
            const cityEl = document.getElementById('city');
            if (cityEl && !cityEl.value.trim()) {
                cityEl.value = settings.default_city;
            }
        }

        window.dispatchEvent(new CustomEvent('user-data-synced'));
    }

    async function migrateLocalData() {
        if (!isLoggedIn()) return;

        const localFavorites = getLocalList('weather-favorite-cities');
        const localRecents = getLocalList('weather-recent-searches');
        const localTheme = localStorage.getItem('weather-theme');

        if (localFavorites.length && favorites.length === 0) {
            await apiFetch('/api/favorites', {
                method: 'PUT',
                body: JSON.stringify({ cities: localFavorites })
            });
        }

        if (localRecents.length && recentSearches.length === 0) {
            for (const city of localRecents.slice().reverse()) {
                await apiFetch('/api/search-history', {
                    method: 'POST',
                    body: JSON.stringify({ city })
                });
            }
        }

        if (localTheme && settings?.theme === 'system') {
            await saveSettings({ theme: localTheme });
        }

        await syncFromServer();
    }

    async function addFavorite(city) {
        const normalized = normalizeCity(city);
        if (!normalized) return;

        if (isLoggedIn()) {
            await apiFetch('/api/favorites', {
                method: 'POST',
                body: JSON.stringify({ city: normalized })
            });
            await syncFromServer();
            return;
        }

        const next = uniqueCities([normalized, ...getLocalList('weather-favorite-cities')]).slice(0, 12);
        localStorage.setItem('weather-favorite-cities', JSON.stringify(next));
    }

    async function removeFavorite(city) {
        const normalized = normalizeCity(city);
        if (!normalized) return;

        if (isLoggedIn()) {
            await apiFetch(`/api/favorites/${encodeURIComponent(normalized)}`, { method: 'DELETE' });
            await syncFromServer();
            return;
        }

        const next = getLocalList('weather-favorite-cities')
            .filter((item) => item.toLowerCase() !== normalized.toLowerCase());
        localStorage.setItem('weather-favorite-cities', JSON.stringify(next));
    }

    async function toggleFavorite(city) {
        const normalized = normalizeCity(city);
        if (!normalized) return;

        const exists = getFavorites().some((item) => item.toLowerCase() === normalized.toLowerCase());
        if (exists) {
            await removeFavorite(normalized);
        } else {
            await addFavorite(normalized);
        }
    }

    async function addRecentSearch(city) {
        const normalized = normalizeCity(city);
        if (!normalized) return;

        if (isLoggedIn()) {
            await apiFetch('/api/search-history', {
                method: 'POST',
                body: JSON.stringify({ city: normalized })
            });
            await syncFromServer();
            return;
        }

        const next = uniqueCities([normalized, ...getLocalList('weather-recent-searches')]).slice(0, 8);
        localStorage.setItem('weather-recent-searches', JSON.stringify(next));
    }

    async function clearRecentSearches() {
        if (isLoggedIn()) {
            await apiFetch('/api/search-history', { method: 'DELETE' });
            recentSearches = [];
            return;
        }

        localStorage.setItem('weather-recent-searches', JSON.stringify([]));
    }

    async function recordWeatherHistory(city, weather) {
        if (!isLoggedIn() || !weather) return;

        try {
            await apiFetch('/api/weather-history', {
                method: 'POST',
                body: JSON.stringify({ city, weather })
            });
        } catch {
            // Non-blocking persistence.
        }
    }

    async function saveSettings(payload) {
        if (!isLoggedIn()) return null;

        const data = await apiFetch('/api/settings', {
            method: 'PUT',
            body: JSON.stringify(payload)
        });
        settings = data.settings || settings;
        return settings;
    }

    async function onSessionChanged() {
        if (isLoggedIn()) {
            await migrateLocalData();
        } else {
            favorites = [];
            recentSearches = [];
            settings = null;
            weatherHistory = [];
            window.dispatchEvent(new CustomEvent('user-data-synced'));
        }
    }

    window.UserData = {
        isLoggedIn,
        syncFromServer,
        migrateLocalData,
        getFavorites,
        getRecentSearches,
        getSettings,
        getWeatherHistory,
        addFavorite,
        removeFavorite,
        toggleFavorite,
        addRecentSearch,
        clearRecentSearches,
        recordWeatherHistory,
        saveSettings,
        onSessionChanged
    };

    window.addEventListener('user-session-changed', () => {
        onSessionChanged().catch(() => {});
    });
})();
