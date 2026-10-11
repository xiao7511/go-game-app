/**
 * multiplayer-ext.js
 *
 * 修复了 PC 端和移动端 Canvas 尺寸自适应的问题
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
    [-1, 0], [1, 0], [0, -1], [0, 1],
  ];

  const SOUNDS = {
    placeStone: 'assets/sounds/button-22.mp3',
    capture: 'assets/sounds/button-21.mp3',
    invalidMove: 'assets/sounds/button-12.mp3',
    yourTurn: 'assets/sounds/button-3.mp3',
    click: 'assets/sounds/button-25.mp3',
  };

  const state = {
    isSyncing: false,
    supabase: null,
    roomChannel: null,
    roomCode: null,
    gameMode: 'MULTIPLAYER',
    myColor: null,
    currentTurn: 'black',
    boardSize: 19,
    isInRoom: false,
    latestMove: null,
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
    viewMoves: [], // Local UI journal; not authoritative settlement or a persisted SGF.
    pendingAITimer: null,
    previewMove: null,
    previewPointer: null,
    undoStack: [], // Single-player snapshots, never broadcast or persisted.
    matchEnded: false,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function playSound(name) {
    if (window.NobiAudio) { window.NobiAudio.playEffect(name); return; }
    try {
      const url = SOUNDS[name];
      if (url) new Audio(url).play().catch(() => {});
    } catch (_) {}
  }

  function toast(message) {
    const el = $('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('is-visible');
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => el.classList.remove('is-visible'), 2000);
  }

  function setConnectionStatus(text) {
    const el = $('connection-summary');
    if (el) el.textContent = text;
  }

  async function initSupabaseClient() {
    state.supabase = await window.NobiServices?.ready;
    return state.supabase || null;
  }

  function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  async function getCurrentUser() {
      await initSupabaseClient();
      if (!state.supabase) return null;
      const { data: { user }, error } = await state.supabase.auth.getUser();
      return error ? null : user;
  }

  async function getPlayerProfile(playerId) {
    try {
      const { data, error } = await state.supabase.schema('public').rpc('get_player_profile', { player_id: playerId });
      if (error) return null;
      return Array.isArray(data) ? data[0] : data;
    } catch (err) {
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
    if (connSummary) connSummary.textContent = state.gameMode==='SINGLE_PLAYER' ? '本地单机' : state.isInRoom ? '已连接' : '未建立';
    if (blackName) blackName.textContent = state.roomContext.blackName || '黑方';
    if (whiteName) whiteName.textContent = state.roomContext.whiteName || '白方';
    if(state.gameMode==='SINGLE_PLAYER') {
      if(localTurn) localTurn.textContent=state.currentTurn==='black'?'状态：轮到我方':'状态：AI 思考中';
      if($('user-nickname')) $('user-nickname').textContent=window.state?.userNickname || '本地玩家';
      if($('local-player-status')) $('local-player-status').textContent='本地';
      if($('opponent-status')) { $('opponent-status').textContent='AI';$('opponent-status').classList.remove('offline'); }
      if($('turn-summary')) $('turn-summary').textContent=state.currentTurn==='black'?'黑棋回合':'白棋回合';
    }
    window.dispatchEvent(new CustomEvent('nobi:go-view'));
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

  function bindCopyInviteButton() {
    const copyBtn = $('mp-copy-invite-btn');
    const input = $('room-invite-link');
    if (!copyBtn) return;

    if (copyBtn.dataset.bound !== '1') {
      copyBtn.addEventListener('click', async () => {
        const text = (input && input.value) || state.roomContext.inviteLink || '';
        if (!text) { toast('暂无可复制的邀请链接'); return; }

        try {
          if (navigator.clipboard?.writeText && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
          } else if (input) {
            input.removeAttribute('readonly');
            input.focus();
            input.select();
            document.execCommand('copy');
            input.setAttribute('readonly', 'readonly');
          }
          toast('已复制房间邀请链接');
        } catch (err) {
          prompt('请手动复制邀请链接:', text);
        }
      });
      copyBtn.dataset.bound = '1';
    }

    copyBtn.disabled = !((input && input.value) || state.roomContext.inviteLink);
  }

  function getBoardSnapshot() {
    return state.board.map((row) => row.slice());
  }

  function setBoardSnapshot(snapshot) {
    if (!Array.isArray(snapshot) || snapshot.length !== SIZE) return;
    state.board = snapshot.map((row) => Array.isArray(row) ? row.slice(0, SIZE) : Array(SIZE).fill(EMPTY));
  }

  // ==========================================
  // ✨【核心修复区】：统一而纯净的 Canvas 自适应重绘逻辑
  // ==========================================
  function initCanvasParams() {
    state.canvas = $('goBoard');
    if (!state.canvas) return false;
    state.ctx = state.canvas.getContext('2d');
    
    // 暴露出全局唯一的 resize 函数，防止 game.js 找不到它而报错
    window.unifiedResizeCanvas = resizeCanvas;
    
    resizeCanvas();
    return true;
  }

  function resizeCanvas() {
      cancelPreview();
      if (!state.canvas || !state.ctx) return;
      // 1. 获取准确的父容器 (CSS 已经把它限制成了完美的正方形)
      const shell = state.canvas.parentElement; 
      if (!shell) return;
      // Small-screen header occupies real vertical space. Constrain the square
      // to the remaining viewport without changing wood/grid/stone rendering.
      if (window.innerWidth <= 860) {
        const height = window.visualViewport?.height || window.innerHeight;
        const available = Math.max(1, Math.floor(height - shell.getBoundingClientRect().top - 12));
        shell.style.maxWidth = available + 'px';
      } else {
        shell.style.maxWidth = '';
      }

      // 2. 获取 CSS 计算出的实际渲染像素大小
      const rect = shell.getBoundingClientRect();
      const cssSize = rect.width; 

      if (cssSize === 0) return; // 处于隐藏状态时跳过

      // 3. 高清屏适配
      const dpr = window.devicePixelRatio || 1;

      // 4. 清除可能残留的破坏性内联样式 (让 CSS 100% 掌权)
      state.canvas.style.width = '';
      state.canvas.style.height = '';

      // 5. 仅设置 Canvas 内部实际绘图分辨率
      state.canvas.width = Math.round(cssSize * dpr);
      state.canvas.height = Math.round(cssSize * dpr);
      
      // 6. 重置画笔缩放矩阵
      state.ctx.resetTransform();
      state.ctx.scale(dpr, dpr);

      // 7. 同步计算游戏内部坐标系参数
      state.padding = cssSize / (SIZE + 1);
      state.cellSize = (cssSize - state.padding * 2) / (SIZE - 1);
      
      // 将参数暴露给全局，确保多端代码同步
      window.gamePadding = state.padding;
      window.gameCellSize = state.cellSize;

      // 8. 触发重绘
      requestAnimationFrame(() => {
        if (typeof drawFullBoard === 'function') {
          drawFullBoard();
        }
      });
  }

  function drawFullBoard() {
    if (!state.canvas || !state.ctx) return;
    // 使用 shell 真实的宽作为绘图参考基准
    const shell = state.canvas.parentElement;
    const size = shell ? shell.getBoundingClientRect().width : (state.canvas.width / (window.devicePixelRatio || 1));
    const ctx = state.ctx;

    ctx.clearRect(0, 0, size, size);

    // 棋盘底色
    ctx.fillStyle = '#f3c17a';
    ctx.fillRect(0, 0, size, size);

    // 纹理
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

    // 网格线
    ctx.save();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
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

    // 星位
    const stars = [[3, 3], [3, 9], [3, 15], [9, 3], [9, 9], [9, 15], [15, 3], [15, 9], [15, 15]];
    ctx.save();
    stars.forEach(([r, c]) => {
      ctx.beginPath();
      ctx.arc(state.padding + c * state.cellSize, state.padding + r * state.cellSize, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#333';
      ctx.fill();
    });
    ctx.restore();

    // 绘制棋子与闪烁逻辑
    for (let row = 0; row < state.boardSize; row++) {
      for (let col = 0; col < state.boardSize; col++) {
        const color = state.board[row][col];
        if (color === EMPTY) continue;

        const bMove = state.blinkingMove || null;
        const isCurrentBlinkMove = (bMove && bMove.row === row && bMove.col === col);

        if (isCurrentBlinkMove) {
          if (bMove.visible) {
            drawStone(row, col, color);
          } else {
            ctx.save();
            ctx.globalAlpha = 0.03; 
            drawStone(row, col, color);
            ctx.restore();
          }
        } else {
          drawStone(row, col, color);
        }
      }
    }
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

  window.state = window.state || {};
  window.state.koPoint = null; 

  function placeStone(row, col, color) {
    if (!validPoint(row, col) || ![BLACK, WHITE].includes(color)) return { success: false, captured: 0, reason: '非法坐标或执色' };
    if (window.state.koPoint) {
      if (window.state.koPoint.row === row && window.state.koPoint.col === col) {
        return { success: false, captured: 0, reason: '🚫 处于劫争状态，不能立刻提回' };
      }
    }

    if (state.board[row][col] !== EMPTY) {
      return { success: false, captured: 0, reason: '该位置已有棋子' };
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
          if (!capturedList.some(([exR, exC]) => exR === gr && exC === gc)) {
            state.board[gr][gc] = EMPTY;
            capturedList.push([gr, gc]);
          }
        }
      }
    }
    
    totalCaptured = capturedList.length;
    const { liberties: selfLiberties } = bfsLiberties(row, col, color, state.board);
    
    if (selfLiberties === 0) {
      state.board[row][col] = EMPTY;
      for (const [r, c] of capturedList) state.board[r][c] = opponent;
      return { success: false, captured: 0, reason: '禁止自杀（无气）' };
    }

    if (totalCaptured === 1 && selfLiberties === 1) {
      window.state.koPoint = { row: capturedList[0][0], col: capturedList[0][1] };
    } else {
      window.state.koPoint = null;
    }

    if (color === BLACK) state.blackCaptures += totalCaptured;
    else state.whiteCaptures += totalCaptured;

    return { success: true, captured: totalCaptured, capturedGroup: capturedList };
  }

  function drawStone(row, col, color) {
    if (!state.ctx) return;
    const cx = state.padding + col * state.cellSize;
    const cy = state.padding + row * state.cellSize;
    const radius = state.cellSize * 0.44;

    // Shadow
    state.ctx.save();
    state.ctx.beginPath();
    state.ctx.arc(cx + 1.5, cy + 1.5, radius, 0, Math.PI * 2);
    state.ctx.fillStyle = 'rgba(0,0,0,0.25)';
    state.ctx.fill();
    state.ctx.restore();

    // Body
    state.ctx.save();
    state.ctx.beginPath();
    state.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    const g = state.ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.3, radius * 0.1, cx, cy, radius);
    if (color === BLACK) {
      g.addColorStop(0, '#555');
      g.addColorStop(1, '#111');
    } else {
      g.addColorStop(0, '#fff');
      g.addColorStop(1, '#bbb');
    }
    state.ctx.fillStyle = g;
    state.ctx.fill();
    
    // Highlight
    state.ctx.beginPath();
    state.ctx.arc(cx - radius * 0.25, cy - radius * 0.25, radius * 0.3, 0, Math.PI * 2);
    state.ctx.fillStyle = 'rgba(255,255,255,0.15)';
    state.ctx.fill();
    state.ctx.restore();
  }

  function captureToBoardCoords(e) {
    const rect = state.canvas.getBoundingClientRect();
    let clientX = e.clientX, clientY = e.clientY;

    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if (e.changedTouches && e.changedTouches.length > 0) {
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    }

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    if (!state.cellSize || x < state.padding - state.cellSize / 2 || y < state.padding - state.cellSize / 2 ||
        x > rect.width - state.padding + state.cellSize / 2 || y > rect.height - state.padding + state.cellSize / 2) return null;

    let col = Math.round((x - state.padding) / state.cellSize);
    let row = Math.round((y - state.padding) / state.cellSize);

    row = Math.max(0, Math.min(SIZE - 1, row));
    col = Math.max(0, Math.min(SIZE - 1, col));

    return { row, col };
  }

  function canvasCaptureHandler(e) {
    if (state.matchEnded) return;
    if (state.gameMode !== 'SINGLE_PLAYER' && !state.isInRoom) return;
    if (!state.myColor || state.currentTurn !== state.myColor) {
      e.preventDefault();
      playSound('invalidMove');
      return;
    }
    e.preventDefault();
    const pos = captureToBoardCoords(e);
    if (!pos) return;
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      if (e.isPrimary === false) { cancelPreview(); return; }
      state.previewPointer = e.pointerId;
      state.canvas.setPointerCapture?.(e.pointerId);
      previewPoint(pos.row, pos.col);
      return;
    }
    handleMultiplayerMove(pos.row, pos.col);
  }

  function cancelPreview() {
    const changed = state.previewMove !== null;
    state.previewMove = null; state.previewPointer = null;
    if (changed) window.dispatchEvent(new CustomEvent('nobi:go-view'));
  }

  function previewPoint(row, col) {
    if (!validPoint(row, col) || state.matchEnded || state.isSyncing ||
        !['black', 'white'].includes(state.myColor) || state.currentTurn !== state.myColor ||
        (state.gameMode !== 'SINGLE_PLAYER' && !state.isInRoom) || state.board[row][col] !== EMPTY) {
      cancelPreview(); return false;
    }
    state.previewMove = {row, col, color:state.myColor,
      x:state.padding + col * state.cellSize, y:state.padding + row * state.cellSize,
      size:state.cellSize};
    window.dispatchEvent(new CustomEvent('nobi:go-view'));
    return true;
  }

  async function confirmPreview() {
    const move = state.previewMove;
    cancelPreview();
    if (!move || move.color !== state.myColor || state.matchEnded) return;
    await handleMultiplayerMove(move.row, move.col);
  }

  function canvasPreviewMove(e) {
    if (state.previewPointer !== e.pointerId) return;
    e.preventDefault();
    const pos = captureToBoardCoords(e);
    if (pos) previewPoint(pos.row, pos.col); else cancelPreview();
  }

  function undoSoloTurn() {
    if (state.gameMode !== 'SINGLE_PLAYER' || state.matchEnded || state.myColor !== 'black' || !state.undoStack.length) return false;
    const snapshot = state.undoStack.pop();
    clearTimeout(state.pendingAITimer); state.pendingAITimer = null;
    cancelPreview(); clearBlink();
    setBoardSnapshot(snapshot.board);
    state.blackCaptures = snapshot.blackCaptures; state.whiteCaptures = snapshot.whiteCaptures;
    window.state.koPoint = snapshot.koPoint;
    state.viewMoves = snapshot.moves;
    state.currentTurn = 'black'; state.isSyncing = false;
    if (snapshot.latest) {
      const {row, col, color} = snapshot.latest;
      // Reuse the original latest-move renderer; startBlink also appends the journal.
      state.viewMoves.pop(); startBlink(row, col, color);
    }
    drawFullBoard(); updateProfilePanels();
    return true;
  }

  async function persistRoomState(extra = {}) {
    if (!state.supabase || !state.roomCode) return;
    try {
      await state.supabase.schema('game').from('game_rooms').update({
          board_state: JSON.stringify(getBoardSnapshot()),
          next_turn: state.currentTurn,
          black_captures: state.blackCaptures,
          white_captures: state.whiteCaptures,
          status: state.isInRoom ? 'playing' : 'ended',
          ...extra,
        }).eq('code', state.roomCode);
    } catch (err) {}
  }

  async function broadcastMove(row, col, color, capturedList) {
      if (!state.roomChannel) return;
      await state.roomChannel.send({
        type: 'broadcast', event: 'move',
        payload: {
          row, col, color, captured: capturedList,
          board_state: getBoardSnapshot(),
          black_captures: state.blackCaptures,
          white_captures: state.whiteCaptures,
          next_turn: state.currentTurn,
          koPoint: window.state.koPoint 
        },
      });
  }

  state.blinkingMove = null;
  state.blinkTimer = null;

  function startBlink(row, col, color) {
    state.viewMoves.push({row:Number(row),col:Number(col),color,number:state.viewMoves.length+1});
    if (state.blinkTimer) clearInterval(state.blinkTimer);
    state.blinkingMove = { row: parseInt(row), col: parseInt(col), color: color, visible: true };
    state.blinkTimer = setInterval(() => {
      if (!state.blinkingMove) {
        clearInterval(state.blinkTimer);
        state.blinkTimer = null;
        return;
      }
      state.blinkingMove.visible = !state.blinkingMove.visible;
      requestAnimationFrame(() => drawFullBoard());
    }, 250); 
  }
  
  function clearBlink() {
      if (state.blinkTimer) {
        clearInterval(state.blinkTimer);
        state.blinkTimer = null;
      }
      state.blinkingMove = null;
      drawFullBoard();
  }

  async function handleMultiplayerMove(row, col) {
    if(state.authoritativeSend){if(state.matchEnded||state.isSyncing||state.currentTurn!==state.myColor)return;cancelPreview();await state.authoritativeSend('move',{row,col});return;}
    if (!validPoint(row, col) || state.matchEnded) return;
    if (state.currentTurn !== state.myColor || state.board[row][col] !== EMPTY || state.isSyncing) {
      playSound('invalidMove'); return;
    }

    state.isSyncing = true; 
    cancelPreview();
    const snapshot = state.gameMode === 'SINGLE_PLAYER' ? {
      board:getBoardSnapshot(), blackCaptures:state.blackCaptures, whiteCaptures:state.whiteCaptures,
      koPoint:window.state.koPoint ? {...window.state.koPoint} : null,
      moves:state.viewMoves.map(move=>({...move})), latest:state.viewMoves.at(-1) ? {...state.viewMoves.at(-1)} : null,
    } : null;
    const colorNum = state.myColor === 'black' ? BLACK : WHITE;
    const result = placeStone(row, col, colorNum);

    if (!result.success) {
      state.isSyncing = false;
      playSound('invalidMove');
      toast(result.reason || '非法落子');
      return;
    }

    if (state.gameMode === 'SINGLE_PLAYER') {
      state.undoStack.push(snapshot);
      playSound(result.captured > 0 ? 'capture' : 'placeStone');
      startBlink(row, col, colorNum);
      state.currentTurn = 'white';
      drawFullBoard();
      updateProfilePanels();
      state.isSyncing = false; 
      clearTimeout(state.pendingAITimer);
      state.pendingAITimer=setTimeout(()=>{
        state.pendingAITimer=null;
        if(state.gameMode==='SINGLE_PLAYER' && state.myColor==='black') triggerAIMove();
      },700);
      return; 
    }

    playSound(result.captured > 0 ? 'capture' : 'placeStone');
    startBlink(row, col, colorNum);
    const nextTurn = state.myColor === 'black' ? 'white' : 'black';
    state.currentTurn = nextTurn;
    drawFullBoard();
    updateProfilePanels();

    try {
      await broadcastMove(row, col, colorNum, result.capturedGroup || []);
      await persistRoomState({ next_turn: nextTurn });
    } catch (err) {} finally {
      state.isSyncing = false;
    }
  }

  function validPoint(row, col) {
    return Number.isInteger(row) && Number.isInteger(col) && row >= 0 && row < SIZE && col >= 0 && col < SIZE;
  }

  async function onOpponentMove(payload) {
    if (state.matchEnded) return;
    const { row, col, color, captured = [], next_turn } = payload || {};
    if (!validPoint(row, col) || ![BLACK, WHITE].includes(color) || !Array.isArray(captured)) return;
    if (captured.some(p => !Array.isArray(p) || p.length !== 2 || !validPoint(p[0], p[1]) || (p[0] === row && p[1] === col))) return;
    if (new Set(captured.map(p => p.join(','))).size !== captured.length) return;
    if (['black_captures', 'white_captures'].some(key => payload[key] !== undefined && (!Number.isInteger(payload[key]) || payload[key] < 0))) return;
    if (next_turn !== undefined && !['black', 'white'].includes(next_turn)) return;
    if (state.board[row][col] !== EMPTY) return; // Duplicate move: no counter/ko mutation.
    cancelPreview();
    clearBlink();
    state.board[row][col] = color;
    for (const [r, c] of captured) state.board[r][c] = EMPTY;
    if (color === BLACK && payload.black_captures === undefined) state.blackCaptures += captured.length;
    if (color === WHITE && payload.white_captures === undefined) state.whiteCaptures += captured.length;
    applyRemotePayload(payload); // Totals replace, never increment a received total.
    state.currentTurn = next_turn || (color === BLACK ? 'white' : 'black');
    const ko = payload.koPoint || payload.ko_point;
    window.state.koPoint = ko && validPoint(ko.row, ko.col) ? { row: ko.row, col: ko.col } : null;
    startBlink(row, col, color);
    playSound('yourTurn');
    drawFullBoard();
    updateProfilePanels();
  }

  function applyRemotePayload(payload) {
    if (!payload) return;
    if (typeof payload.black_captures === 'number') state.blackCaptures = payload.black_captures;
    if (typeof payload.white_captures === 'number') state.whiteCaptures = payload.white_captures;
    if (typeof payload.next_turn === 'string') state.currentTurn = payload.next_turn;
  }

  function showGameOverOverlay(winnerColor, reason = 'game_over', detail = '') {
    state.matchEnded = true; cancelPreview();
    clearTimeout(state.pendingAITimer);state.pendingAITimer=null;
    window.NobiAudio?.setScene('result');
    updateProfilePanels();
    const overlay = $('result-overlay');
    if (!overlay) return;
    const won = state.myColor ? winnerColor === state.myColor : null;
    overlay.dataset.outcome = won === null ? 'neutral' : won ? 'win' : 'loss';
    overlay.dataset.mode = state.gameMode;
    $('result-title').textContent = won === null ? '对局结束' : won ? '恭喜获胜' : '本局惜败';
    $('result-desc').textContent = `${winnerColor === 'black' ? '黑方' : '白方'}获胜${({resign:'（认输）',count:'（数子）'})[reason] || ''} · 共 ${state.viewMoves.length} 手`;
    const extra = $('result-detail'); if (extra) extra.textContent = detail;
    overlay.classList.add('is-open');
    overlay.querySelector('button')?.focus({preventScroll:true});
  }

  function closeResultOverlay() { $('result-overlay')?.classList.remove('is-open'); }

  // Single-player area count of the board as it stands (no dead-stone removal), white komi 7.5.
  function scoreSoloGame(skipConfirm = false) {
    const analysis = window.NobiGoAnalysis;
    if (!analysis || state.gameMode !== 'SINGLE_PLAYER' || state.matchEnded || !state.myColor) return null;
    if (!skipConfirm && !window.confirm('按当前盘面数子并结束本局？\n\n棋盘上的子全部按活子计算，请先下完收官。')) return null;
    const score = analysis.areaScore(state.board);
    showGameOverOverlay(score.winner, 'count', `黑 ${score.black} 子 · 白 ${score.white} 子（含贴 ${score.komi}）· ${score.winner === 'black' ? '黑' : '白'}胜 ${Math.abs(score.margin)} 子`);
    return score;
  }

  async function announceGameOver(winnerColor, reason = 'game_over') {
    if (state.roomChannel) {
      await state.roomChannel.send({
        type: 'broadcast', event: 'message',
        payload: { type: 'GAME_OVER', winner: winnerColor, reason },
      });
    }
    await persistRoomState({ status: 'ended' });
    showGameOverOverlay(winnerColor, reason);
  }
 
  async function handleResignRequest(fromColor) {
    if (!state.isInRoom) return;
    const winner = fromColor === 'black' ? 'white' : 'black';
    if (!window.confirm(`对手请求认输，是否接受？\n\n接受后将判定 ${winner === 'black' ? '黑方' : '白方'} 获胜。`)) return;
    await announceGameOver(winner, 'resign');
    leaveRoom(); 
  }

  async function onRoomMessage(payload) {
    if (!payload || typeof payload !== 'object') return;
    if (payload.type === 'RESIGN_REQUEST') await handleResignRequest(payload.from);
    else if (payload.type === 'GAME_OVER') {
      await persistRoomState({ status: 'ended' });
      showGameOverOverlay(payload.winner, payload.reason || 'game_over');
    }
  }

  async function initRoomChannel(code) {
      if (!state.supabase) return null;
      if (state.roomChannel) try { await state.roomChannel.unsubscribe(); } catch(_) {}

      const ch = state.supabase.channel(`room:${code}`, { config: { broadcast: { self: false } } });
      state.roomChannel = ch; 

      ch.on('broadcast', { event: 'move' }, ({ payload }) => {
        if (state.roomChannel === ch && state.gameMode === 'MULTIPLAYER') return onOpponentMove(payload);
      });

      ch.on('broadcast', { event: 'message' }, ({ payload }) => onRoomMessage(payload));

      ch.on('postgres_changes', { event: 'UPDATE', schema: 'game', table: 'game_rooms' }, async (payload) => {
          const room = payload.new;
          if (!room || room.code !== code) return; 
          
          state.room = room;
          state.currentTurn = room.next_turn || room.current_turn || 'black'; 
          
          if (room.white_id || room.status === 'playing') state.isInRoom = true;

          if (room.white_id) {
            const selectionPage = document.getElementById('game-selection');
            if (selectionPage) selectionPage.style.display = 'none'; 
            document.querySelector('.app')?.style.setProperty('display', 'grid');
            resizeCanvas(); 
          }

          state.blackProfile = await getPlayerProfile(room.black_id);
          state.whiteProfile = await getPlayerProfile(room.white_id);

          const opponentNickname = document.getElementById('opponent-nickname');
          if (room.white_id && opponentNickname) {
            opponentNickname.textContent = state.myColor === 'black' ? "白方已加入" : "黑方已就位";
            document.getElementById('opponent-status').textContent = "在线";
            document.getElementById('opponent-status').className = "status-pill";
          }

          await refreshRoomFromServer(room);
          drawFullBoard();
          updateProfilePanels();
          
          const overlay = document.querySelector('.room-overlay');
          if (overlay && room.white_id) {
            overlay.style.display = 'none';
            toast('白方已加入，对局正式开始！');
          }
        }
      );

      await ch.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await ch.track({ online: true });
          setConnectionStatus('已连接');
        }
      });
      return ch;
  }

  async function refreshRoomFromServer(room) {
    if (!room || state.isSyncing) return;
    state.isSyncing = true;
    try {
      if (room.board_state) {
        try {
          const snapshot = typeof room.board_state === 'string' ? JSON.parse(room.board_state) : room.board_state;
          setBoardSnapshot(snapshot);
        } catch (err) {}
      }

      if (typeof room.black_captures === 'number') state.blackCaptures = room.black_captures;
      if (typeof room.white_captures === 'number') state.whiteCaptures = room.white_captures;

      if (room.status === 'ended') setConnectionStatus('已结束');
      else if (room.status === 'playing') setConnectionStatus('实时同步中');
      else setConnectionStatus('等待对手');

      const otherId = state.myColor === 'black' ? room.white_id : room.black_id;
      const myId = state.myColor === 'black' ? room.black_id : room.white_id;

      const [blackP, whiteP, myP] = await Promise.allSettled([
        room.black_id ? getPlayerProfile(room.black_id) : Promise.resolve(null),
        room.white_id ? getPlayerProfile(room.white_id) : Promise.resolve(null),
        myId ? getPlayerProfile(myId) : Promise.resolve(null)
      ]);

      state.roomContext.blackName = (blackP.status === 'fulfilled' && blackP.value?.nickname) ? blackP.value.nickname : '黑方';
      state.roomContext.whiteName = (whiteP.status === 'fulfilled' && whiteP.value?.nickname) ? whiteP.value.nickname : '白方';

      if ($('black-player-name')) $('black-player-name').textContent = state.roomContext.blackName;
      if ($('white-player-name')) $('white-player-name').textContent = state.roomContext.whiteName;

      const oppStatus = $('opponent-status');
      if (oppStatus) {
        oppStatus.textContent = otherId ? '在线' : '离线';
        oppStatus.classList.toggle('offline', !otherId);
      }
      if ($('opponent-nickname')) $('opponent-nickname').textContent = otherId ? (state.myColor === 'black' ? state.roomContext.whiteName : state.roomContext.blackName) : '等待对手';
      if ($('opponent-side')) $('opponent-side').textContent = `执色：${otherId ? (state.myColor === 'black' ? '白棋' : '黑棋') : '—'}`;

      if (myP.status === 'fulfilled' && myP.value) {
        if ($('user-nickname')) $('user-nickname').textContent = myP.value.nickname || '棋手';
        if ($('user-rank')) $('user-rank').textContent = myP.value.rank || '业余1段';
      }

      updateProfilePanels();
      drawFullBoard();
    } finally {
      state.isSyncing = false;
    }
  }

  function buildInviteLink(code) { return `${window.location.origin}${window.location.pathname}?room=${code}`; }

  async function createRoom() {
    try {
      state.gameMode = 'MULTIPLAYER';
      state.matchEnded = false; state.undoStack = []; cancelPreview();
      const user = await getCurrentUser();
      if (!user) throw new Error('未登录用户');

      const code = generateRoomCode();
      state.viewMoves=[];
      const { data, error } = await state.supabase.schema('game').from('game_rooms').insert([{ code: code, black_id: user.id, next_turn: 'black', status: 'waiting' }]).select().single();
      if (error) throw error;

      state.roomCode = code; state.myColor = 'black'; state.currentTurn = 'black';
      state.room = data; state.isInRoom = true;
      state.roomContext.roomId = code; state.roomContext.inviteLink = buildInviteLink(code);

      await initRoomChannel(code);
      enterGameBoardUI(); 
      updateRoomPanel({ code, inviteLink: state.roomContext.inviteLink });
      toast('房间创建成功，正在大厅静候白方加入...');
      return data;
    } catch (err) { toast(`创建失败: ${err.message}`); }
  }

  function enterGameBoardUI() {
    if ($('game-selection')) $('game-selection').style.display = 'none';
    if (document.querySelector('.app')) {
      document.querySelector('.app').style.display = 'grid';
      resizeCanvas();
    }
  }
  
  async function joinRoom(code) {
    state.gameMode = 'MULTIPLAYER';
    state.matchEnded = false; state.undoStack = []; cancelPreview();
    if (!code || code.length !== ROOM_CODE_LENGTH) { toast('请输入正确的6位房间号'); return; }
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('未登录用户');

      const { data: room, error: fetchError } = await state.supabase.schema('game').from('game_rooms').select('*').eq('code', code).single();
      if (fetchError || !room) throw new Error('房间不存在');
      if(state.roomCode!==code) state.viewMoves=[];

      let role = null;
      if (room.black_id === user.id) role = 'black';
      else if (room.white_id === user.id) role = 'white';
      else if (!room.white_id) {
        await state.supabase.schema('game').from('game_rooms').update({ white_id: user.id, status: 'playing' }).eq('code', code);
        role = 'white';
      } else { role = 'viewer'; }

      state.roomCode = code; state.myColor = role; 
      state.currentTurn = (room.next_turn || 'black').toLowerCase(); 
      state.room = room; state.isInRoom = true;
      state.roomContext.inviteLink = buildInviteLink(code);

      await initRoomChannel(code);
      enterGameBoardUI(); 
      await refreshRoomFromServer(room);
      updateRoomPanel({ code, inviteLink: state.roomContext.inviteLink });
      toast(`成功加入房间！您执: ${role === 'black' ? '黑子' : '白子'}`);
    } catch (err) { toast(err.message); }
  }

  function injectUIButtons() {
    const card = document.querySelector('#game-selection .selection-card');
    if (!card || $('mp-create-room-btn')) return;

    const div = document.createElement('div');
    div.innerHTML = `<div style="margin:14px 0;border-top:1px solid rgba(255,255,255,0.1);"></div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:12px;">
        <button id="mp-create-room-btn" class="mode-btn primary"><span>🆚 创建对战房间</span><span class="badge">多人</span></button>
        <p style="margin:0;color:rgba(238,244,251,0.68);font-size:13px;">收到邀请链接后，打开即可自动加入房间。</p>
      </div>`;
    card.appendChild(div);
    $('mp-create-room-btn').addEventListener('click', createRoom);
  }

  async function leaveRoom() {
    cancelPreview(); closeResultOverlay(); state.undoStack = [];
    clearTimeout(state.pendingAITimer);state.pendingAITimer=null;
    clearBlink();
    if (state.roomChannel) {
      try { await state.roomChannel.untrack(); } catch (_) {}
      try { await state.supabase?.removeChannel(state.roomChannel); } catch (_) {}
      state.roomChannel = null;
    }
    state.isInRoom = false; state.roomCode = null; state.myColor = null;
    setConnectionStatus('未建立'); updateProfilePanels(); updateRoomPanel({ code: '—', inviteLink: '' });
    drawFullBoard();
  }

  function checkRoomParam() {
    const code = new URLSearchParams(window.location.search).get('room');
    if (code && code.length === ROOM_CODE_LENGTH) { setTimeout(() => joinRoom(code.toUpperCase()), 350); return true; }
    return false;
  }

  function bindResignButtons() {
    const bindOne = (el) => {
      if (!el || el.dataset.bound === '1') return;
      el.addEventListener('click', async () => {
        if (state.gameMode === 'SINGLE_PLAYER') {
          if (!state.myColor || state.matchEnded || !window.confirm('确认认输并结束本局？')) return;
          showGameOverOverlay('white', 'resign');
          toast('本局已结束 · 白方获胜');
          return;
        }
        if (!state.isInRoom || !state.roomChannel) return;
        await state.roomChannel.send({ type: 'broadcast', event: 'message', payload: { type: 'RESIGN_REQUEST', from: state.myColor } });
        toast('已发送认输请求');
      });
      el.dataset.bound = '1';
    };
    bindOne($('mp-resign-btn')); bindOne($('surrender-btn'));
  }

  async function init() {
    if (state.boundOnce) return;
    state.boundOnce = true;

    initSupabaseClient();
    injectUIButtons();
    bindCopyInviteButton();
    bindResignButtons();
    // The shared shell validates platform/Auth and owns invite routing. Legacy standalone use remains supported.
    if (!window.NobiLobby) checkRoomParam();

    if (!initCanvasParams()) return;

    state.canvas.addEventListener('pointerdown', canvasCaptureHandler, { passive: false, capture: true });
    state.canvas.addEventListener('pointermove', canvasPreviewMove, { passive:false });
    state.canvas.addEventListener('pointerup', e=>{if(state.previewPointer === e.pointerId) state.previewPointer = null;});
    state.canvas.addEventListener('pointercancel', cancelPreview);
    document.addEventListener('visibilitychange', ()=>{if(document.hidden) cancelPreview();});
    window.addEventListener('pagehide', cancelPreview);

    // ✨ 这里我们采用 ResizeObserver 直接监听 CSS Grid 的中间容器
    if (state.resizeObserver) state.resizeObserver.disconnect();
    state.resizeObserver = new ResizeObserver(() => {
      resizeCanvas(); 
    });
    
    const shell = state.canvas.parentElement;
    if (shell) state.resizeObserver.observe(shell);
    window.addEventListener('resize', resizeCanvas);
    window.visualViewport?.addEventListener('resize', resizeCanvas);

    console.log('[multiplayer-ext] loaded');
  }

  function startAIGame() {
    state.authoritativeSend=null;
    cancelPreview(); closeResultOverlay(); state.undoStack = []; state.matchEnded = false;
    clearTimeout(state.pendingAITimer);state.pendingAITimer=null;
    state.viewMoves=[];
    const oldChannel = state.roomChannel;
    state.roomChannel = null; state.isInRoom = false;
    if (oldChannel) Promise.resolve(state.supabase?.removeChannel(oldChannel)).catch(() => {});
    state.gameMode = 'SINGLE_PLAYER'; state.roomCode = 'AI_LOCAL';
    state.myColor = 'black'; state.currentTurn = 'black';
    state.blackCaptures = 0; state.whiteCaptures = 0;
    window.state.koPoint = null;
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) state.board[r][c] = EMPTY;
    clearBlink();
    
    if ($('opponent-nickname')) $('opponent-nickname').textContent = '阿尔法狗 (AI)';
    if ($('opponent-side')) $('opponent-side').textContent = '执色：白棋';
    if ($('opponent-activity')) $('opponent-activity').textContent = '状态：对战中'; 
    if ($('connection-summary')) $('connection-summary').textContent = '单机离线模式';
    if ($('turn-summary')) $('turn-summary').textContent = '黑棋先行 (你的回合)';

    state.isSyncing = false;
    updateProfilePanels();
    drawFullBoard();
  }

  function triggerAIMove() {
    if (state.matchEnded || state.gameMode !== 'SINGLE_PLAYER' || state.currentTurn !== 'white') return;

    let allEmptyMoves = [];
    for (let r = 0; r < state.boardSize; r++) for (let c = 0; c < state.boardSize; c++) if (state.board[r][c] === EMPTY) allEmptyMoves.push({ r, c });

    if (allEmptyMoves.length === 0) { scoreSoloGame(true); return; }

    let bestMove = null, placed = false;
    const analysis = window.NobiGoAnalysis;
    if (analysis) {
      const choice = analysis.chooseMove(state.board, WHITE, window.state.koPoint);
      if (!choice) {
        // AI passes when only own eyes or self-atari remain; the player may count the board.
        state.viewMoves.push({pass:true,color:WHITE,number:state.viewMoves.length+1});
        state.currentTurn = 'black'; updateProfilePanels();
        toast('AI 选择虚着 · 可点击“数子”结束对局');
        window.NobiAudio?.playEffect('yourTurn');
        return;
      }
      if (placeStone(choice.row, choice.col, WHITE).success) { bestMove = { r: choice.row, c: choice.col }; placed = true; }
    }
    if (!bestMove) for (const move of allEmptyMoves) {
      const boardBefore = state.board.map(row => row.slice());
      const blackBefore = state.blackCaptures, whiteBefore = state.whiteCaptures;
      const koBefore = window.state.koPoint;
      const test = placeStone(move.r, move.c, WHITE);
      // Candidate evaluation must never commit board, captures or ko.
      state.board = boardBefore;
      state.blackCaptures = blackBefore; state.whiteCaptures = whiteBefore;
      window.state.koPoint = koBefore;
      if (test.success && test.captured > 0) { bestMove = move; break; }
    }

    if (!bestMove) {
      while (allEmptyMoves.length > 0) {
        const candidate = allEmptyMoves.splice(Math.floor(Math.random() * allEmptyMoves.length), 1)[0];
        if (placeStone(candidate.r, candidate.c, WHITE).success) { bestMove = candidate; break; }
      }
    } else if (!placed) {
      placeStone(bestMove.r, bestMove.c, WHITE);
    }

    if (!bestMove) { state.currentTurn = 'black'; updateProfilePanels(); return; }

    playSound('placeStone'); 
    clearBlink();
    startBlink(bestMove.r, bestMove.c, WHITE);

    state.currentTurn = 'black';
    drawFullBoard();
    updateProfilePanels();
    window.NobiAudio?.playEffect('yourTurn');
  }

  function applyAuthoritySnapshot(snapshot,send,connected=true) {
    const pub=snapshot.publicState;state.authoritativeSend=send;
    state.gameMode='MULTIPLAYER';state.isInRoom=true;state.roomCode=snapshot.roomId;state.myColor=snapshot.privateState.seat===0?'black':'white';
    state.currentTurn=snapshot.currentTurn===0?'black':'white';state.matchEnded=snapshot.status==='ended';state.isSyncing=!connected||snapshot.status!=='playing';state.room={status:snapshot.status,black_id:snapshot.players[0]?.userId,white_id:snapshot.players[1]?.userId};state.roomContext.blackName=snapshot.players[0]?.nickname??'黑方';state.roomContext.whiteName=snapshot.players[1]?.nickname??'等待加入';
    cancelPreview();clearTimeout(state.pendingAITimer);state.pendingAITimer=null;
    setBoardSnapshot(pub.board.length?pub.board:Array.from({length:19},()=>Array(19).fill(0)));
    state.blackCaptures=pub.blackCaptures;state.whiteCaptures=pub.whiteCaptures;window.state.koPoint=pub.koPoint;
    clearBlink();const moves=pub.moves.filter(move=>!move.pass);state.viewMoves=pub.moves.map((move,i)=>({...move,number:i+1}));
    const latest=moves.at(-1);if(latest)state.blinkingMove={...latest,visible:true};
    document.body.classList.add('nobi-playing-go','in-game-match');document.body.classList.remove('nobi-playing-guandan');
    if($('game-selection'))$('game-selection').style.display='none';const app=document.querySelector('.app');if(app)app.style.display='grid';
    resizeCanvas();drawFullBoard();updateProfilePanels();window.dispatchEvent(new CustomEvent('nobi:go-view'));
  }
  window.MP = {
    applyAuthoritySnapshot,
    createRoom, joinRoom, leaveRoom, startAIGame,
    confirmPreview, cancelPreview, undoSoloTurn, scoreSoloGame, closeResultOverlay,
    getRoomCode: () => state.roomCode, getMyColor: () => state.myColor,
    isInRoom: () => state.isInRoom, handleSurrender: () => {},
    getViewState: () => ({mode:state.gameMode,turn:state.currentTurn,myColor:state.myColor,room:state.roomCode,
      board:getBoardSnapshot(),blackCaptures:state.blackCaptures,whiteCaptures:state.whiteCaptures,
      geometry:{padding:state.padding,cellSize:state.cellSize},
      ended:state.matchEnded || (state.gameMode==='MULTIPLAYER' && state.room?.status==='ended'),moveNumber:state.viewMoves.length,
      preview:state.previewMove ? {...state.previewMove} : null,canUndo:state.gameMode==='SINGLE_PLAYER' && !state.matchEnded && state.undoStack.length>0,
      moves:state.viewMoves.map(move=>({...move})),latestVisible:state.blinkingMove?.visible ?? true,blackName:state.roomContext.blackName,whiteName:state.roomContext.whiteName}),
  };

  // =========================================================================
  // 🎯 🌟【重点修改 2026-05-30】：挂载主控舱直接进入对局的免密直连专区
  // 作用：无需玩家输入房间号、房间名或点击确认，点击按钮后即刻装载 19x19 围棋矩阵
  // =========================================================================
  /*MP.startAIGame = function() {
    console.log("[围棋直连] [2026-05-30] 主控舱直入指令：单机AI对局");
    state.gameMode = 'SINGLE_PLAYER';
    drawFullBoard();
  };

  MP.startMultiplayerGame = function() {
    console.log("[围棋直连] [2026-05-30] 主控舱直入指令：多人网络联机对局");
    state.gameMode = 'MULTIPLAYER';
    drawFullBoard();
    console.log("[云端握手] 正在后台静默注册 Supabase 实时流房间，跳过中间输入配置面板...");
  };*/

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
