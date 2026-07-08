(() => {
    const loadedScripts = new Map();
    const loadedStyles = new Map();

    function loadScript(src, attributes = {}) {
        if (loadedScripts.has(src)) return loadedScripts.get(src);

        const promise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            Object.entries(attributes).forEach(([key, value]) => {
                script.setAttribute(key, value);
            });
            script.onload = () => resolve(script);
            script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
            document.head.appendChild(script);
        });

        loadedScripts.set(src, promise);
        return promise;
    }

    function loadStyle(href, attributes = {}) {
        if (loadedStyles.has(href)) return loadedStyles.get(href);

        const promise = new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            Object.entries(attributes).forEach(([key, value]) => {
                link.setAttribute(key, value);
            });
            link.onload = () => resolve(link);
            link.onerror = () => reject(new Error(`Failed to load stylesheet: ${href}`));
            document.head.appendChild(link);
        });

        loadedStyles.set(href, promise);
        return promise;
    }

    async function loadLeaflet() {
        if (window.L) return window.L;

        await Promise.all([
            loadStyle(
                'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
                {
                    integrity: 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=',
                    crossorigin: 'anonymous'
                }
            ),
            loadScript(
                'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
                {
                    integrity: 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=',
                    crossorigin: 'anonymous'
                }
            )
        ]);

        return window.L;
    }

    async function loadChartJs() {
        if (window.Chart) return window.Chart;

        await loadScript('https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js');
        return window.Chart;
    }

    window.LazyLoader = {
        loadScript,
        loadStyle,
        loadLeaflet,
        loadChartJs
    };
})();
