// Advisory Go board analysis: area counting, position estimate and single-player AI move ranking.
// Pure functions over a 19x19 numeric board (0 empty, 1 black, 2 white). Never settles rated games.
(() => {
  'use strict';
  const EMPTY = 0, BLACK = 1, WHITE = 2, KOMI = 7.5;
  const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const size = board => board.length;
  const inside = (board, r, c) => r >= 0 && c >= 0 && r < size(board) && c < size(board);
  const clone = board => board.map(row => row.slice());

  function group(board, row, col) {
    const color = board[row][col], seen = new Set([row * 32 + col]), stones = [], liberties = new Set();
    const stack = [[row, col]];
    while (stack.length) {
      const [r, c] = stack.pop(); stones.push([r, c]);
      for (const [dr, dc] of DIRS) {
        const nr = r + dr, nc = c + dc;
        if (!inside(board, nr, nc)) continue;
        const key = nr * 32 + nc, value = board[nr][nc];
        if (value === EMPTY) liberties.add(key);
        else if (value === color && !seen.has(key)) { seen.add(key); stack.push([nr, nc]); }
      }
    }
    return { color, stones, liberties: liberties.size };
  }

  // Empty regions with the set of stone colours bordering each region.
  function regions(board) {
    const seen = new Set(), list = [];
    for (let r = 0; r < size(board); r++) for (let c = 0; c < size(board); c++) {
      if (board[r][c] !== EMPTY || seen.has(r * 32 + c)) continue;
      const points = [], borders = new Set(), stack = [[r, c]]; seen.add(r * 32 + c);
      while (stack.length) {
        const [pr, pc] = stack.pop(); points.push([pr, pc]);
        for (const [dr, dc] of DIRS) {
          const nr = pr + dr, nc = pc + dc;
          if (!inside(board, nr, nc)) continue;
          const value = board[nr][nc], key = nr * 32 + nc;
          if (value === EMPTY) { if (!seen.has(key)) { seen.add(key); stack.push([nr, nc]); } }
          else borders.add(value);
        }
      }
      list.push({ points, owner: borders.size === 1 ? [...borders][0] : EMPTY });
    }
    return list;
  }

  // Chinese area count of the current position: stones plus empty regions touched by one colour only.
  // Dead stones are not removed; the caller must present this as a count of the board as it stands.
  function areaScore(board, komi = KOMI) {
    let blackStones = 0, whiteStones = 0, blackArea = 0, whiteArea = 0, neutral = 0;
    for (const row of board) for (const v of row) { if (v === BLACK) blackStones++; else if (v === WHITE) whiteStones++; }
    for (const region of regions(board)) {
      if (region.owner === BLACK) blackArea += region.points.length;
      else if (region.owner === WHITE) whiteArea += region.points.length;
      else neutral += region.points.length;
    }
    const black = blackStones + blackArea, white = whiteStones + whiteArea + komi;
    return { blackStones, whiteStones, blackArea, whiteArea, neutral, komi, black, white, margin: black - white, winner: black > white ? 'black' : 'white' };
  }

  // Influence estimate: every stone radiates decaying influence; enclosed regions keep their owner.
  // Stones in atari surrounded by stronger enemy influence are counted as likely captured.
  function estimate(board, komi = KOMI) {
    const n = size(board), influence = Array.from({ length: n }, () => Array(n).fill(0));
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const v = board[r][c]; if (v === EMPTY) continue;
      const sign = v === BLACK ? 1 : -1;
      for (let dr = -4; dr <= 4; dr++) for (let dc = -4; dc <= 4; dc++) {
        const d = Math.abs(dr) + Math.abs(dc), nr = r + dr, nc = c + dc;
        if (d > 4 || !inside(board, nr, nc)) continue;
        influence[nr][nc] += sign * (d === 0 ? 4 : 2 / (d * d));
      }
    }
    const owner = Array.from({ length: n }, () => Array(n).fill(EMPTY));
    const deadKeys = new Set();
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (board[r][c] === EMPTY || deadKeys.has(r * 32 + c)) continue;
      const g = group(board, r, c);
      const sum = g.stones.reduce((t, [sr, sc]) => t + influence[sr][sc], 0) / g.stones.length;
      const hostile = g.color === BLACK ? sum < -0.4 : sum > 0.4;
      if (g.liberties === 1 && hostile) for (const [sr, sc] of g.stones) deadKeys.add(sr * 32 + sc);
    }
    for (const region of regions(board)) {
      const fill = region.owner !== EMPTY && region.points.length <= 60 ? region.owner : null;
      for (const [r, c] of region.points) {
        if (fill) { owner[r][c] = fill; continue; }
        const v = influence[r][c];
        owner[r][c] = v > 0.6 ? BLACK : v < -0.6 ? WHITE : EMPTY;
      }
    }
    let black = 0, white = 0, dead = { black: 0, white: 0 };
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const v = board[r][c];
      if (v !== EMPTY && deadKeys.has(r * 32 + c)) {
        owner[r][c] = v === BLACK ? WHITE : BLACK; dead[v === BLACK ? 'black' : 'white']++;
      } else if (v !== EMPTY) owner[r][c] = v;
      if (owner[r][c] === BLACK) black++; else if (owner[r][c] === WHITE) white++;
    }
    const whiteTotal = white + komi;
    return { owner, black, white: whiteTotal, komi, dead, margin: black - whiteTotal, leader: black > whiteTotal ? 'black' : 'white' };
  }

  // Simulate a move with capture and suicide rules; returns null for illegal moves.
  function simulate(board, row, col, color, ko) {
    if (!inside(board, row, col) || board[row][col] !== EMPTY) return null;
    if (ko && ko.row === row && ko.col === col) return null;
    const next = clone(board), enemy = color === BLACK ? WHITE : BLACK;
    next[row][col] = color;
    let captured = 0;
    for (const [dr, dc] of DIRS) {
      const nr = row + dr, nc = col + dc;
      if (!inside(next, nr, nc) || next[nr][nc] !== enemy) continue;
      const g = group(next, nr, nc);
      if (!g.liberties) for (const [sr, sc] of g.stones) { next[sr][sc] = EMPTY; captured++; }
    }
    const own = group(next, row, col);
    if (!own.liberties) return null;
    return { board: next, captured, liberties: own.liberties, groupSize: own.stones.length };
  }

  // Own single-point eye: every neighbour is own colour and most diagonals are too.
  function isOwnEye(board, row, col, color) {
    for (const [dr, dc] of DIRS) { const nr = row + dr, nc = col + dc; if (inside(board, nr, nc) && board[nr][nc] !== color) return false; }
    let bad = 0, edge = false;
    for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const nr = row + dr, nc = col + dc;
      if (!inside(board, nr, nc)) { edge = true; continue; }
      if (board[nr][nc] !== color) bad++;
    }
    return edge ? bad === 0 : bad <= 1;
  }

  // Rank candidate moves for the casual AI. Higher is better; returns null when passing is best.
  function chooseMove(board, color, ko, random = Math.random) {
    const n = size(board), enemy = color === BLACK ? WHITE : BLACK;
    let stones = 0; for (const row of board) for (const v of row) if (v !== EMPTY) stones++;
    const atari = (target, b) => {
      const list = [];
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        if (b[r][c] !== target) continue;
        const g = group(b, r, c);
        if (g.liberties === 1 && g.stones[0][0] === r && g.stones[0][1] === c) list.push(g);
      }
      return list;
    };
    const ownInAtari = atari(color, board).reduce((t, g) => t + g.stones.length, 0);
    let best = null, bestScore = -Infinity;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (board[r][c] !== EMPTY || isOwnEye(board, r, c, color)) continue;
      const result = simulate(board, r, c, color, ko);
      if (!result) continue;
      let score = random() * 2;
      score += result.captured * 30;
      if (result.liberties === 1 && !result.captured) score -= 40 + result.groupSize * 4;
      else if (result.liberties === 2) score -= 2;
      const savedAfter = atari(color, result.board).reduce((t, g) => t + g.stones.length, 0);
      score += (ownInAtari - savedAfter) * 18;
      for (const g of atari(enemy, result.board)) if (result.liberties > 1) score += 6 + g.stones.length * 2;
      let near = 0;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        const nr = r + dr, nc = c + dc;
        if ((dr || dc) && inside(board, nr, nc) && board[nr][nc] !== EMPTY) near += board[nr][nc] === enemy ? 1.2 : 0.8;
      }
      const line = Math.min(r, c, n - 1 - r, n - 1 - c);
      if (stones < 12) score += line === 3 ? 6 : line === 2 ? 4 : line < 2 ? -6 : 1;
      else score += Math.min(near, 5) * 1.4 - (line === 0 ? 3 : 0);
      if (score > bestScore) { bestScore = score; best = { row: r, col: c, score }; }
    }
    return best && bestScore > -20 ? best : null;
  }

  window.NobiGoAnalysis = Object.freeze({ areaScore, estimate, chooseMove, simulate, group, KOMI });
})();
