import { describe, test, expect } from '../../tooling/node_modules/vitest/dist/index.js';
import { sandbox, load, go, guandan } from './legacy-harness.mjs';

describe('Phase 0 defect reproductions (real legacy scripts)', () => {
  test('new Go game resets captures and ko', () => {
    const { api, context } = go();
    api.state.blackCaptures = 5; api.state.whiteCaptures = 7;
    context.state.koPoint = { row: 2, col: 2 };
    api.startAIGame();
    expect([api.state.blackCaptures, api.state.whiteCaptures, context.state.koPoint]).toEqual([0, 0, null]);
    expect(api.state.board.flat().every(v => v === 0)).toBe(true);
  });

  test('Go broadcast snapshot plus captured list counts once, duplicate is idempotent', async () => {
    const { api } = go();
    const events = {};
    const channel = { on(_type, filter, fn) { events[filter.event] = fn; return this; }, subscribe() { return this; } };
    api.state.supabase = { channel: () => channel };
    await api.initRoomChannel('TEST');
    const payload = { row: 1, col: 1, color: 2, captured: [[1, 2]], white_captures: 1, black_captures: 0, next_turn: 'black' };
    await events.move({ payload });
    expect(api.state.whiteCaptures).toBe(1);
    await events.move({ payload });
    expect(api.state.whiteCaptures).toBe(1);
  });

  test('Go rejects out-of-board remote moves without mutation or crash', async () => {
    const { api } = go();
    await expect(api.onOpponentMove({ row: 19, col: 0, color: 2 })).resolves.toBeUndefined();
    expect(api.state.board.flat().every(v => v === 0)).toBe(true);
  });

  test('Guandan subscribed PLAY_CARDS and PASS_TURN handlers exist', async () => {
    const context = sandbox();
    const events = {};
    const channel = { on(_type, filter, fn) { events[filter.event] = fn; return this; }, subscribe() { return this; } };
    context.getSupabaseClient = () => ({ channel: () => channel });
    context.state = { uid: 'auth-user-fixture', userNickname: 'fixture' };
    load('guandan-mp-ext.js', context);
    await context.GD_MP.startNetMatch();
    expect(() => events.PLAY_CARDS({ payload: {} })).not.toThrow();
    expect(() => events.PASS_TURN({ payload: {} })).not.toThrow();
  });

  test('CI window.CONFIG source is accepted and URL normalized', async () => {
    const context = sandbox({ CONFIG: { SUPABASE_URL: 'https://example.invalid/rest/v1/', SUPABASE_ANON_KEY: 'anon-fixture' } });
    load('config.js', context);
    await new Promise(resolve => setImmediate(resolve));
    expect(context.APP_CONFIG.SUPABASE_URL).toBe('https://example.invalid');
    expect(context.APP_CONFIG.SUPABASE_ANON_KEY).toBe('anon-fixture');
  });

  test('missing card does not draw a replacement SVG', () => {
    const { api } = guandan();
    expect(api.formatCard(api.makeDeck()[0])).not.toContain('data:image/svg');
  });
});
