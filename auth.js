(() => {
    let currentUser = null;
    let googleAuthEnabled = false;

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));
    }

    async function authFetch(url, options = {}) {
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

    function setAuthMessage(element, message, type = 'error') {
        if (!element) return;
        element.textContent = message;
        element.classList.remove('hidden', 'is-error', 'is-success');
        element.classList.add(type === 'success' ? 'is-success' : 'is-error');
    }

    function clearAuthMessage(element) {
        if (!element) element = null;
        if (!element) return;
        element.textContent = '';
        element.classList.add('hidden');
        element.classList.remove('is-error', 'is-success');
    }

    function renderAuthNav(user) {
        const navAuthEl = document.getElementById('navAuth');
        if (!navAuthEl) return;

        if (user) {
            const initial = escapeHtml((user.name || user.email || '?').charAt(0).toUpperCase());
            const avatar = user.avatar_url
                ? `<img src="${escapeHtml(user.avatar_url)}" alt="" class="nav-avatar">`
                : `<span class="nav-avatar nav-avatar-fallback">${initial}</span>`;
            navAuthEl.innerHTML = `
                <a class="nav-profile" href="/profile" aria-label="Open profile">
                    ${avatar}
                    <span>${escapeHtml(user.name || 'Profile')}</span>
                </a>
                <button id="navLogout" class="text-button" type="button">Logout</button>
            `;
            navAuthEl.querySelector('#navLogout')?.addEventListener('click', logout);
            return;
        }

        navAuthEl.innerHTML = `
            <button id="openLogin" class="text-button" type="button">Login</button>
            <button id="openSignup" class="nav-auth-primary" type="button">Sign up</button>
        `;
        navAuthEl.querySelector('#openLogin')?.addEventListener('click', () => openAuthModal('login'));
        navAuthEl.querySelector('#openSignup')?.addEventListener('click', () => openAuthModal('signup'));
    }

    function openAuthModal(view = 'login') {
        const modal = document.getElementById('authModal');
        if (!modal) return;
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        modal.setAttribute('aria-modal', 'true');
        switchAuthView(view);
        clearAuthMessage(document.getElementById('authMessage'));
        trapAuthFocus(modal);
        modal.querySelector('[data-auth-view]:not(.hidden) input')?.focus();
    }

    function closeAuthModal() {
        const modal = document.getElementById('authModal');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
        modal.removeAttribute('aria-modal');
        releaseAuthFocus(modal);
    }

    let authFocusTrapHandler = null;

    function trapAuthFocus(modal) {
        releaseAuthFocus(modal);
        authFocusTrapHandler = (event) => {
            if (event.key === 'Escape') {
                closeAuthModal();
                return;
            }
            if (event.key !== 'Tab') return;

            const focusable = [...modal.querySelectorAll(
                'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
            )].filter((element) => element.offsetParent !== null);
            if (focusable.length === 0) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        modal.addEventListener('keydown', authFocusTrapHandler);
    }

    function releaseAuthFocus(modal) {
        if (authFocusTrapHandler) {
            modal.removeEventListener('keydown', authFocusTrapHandler);
            authFocusTrapHandler = null;
        }
    }

    function switchAuthView(view) {
        document.querySelectorAll('[data-auth-view]').forEach((panel) => {
            panel.classList.toggle('hidden', panel.dataset.authView !== view);
        });
        document.querySelectorAll('[data-auth-tab]').forEach((tab) => {
            const active = tab.dataset.authTab === view;
            tab.classList.toggle('is-active', active);
            tab.setAttribute('aria-selected', String(active));
        });
    }

    async function loadSession() {
        try {
            const data = await authFetch('/api/auth/me');
            currentUser = data.user || null;
        } catch {
            currentUser = null;
        }
        renderAuthNav(currentUser);

        if (currentUser?.default_city) {
            const cityEl = document.getElementById('city');
            if (cityEl && !cityEl.value.trim()) {
                cityEl.value = currentUser.default_city;
            }
        }
        await notifySessionChange();
        return currentUser;
    }

    async function notifySessionChange() {
        window.dispatchEvent(new CustomEvent('user-session-changed'));
        if (window.UserData?.onSessionChanged) {
            await window.UserData.onSessionChanged();
        }
    }

    async function login(email, password) {
        const data = await authFetch('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        currentUser = data.user;
        renderAuthNav(currentUser);
        closeAuthModal();
        await notifySessionChange();
        return currentUser;
    }

    async function signup(name, email, password) {
        const data = await authFetch('/api/auth/signup', {
            method: 'POST',
            body: JSON.stringify({ name, email, password })
        });
        currentUser = data.user;
        renderAuthNav(currentUser);
        closeAuthModal();
        await notifySessionChange();
        return currentUser;
    }

    async function logout() {
        await authFetch('/api/auth/logout', { method: 'POST' });
        currentUser = null;
        renderAuthNav(null);
        await notifySessionChange();
        if (window.location.pathname === '/profile') {
            window.location.href = '/?login=1';
        }
    }

    async function forgotPassword(email) {
        return authFetch('/api/auth/forgot-password', {
            method: 'POST',
            body: JSON.stringify({ email })
        });
    }

    async function resetPassword(token, password) {
        return authFetch('/api/auth/reset-password', {
            method: 'POST',
            body: JSON.stringify({ token, password })
        });
    }

    async function updateProfile(payload) {
        const data = await authFetch('/api/auth/profile', {
            method: 'PUT',
            body: JSON.stringify(payload)
        });
        currentUser = data.user;
        renderAuthNav(currentUser);
        return currentUser;
    }

    async function loadGoogleConfig() {
        try {
            const data = await authFetch('/api/auth/google/config');
            googleAuthEnabled = Boolean(data.enabled);
            const googleButton = document.getElementById('googleLoginButton');
            if (googleButton) {
                googleButton.classList.toggle('hidden', !googleAuthEnabled);
            }
        } catch {
            googleAuthEnabled = false;
        }
    }

    function bindAuthModal() {
        const modal = document.getElementById('authModal');
        if (!modal) return;

        modal.querySelectorAll('[data-auth-tab]').forEach((tab) => {
            tab.addEventListener('click', () => switchAuthView(tab.dataset.authTab || 'login'));
        });

        modal.querySelector('[data-close-auth]')?.addEventListener('click', closeAuthModal);
        modal.querySelector('.auth-modal-backdrop')?.addEventListener('click', closeAuthModal);

        document.getElementById('showForgotPassword')?.addEventListener('click', () => switchAuthView('forgot'));
        document.getElementById('backToLogin')?.addEventListener('click', () => switchAuthView('login'));
        document.getElementById('googleLoginButton')?.addEventListener('click', () => {
            window.location.href = '/api/auth/google';
        });

        document.getElementById('loginForm')?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const messageEl = document.getElementById('authMessage');
            clearAuthMessage(messageEl);
            try {
                await login(
                    document.getElementById('loginEmail')?.value.trim() || '',
                    document.getElementById('loginPassword')?.value || ''
                );
            } catch (error) {
                setAuthMessage(messageEl, error.message);
            }
        });

        document.getElementById('signupForm')?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const messageEl = document.getElementById('authMessage');
            clearAuthMessage(messageEl);
            const password = document.getElementById('signupPassword')?.value || '';
            const confirm = document.getElementById('signupPasswordConfirm')?.value || '';
            if (password !== confirm) {
                setAuthMessage(messageEl, 'Passwords do not match.');
                return;
            }
            try {
                await signup(
                    document.getElementById('signupName')?.value.trim() || '',
                    document.getElementById('signupEmail')?.value.trim() || '',
                    password
                );
            } catch (error) {
                setAuthMessage(messageEl, error.message);
            }
        });

        document.getElementById('forgotPasswordForm')?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const messageEl = document.getElementById('authMessage');
            clearAuthMessage(messageEl);
            try {
                const data = await forgotPassword(document.getElementById('forgotEmail')?.value.trim() || '');
                let message = data.message || 'Check your email for reset instructions.';
                if (data.reset_url) {
                    message += ` Dev reset link: ${data.reset_url}`;
                }
                setAuthMessage(messageEl, message, 'success');
            } catch (error) {
                setAuthMessage(messageEl, error.message);
            }
        });
    }

    function bindProfilePage() {
        const form = document.getElementById('profileForm');
        if (!form) return;

        document.getElementById('logoutButton')?.addEventListener('click', logout);
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const messageEl = document.getElementById('profileMessage');
            clearAuthMessage(messageEl);
            try {
                await updateProfile({
                    name: document.getElementById('profileName')?.value.trim() || '',
                    default_city: document.getElementById('profileCity')?.value.trim() || ''
                });
                setAuthMessage(messageEl, 'Profile updated successfully.', 'success');
            } catch (error) {
                setAuthMessage(messageEl, error.message);
            }
        });
    }

    function bindResetPasswordPage() {
        const form = document.getElementById('resetPasswordForm');
        if (!form) return;

        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const messageEl = document.getElementById('resetPasswordMessage');
            clearAuthMessage(messageEl);
            const password = document.getElementById('resetPassword')?.value || '';
            const confirm = document.getElementById('resetPasswordConfirm')?.value || '';
            const token = document.getElementById('resetToken')?.value || '';
            if (!token) {
                setAuthMessage(messageEl, 'Reset token is missing or invalid.');
                return;
            }
            if (password !== confirm) {
                setAuthMessage(messageEl, 'Passwords do not match.');
                return;
            }
            try {
                await resetPassword(token, password);
                setAuthMessage(messageEl, 'Password updated. Redirecting to home...', 'success');
                window.setTimeout(() => {
                    window.location.href = '/';
                }, 1200);
            } catch (error) {
                setAuthMessage(messageEl, error.message);
            }
        });
    }

    function handleAuthQueryParams() {
        const params = new URLSearchParams(window.location.search);
        if (params.get('login') === '1') {
            openAuthModal('login');
        }
        const authError = params.get('auth_error');
        if (authError) {
            openAuthModal('login');
            setAuthMessage(document.getElementById('authMessage'), `Google sign-in failed: ${authError.replace(/_/g, ' ')}`);
        }
    }

    async function init() {
        bindAuthModal();
        bindProfilePage();
        bindResetPasswordPage();
        await loadGoogleConfig();
        await loadSession();
        handleAuthQueryParams();
    }

    window.AuthApp = {
        init,
        loadSession,
        logout,
        getCurrentUser: () => currentUser
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
