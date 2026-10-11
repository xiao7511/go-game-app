(() => {
  'use strict';
  // Local product catalogue, not database state. All consumers use the same capability gate.
  const initial = [
    { gameId: 'guandan', name: '掼蛋', description: '经典牌类 · 好友对局', cover: 'cards', icon: 'cards', platforms: ['pc', 'mobile'], modes: ['SINGLE', 'NET'], enabled: true, sortOrder: 10, route: 'game.html?game=guandan', musicScene: 'guandan' },
    { gameId: 'go', name: '围棋', description: '黑白对弈 · 智慧博弈', cover: 'board', icon: 'go', platforms: ['pc', 'mobile'], modes: ['SINGLE', 'NET'], enabled: true, sortOrder: 20, route: 'game.html?game=go', musicScene: 'go' },
    { gameId: 'cs16', name: 'CS1.6', description: '经典竞技 · Windows 启动器', cover: 'crosshair', icon: 'target', platforms: ['pc'], modes: ['SINGLE', 'NET'], enabled: true, sortOrder: 30, route: 'game.html?game=cs16', musicScene: 'lobby' }
  ];
  function create(entries = initial) {
    const games = new Map();
    function register(entry) {
      if (!entry || !/^[a-z][a-z0-9-]*$/.test(entry.gameId) || games.has(entry.gameId)) throw new Error('Invalid or duplicate gameId');
      if (!entry.name || !Array.isArray(entry.platforms) || !entry.platforms.length || entry.platforms.some(p => !['pc', 'mobile'].includes(p))) throw new Error('Invalid game platforms');
      if (!Array.isArray(entry.modes) || entry.modes.some(m => !['SINGLE', 'NET'].includes(m))) throw new Error('Invalid game modes');
      if (!/^game\.html(?:\?|$)/.test(entry.route) || typeof entry.enabled !== 'boolean' || !Number.isFinite(entry.sortOrder)) throw new Error('Invalid game contract');
      // CS is always PC-only, even if a future caller attempts a misconfigured registration.
      if (entry.gameId === 'cs16' && entry.platforms.includes('mobile')) throw new Error('CS1.6 is PC-only');
      games.set(entry.gameId, Object.freeze({ ...entry, platforms: Object.freeze([...entry.platforms]), modes: Object.freeze([...entry.modes]) }));
    }
    entries.forEach(register);
    const list = (platform, query = '') => [...games.values()].filter(g => g.enabled && g.platforms.includes(platform) && (g.name + g.description).toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => a.sortOrder - b.sortOrder);
    const get = (id, platform) => list(platform).find(g => g.gameId === id) || null;
    return Object.freeze({ register, list, get });
  }
  window.NobiGames = Object.freeze({ create, catalogue: create(), platform: () => window.NobiPlatform.canUsePCGames() ? 'pc' : 'mobile' });
})();
