(() => {
    const installButton = document.getElementById('installApp');
    const offlineBanner = document.getElementById('offlineBanner');
    let deferredPrompt = null;

    function isStandalone() {
        return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    }

    function updateOnlineStatus() {
        const online = navigator.onLine;
        document.body.classList.toggle('is-offline', !online);

        if (offlineBanner) {
            offlineBanner.classList.toggle('hidden', online);
            offlineBanner.setAttribute('aria-hidden', String(online));
        }
    }

    async function registerServiceWorker() {
        if (!('serviceWorker' in navigator)) return;

        try {
            await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        } catch (error) {
            console.warn('Service worker registration failed:', error);
        }
    }

    function showInstallButton(show) {
        if (!installButton) return;
        installButton.classList.toggle('hidden', !show);
        installButton.setAttribute('aria-hidden', String(!show));
    }

    async function installApp() {
        if (!deferredPrompt) return;

        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        showInstallButton(false);
    }

    function bindInstallPrompt() {
        if (isStandalone()) {
            showInstallButton(false);
            return;
        }

        window.addEventListener('beforeinstallprompt', (event) => {
            event.preventDefault();
            deferredPrompt = event;
            showInstallButton(true);
        });

        installButton?.addEventListener('click', installApp);

        window.addEventListener('appinstalled', () => {
            deferredPrompt = null;
            showInstallButton(false);
        });
    }

    function bindConnectivityEvents() {
        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);
        updateOnlineStatus();
    }

    function init() {
        registerServiceWorker();
        bindInstallPrompt();
        bindConnectivityEvents();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.WeatherPWA = {
        isStandalone,
        isOnline: () => navigator.onLine
    };
})();
