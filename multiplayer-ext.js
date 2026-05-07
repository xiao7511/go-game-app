/**
 * multiplayer-ext.js
 * [终极修复版] - 解决函数定义错误，匹配截图 UI 风格，支持手机端与呼吸闪烁
 */
(() => {
 'use strict';

  const SIZE = 19;
  const EMPTY = 0;
  const BLACK = 1;
  const WHITE = 2;
  const ROOM_CODE_LENGTH = 6;
  const FLASH_DURATION = 2000;
  const FLASH_INTERVAL = 200;

  const DIRECTIONS = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];

  const SOUNDS = {
    placeStone: 'assets/sounds/button-22.mp3',
    capture: 'assets/sounds/button-21.mp3',
    invalidMove: 'assets/sounds/button-12.mp3',
    yourTurn: 'assets/sounds/button-3.mp3',
    click: 'assets/sounds/button-25.mp3',
  };

  const state = {
    supabase: null,
    roomChannel: null,
    roomCode: null,
    myColor: null,
    currentTurn: 'black',
    isInRoom: false,
    latestMove: null, // [row, col]
    latestMoveVisible: true,
    latestMoveTimer: null,
    latestMoveBlinkTimer: null,
    blackCaptures: 0,
    whiteCaptures: 0,
    roomContext: {
      inviteLink: '',
      roomId: null,
      blackName: '黑方',
      whiteName: '白方',
    },
    canvas: null,
    ctx: null,
    padding: 0,
    cellSize: 0,
    board: Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY)),
    resizeObserver: null,
    boundOnce: false,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function playSound(name) {
    try {
      const url = SOUNDS[name];
      if (url) new Audio(url).play().catch(() => {});
    } catch (_) {}
  }

  function toast(message) {
    const el = $('toast');
    if (!el) {
      console.log('[toast]', message);
      return;
    }
    el.textContent = message;
    el.classList.add('is-visible');
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => el.classList.remove('is-visible'), 2000);
  }

  function setConnectionStatus(text) {
    const el = $('connection-summary');
    if (el) el.textContent = text;
  }

  function normalizeSupabaseUrl(url) {
    if (!url) return '';
    return String(url)
      .replace(/\/rest\/v1\/?$/i, '')
      .replace(/\/$/, '');
  }

  function initSupabaseClient() {
    const cfg = window.APP_CONFIG || window.CONFIG || {};
    const url = normalizeSupabaseUrl(cfg.SUPABASE_URL || cfg.supabaseUrl || cfg.url);
    const key = cfg.SUPABASE_ANON_KEY || cfg.supabaseAnonKey || cfg.key;

    if (!url || !key || !window.supabase?.createClient) {
      console.warn('[multiplayer-ext] Supabase 未配置或 CDN 未加载，多人模式将保持离线。');
      return null;
    }

    state.supabase = window.supabase.createClient(url, key, {
      db: { schema: 'game' },
      realtime: { params: { eventsPerSecond: 10 } },
    });
    return state.supabase;
  }

  function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  async function getUserId() {
    if (!state.supabase) return null;
    try {
      const { data: { session } } = await state.supabase.auth.getSession();
      return session?.user?.id || null;
    } catch (_) {
      return null;
    }
  }

  async function getPlayerProfile(playerId) {
    if (!state.supabase || !playerId) return null;
    try {
      const { data, error } = await state.supabase
        .schema('game')
        .rpc('get_player_profile', { player_id: playerId });
      if (error) throw error;
      return Array.isArray(data) ? data[0] || null : data;
    } catch (err) {
      console.warn('[multiplayer-ext] 获取玩家资料失败:', err);
      return null;
    }
  }

  function updateProfilePanels() {
    const blackCaptures = $('blackCaptures');
    const whiteCaptures = $('whiteCaptures');
    const currentPlayer = $('currentPlayer');

    if (blackCaptures) blackCaptures.textContent = String(state.blackCaptures);
    if (whiteCaptures) whiteCaptures.textContent = String(state.whiteCaptures);
    if (currentPlayer) {
      if (state.myColor) {
        const isMine = state.currentTurn === state.myColor;
        currentPlayer.textContent = `${state.currentTurn === 'black' ? '黑棋' : '白棋'}（${isMine ? '我方' : '对方'}）`;
      } else {
        currentPlayer.textContent = state.currentTurn === 'black' ? '黑棋' : '白棋';
      }
    }

    const localSide = $('local-player-side');
    const localTurn = $('local-player-turn');
    const connSummary = $('connection-summary');
    const blackName = $('black-player-name');
    const whiteName = $('white-player-name');

    if (localSide) localSide.textContent = `执色：${state.myColor === 'black' ? '黑棋' : state.myColor === 'white' ? '白棋' : '—'}`;
    if (localTurn) localTurn.textContent = state.isInRoom
      ? `状态：${state.currentTurn === state.myColor ? '轮到我方' : '等待对手'}`
      : '状态：待进入对局';
    if (connSummary) connSummary.textContent = state.isInRoom ? '已连接' : '未建立';
    if (blackName) blackName.textContent = state.roomContext.blackName || '黑方';
    if (whiteName) whiteName.textContent = state.roomContext.whiteName || '白方';
  }

  function updateRoomPanel({ code = state.roomCode, inviteLink = state.roomContext.inviteLink || '' } = {}) {
    const roomIdEl = $('room-id');
    const linkEl = $('room-invite-link');
    const pill = $('room-status-pill');
    if (roomIdEl) roomIdEl.textContent = code || '—';
    if (linkEl) {
      linkEl.value = inviteLink || '';
      linkEl.readOnly = true;
    }
    if (pill) {
      pill.textContent = state.isInRoom ? '进行中' : '待连接';
      pill.classList.toggle('offline', !state.isInRoom);
    }
    bindCopyInviteButton();
  }

  function clearLatestMoveTimers() {
    if (state.latestMoveTimer) clearTimeout(state.latestMoveTimer);
    if (state.latestMoveBlinkTimer) clearInterval(state.latestMoveBlinkTimer);
    state.latestMoveTimer = null;
    state.latestMoveBlinkTimer = null;
  }

  function clearLatestMoveHighlight() {
    clearLatestMoveTimers();
    state.latestMove = null;
    state.latestMoveVisible = true;
  }

  function setLatestMoveHighlight(row, col, duration = FLASH_DURATION) {
    clearLatestMoveTimers();
    state.latestMove = [row, col];
    state.latestMoveVisible = true;
    drawFullBoard();

    state.latestMoveBlinkTimer = setInterval(() => {
      state.latestMoveVisible = !state.latestMoveVisible;
      drawFullBoard();
    }, FLASH_INTERVAL);

    state.latestMoveTimer = setTimeout(() => {
      clearLatestMoveHighlight();
      drawFullBoard();
    }, duration);
  }

  function bindCopyInviteButton() {
    const copyBtn = $('mp-copy-invite-btn');
    const input = $('room-invite-link');
    if (!copyBtn) return;

    if (copyBtn.dataset.bound !== '1') {
      copyBtn.addEventListener('click', async () => {
        const text = (input && input.value) || state.roomContext.inviteLink || '';
        if (!text) {
          toast('暂无可复制的邀请链接');
          return;
        }

        try {
          if (navigator.clipboard?.writeText && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
          } else if (input) {
            input.removeAttribute('readonly');
            input.focus();
            input.select();
            const ok = document.execCommand('copy');
            input.setAttribute('readonly', 'readonly');
            if (!ok) throw new Error('copy failed');
          } else {
            throw new Error('clipboard unavailable');
          }
          toast('已复制房间邀请链接');
        } catch (err) {
          console.warn('[multiplayer-ext] 复制失败:', err);
          if (input) {
            input.removeAttribute('readonly');
            input.focus();
            input.select();
            const ok = document.execCommand('copy');
            input.setAttribute('readonly', 'readonly');
            if (ok) toast('已复制房间邀请链接');
            else prompt('请手动复制邀请链接:', text);
          } else {
            prompt('请手动复制邀请链接:', text);
          }
        }
      });

      copyBtn.dataset.bound = '1';
    }

    copyBtn.disabled = !((input && input.value) || state.roomContext.inviteLink);
    copyBtn.title = copyBtn.disabled ? '创建或加入房间后可复制邀请链接' : '复制房间邀请链接';
  }

  function getBoardSnapshot() {
    return state.board.map((row) => row.slice());
  }

  function setBoardSnapshot(snapshot) {
    if (!Array.isArray(snapshot) || snapshot.length !== SIZE) return;
    state.board = snapshot.map((row) => Array.isArray(row) ? row.slice(0, SIZE) : Array(SIZE).fill(EMPTY));
  }

  function initCanvasParams() {
    state.canvas = $('goBoard');
    if (!state.canvas) return false;
    state.ctx = state.canvas.getContext('2d');
    resizeCanvas();
    return true;
  }

  function resizeCanvas() {
    if (!state.canvas || !state.ctx) return;
    const parent = state.canvas.parentElement;
    const shell = parent?.closest('.board-shell') || parent;
    const cssSize = Math.max(320, Math.floor(Math.min(shell?.clientWidth || 0, shell?.clientHeight || shell?.clientWidth || 0) || 760));
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    state.canvas.width = cssSize * dpr;
    state.canvas.height = cssSize * dpr;
    state.canvas.style.width = `${cssSize}px`;
    state.canvas.style.height = `${cssSize}px`;
    state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    state.padding = cssSize / (SIZE + 1);
    state.cellSize = (cssSize - state.padding * 2) / (SIZE - 1);
    drawFullBoard();
  }

  function ensureCanvasSize() {
    if (!state.canvas || !state.ctx) return;
    const rect = state.canvas.getBoundingClientRect();
    const size = Math.max(320, Math.floor(Math.min(rect.width || 0, rect.height || 0) || 760));
    const current = state.canvas.width / Math.max(1, window.devicePixelRatio || 1);
    if (Math.abs(current - size) > 1) resizeCanvas();
  }

  function clearLatestMoveTimers() {
    if (state.latestMoveTimer) clearTimeout(state.latestMoveTimer);
    if (state.latestMoveBlinkTimer) clearInterval(state.latestMoveBlinkTimer);
    state.latestMoveTimer = null;
    state.latestMoveBlinkTimer = null;
  }

  function clearLatestMoveHighlight() {
    clearLatestMoveTimers();
    state.latestMove = null;
    state.latestMoveVisible = true;
  }

  function setLatestMoveHighlight(row, col, duration = FLASH_DURATION) {
    clearLatestMoveTimers();
    state.latestMove = [row, col];
    state.latestMoveVisible = true;
    drawFullBoard();

    state.latestMoveBlinkTimer = setInterval(() => {
      state.latestMoveVisible = !state.latestMoveVisible;
      drawFullBoard();
    }, FLASH_INTERVAL);

    state.latestMoveTimer = setTimeout(() => {
      clearLatestMoveHighlight();
      drawFullBoard();
    }, duration);
  }

  function bfsLiberties(startRow, startCol, color, boardState) {
    const queue = [[startRow, startCol]];
    const visited = new Set([`${startRow},${startCol}`]);
    const group = [];
    const countedLibs = new Set();
    let liberties = 0;

    while (queue.length) {
      const [r, c] = queue.shift();
      group.push([r, c]);
      for (const [dr, dc] of DIRECTIONS) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
        const key = `${nr},${nc}`;
        if (boardState[nr][nc] === EMPTY) {
          if (!countedLibs.has(key)) {
            countedLibs.add(key);
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

  function placeStone(row, col, color) {
    if (state.board[row][col] !== EMPTY) {
      return { success: false, reason: '该位置已有棋子' };
    }

    const opponent = color === BLACK ? WHITE : BLACK;
    state.board[row][col] = color;

    const capturedList = [];
    let totalCaptured = 0;

    for (const [dr, dc] of DIRECTIONS) {
      const nr = row + dr;
      const nc = col + dc;
      if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
      if (state.board[nr][nc] !== opponent) continue;

      const { liberties, group } = bfsLiberties(nr, nc, opponent, state.board);
      if (liberties === 0) {
        for (const [gr, gc] of group) {
          state.board[gr][gc] = EMPTY;
          capturedList.push([gr, gc]);
        }
        totalCaptured += group.length;
      }
    }

    const { liberties: selfLiberties } = bfsLiberties(row, col, color, state.board);
    if (selfLiberties === 0) {
      state.board[row][col] = EMPTY;
      for (const [r, c] of capturedList) state.board[r][c] = opponent;
      return { success: false, reason: '禁止自杀（无气）' };
    }

    if (color === BLACK) state.blackCaptures += totalCaptured;
    else state.whiteCaptures += totalCaptured;

    return { success: true, captured: totalCaptured, capturedGroup: capturedList };
  }

  function switchTurn() {
    state.currentTurn = state.currentTurn === 'black' ? 'white' : 'black';
    updateProfilePanels();
  }

  function drawStone(row, col, color, isLatestMove = false) {
    if (!state.ctx) return;
    const cx = state.padding + col * state.cellSize;
    const cy = state.padding + row * state.cellSize;
    const radius = state.cellSize * 0.44;
    const alpha = isLatestMove ? (state.latestMoveVisible ? 1 : 0.14) : 1;

    state.ctx.save();
    state.ctx.globalAlpha = 1;
    state.ctx.beginPath();
    state.ctx.arc(cx + 1.2, cy + 1.4, radius, 0, Math.PI * 2);
    state.ctx.fillStyle = 'rgba(0,0,0,0.25)';
    state.ctx.fill();
    state.ctx.restore();

    state.ctx.save();
    state.ctx.globalAlpha = alpha;
    state.ctx.beginPath();
    state.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    const g = state.ctx.createRadialGradient(cx - radius * 0.32, cy - radius * 0.32, radius * 0.1, cx, cy, radius);
    if (color === BLACK) {
      g.addColorStop(0, '#575757');
      g.addColorStop(1, '#101010');
    } else {
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, '#bebebe');
    }
    state.ctx.fillStyle = g;
    state.ctx.fill();
    state.ctx.beginPath();
    state.ctx.arc(cx - radius * 0.24, cy - radius * 0.24, radius * 0.26, 0, Math.PI * 2);
    state.ctx.fillStyle = 'rgba(255,255,255,0.16)';
    state.ctx.fill();
    state.ctx.restore();
  }

  function drawFullBoard() {
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
    ctx.globalAlpha = 0.16;
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

    const stars = [[3, 3], [3, 9], [3, 15], [9, 3], [9, 9], [9, 15], [15, 3], [15, 9], [15, 15]];
    ctx.save();
    stars.forEach(([r, c]) => {
      ctx.beginPath();
      ctx.arc(state.padding + c * state.cellSize, state.padding + r * state.cellSize, 3.4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(35, 22, 12, 0.96)';
      ctx.fill();
    });
    ctx.restore();

    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (state.board[r][c] !== EMPTY) {
          const isLatest = Boolean(state.latestMove && state.latestMove[0] === r && state.latestMove[1] === c);
          drawStone(r, c, state.board[r][c], isLatest);
        }
      }
    }
  }

  function captureToBoardCoords(e) {
    const rect = state.canvas.getBoundingClientRect();
    const scaleX = state.canvas.width / rect.width;
    const scaleY = state.canvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;
    const col = Math.round((mouseX - state.padding) / state.cellSize);
    const row = Math.round((mouseY - state.padding) / state.cellSize);
    if (row < 0 || row >= SIZE || col < 0 || col >= SIZE) return null;
    return { row, col };
  }

  function canvasCaptureHandler(e) {
    if (!state.isInRoom) return;
    if (!state.myColor || state.currentTurn !== state.myColor) {
      e.preventDefault();
      e.stopPropagation();
      playSound('invalidMove');
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const pos = captureToBoardCoords(e);
    if (!pos) return;
    handleMultiplayerMove(pos.row, pos.col);
  }

  async function persistRoomState(extra = {}) {
    if (!state.supabase || !state.roomCode) return;
    try {
      await state.supabase
        .schema('game')
        .from('game_rooms')
        .update({
          board_state: JSON.stringify(getBoardSnapshot()),
          next_turn: state.currentTurn,
          black_captures: state.blackCaptures,
          white_captures: state.whiteCaptures,
          status: state.isInRoom ? 'playing' : 'ended',
          ...extra,
        })
        .eq('code', state.roomCode);
    } catch (err) {
      console.warn('[multiplayer-ext] 同步房间状态失败:', err);
    }
  }

  async function broadcastMove(row, col, color, capturedList) {
    if (!state.roomChannel) return;
    await state.roomChannel.send({
      type: 'broadcast',
      event: 'move',
      payload: {
        row,
        col,
        color,
        captured: capturedList,
        board_state: getBoardSnapshot(),
        black_captures: state.blackCaptures,
        white_captures: state.whiteCaptures,
        next_turn: state.currentTurn,
      },
    });
  }

  async function handleMultiplayerMove(row, col) {
    const color = state.myColor === 'black' ? BLACK : WHITE;
    const result = placeStone(row, col, color);
    if (!result.success) {
      playSound('invalidMove');
      toast(result.reason || '非法落子');
      return;
    }

    playSound(result.captured > 0 ? 'capture' : 'placeStone');
    setLatestMoveHighlight(row, col, FLASH_DURATION);
    switchTurn();
    drawFullBoard();

    await broadcastMove(row, col, color, result.capturedGroup || []);
    await persistRoomState();
  }

  function applyRemotePayload(payload) {
    if (!payload) return;
    if (payload.board_state) setBoardSnapshot(payload.board_state);
    if (typeof payload.black_captures === 'number') state.blackCaptures = payload.black_captures;
    if (typeof payload.white_captures === 'number') state.whiteCaptures = payload.white_captures;
    if (typeof payload.next_turn === 'string') state.currentTurn = payload.next_turn;
  }

  async function onOpponentMove(payload) {
    const { row, col, color, captured } = payload || {};
    if (typeof row !== 'number' || typeof col !== 'number' || !color) return;

    state.board[row][col] = color;
    if (Array.isArray(captured)) {
      for (const [r, c] of captured) state.board[r][c] = EMPTY;
    }

    if (color === BLACK) state.blackCaptures += Array.isArray(captured) ? captured.length : 0;
    else state.whiteCaptures += Array.isArray(captured) ? captured.length : 0;

    state.currentTurn = state.myColor || (color === BLACK ? 'white' : 'black');
    setLatestMoveHighlight(row, col);
    playSound('yourTurn');
    drawFullBoard();
    updateProfilePanels();
  }

  function showGameOverOverlay(winnerColor, reason = 'game_over') {
    const overlay = $('result-overlay');
    const title = $('result-title');
    const desc = $('result-desc');
    if (!overlay || !title || !desc) return;

    title.textContent = '对局结束';
    desc.textContent = `${winnerColor === 'black' ? '黑方' : '白方'}获胜${reason === 'resign' ? '（对手认输）' : ''}`;
    overlay.classList.add('is-open');
  }

  function hideGameOverOverlay() {
    const overlay = $('result-overlay');
    if (overlay) overlay.classList.remove('is-open');
  }

  async function announceGameOver(winnerColor, reason = 'game_over') {
    if (state.roomChannel) {
      await state.roomChannel.send({
        type: 'broadcast',
        event: 'message',
        payload: {
          type: 'GAME_OVER',
          winner: winnerColor,
          reason,
        },
      });
    }
    await persistRoomState({ status: 'ended' });
    showGameOverOverlay(winnerColor, reason);
  }

  async function handleResignRequest(fromColor) {
    if (!state.isInRoom) return;
    const winner = fromColor === 'black' ? 'white' : 'black';
    const accepted = window.confirm(`对手请求认输。是否接受？\n\n接受后将判定 ${winner === 'black' ? '黑方' : '白方'} 获胜。`);
    if (!accepted) return;
    await announceGameOver(state.myColor || winner, 'resign');
  }

  async function onRoomMessage(payload) {
    if (!payload || typeof payload !== 'object') return;
    if (payload.type === 'RESIGN_REQUEST') {
      await handleResignRequest(payload.from);
      return;
    }
    if (payload.type === 'GAME_OVER') {
      await persistRoomState({ status: 'ended' });
      showGameOverOverlay(payload.winner, payload.reason || 'game_over');
    }
  }

  async function initRoomChannel(code) {
    if (!state.supabase) return null;
    const ch = state.supabase.channel(`room:${code}`, { config: { broadcast: { self: false } } });

    ch.on('broadcast', { event: 'move' }, ({ payload }) => {
      applyRemotePayload(payload);
      onOpponentMove(payload);
    });

    ch.on('broadcast', { event: 'message' }, ({ payload }) => {
      onRoomMessage(payload);
    });

    ch.on('presence', { event: 'sync' }, async () => {
      try {
        const { data: latestRoom } = await state.supabase
          .schema('game')
          .from('game_rooms')
          .select('*')
          .eq('code', code)
          .single();
        if (latestRoom) refreshRoomFromServer(latestRoom);
      } catch (err) {
        console.warn('[multiplayer-ext] 刷新房间失败:', err);
      }
    });

    ch.on('postgres_changes', {
      event: 'UPDATE',
      schema: 'game',
      table: 'game_rooms',
      filter: `code=eq.${code}`,
    }, async ({ new: room }) => {
      if (room) refreshRoomFromServer(room);
    });

    await ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.track({ online: true });
        setConnectionStatus('已连接');
      }
    });

    return ch;
  }

  async function refreshRoomFromServer(room) {
    if (!room) return;
    if (room.board_state) {
      try {
        const snapshot = typeof room.board_state === 'string' ? JSON.parse(room.board_state) : room.board_state;
        setBoardSnapshot(snapshot);
      } catch (err) {
        console.warn('[multiplayer-ext] board_state 解析失败:', err);
      }
    }
    if (typeof room.black_captures === 'number') state.blackCaptures = room.black_captures;
    if (typeof room.white_captures === 'number') state.whiteCaptures = room.white_captures;

    if (room.status === 'ended') setConnectionStatus('已结束');
    else if (room.status === 'playing') setConnectionStatus('实时同步中');
    else setConnectionStatus('等待对手');

    const otherId = state.myColor === 'black' ? room.white_id : room.black_id;
    const myId = state.myColor === 'black' ? room.black_id : room.white_id;
    const blackNameEl = $('black-player-name');
    const whiteNameEl = $('white-player-name');

    const blackProfile = room.black_id ? await getPlayerProfile(room.black_id) : null;
    const whiteProfile = room.white_id ? await getPlayerProfile(room.white_id) : null;
    state.roomContext.blackName = blackProfile?.nickname || (room.black_id ? '黑方玩家' : '黑方');
    state.roomContext.whiteName = whiteProfile?.nickname || (room.white_id ? '白方玩家' : '白方');

    if (blackNameEl) blackNameEl.textContent = state.roomContext.blackName;
    if (whiteNameEl) whiteNameEl.textContent = state.roomContext.whiteName;

    const oppStatus = $('opponent-status');
    const oppName = $('opponent-nickname');
    const oppSide = $('opponent-side');
    const oppActivity = $('opponent-activity');
    if (oppStatus) {
      oppStatus.textContent = otherId ? '在线' : '离线';
      oppStatus.classList.toggle('offline', !otherId);
    }
    if (oppName) oppName.textContent = otherId ? (state.myColor === 'black' ? state.roomContext.whiteName : state.roomContext.blackName) : '等待对手';
    if (oppSide) oppSide.textContent = `执色：${otherId ? (state.myColor === 'black' ? '白棋' : '黑棋') : '—'}`;
    if (oppActivity) oppActivity.textContent = otherId ? '状态：已匹配' : '状态：等待加入';

    if (myId) {
      const profile = await getPlayerProfile(myId);
      const localName = $('user-nickname');
      const rankEl = $('user-rank');
      if (localName) localName.textContent = profile?.nickname || '棋手';
      if (rankEl) rankEl.textContent = profile?.rank || '业余1段';
    }

    updateProfilePanels();
    drawFullBoard();
  }

  function buildInviteLink(code) {
    return `${window.location.origin}${window.location.pathname}?room=${code}`;
  }

  async function createRoom() {
    console.log('[MP] 正在发起创建房间请求...');

    const userId = await getUserId();
    if (!userId) {
      alert('请先登录后再创建房间');
      window.location.href = 'login.html';
      return;
    }
    if (!state.supabase) {
      alert('Supabase 未配置，无法创建房间');
      return;
    }

    const code = generateRoomCode();
    try {
      const { error } = await state.supabase
        .schema('game')
        .from('game_rooms')
        .insert({
          code,
          black_id: userId,
          white_id: null,
          status: 'waiting',
          board_state: JSON.stringify(getBoardSnapshot()),
          next_turn: 'black',
          black_captures: 0,
          white_captures: 0,
        });
      if (error) throw error;

      state.roomCode = code;
      state.myColor = 'black';
      state.currentTurn = 'black';
      state.isInRoom = true;
      state.roomContext.roomId = code;
      state.roomContext.inviteLink = buildInviteLink(code);
      state.roomContext.blackName = '黑方玩家';
      state.roomContext.whiteName = '白方玩家';

      state.roomChannel = await initRoomChannel(code);
      updateRoomPanel({ code, inviteLink: state.roomContext.inviteLink });
      await refreshRoomFromServer({ black_id: userId, white_id: null, status: 'waiting' });
      drawFullBoard();
      updateProfilePanels();
      showGameArea();
      toast(`房间已创建：${code}`);
    } catch (err) {
      console.error('[multiplayer-ext] 创建房间失败:', err);
      alert(`创建房间失败: ${err.message}`);
    }
  }

  async function joinRoom(code) {
    const cleanCode = code.trim().toUpperCase();
    if (cleanCode.length !== 6) {
      alert("请输入正确的6位房号");
      return;
    }
    console.log('[MP] 正在加入房间:', cleanCode);
    const userId = await getUserId();
    if (!userId) {
      alert('请先登录后再加入房间');
      window.location.href = 'login.html';
      return;
    }
    if (!state.supabase) {
      alert('Supabase 未配置，无法加入房间');
      return;
    }

    try {
      const { data: room, error } = await state.supabase
        .schema('game')
        .from('game_rooms')
        .select('*')
        .eq('code', code)
        .single();
      if (error || !room) {
        alert('房间不存在或已过期');
        return;
      }

      if (room.black_id === userId) {
        state.myColor = 'black';
      } else if (!room.white_id) {
        const { error: updateErr } = await state.supabase
          .schema('game')
          .from('game_rooms')
          .update({ white_id: userId, status: 'playing' })
          .eq('code', code);
        if (updateErr) throw updateErr;
        state.myColor = 'white';
      } else if (room.white_id === userId) {
        state.myColor = 'white';
      } else {
        alert('该房间已满');
        return;
      }

      state.roomCode = code;
      state.currentTurn = 'black';
      state.isInRoom = true;
      state.roomContext.roomId = code;
      state.roomContext.inviteLink = buildInviteLink(code);
      state.roomChannel = await initRoomChannel(code);
      await refreshRoomFromServer(room);
      updateRoomPanel({ code, inviteLink: state.roomContext.inviteLink });
      drawFullBoard();
      updateProfilePanels();
      showGameArea();
      toast(`已加入房间：${code}`);
    } catch (err) {
      console.error('[multiplayer-ext] 加入房间失败:', err);
      alert(`加入房间失败: ${err.message}`);
    }
  }

  // --- 2. UI 注入 (严格匹配图片风格：深色、磨砂、紫色渐变) ---

  function injectUIButtons() {
    const selectionPanel = document.querySelector('.selection-panel') || $('game-selection');
    if (!selectionPanel) return;

    // 清除旧的控制区
    const old = document.querySelector('.mp-visual-container');
    if (old) old.remove();

    const container = document.createElement('div');
    container.className = 'mp-visual-container';
    
    // 动态注入匹配截图的 CSS
    const style = document.createElement('style');
    style.innerHTML = `
      .mp-visual-container {
        background: rgba(15, 15, 20, 0.7);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 24px;
        padding: 25px;
        margin-top: 25px;
        width: 100%;
        max-width: 380px;
        box-shadow: 0 20px 50px rgba(0,0,0,0.6);
        color: #fff;
        font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
      }
      .mp-header-row {
        display: flex;
        align-items: center;
        margin-bottom: 20px;
        font-size: 14px;
        color: rgba(255,255,255,0.9);
        letter-spacing: 1px;
      }
      .mp-dot {
        width: 6px; height: 6px;
        background: #00ffcc;
        border-radius: 50%;
        margin-right: 10px;
        box-shadow: 0 0 10px #00ffcc;
      }
      .btn-purple-glow {
        background: linear-gradient(135deg, #6d28d9 0%, #a855f7 100%);
        color: white;
        border: none;
        padding: 15px;
        border-radius: 14px;
        width: 100%;
        font-weight: 600;
        font-size: 16px;
        cursor: pointer;
        margin-bottom: 15px;
        transition: all 0.3s ease;
        box-shadow: 0 4px 15px rgba(109, 40, 217, 0.4);
      }
      .btn-purple-glow:active { transform: scale(0.96); opacity: 0.9; }
      .mp-input-row { display: flex; gap: 12px; }
      .mp-input-field {
        flex: 1;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 12px;
        padding: 12px;
        color: #fff;
        text-align: center;
        font-size: 16px;
        font-weight: bold;
        letter-spacing: 3px;
      }
      .mp-input-field::placeholder { color: rgba(255,255,255,0.3); letter-spacing: normal; font-weight: normal; }
      .btn-join-dark {
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: #fff;
        padding: 0 22px;
        border-radius: 12px;
        cursor: pointer;
        font-weight: 500;
        transition: background 0.2s;
      }
      .btn-join-dark:hover { background: rgba(255, 255, 255, 0.15); }
    `;
    document.head.appendChild(style);

    container.innerHTML = `
      <div class="mp-header-row"><span class="mp-dot"></span> 在线对战模式 (Alpha)</div>
      <button id="mp-create-btn" class="btn-purple-glow">创建联机对战</button>
      <div class="mp-input-row">
        <input type="text" id="mp-code-input" class="mp-input-field" placeholder="输入6位房号" maxlength="6">
        <button id="mp-join-btn" class="btn-join-dark">加入</button>
      </div>
    `;
    selectionPanel.appendChild(container);

    // 绑定事件
    $('mp-create-btn').onclick = createRoom;
    $('mp-join-btn').onclick = () => {
      const code = $('mp-code-input').value;
      joinRoom(code);
    };
  }

  // --- 3. 逻辑修复 (手机端落子 + 白方权限 + 呼吸闪烁) ---

  function canvasCaptureHandler(e) {
    if (!state.isInRoom) return;

    // 权限：确保当前回合与玩家颜色一致
    if (state.currentTurn !== state.myColor) return;

    const rect = state.canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const col = Math.round((x - state.padding) / state.cellSize);
    const row = Math.round((y - state.padding) / state.cellSize);

    if (row >= 0 && row < SIZE && col >= 0 && col < SIZE) {
      if (state.board[row][col] === EMPTY) {
        // 调用发送落子的 handleMultiplayerMove
        if (typeof handleMultiplayerMove === 'function') {
           handleMultiplayerMove(row, col);
        }
      }
    }
  }

  // 呼吸闪烁绘制函数
  function renderLatestStoneEffect(row, col, colorType) {
    const cx = state.padding + col * state.cellSize;
    const cy = state.padding + row * state.cellSize;
    
    state.ctx.save();
    // 呼吸动画：透明度 0.6 ~ 1.0 之间平滑变动
    state.ctx.globalAlpha = 0.8 + 0.2 * Math.sin(Date.now() / 250);
    state.ctx.shadowColor = '#00ffcc';
    state.ctx.shadowBlur = 15;
    
    state.ctx.beginPath();
    state.ctx.arc(cx, cy, state.cellSize * 0.43, 0, Math.PI * 2);
    state.ctx.fillStyle = (colorType === BLACK) ? '#000' : '#fff';
    state.ctx.fill();
    state.ctx.restore();
  }

  // --- 4. 初始化 ---

  async function init() {
    if (state.boundOnce) return;
    state.boundOnce = true;

    injectUIButtons();

    state.canvas = $('game-canvas');
    if (!state.canvas) return;
    state.ctx = state.canvas.getContext('2d');

    // 手机端适配
    state.canvas.addEventListener('click', canvasCaptureHandler);
    state.canvas.addEventListener('touchstart', (e) => {
      if (state.isInRoom) e.preventDefault(); // 阻止滚动
      canvasCaptureHandler(e);
    }, { passive: false });

    // 每一帧都尝试重绘（用于呼吸闪烁效果）
    const frame = () => {
      if (state.latestMove && state.isInRoom) {
        // 假设 drawFullBoard 会被调用，这里触发局部重绘
        renderLatestStoneEffect(state.latestMove[0], state.latestMove[1], state.board[state.latestMove[0]][state.latestMove[1]]);
      }
      requestAnimationFrame(frame);
    };
    frame();

    console.log('[MP] 科技感 UI 修复版已就绪');
  }

  // 确保 API 暴露
  window.MP = { ...window.MP, init, createRoom, joinRoom };
  window.addEventListener('DOMContentLoaded', init);
})();