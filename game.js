(() => {
  'use strict';

  const SIZE = 19;
  const EMPTY = 0;
  const BLACK = 1;
  const WHITE = 2;
  const STAR_POINTS = [[3, 3], [3, 9], [3, 15], [9, 3], [9, 9], [9, 15], [15, 3], [15, 9], [15, 15]];

  const state = {
    canvas: null,
    ctx: null,
    padding: 0,
    cellSize: 0,
    board: Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY)),
    blackCaptures: 0,
    whiteCaptures: 0,
    currentTurn: 'black',
    myColor: null,
    isInRoom: false,
    gameEnded: false,
    animating: false,
    latestMove: null,
    latestMoveRaf: null,
    resizeObserver: null,
    resizeRaf: null,
    clickHandler: null,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function normalizeSide(side) {
    if (side === BLACK || side === 'black' || side === 1) return 'black';
    if (side === WHITE || side === 'white' || side === 2) return 'white';
    return null;
  }

  function oppositeSide(side) {
    const normalized = normalizeSide(side);
    return normalized === 'black' ? 'white' : normalized === 'white' ? 'black' : null;
  }

  function sideLabel(side) {
    const normalized = normalizeSide(side);
    return normalized === 'black' ? '黑棋' : normalized === 'white' ? '白棋' : '—';
  }

  function getBoardSnapshot() {
    return state.board.map((row) => row.slice());
  }

  function setBoardSnapshot(snapshot) {
    if (!Array.isArray(snapshot) || snapshot.length !== SIZE) return;
    state.board = snapshot.map((row) => Array.isArray(row) ? row.slice(0, SIZE).map((cell) => (cell === BLACK || cell === WHITE ? cell : EMPTY)) : Array(SIZE).fill(EMPTY));
    drawBoard();
  }

  function setTurn(nextTurn) {
    const normalized = normalizeSide(nextTurn);
    if (!normalized) return;
    state.currentTurn = normalized;
    updateUI();
  }

  function isMyTurn() {
    if (!state.isInRoom) return state.currentTurn === 'black';
    if (!state.myColor) return false;
    return normalizeSide(state.currentTurn) === normalizeSide(state.myColor);
  }

  function clearLatestMoveAnimation() {
    if (state.latestMoveRaf) {
      cancelAnimationFrame(state.latestMoveRaf);
      state.latestMoveRaf = null;
    }
  }

  function setLatestMove(row, col, color = null) {
    state.latestMove = {
      row,
      col,
      color: normalizeSide(color) || normalizeSide(state.currentTurn) || 'black',
      startedAt: performance.now(),
    };
    if (!state.latestMoveRaf) {
      const tick = () => {
        if (!state.latestMove) {
          state.latestMoveRaf = null;
          return;
        }
        drawBoard();
        state.latestMoveRaf = requestAnimationFrame(tick);
      };
      state.latestMoveRaf = requestAnimationFrame(tick);
    }
    drawBoard();
  }

  function clearLatestMove() {
    clearLatestMoveAnimation();
    state.latestMove = null;
    drawBoard();
  }

  function bfsLiberties(startRow, startCol, color, boardState = state.board) {
    const queue = [[startRow, startCol]];
    const visited = new Set([`${startRow},${startCol}`]);
    const group = [];
    const counted = new Set();
    let liberties = 0;

    while (queue.length) {
      const [row, col] = queue.shift();
      group.push([row, col]);
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nr = row + dr;
        const nc = col + dc;
        if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
        const key = `${nr},${nc}`;
        if (boardState[nr][nc] === EMPTY) {
          if (!counted.has(key)) {
            counted.add(key);
            liberties++;
          }
        } else if (boardState[nr][nc] === color && !visited.has(key)) {
          visited.add(key);
          queue.push([nr, nc]);
        }
      }
    }

    return { liberties, group };
  }

  function placeStone(row, col, color = state.currentTurn, options = {}) {
    const normalizedColor = normalizeSide(color);
    if (!normalizedColor) return { success: false, reason: '颜色无效' };
    if (row < 0 || row >= SIZE || col < 0 || col >= SIZE) return { success: false, reason: '越界' };
    if (state.board[row][col] !== EMPTY) return { success: false, reason: '该位置已有棋子' };

    const stone = normalizedColor === 'black' ? BLACK : WHITE;
    const opponent = stone === BLACK ? WHITE : BLACK;
    const snapshot = getBoardSnapshot();
    snapshot[row][col] = stone;

    const capturedList = [];
    let captured = 0;

    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nr = row + dr;
      const nc = col + dc;
      if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
      if (snapshot[nr][nc] !== opponent) continue;
      const { liberties, group } = bfsLiberties(nr, nc, opponent, snapshot);
      if (liberties === 0) {
        for (const [gr, gc] of group) {
          snapshot[gr][gc] = EMPTY;
          capturedList.push([gr, gc]);
        }
        captured += group.length;
      }
    }

    const { liberties: selfLiberties } = bfsLiberties(row, col, stone, snapshot);
    if (selfLiberties === 0) {
      return { success: false, reason: '禁止自杀（该落子无气）' };
    }

    state.board = snapshot;
    if (stone === BLACK) state.blackCaptures += captured;
    else state.whiteCaptures += captured;
    if (options.switchTurn !== false) state.currentTurn = oppositeSide(normalizedColor) || state.currentTurn;

    setLatestMove(row, col, normalizedColor);
    updateUI();
    drawBoard();
    return { success: true, captured, capturedGroup: capturedList, color: normalizedColor };
  }

  function resizeCanvas() {
    if (!state.canvas || !state.ctx) return;
    const shell = state.canvas.parentElement?.closest('.board-shell') || state.canvas.parentElement;
    const cssSize = Math.max(320, Math.floor(Math.min(shell?.clientWidth || 0, shell?.clientHeight || shell?.clientWidth || 760) || 760));
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    state.canvas.width = Math.round(cssSize * dpr);
    state.canvas.height = Math.round(cssSize * dpr);
    state.canvas.style.width = `${cssSize}px`;
    state.canvas.style.height = `${cssSize}px`;
    state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    state.padding = cssSize / (SIZE + 1);
    state.cellSize = (cssSize - state.padding * 2) / (SIZE - 1);
    drawBoard();
  }

  function drawStone(row, col, color) {
    const ctx = state.ctx;
    if (!ctx) return;
    const cx = state.padding + col * state.cellSize;
    const cy = state.padding + row * state.cellSize;
    const radius = state.cellSize * 0.44;
    const isLatest = state.latestMove && state.latestMove.row === row && state.latestMove.col === col;
    const pulse = isLatest ? (0.5 + 0.5 * Math.sin(Date.now() / 180)) : 1;
    const alpha = isLatest ? (0.55 + 0.45 * pulse) : 1;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx + 1.4, cy + 1.6, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.3, radius * 0.12, cx, cy, radius);
    if (color === BLACK) {
      grad.addColorStop(0, '#5f5f5f');
      grad.addColorStop(1, '#111');
    } else {
      grad.addColorStop(0, '#fff');
      grad.addColorStop(1, '#bdbdbd');
    }
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx - radius * 0.24, cy - radius * 0.24, radius * 0.26, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fill();
    ctx.restore();

    if (isLatest) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius * (1.02 + pulse * 0.08), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(246, 196, 83, ${0.24 + pulse * 0.48})`;
      ctx.lineWidth = 2 + pulse * 1.6;
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawBoard() {
    if (!state.canvas || !state.ctx) return;
    const size = state.canvas.clientWidth || state.canvas.width / Math.max(1, window.devicePixelRatio || 1);
    const ctx = state.ctx;

    ctx.clearRect(0, 0, size, size);

    const wood = ctx.createRadialGradient(size * 0.28, size * 0.2, size * 0.05, size * 0.5, size * 0.5, size * 0.95);
    wood.addColorStop(0, '#f3d1a4');
    wood.addColorStop(0.45, '#d9ad73');
    wood.addColorStop(1, '#b97d43');
    ctx.fillStyle = wood;
    ctx.fillRect(0, 0, size, size);

    ctx.save();
    ctx.globalAlpha = 0.14;
    for (let i = 0; i < 12; i++) {
      const y = size * (0.06 + i * 0.08);
      ctx.beginPath();
      ctx.moveTo(size * 0.03, y);
      ctx.bezierCurveTo(size * 0.22, y - 7, size * 0.48, y + 10, size * 0.97, y - 2);
      ctx.strokeStyle = i % 2 === 0 ? '#8e5a2d' : '#c8945a';
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(45, 28, 15, 0.95)';
    ctx.lineWidth = 1.1;
    for (let i = 0; i < SIZE; i++) {
      const pos = state.padding + i * state.cellSize;
      ctx.beginPath();
      ctx.moveTo(state.padding, pos);
      ctx.lineTo(size - state.padding, pos);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pos, state.padding);
      ctx.lineTo(pos, size - state.padding);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    STAR_POINTS.forEach(([r, c]) => {
      ctx.beginPath();
      ctx.arc(state.padding + c * state.cellSize, state.padding + r * state.cellSize, 3.4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(35, 22, 12, 0.95)';
      ctx.fill();
    });
    ctx.restore();

    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (state.board[r][c] !== EMPTY) drawStone(r, c, state.board[r][c]);
      }
    }
  }

  function updateUI() {
    const turnEl = $('currentPlayer');
    const blackCapEl = $('blackCaptures');
    const whiteCapEl = $('whiteCaptures');
    const localSideEl = $('local-player-side');
    const localTurnEl = $('local-player-turn');
    const roomStatusEl = $('room-status-pill');
    const connectionEl = $('connection-summary');
    const turnSummaryEl = $('turn-summary');
    if (turnEl) turnEl.textContent = sideLabel(state.currentTurn);
    if (blackCapEl) blackCapEl.textContent = String(state.blackCaptures);
    if (whiteCapEl) whiteCapEl.textContent = String(state.whiteCaptures);
    if (localSideEl) localSideEl.textContent = `执色：${sideLabel(state.myColor)}`;
    if (localTurnEl) {
      if (state.isInRoom) localTurnEl.textContent = `状态：${isMyTurn() ? '轮到我方' : '等待对手'}`;
      else localTurnEl.textContent = '状态：待进入对局';
    }
    if (roomStatusEl && !roomStatusEl.dataset.locked) roomStatusEl.textContent = state.isInRoom ? '进行中' : '待连接';
    if (connectionEl && !connectionEl.dataset.locked) connectionEl.textContent = state.isInRoom ? '已连接' : '未建立';
    if (turnSummaryEl) turnSummaryEl.textContent = `${sideLabel(state.currentTurn)}回合`;
  }

  function showGameEnd(winnerColor, loserColor, reason = 'game_over') {
    const overlay = $('result-overlay');
    const title = $('result-title');
    const desc = $('result-desc');
    if (overlay) overlay.classList.add('is-open');
    if (overlay) overlay.setAttribute('aria-hidden', 'false');
    if (title) title.textContent = '对局结束';
    if (desc) {
      const winner = sideLabel(winnerColor);
      const loser = sideLabel(loserColor);
      if (reason === 'resign' || reason === 'surrender') {
        desc.textContent = `${winner}方获胜（${loser}方投降）`;
      } else {
        desc.textContent = `${winner}方获胜（${loser}方投降）`;
      }
    }
    state.gameEnded = true;
  }

  function hideGameEnd() {
    const overlay = $('result-overlay');
    if (overlay) overlay.classList.remove('is-open');
    if (overlay) overlay.setAttribute('aria-hidden', 'true');
    state.gameEnded = false;
  }

  function resetGame() {
    state.board = Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY));
    state.blackCaptures = 0;
    state.whiteCaptures = 0;
    state.currentTurn = 'black';
    state.myColor = null;
    state.isInRoom = false;
    state.gameEnded = false;
    clearLatestMoveAnimation();
    state.latestMove = null;
    updateUI();
    drawBoard();
  }

  function captureToBoardCoords(e) {
    if (!state.canvas) return null;
    const rect = state.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const scaleX = state.canvas.width / rect.width;
    const scaleY = state.canvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;
    const col = Math.round((mouseX - state.padding) / state.cellSize);
    const row = Math.round((mouseY - state.padding) / state.cellSize);
    if (row < 0 || row >= SIZE || col < 0 || col >= SIZE) return null;
    return { row, col };
  }

  async function handleBoardClick(e) {
    if (state.gameEnded || state.animating) return;
    const pos = captureToBoardCoords(e);
    if (!pos) return;

    if (window.MP && typeof window.MP.isMyTurn === 'function' && !window.MP.isMyTurn()) {
      e.preventDefault();
      return;
    }

    if (window.MP && typeof window.MP.handleLocalMove === 'function') {
      const handled = await window.MP.handleLocalMove(pos.row, pos.col);
      if (handled) return;
    }

    if (!state.isInRoom) {
      const result = placeStone(pos.row, pos.col, state.currentTurn);
      if (result.success) {
        state.currentTurn = oppositeSide(state.currentTurn) || state.currentTurn;
        updateUI();
        drawBoard();
      }
    }
  }

  function initCanvas() {
    state.canvas = $('goBoard');
    if (!state.canvas) return false;
    state.ctx = state.canvas.getContext('2d');
    resizeCanvas();
    if (state.clickHandler) state.canvas.removeEventListener('click', state.clickHandler);
    state.clickHandler = handleBoardClick;
    state.canvas.addEventListener('click', state.clickHandler);

    if (!state.resizeObserver && 'ResizeObserver' in window) {
      state.resizeObserver = new ResizeObserver(() => {
        if (state.resizeRaf) cancelAnimationFrame(state.resizeRaf);
        state.resizeRaf = requestAnimationFrame(resizeCanvas);
      });
      const shell = state.canvas.parentElement?.closest('.board-shell') || state.canvas.parentElement;
      if (shell) state.resizeObserver.observe(shell);
    }

    if (!window.__GO_GAME_RESIZE_BOUND__) {
      window.__GO_GAME_RESIZE_BOUND__ = true;
      window.addEventListener('resize', () => {
        if (state.resizeRaf) cancelAnimationFrame(state.resizeRaf);
        state.resizeRaf = requestAnimationFrame(resizeCanvas);
      });
    }
    return true;
  }

  function launchGameUI() {
    const selection = $('game-selection');
    const app = document.querySelector('.app');
    if (selection) selection.style.display = 'none';
    if (app) app.style.display = 'grid';
    state.isInRoom = false;
    updateUI();
    initCanvas();
    drawBoard();
  }

  function bindTopButtons() {
    $('go-game-btn')?.addEventListener('click', () => {
      launchGameUI();
      if (typeof window.MP?.bootstrap === 'function') window.MP.bootstrap();
    });

    $('result-close-btn')?.addEventListener('click', () => hideGameEnd());
  }

  window.GoGame = {
    state,
    BLACK,
    WHITE,
    EMPTY,
    initCanvas,
    launchGameUI,
    resizeCanvas,
    drawBoard,
    placeStone,
    setLatestMove,
    clearLatestMove,
    setTurn,
    isMyTurn,
    getBoardSnapshot,
    setBoardSnapshot,
    updateUI,
    showGameEnd,
    hideGameEnd,
    resetGame,
    normalizeSide,
    oppositeSide,
    sideLabel,
  };

  window.addEventListener('DOMContentLoaded', () => {
    bindTopButtons();
    updateUI();
    drawBoard();
  });
})();
