/* Shared helpers: theme, API client, formatting. Loaded in <head> so the theme applies before paint. */
(function () {
  const saved = localStorage.getItem('sd_theme');
  const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  document.documentElement.setAttribute('data-theme', saved || (prefersLight ? 'light' : 'dark'));
})();

const SD = {
  get token() { return localStorage.getItem('sd_token'); },
  get user() { try { return JSON.parse(localStorage.getItem('sd_user')); } catch { return null; } },
  setSession(token, user) { localStorage.setItem('sd_token', token); localStorage.setItem('sd_user', JSON.stringify(user)); },
  clearSession() { localStorage.removeItem('sd_token'); localStorage.removeItem('sd_user'); },

  async api(path, { method = 'GET', body } = {}) {
    const res = await fetch(`/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(SD.token ? { Authorization: `Bearer ${SD.token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && SD.token) { SD.clearSession(); }
    if (!res.ok) throw new Error(data.error || 'Request failed. Try again.');
    return data;
  },

  esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  label(s) { return String(s || '').replace(/_/g, ' '); },

  toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast glass';
    el.setAttribute('role', 'status');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  },

  duration(ms) {
    const s = Math.floor(Math.abs(ms) / 1000);
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (d) return `${d}d ${h}h`;
    if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
    return `${m}m ${String(sec).padStart(2, '0')}s`;
  },

  connectSocket(handlers) {
    if (typeof io === 'undefined' || !SD.token) return null;
    const socket = io({ auth: { token: SD.token } });
    Object.entries(handlers).forEach(([evt, fn]) => socket.on(evt, fn));
    return socket;
  },
};

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('theme-toggle');
  if (btn) {
    const sync = () => { btn.textContent = document.documentElement.dataset.theme === 'light' ? '☾' : '☀'; btn.setAttribute('aria-label', 'Switch theme'); };
    sync();
    btn.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('sd_theme', next);
      sync();
    });
  }
  if (window.VanillaTilt) {
    VanillaTilt.init(document.querySelectorAll('[data-tilt]'), { max: 10, speed: 500, glare: true, 'max-glare': 0.18, perspective: 900, scale: 1.02 });
  }
});
