/**
 * multiplayer-ext.js
 *
 * Self-contained multiplayer extension for the Go game.
 * - Room creation/joining
 * - Realtime move sync
 * - Latest move stone flashing
 * - Resign confirmation flow
 * - Room invite copy support
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
    isSyncing: false, // 必须添加此行
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
/*
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
  }*/
 // 修改后的初始化函数，支持异步等待配置
  async function initSupabaseClient() {
      // 1. 如果已经初始化过，直接返回实例
      if (state.supabase) return state.supabase;

      // 2. 增加重试机制，等待 config.js 加载完成 (最多等待 3 秒)
      let retry = 0;
      while (!window.APP_CONFIG?.SUPABASE_URL && retry < 30) {
          await new Promise(r => setTimeout(r, 100)); // 每 100ms 检查一次
          retry++;
      }

      // 3. 获取最新的配置
      const cfg = window.APP_CONFIG || window.CONFIG || {};
      
      // 强制清洗 URL，防止 /rest/v1 导致的 404 错误
      const rawUrl = cfg.SUPABASE_URL || cfg.supabaseUrl || cfg.url;
      const url = rawUrl ? rawUrl.trim().replace(/\/rest\/v1\/?$/, '') : null;
      const key = cfg.SUPABASE_ANON_KEY || cfg.supabaseAnonKey || cfg.key;

      // 4. 校验环境
      if (!url || !key || !window.supabase?.createClient) {
          console.warn('[multiplayer-ext] Supabase 配置缺失或 CDN 未加载，正在重试或保持离线...');
          return null;
      }

      try {
          // 5. 创建实例
          state.supabase = window.supabase.createClient(url, key, {
              db: { schema: 'game' },
              realtime: { 
                  params: { eventsPerSecond: 10 },
                  // 确保开启 Realtime，这是看到对手落子的关键
                  config: { broadcast: { self: true }, presence: { key: 'player' } }
              },
          });
          
          console.log('[multiplayer-ext] Supabase 实例已成功创建');
          return state.supabase;
      } catch (err) {
          console.error('[multiplayer-ext] 初始化异常:', err);
          return null;
      }
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

  /*
 async function getPlayerProfile(playerId) {
    try {
      // 关键修复：确保参数名 p_id 与数据库函数定义一致
      const { data, error } = await state.supabase.rpc('get_player_profile', { 
        p_id: playerId 
      });

      if (error) {
        // 如果是 400 错误，说明可能是参数名不对或函数不存在
        console.warn('[MP] RPC 调用失败，尝试返回保底数据:', error.message);
        return { nickname: '棋手_' + playerId.substring(0, 4), avatar_url: null };
      }

      return data;
    } catch (err) {
      // 捕获 LockGrantedCallback 等浏览器底层的异步异常
      console.error('[MP] getPlayerProfile 发生异常:', err);
      return { nickname: '棋手', avatar_url: null };
    }
  }*/
  async function getPlayerProfile(playerId) { //调用玩家信息  by 0510
    try {
      const { data, error } = await state.supabase.rpc(
        'get_player_profile',
        { p_id: playerId }
      );

      if (error) {
        console.warn('[MP] RPC 调用失败:', error.message);
        return null;
      }

      return Array.isArray(data) ? data[0] : data;

    } catch (err) {
      console.error('[MP] getPlayerProfile 异常:', err);
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

    //state.currentTurn = state.myColor || (color === BLACK ? 'white' : 'black');
    state.currentTurn = color === BLACK ? 'white' : 'black';
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

  /**
 * 修复版：refreshRoomFromServer
 * 解决 400 报错、LockGrantedCallback 异常及 UI 同步卡顿
 */
  async function refreshRoomFromServer(room) {
    if (!room) return;

    // 1. 防止并发同步导致 Lock 异常 (加锁)
    if (state.isSyncing) return;
    state.isSyncing = true;

    try {
      // 2. 更新棋盘状态 (优先执行，确保落子可见)
      if (room.board_state) {
        try {
          const snapshot = typeof room.board_state === 'string' 
            ? JSON.parse(room.board_state) 
            : room.board_state;
          setBoardSnapshot(snapshot);
        } catch (err) {
          console.warn('[multiplayer-ext] board_state 解析失败:', err);
        }
      }

      // 更新提子数
      if (typeof room.black_captures === 'number') state.blackCaptures = room.black_captures;
      if (typeof room.white_captures === 'number') state.whiteCaptures = room.white_captures;

      // 更新连接显示状态
      if (room.status === 'ended') setConnectionStatus('已结束');
      else if (room.status === 'playing') setConnectionStatus('实时同步中');
      else setConnectionStatus('等待对手');

      // 3. 异步获取玩家资料 (带异常保护，防止 400 错误中断全局)
      const otherId = state.myColor === 'black' ? room.white_id : room.black_id;
      const myId = state.myColor === 'black' ? room.black_id : room.white_id;

      // 获取黑白双方资料 (Parallel 执行，提高效率)
      const [blackProfile, whiteProfile, myProfile] = await Promise.allSettled([
        room.black_id ? getPlayerProfile(room.black_id) : Promise.resolve(null),
        room.white_id ? getPlayerProfile(room.white_id) : Promise.resolve(null),
        myId ? getPlayerProfile(myId) : Promise.resolve(null)
      ]);

      // 处理黑方名字
      state.roomContext.blackName = (blackProfile.status === 'fulfilled' && blackProfile.value?.nickname) 
        ? blackProfile.value.nickname 
        : (room.black_id ? '黑方玩家' : '黑方');

      // 处理白方名字
      state.roomContext.whiteName = (whiteProfile.status === 'fulfilled' && whiteProfile.value?.nickname) 
        ? whiteProfile.value.nickname 
        : (room.white_id ? '白方玩家' : '白方');

      // 4. 更新 UI 文本 (DOM 操作)
      const blackNameEl = $('black-player-name');
      const whiteNameEl = $('white-player-name');
      if (blackNameEl) blackNameEl.textContent = state.roomContext.blackName;
      if (whiteNameEl) whiteNameEl.textContent = state.roomContext.whiteName;

      // 更新对手面板
      const oppStatus = $('opponent-status');
      const oppName = $('opponent-nickname');
      const oppSide = $('opponent-side');
      if (oppStatus) {
        oppStatus.textContent = otherId ? '在线' : '离线';
        oppStatus.classList.toggle('offline', !otherId);
      }
      if (oppName) {
        oppName.textContent = otherId 
          ? (state.myColor === 'black' ? state.roomContext.whiteName : state.roomContext.blackName) 
          : '等待对手';
      }
      if (oppSide) {
        oppSide.textContent = `执色：${otherId ? (state.myColor === 'black' ? '白棋' : '黑棋') : '—'}`;
      }

      // 更新本地玩家面板
      if (myProfile.status === 'fulfilled' && myProfile.value) {
        const localName = $('user-nickname');
        const rankEl = $('user-rank');
        if (localName) localName.textContent = myProfile.value.nickname || '棋手';
        if (rankEl) rankEl.textContent = myProfile.value.rank || '业余1段';
      }

      // 5. 触发重绘
      updateProfilePanels();
      drawFullBoard();

    } catch (e) {
      console.warn('[MP] 同步房间数据时发生非致命异常:', e.message);
    } finally {
      // 释放锁
      state.isSyncing = false;
    }
  }

  function buildInviteLink(code) {
    return `${window.location.origin}${window.location.pathname}?room=${code}`;
  }

  async function createRoom() {
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
      //await refreshRoomFromServer(room);
      const { data: latestRoom } = await state.supabase
        .schema('game')
        .from('game_rooms')
        .select('*')
        .eq('code', code)
        .single();

      await refreshRoomFromServer(latestRoom);  //修复new

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

  function showGameArea() {
    const selection = $('game-selection');
    const app = document.querySelector('.app');
    if (selection) selection.style.display = 'none';
    if (app) app.style.display = 'grid';
  }

  function injectUIButtons() {
    const card = document.querySelector('#game-selection .selection-card');
    if (!card || $('mp-create-room-btn')) return;

    const divider = document.createElement('div');
    divider.style.cssText = 'margin:14px 0;border-top:1px solid rgba(255,255,255,0.1);';

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:column;gap:10px;margin-top:12px;';

    const createBtn = document.createElement('button');
    createBtn.id = 'mp-create-room-btn';
    createBtn.className = 'mode-btn primary';
    createBtn.innerHTML = '<span>🆚 创建对战房间</span><span class="badge">多人</span>';
    createBtn.addEventListener('click', createRoom);

    const joinHint = document.createElement('p');
    joinHint.style.cssText = 'margin:0;color:rgba(238,244,251,0.68);font-size:13px;line-height:1.6;';
    joinHint.textContent = '收到邀请链接后，打开即可自动加入房间。';

    wrapper.appendChild(createBtn);
    wrapper.appendChild(joinHint);
    card.appendChild(divider);
    card.appendChild(wrapper);
  }

  function bindResignButtons() {
    const bindOne = (el) => {
      if (!el || el.dataset.bound === '1') return;
      el.addEventListener('click', onResignClick);
      el.dataset.bound = '1';
    };
    bindOne($('mp-resign-btn'));
    bindOne($('surrender-btn'));
  }

  async function onResignClick() {
    if (!state.isInRoom || !state.roomChannel) {
      alert('当前不在对局中');
      return;
    }
    await state.roomChannel.send({
      type: 'broadcast',
      event: 'message',
      payload: {
        type: 'RESIGN_REQUEST',
        from: state.myColor,
        room: state.roomCode,
      },
    });
    toast('已发送认输请求');
  }

  async function leaveRoom() {
    clearLatestMoveHighlight();
    if (state.roomChannel) {
      try { await state.roomChannel.untrack(); } catch (_) {}
      try { await state.supabase?.removeChannel(state.roomChannel); } catch (_) {}
      state.roomChannel = null;
    }
    state.isInRoom = false;
    state.roomCode = null;
    state.myColor = null;
    state.roomContext.roomId = null;
    state.roomContext.inviteLink = '';
    state.blackCaptures = 0;
    state.whiteCaptures = 0;
    setConnectionStatus('未建立');
    updateProfilePanels();
    updateRoomPanel({ code: '—', inviteLink: '' });
    drawFullBoard();
  }

  function checkRoomParam() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('room');
    if (code && code.length === ROOM_CODE_LENGTH) {
      setTimeout(() => joinRoom(code.toUpperCase()), 350);
      return true;
    }
    return false;
  }

  async function handleSurrenderMessage(payload) {
    if (!payload || payload.type !== 'RESIGN_REQUEST') return;
    if (!state.myColor || payload.from === state.myColor) return;

    const agree = window.confirm('对手请求认输，是否同意？');
    if (!agree) return;

    const winner = state.myColor;
    await state.roomChannel?.send({
      type: 'broadcast',
      event: 'message',
      payload: {
        type: 'GAME_OVER',
        winner,
        reason: 'resign',
      },
    });
    await persistRoomState({ status: 'ended' });
    showGameOverOverlay(winner, 'resign');
  }
/*
  async function onRoomMessage(payload) {
    if (!payload) return;
    if (payload.type === 'RESIGN_REQUEST') {
      await handleSurrenderMessage(payload);
    } else if (payload.type === 'GAME_OVER') {
      await persistRoomState({ status: 'ended' });
      showGameOverOverlay(payload.winner, payload.reason || 'game_over');
    }
  }*/

  /**
 * 修复版：refreshRoomFromServer
 * 解决 400 报错、LockGrantedCallback 异常及 UI 同步卡顿
 */
/*
async function refreshRoomFromServer(room) {
  if (!room) return;

  // 1. 防止并发同步导致 Lock 异常 (加锁)
  if (state.isSyncing) return;
  state.isSyncing = true;

  try {
    // 2. 更新棋盘状态 (优先执行，确保落子可见)
    if (room.board_state) {
      try {
        const snapshot = typeof room.board_state === 'string' 
          ? JSON.parse(room.board_state) 
          : room.board_state;
        setBoardSnapshot(snapshot);
      } catch (err) {
        console.warn('[multiplayer-ext] board_state 解析失败:', err);
      }
    }

    // 更新提子数
    if (typeof room.black_captures === 'number') state.blackCaptures = room.black_captures;
    if (typeof room.white_captures === 'number') state.whiteCaptures = room.white_captures;

    // 更新连接显示状态
    if (room.status === 'ended') setConnectionStatus('已结束');
    else if (room.status === 'playing') setConnectionStatus('实时同步中');
    else setConnectionStatus('等待对手');

    // 3. 异步获取玩家资料 (带异常保护，防止 400 错误中断全局)
    const otherId = state.myColor === 'black' ? room.white_id : room.black_id;
    const myId = state.myColor === 'black' ? room.black_id : room.white_id;

    // 获取黑白双方资料 (Parallel 执行，提高效率)
    const [blackProfile, whiteProfile, myProfile] = await Promise.allSettled([
      room.black_id ? getPlayerProfile(room.black_id) : Promise.resolve(null),
      room.white_id ? getPlayerProfile(room.white_id) : Promise.resolve(null),
      myId ? getPlayerProfile(myId) : Promise.resolve(null)
    ]);

    // 处理黑方名字
    state.roomContext.blackName = (blackProfile.status === 'fulfilled' && blackProfile.value?.nickname) 
      ? blackProfile.value.nickname 
      : (room.black_id ? '黑方玩家' : '黑方');

    // 处理白方名字
    state.roomContext.whiteName = (whiteProfile.status === 'fulfilled' && whiteProfile.value?.nickname) 
      ? whiteProfile.value.nickname 
      : (room.white_id ? '白方玩家' : '白方');

    // 4. 更新 UI 文本 (DOM 操作)
    const blackNameEl = $('black-player-name');
    const whiteNameEl = $('white-player-name');
    if (blackNameEl) blackNameEl.textContent = state.roomContext.blackName;
    if (whiteNameEl) whiteNameEl.textContent = state.roomContext.whiteName;

    // 更新对手面板
    const oppStatus = $('opponent-status');
    const oppName = $('opponent-nickname');
    const oppSide = $('opponent-side');
    if (oppStatus) {
      oppStatus.textContent = otherId ? '在线' : '离线';
      oppStatus.classList.toggle('offline', !otherId);
    }
    if (oppName) {
      oppName.textContent = otherId 
        ? (state.myColor === 'black' ? state.roomContext.whiteName : state.roomContext.blackName) 
        : '等待对手';
    }
    if (oppSide) {
      oppSide.textContent = `执色：${otherId ? (state.myColor === 'black' ? '白棋' : '黑棋') : '—'}`;
    }

    // 更新本地玩家面板
    if (myProfile.status === 'fulfilled' && myProfile.value) {
      const localName = $('user-nickname');
      const rankEl = $('user-rank');
      if (localName) localName.textContent = myProfile.value.nickname || '棋手';
      if (rankEl) rankEl.textContent = myProfile.value.rank || '业余1段';
    }

    // 5. 触发重绘
    updateProfilePanels();
    drawFullBoard();

  } catch (e) {
    console.warn('[MP] 同步房间数据时发生非致命异常:', e.message);
  } finally {
    // 释放锁
    state.isSyncing = false;
  }
} */

  function buildInviteLink(code) {
    return `${window.location.origin}${window.location.pathname}?room=${code}`;
  }
/*
  async function createRoom() {
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
  } */
 /*
  async function joinRoom(code) {
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
  }*/

  function bindResignButtons() {
    const bindOne = (el) => {
      if (!el || el.dataset.bound === '1') return;
      el.addEventListener('click', onResignClick);
      el.dataset.bound = '1';
    };
    bindOne($('mp-resign-btn'));
    bindOne($('surrender-btn'));
  }

  async function onResignClick() {
    if (!state.isInRoom || !state.roomChannel) {
      alert('当前不在对局中');
      return;
    }
    await state.roomChannel.send({
      type: 'broadcast',
      event: 'message',
      payload: {
        type: 'RESIGN_REQUEST',
        from: state.myColor,
        room: state.roomCode,
      },
    });
    toast('已发送认输请求');
  }

  function hideGameOverOverlay() {
    const overlay = $('result-overlay');
    if (overlay) overlay.classList.remove('is-open');
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

  async function leaveRoom() {
    clearLatestMoveHighlight();
    if (state.roomChannel) {
      try { await state.roomChannel.untrack(); } catch (_) {}
      try { await state.supabase?.removeChannel(state.roomChannel); } catch (_) {}
      state.roomChannel = null;
    }
    state.isInRoom = false;
    state.roomCode = null;
    state.myColor = null;
    state.roomContext.roomId = null;
    state.roomContext.inviteLink = '';
    state.blackCaptures = 0;
    state.whiteCaptures = 0;
    setConnectionStatus('未建立');
    updateProfilePanels();
    updateRoomPanel({ code: '—', inviteLink: '' });
    drawFullBoard();
  }

  function checkRoomParam() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('room');
    if (code && code.length === ROOM_CODE_LENGTH) {
      setTimeout(() => joinRoom(code.toUpperCase()), 350);
      return true;
    }
    return false;
  }

  async function handleSurrenderMessage(payload) {
    if (!payload || payload.type !== 'RESIGN_REQUEST') return;
    if (!state.myColor || payload.from === state.myColor) return;

    const agree = window.confirm('对手请求认输，是否同意？');
    if (!agree) return;

    const winner = state.myColor;
    await state.roomChannel?.send({
      type: 'broadcast',
      event: 'message',
      payload: {
        type: 'GAME_OVER',
        winner,
        reason: 'resign',
      },
    });
    await persistRoomState({ status: 'ended' });
    showGameOverOverlay(winner, 'resign');
  }
 /*
  async function onRoomMessage(payload) {
    if (!payload) return;
    if (payload.type === 'RESIGN_REQUEST') {
      await handleSurrenderMessage(payload);
    } else if (payload.type === 'GAME_OVER') {
      await persistRoomState({ status: 'ended' });
      showGameOverOverlay(payload.winner, payload.reason || 'game_over');
    }
  }*/

  function showGameArea() {
    const selection = $('game-selection');
    const app = document.querySelector('.app');
    if (selection) selection.style.display = 'none';
    if (app) app.style.display = 'grid';
  }

  function injectUIButtons() {
    const card = document.querySelector('#game-selection .selection-card');
    if (!card || $('mp-create-room-btn')) return;

    const divider = document.createElement('div');
    divider.style.cssText = 'margin:14px 0;border-top:1px solid rgba(255,255,255,0.1);';

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:column;gap:10px;margin-top:12px;';

    const createBtn = document.createElement('button');
    createBtn.id = 'mp-create-room-btn';
    createBtn.className = 'mode-btn primary';
    createBtn.innerHTML = '<span>🆚 创建对战房间</span><span class="badge">多人</span>';
    createBtn.addEventListener('click', createRoom);

    const joinHint = document.createElement('p');
    joinHint.style.cssText = 'margin:0;color:rgba(238,244,251,0.68);font-size:13px;line-height:1.6;';
    joinHint.textContent = '收到邀请链接后，打开即可自动加入房间。';

    wrapper.appendChild(createBtn);
    wrapper.appendChild(joinHint);
    card.appendChild(divider);
    card.appendChild(wrapper);
  }

  async function init() {
    if (state.boundOnce) return;
    state.boundOnce = true;

    initSupabaseClient();
    injectUIButtons();
    bindCopyInviteButton();
    bindResignButtons();
    checkRoomParam();

    //if (!initCanvasParams()) return;
    if (!initCanvasParams()) {
      console.error('[multiplayer-ext] goBoard 初始化失败');
      return;
    }
    drawFullBoard();
    updateProfilePanels();

    state.canvas.addEventListener('click', canvasCaptureHandler, { capture: true });
    /**添加监听 */
    state.canvas.addEventListener('touchstart', canvasCaptureHandler, {
      passive: false,
      capture: true
    });

    if (state.resizeObserver) state.resizeObserver.disconnect();
    state.resizeObserver = new ResizeObserver(() => {
      ensureCanvasSize();
      drawFullBoard();
    });
    const shell = state.canvas.parentElement;
    if (shell) state.resizeObserver.observe(shell);
    window.addEventListener('resize', () => {
      ensureCanvasSize();
      drawFullBoard();
    });

    const closeBtn = $('result-close-btn');
    if (closeBtn && closeBtn.dataset.bound !== '1') {
      closeBtn.addEventListener('click', () => hideGameOverOverlay());
      closeBtn.dataset.bound = '1';
    }

    console.log('[multiplayer-ext] loaded');
  }
  window.MP = {
    createRoom,
    joinRoom,
    leaveRoom,
    getRoomCode: () => state.roomCode,
    getMyColor: () => state.myColor,
    isInRoom: () => state.isInRoom,
    handleSurrender: onResignClick,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
