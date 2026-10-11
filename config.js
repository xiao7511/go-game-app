/* Public browser configuration. URL/key are not authorization boundaries. */
(() => {
  'use strict';
  function normalize(input = {}) {
    const url = String(input.SUPABASE_URL || '').trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
    const key = String(input.SUPABASE_ANON_KEY || '').trim();
    if (url) {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('Invalid Supabase URL');
      if (parsed.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) throw new Error('Supabase requires HTTPS outside localhost');
    }
    if (key.startsWith('sb_secret_')) throw new Error('Secret key forbidden in browser');
    if (key.split('.').length === 3) {
      let payload;
      try { payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); }
      catch (_) { throw new Error('Invalid anonymous JWT'); }
      if (payload.role !== 'anon') throw new Error('Only anon JWT is allowed in browser');
    }
    return Object.freeze({ SUPABASE_URL: url, SUPABASE_ANON_KEY: key });
  }
  const injected = { ...(window.CONFIG || {}), ...(window.LOCAL_CONFIG || {}), ...(window.APP_CONFIG_LOCAL || {}) };
  let config = Object.freeze({ SUPABASE_URL: '', SUPABASE_ANON_KEY: '' });
  window.NobiConfig = {
    normalize,
    get: () => config,
    ready: (async () => {
      try {
        config = normalize(injected);
        if ((!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) && !window.NobiPlatform?.isNative()) {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 3000);
          try {
            const response = await fetch('/get-config', { signal: controller.signal, credentials: 'same-origin' });
            if (response.ok) config = normalize({ ...(await response.json()), ...Object.fromEntries(Object.entries(injected).filter(([, value]) => value)) });
          } finally { clearTimeout(timer); }
        }
      } catch (_) {
        config = Object.freeze({ SUPABASE_URL: '', SUPABASE_ANON_KEY: '' });
        console.error('[Config] Configuration rejected or unavailable; no credentials logged.');
      }
      window.APP_CONFIG = config;
      setTimeout(() => window.dispatchEvent(new CustomEvent('configReady', { detail: config })), 0);
      return config;
    })()
  };
})();
