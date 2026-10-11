import { test, expect } from '../../tooling/node_modules/vitest/dist/index.js';
import { sandbox, load } from './legacy-harness.mjs';

function registry() { const c = sandbox({ NobiPlatform: { canUsePCGames: () => true } }); load('ui/registry.js', c); return c.NobiGames; }
test('catalogue orders games and isolates all mobile search/lookup routes', () => {
  const { catalogue } = registry();
  expect(catalogue.list('pc').map(g => g.gameId)).toEqual(['guandan', 'go', 'cs16']);
  expect(catalogue.list('mobile').map(g => g.gameId)).toEqual(['guandan', 'go']);
  expect(catalogue.list('mobile', 'CS')).toEqual([]);
  expect(catalogue.get('cs16', 'mobile')).toBeNull();
  expect(catalogue.get('go', 'pc').route).toBe('game.html?game=go');
});
test('new game is configuration-only, immutable and validated', () => {
  const { create } = registry(); const r = create();
  const entry = { gameId:'future', name:'未来游戏', description:'预留', platforms:['pc','mobile'], modes:['SINGLE'], enabled:true, sortOrder:1, route:'game.html?game=future' };
  r.register(entry); entry.platforms.length = 0;
  expect(r.list('mobile', '未来').map(g => g.gameId)).toEqual(['future']);
  expect(() => r.register(entry)).toThrow();
  expect(() => create([{...entry, platforms:['mobile'], gameId:'cs16'}])).toThrow();
  expect(() => create([{...entry, platforms:['mobile'], route:'javascript:alert(1)'}])).toThrow();
  expect(create([{...entry, platforms:['mobile'], enabled:false}]).list('mobile')).toEqual([]);
});
