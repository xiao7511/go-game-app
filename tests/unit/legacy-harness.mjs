import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { root } from '../../scripts/verify-assets.mjs';

export function sandbox(extra = {}) {
  const handlers = {};
  const storage = { getItem: () => null, setItem() {}, removeItem() {} };
  const context = {
    console: { log() {}, warn() {}, error() {} },
    document: { readyState: 'loading', getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} },
    localStorage: storage, sessionStorage: storage,
    setTimeout: () => 1, setInterval: () => 1, clearTimeout() {}, clearInterval() {},
    performance: { now: () => 10000 }, URL, URLSearchParams, AbortController, atob, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    navigator: { userAgent: 'Windows', platform: 'Win32' },
    location: { href: 'http://localhost/game.html', search: '', origin: 'http://localhost', pathname: '/game.html' },
    addEventListener(type, fn) { handlers[type] = fn; }, dispatchEvent(event) { handlers[event.type]?.(event); },
    fetch: async () => ({ ok: false }), alert() {}, ...extra
  };
  context.window = context;
  return vm.createContext(context);
}

export function load(name, context, hooks = '') {
  let source = fs.readFileSync(path.join(root, name), 'utf8');
  if (hooks) {
    const pos = source.lastIndexOf('})();');
    source = source.slice(0, pos) + `window.__test = {${hooks}};\n` + source.slice(pos);
  }
  vm.runInContext(source, context, { filename: name });
  return context.__test;
}

export function go() {
  const context = sandbox();
  const api = load('multiplayer-ext.js', context, 'state, placeStone, bfsLiberties, startAIGame, triggerAIMove, onOpponentMove, applyRemotePayload, initRoomChannel');
  return { context, api };
}

export function guandan() {
  const context = sandbox();
  const api = load('guandan-game.js', context, 'state, makeDeck, typeOf, beats, playCards, passTurn, formatCard, triggerAIMove');
  return { context, api };
}
