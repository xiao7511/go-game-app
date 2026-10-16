// Shared mobile navigation. Vertical gestures stay with the browser's native scroller.
(() => {
  'use strict';
  const embedded = window !== window.top;
  const key = 'nobi.navigation.v1';
  let saved;
  try { if (!embedded) saved = JSON.parse(sessionStorage.getItem(key)); } catch (_) {}
  const internalReferrer = (() => {
    try {
      const from = new URL(document.referrer);
      return from.origin === location.origin && /\/(game|online|register)\.html$/.test(from.pathname);
    } catch (_) { return false; }
  })();
  const existing = history.state?.nobiNavigation;
  const token = existing?.token || (internalReferrer && saved?.token) || String(Date.now()) + Math.random();
  const positions = saved?.token === token ? saved.positions || {} : {};
  let index = existing?.token === token ? existing.index : internalReferrer && saved?.token === token ? saved.index + 1 : 0;
  let url = location.href, handler = null, gesture = null, restoring = false;
  const persist = () => { try { if (!embedded) sessionStorage.setItem(key, JSON.stringify({token, index, positions})); } catch (_) {} };
  const stamp = () => { if (!embedded) history.replaceState({...history.state, nobiNavigation: {token, index, url}}, '', url); };
  const remember = () => { if (!restoring) positions[index] = scrollY; };
  const restore = () => {
    if (embedded) return;
    restoring = true;
    requestAnimationFrame(() => requestAnimationFrame(() => { window.scrollTo(0, positions[index] || 0); restoring = false; }));
  };
  stamp(); persist(); if (!embedded) history.scrollRestoration = 'manual';
  addEventListener('scroll', remember, {passive: true});
  addEventListener('pagehide', () => { remember(); persist(); });
  addEventListener('popstate', () => {
    if (embedded) return;
    const entry = history.state?.nobiNavigation;
    if (entry?.token !== token || entry.url !== location.href) return;
    remember(); index = entry.index; url = entry.url; persist(); restore();
  });
  addEventListener('hashchange', () => {
    if (embedded) return;
    if (url === location.href) return;
    remember(); index++; url = location.href; positions[index] = 0; stamp(); persist();
  });
  function closeDialog(doc) {
    const dialog = doc.querySelector('dialog[open]');
    if (!dialog) return false;
    if (dialog.classList.contains('nobi-chat-dialog')) doc.defaultView.NobiRoomChat?.close();
    else if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
    return true;
  }
  function back() {
    if (embedded) return window.parent.NobiNavigation?.back() || false;
    if (closeDialog(document)) return true;
    const frame = document.querySelector('#game-frame iframe');
    try { if (frame?.contentDocument && closeDialog(frame.contentDocument)) return true; } catch (_) {}
    if (handler?.()) return true;
    if (index > 0) { history.back(); return true; }
    if (location.pathname.endsWith('/online.html')) { location.replace('game.html#/games/' + (['go','xiangqi'].includes(new URLSearchParams(location.search).get('game')) ? new URLSearchParams(location.search).get('game') : 'guandan')); return true; }
    if (location.pathname.endsWith('/register.html')) { location.replace('login.html'); return true; }
    if (location.pathname.endsWith('/game.html') && location.hash && location.hash !== '#/home') {
      location.replace('game.html#/home'); return true;
    }
    return false;
  }
  // Only a deliberate rightward gesture near the left edge navigates. Card hands,
  // board input, horizontal scrollers and form controls keep their own gestures.
  const excluded = 'input,textarea,select,[contenteditable],canvas,.board-shell,[data-gd-hand],.gd-hand,[data-no-back-swipe]';
  document.addEventListener('touchstart', event => {
    gesture = null;
    if (event.touches.length !== 1 || event.target.closest?.(excluded)) return;
    const touch = event.touches[0];
    if (touch.clientX > 32) return;
    for (let node = event.target; node instanceof Element; node = node.parentElement) {
      if (node.scrollWidth > node.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(node).overflowX)) return;
    }
    gesture = {x: touch.clientX, y: touch.clientY, dx: 0, locked: false};
  }, {passive: true});
  document.addEventListener('touchmove', event => {
    if (!gesture) return;
    if (event.touches.length !== 1) { gesture = null; return; }
    const dx = event.touches[0].clientX - gesture.x, dy = Math.abs(event.touches[0].clientY - gesture.y);
    if (!gesture.locked && (dy > 12 && dy > Math.abs(dx) || dx < -12)) { gesture = null; return; }
    if (dx > 16 && dx > dy * 1.8) gesture.locked = true;
    if (gesture.locked) { gesture.dx = dx; if (event.cancelable) event.preventDefault(); }
  }, {passive: false});
  document.addEventListener('touchend', () => {
    const complete = gesture?.locked && gesture.dx >= Math.min(96, innerWidth * .24);
    gesture = null;
    if (complete) back();
  }, {passive: true});
  document.addEventListener('touchcancel', () => { gesture = null; }, {passive: true});
  document.addEventListener('click', event => {
    if (!event.target.closest?.('.mobile-back')) return;
    if (back()) event.preventDefault();
  });
  function syncViewport() {
    document.documentElement.classList.toggle('nobi-viewport-match', document.body.classList.contains('in-game-match') || ['playing','ended'].includes(document.body.dataset.roomPhase));
  }
  addEventListener('DOMContentLoaded', () => {
    syncViewport(); new MutationObserver(syncViewport).observe(document.body, {attributes: true, attributeFilter: ['class','data-room-phase']}); restore();
  });
  window.NobiNavigation = Object.freeze({back, routeRendered: restore, setBackHandler: value => { handler = value; }});
})();
