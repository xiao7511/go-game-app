import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '../../tooling/node_modules/vitest/dist/index.js';
import { cards, root, verifyCards, verifyRegions, extractRegion, sha256, readBaseline } from '../../scripts/verify-assets.mjs';

test('all 56 originals and seven visual source regions match Phase 0', () => {
  expect(verifyCards().count).toBe(56); expect(verifyRegions().count).toBe(7);
});
test('baseline itself cannot silently bless changed assets', () => {
  const source=fs.readFileSync(path.join(root,'docs/nobi-v2/asset-manifest.json'),'utf8');
  expect(readBaseline(source).card_png_count).toBe(56);
  expect(()=>readBaseline(source.replace('card_png_count": 56','card_png_count": 57'))).toThrow();
});
test.each(['modified', 'missing', 'additional', 'renamed'])('guard rejects %s fixture', kind => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nobi-asset-test-'));
  try {
    fs.cpSync(path.join(root, 'images/cards'), path.join(temp, 'images/cards'), { recursive: true });
    const file = path.join(temp, cards[0].path);
    if (kind === 'modified') fs.appendFileSync(file, 'not-original');
    if (kind === 'missing') fs.unlinkSync(file);
    if (kind === 'additional') fs.copyFileSync(file, path.join(temp, 'images/cards/extra.png'));
    if (kind === 'renamed') fs.renameSync(file, path.join(temp, 'images/cards/renamed.png'));
    expect(() => verifyCards(temp)).toThrow();
  } finally {
    if (!path.basename(temp).startsWith('nobi-asset-test-') || path.dirname(temp) !== os.tmpdir()) throw new Error('Unsafe fixture cleanup');
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
test('non-render logic changes and line endings do not invalidate visual hash', () => {
  const src = fs.readFileSync(path.join(root, 'multiplayer-ext.js'), 'utf8');
  expect(sha256(extractRegion(src, 'drawStone'))).toBe(sha256(extractRegion(src.replace('const SIZE = 19;', 'const SIZE = 19; // logic-only'), 'drawStone')));
  expect(extractRegion(src.replace(/\r?\n/g, '\r\n'), 'drawStone')).toBe(extractRegion(src, 'drawStone'));
});
