// Player avatars: illustrated presets, the local player's own choice (preset or uploaded photo) and
// account portraits shared with multiplayer seats; local choices are scoped to the signed-in user.
(() => {
  'use strict';
  const KEY = 'nobi.avatar.v1';
  const SKIN = ['#f6d3b3', '#eec19a', '#e0a97f', '#c98d63', '#f3cfae', '#e9b892', '#d79c74', '#f8dcc0'];
  const HAIR = ['#1d1a1c', '#3a2418', '#2b2b33', '#5b3520', '#141414', '#7a4a26', '#20222c', '#4a2c1a'];
  const SHIRT = ['#2f5fb3', '#b23a3a', '#2f8a5c', '#6b4bb3', '#c78a22', '#1f6f86', '#8a3a6b', '#3d4f6b'];
  const BG = [['#3b6fb6', '#16305c'], ['#b8574a', '#5a1f1b'], ['#3f9a6e', '#164a33'], ['#7d5bc4', '#33215e'], ['#d2a24a', '#6b4612'], ['#3a9bb3', '#14465a'], ['#b0558a', '#4d1a3b'], ['#5d7393', '#222f44']];
  const NAMES = ['青衫', '赤焰', '竹影', '紫霄', '金秋', '碧波', '霞光', '墨石'];

  function hairPath(style) {
    return [
      'M26 44c0-16 10-26 24-26s24 10 24 26c-4-8-12-12-24-12s-20 4-24 12z',
      'M25 48c-1-19 11-31 26-30 14 1 24 12 24 28-6-10-16-14-30-12l-8 10c-6 0-10 2-12 4z',
      'M24 46c0-18 12-28 26-28s26 10 26 28v26c-4 0-6-4-6-8V44c-6-6-14-9-20-9s-14 3-20 9v20c0 4-2 8-6 8z',
      'M27 44c0-15 10-25 23-25s23 10 23 25c-5-6-13-9-23-9s-18 3-23 9zM50 8a9 9 0 1 1 0 18 9 9 0 0 1 0-18z',
    ][style % 4];
  }
  function svg(i) {
    const n = ((i % 8) + 8) % 8, [b1, b2] = BG[n], style = n % 4, glasses = n === 3 || n === 7;
    const parts = [
      `<defs><radialGradient id="g" cx="35%" cy="25%" r="80%"><stop offset="0" stop-color="${b1}"/><stop offset="1" stop-color="${b2}"/></radialGradient></defs>`,
      '<rect width="100" height="100" fill="url(#g)"/>',
      `<path d="M14 100c2-20 16-30 36-30s34 10 36 30z" fill="${SHIRT[n]}"/>`,
      '<path d="M40 70l10 12 10-12" fill="#fff" opacity=".85"/>',
      `<rect x="43" y="56" width="14" height="16" rx="6" fill="${SKIN[n]}"/>`,
      `<ellipse cx="50" cy="46" rx="19" ry="22" fill="${SKIN[n]}"/>`,
      `<path d="${hairPath(style)}" fill="${HAIR[n]}"/>`,
      '<ellipse cx="43" cy="48" rx="2.2" ry="2.8" fill="#2a1d18"/><ellipse cx="57" cy="48" rx="2.2" ry="2.8" fill="#2a1d18"/>',
      '<path d="M44 58q6 4 12 0" stroke="#9a4a3a" stroke-width="2" fill="none" stroke-linecap="round"/>',
      '<ellipse cx="38" cy="55" rx="3.5" ry="2" fill="#e88" opacity=".35"/><ellipse cx="62" cy="55" rx="3.5" ry="2" fill="#e88" opacity=".35"/>',
      glasses ? '<g fill="none" stroke="#1d1d1d" stroke-width="1.6"><circle cx="43" cy="48" r="5.5"/><circle cx="57" cy="48" r="5.5"/><path d="M48.5 48h3"/></g>' : '',
    ];
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${parts.join('')}</svg>`);
  }
  const presets = Object.freeze(NAMES.map((name, id) => Object.freeze({ id, name, src: svg(id) })));
  const hash = text => [...String(text || '')].reduce((h, c) => (h * 31 + c.codePointAt(0)) >>> 0, 7);
  const safe = src => typeof src === 'string' && src.length <= 32768 && (/^data:image\/(png|jpeg|webp|svg\+xml)[;,]/.test(src) || /^https:\/\//.test(src) || /^ui\/avatar-presets\/[0-7]\.svg$/.test(src)) ? src : null;
  const listeners = new Set();
  let accountAvatar = null;
  let accountId = null;
  const storageKey = () => accountId ? KEY + ':' + accountId : KEY;

  function read() { try { return JSON.parse(localStorage.getItem(storageKey()) || 'null'); } catch (_) { return null; } }
  function write(value) {
    try { if (value) localStorage.setItem(storageKey(), JSON.stringify(value)); else localStorage.removeItem(storageKey()); } catch (_) { return false; }
    listeners.forEach(fn => { try { fn(); } catch (_) {} });
    return true;
  }
  // The local player's avatar: explicit choice > account avatar_url > preset derived from the name.
  function self(name) {
    const choice = read();
    if (choice?.type === 'upload' && safe(choice.data)) return choice.data;
    if (choice?.type === 'preset' && presets[choice.id]) return presets[choice.id].src;
    return accountAvatar || forKey(name || 'self');
  }
  function forKey(key) { return presets[hash(key) % presets.length].src; }
  function choosePreset(id) { return presets[id] ? write({ type: 'preset', id }) : false; }
  function reset() { return write(null); }
  function current() { return read(); }
  let saving = false;
  async function saveChoice(choice) {
    if (saving) throw new Error('头像正在保存，请稍候');
    const owner = accountId;
    if (!owner) throw new Error('请先登录后更换头像');
    saving = true;
    try {
      const sdk = await window.NobiServices.requireClient();
      const verified = await window.NobiServices.requireUser();
      if (verified.id !== owner) throw new Error('账号已切换，请重新选择头像');
      const { data, error } = await sdk.auth.updateUser({ data: { nobi_avatar: choice } });
      if (error) throw new Error('头像同步失败，请检查网络后重试');
      if (accountId === owner) setAccount(data.user);
      return true;
    } finally { saving = false; }
  }
  const savePreset = id => presets[id] ? saveChoice({ type: 'preset', id }) : Promise.reject(new Error('头像不存在'));
  const saveReset = () => saveChoice(null);
  function setAccountAvatar(url) { accountAvatar = safe(url); listeners.forEach(fn => { try { fn(); } catch (_) {} }); }
  function setAccount(user) {
    accountId = typeof user?.id === 'string' ? user.id : null;
    const choice = user?.user_metadata?.nobi_avatar;
    if (Object.prototype.hasOwnProperty.call(user?.user_metadata || {}, 'nobi_avatar')) {
      write(choice?.type === 'preset' && Number.isInteger(choice.id) && presets[choice.id] ? choice : choice?.type === 'upload' && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(choice.data || '') && choice.data.length <= 6000 ? choice : null);
    }
    setAccountAvatar(user?.user_metadata?.avatar_url || user?.user_metadata?.picture);
  }
  // Re-encode an uploaded image to a small square JPEG so only pixel data is stored.
  function upload(file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\/(png|jpeg|webp|gif)$/.test(file.type) || file.size > 8 * 1024 * 1024) { reject(new Error('请选择 8MB 以内的 PNG/JPEG/WebP/GIF 图片')); return; }
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const size = 96, canvas = document.createElement('canvas'), side = Math.min(img.naturalWidth, img.naturalHeight);
        canvas.width = canvas.height = size;
        canvas.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
        URL.revokeObjectURL(url);
        let data = canvas.toDataURL('image/jpeg', 0.72);
        for (const quality of [0.55, 0.35]) { if (data.length <= 6000) break; data = canvas.toDataURL('image/jpeg', quality); }
        if (data.length > 6000) { reject(new Error('图片过于复杂，请选择其他照片')); return; }
        saveChoice({ type: 'upload', data }).then(() => resolve(data), reject);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('无法读取该图片')); };
      img.src = url;
    });
  }
  window.NobiAvatars = Object.freeze({ presets, self, forKey, safe, choosePreset, savePreset, saveReset, upload, reset, current, setAccount, setAccountAvatar, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); } });
})();
