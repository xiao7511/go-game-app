import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import ts from '../node_modules/typescript/lib/typescript.js';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
export const BASELINE_MANIFEST_SHA256 = '3218114e9c30252d9d39192aac42e8fc07ef774bdf46d976a54dc03cc08fd011';
export function readBaseline(source) {
  if (sha256(source.replace(/\r\n/g, '\n')) !== BASELINE_MANIFEST_SHA256) throw new Error('Phase 0 resource manifest was changed');
  return JSON.parse(source);
}
export const manifest = readBaseline(fs.readFileSync(path.join(root, 'docs/nobi-v2/asset-manifest.json'), 'utf8'));
export const cards = manifest.assets.filter(a => a.category === 'protected-card-png');

function pngFiles(dir, prefix = 'images/cards') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const name = `${prefix}/${entry.name}`;
    return entry.isDirectory() ? pngFiles(path.join(dir, entry.name), name) : /\.png$/i.test(entry.name) ? [name] : [];
  }).sort();
}

export function verifyCards(base = root) {
  const names = pngFiles(path.join(base, 'images/cards'));
  const expected = cards.map(a => a.path).sort();
  if (cards.length !== 56 || manifest.card_png_count !== 56) throw new Error('Invalid Phase 0 manifest');
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    throw new Error(`Card filenames/count mismatch: missing=${expected.filter(n => !names.includes(n))}; added=${names.filter(n => !expected.includes(n))}`);
  }
  for (const card of cards) {
    if (sha256(fs.readFileSync(path.join(base, card.path))) !== card.baseline_sha256) throw new Error(`Modified card: ${card.path}`);
  }
  return { count: names.length, status: 'PASS' };
}

export function extractRegion(source, name) {
  const text = source.replace(/\r\n/g, '\n');
  if (name === 'CSS --wood-image') {
    const matches = [...text.matchAll(/--wood-image:[\s\S]*?;/g)];
    if (matches.length !== 1) throw new Error('Ambiguous/missing wood image');
    return matches[0][0];
  }
  const ast = ts.createSourceFile('source.js', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const found = [];
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found.push(text.slice(node.getStart(ast), node.end));
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (found.length !== 1) throw new Error(`Ambiguous/missing render region: ${name}`);
  return found[0];
}

export function verifyRegions(base = root) {
  for (const entry of manifest.protected_regions) {
    const source = fs.readFileSync(path.join(base, entry.path), 'utf8');
    if (sha256(extractRegion(source, entry.region)) !== entry.baseline_sha256) throw new Error(`Changed Go rendering: ${entry.path}:${entry.region}`);
  }
  return { count: manifest.protected_regions.length, status: 'PASS' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify({ cards: verifyCards(), goRendering: verifyRegions() })); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
