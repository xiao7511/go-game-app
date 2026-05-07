(() => {
  'use strict';

  const GoGame = window.GoGame;
  if (!GoGame) return;

  const state = {
    supabase: null,
    roomChannel: null,
    roomCode: null,
    myColor: null,
    isInRoom: false,
    roomContext: {
      roomId: null,
      inviteLink: '',
      blackName: '黑方',
      whiteName: '白方',
      blackPlayerId: null,
      whitePlayerId: null,
    },
  };

  function $(id) {
    return document.getElementById(id);
  }

  function normalizeSupabaseUrl(url) {
    if (!url) return '';
    return String(url).replace(/\/rest\/v1\/?$/i, '').replace(/\/$/, '');
  }

  function normalizeSide(side) {
    return GoGame.normalizeSide(side);
  }

  function sideLabel(side) {
    return GoGame.sideLabel(side);
  }

  function opponentSide(side) {
    return GoGame.oppositeSide(side);
  }

  function buildInviteLink(code) {
    return `${window.location.origin}${window.location.pathname}?room=${code}`;
  }

  function setConnectionStatus(text, locked = false) {
    const el = $('connection-summary');
    if (el) {
      el.textContent = text;
      if (locked) el.dataset.locked = '1';
      else delete el.dataset.locked;
    }
    const pill = $('room-status-pill');
    if (pill) {
      pill.textContent = state.isInRoom ? '进行中' : '待连接';
      pill.classList.toggle('offline', !state.isInRoom);
      if (locked) pill.dataset.locked = '1';
      else delete pill.dataset.locked;
    }
  }

  function toast(message, duration = 2200) {
    const el = $('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('is-visible');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => el.classList.remove('is-visible'), duration);
  }

  function initSupabaseClient() {
    const cfg = window.APP_CONFIG || window.CONFIG || {};
    const url = normalizeSupabaseUrl(cfg.SUPABASE_URL || cfg.supabaseUrl || cfg.url);
    const key = cfg.SUPABASE_ANON_KEY || cfg.supabaseAnonKey || cfg.key;
    if (!url || !key || !window.supabase?.createClient) return null;
    if (!state.supabase) {
      state.supabase = window.supabase.createClient(url, key, {
        db: { schema: 'game' },
        realtime: { params: { eventsPerSecond: 10 } },
      });
    }
    return state.supabase;
  }

  async function getUserId() {
    const client = state.supabase || initSupabaseClient();
    if (!client) return null;
    try {
      const { data: { session } } = await client.auth.getSession();
      return session?.user?.id || null;
    } catch {
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

  async function persistRoomState(extra = {}) {
    if (!state.supabase || !state.roomCode) return;
    try {
      await state.supabase
        .schema('game')
        .from('game_rooms')
        .update({
          board_state: JSON.stringify(GoGame.getBoardSnapshot()),
          next_turn: GoGame.state.currentTurn,
          black_captures: GoGame.state.blackCaptures,
          white_captures: GoGame.state.whiteCaptures,
          status: state.isInRoom ? 'playing' : 'ended',
          ...extra,
        })
        .eq('code', state.roomCode);
    } catch (err) {
      console.warn('[multiplayer-ext] 同步房间状态失败:', err);
    }
  }

  function updateProfilePanels() {
    const localSide = $('local-player-side');
    const localTurn = $('local-player-turn');
    const blackName = $('black-player-name');
    const whiteName = $('white-player-name');
    const roomId = $('room-id');
    const link = $('room-invite-link');
    const oppStatus = $('opponent-status');
    const oppName = $('opponent-nickname');
    const oppSide = $('opponent-side');
    const oppActivity = $('opponent-activity');

    if (roomId) roomId.textContent = state.roomCode || '—';
    if (link) link.value = state.roomContext.inviteLink || '';
    if (localSide) localSide.textContent = `执色：${sideLabel(state.myColor)}`;
    if (localTurn) localTurn.textContent = state.isInRoom ? `状态：${GoGame.isMyTurn() ? '轮到我方' : '等待对手'}` : '状态：待进入对局';
    if (blackName) blackName.textContent = state.roomContext.blackName || '黑方';
    if (whiteName) whiteName.textContent = state.roomContext.whiteName || '白方';

    if (oppStatus) {
      const hasOpponent = Boolean(state.roomContext.blackPlayerId && state.roomContext.whitePlayerId);
      oppStatus.textContent = hasOpponent ? '在线' : '离线';
      oppStatus.classList.toggle('offline', !hasOpponent);
    }
    if (oppName) oppName.textContent = state.myColor === 'black' ? state.roomContext.whiteName : state.roomContext.blackName;
    if (oppSide) oppSide.textContent = `执色：${sideLabel(opponentSide(state.myColor))}`;
    if (oppActivity) oppActivity.textContent = state.isInRoom ? '状态：实时同步中' : '状态：等待加入';

    GoGame.updateUI();
  }

  function applyRoomSnapshot(room) {
    if (!room) return;
    state.roomContext.roomId = room.code || state.roomCode;
    state.roomContext.inviteLink = buildInviteLink(room.code || state.roomCode || '');
    state.roomContext.blackPlayerId = room.black_id || null;
    state.roomContext.whitePlayerId = room.white_id || null;
    state.roomContext.blackName = room.black_id ? '黑方玩家' : '黑方';
    state.roomContext.whiteName = room.white_id ? '白方玩家' : '白方';
    if (room.board_state) {
      try {
        const snapshot = typeof room.board_state === 'string' ? JSON.parse(room.board_state) : room.board_state;
        GoGame.setBoardSnapshot(snapshot);
      } catch (err) {
        console.warn('[multiplayer-ext] board_state 解析失败:', err);
      }
    }
    if (typeof room.black_captures === 'number') GoGame.state.blackCaptures = room.black_captures;
    if (typeof room.white_captures === 'number') GoGame.state.whiteCaptures = room.white_captures;
    if (room.next_turn) GoGame.setTurn(room.next_turn);
    if (room.status === 'playing') setConnectionStatus('实时同步中');
    else if (room.status === 'ended') setConnectionStatus('已结束');
    else setConnectionStatus('等待对手');
    updateProfilePanels();
    GoGame.drawBoard();
  }

  function refreshRoomFromMove(payload) {
    if (!payload) return;
    if (payload.board_state) {
      try {
        const snapshot = typeof payload.board_state === 'string' ? JSON.parse(payload.board_state) : payload.board_state;
        GoGame.setBoardSnapshot(snapshot);
      } catch (err) {
        console.warn('[multiplayer-ext] move board_state 解析失败:', err);
      }
    } else if (typeof payload.row === 'number' && typeof payload.col === 'number' && payload.color) {
      const board = GoGame.getBoardSnapshot();
      board[payload.row][payload.col] = payload.color === 'black' ? 1 : 2;
      if (Array.isArray(payload.captured)) {
        for (const [r, c] of payload.captured) board[r][c] = 0;
      }
      GoGame.setBoardSnapshot(board);
    }
    if (typeof payload.black_captures === 'number') GoGame.state.blackCaptures = payload.black_captures;
    if (typeof payload.white_captures === 'number') GoGame.state.whiteCaptures = payload.white_captures;
    if (typeof payload.next_turn === 'string') GoGame.setTurn(payload.next_turn);
  }

  async function onOpponentMove(payload) {
    if (!payload || typeof payload.row !== 'number' || typeof payload.col !== 'number') return;
    refreshRoomFromMove(payload);
    GoGame.setLatestMove(payload.row, payload.col, payload.color);
    GoGame.drawBoard();
    updateProfilePanels();
    if (payload.captured?.length) {
      // 让提示更明确，但不阻塞对局
      toast('对手完成提子');
    }
  }

  async function announceGameOver(winnerColor, loserColor, reason = 'game_over') {
    if (state.roomChannel) {
      await state.roomChannel.send({
        type: 'broadcast',
        event: 'message',
        payload: {
          type: 'GAME_OVER',
          winner: winnerColor,
          loser: loserColor,
          reason,
        },
      });
    }
    await persistRoomState({ status: 'ended' });
    GoGame.showGameEnd(winnerColor, loserColor, reason);
  }

  async function handleResignRequest(fromColor) {
    if (!state.isInRoom) return;
    if (!fromColor || normalizeSide(fromColor) === normalizeSide(state.myColor)) return;
    const winner = opponentSide(fromColor);
    const loser = normalizeSide(fromColor);
    const accepted = window.confirm(`对手请求认输。\n\n接受后将判定 ${sideLabel(winner)}获胜。`);
    if (!accepted) return;
    await announceGameOver(winner, loser, 'resign');
  }

  async function onRoomMessage(payload) {
    if (!payload || typeof payload !== 'object') return;
    if (payload.type === 'RESIGN_REQUEST') {
      await handleResignRequest(payload.from);
      return;
    }
    if (payload.type === 'GAME_OVER') {
      const winner = normalizeSide(payload.winner);
      const loser = normalizeSide(payload.loser) || opponentSide(winner);
      await persistRoomState({ status: 'ended' });
      GoGame.showGameEnd(winner, loser, payload.reason || 'game_over');
    }
  }

  async function initRoomChannel(code) {
    if (!state.supabase) return null;
    const ch = state.supabase.channel(`room:${code}`, { config: { broadcast: { self: false } } });

    ch.on('broadcast', { event: 'move' }, ({ payload }) => {
      refreshRoomFromMove(payload);
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
        if (latestRoom) applyRoomSnapshot(latestRoom);
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
      if (room) applyRoomSnapshot(room);
    });

    await ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.track({ online: true });
        setConnectionStatus('已连接');
      }
    });

    return ch;
  }

  function canLocalPlay() {
    if (!state.isInRoom) return true;
    return GoGame.isMyTurn();
  }

  async function handleLocalMove(row, col) {
    if (!canLocalPlay()) {
      toast('未轮到你落子');
      return false;
    }
    const color = normalizeSide(state.myColor) || 'black';
    const result = GoGame.placeStone(row, col, color, { switchTurn: false });
    if (!result.success) {
      toast(result.reason || '非法落子');
      return false;
    }

    const nextTurn = color === 'black' ? 'white' : 'black';
    GoGame.setTurn(nextTurn);
    GoGame.setLatestMove(row, col, color);
    GoGame.drawBoard();
    await broadcastMove(row, col, color, result.capturedGroup || []);
    await persistRoomState();
    updateProfilePanels();
    return true;
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
        board_state: GoGame.getBoardSnapshot(),
        black_captures: GoGame.state.blackCaptures,
        white_captures: GoGame.state.whiteCaptures,
        next_turn: GoGame.state.currentTurn,
      },
    });
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

    const code = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'ROOM01';
    try {
      const { error } = await state.supabase
        .schema('game')
        .from('game_rooms')
        .insert({
          code,
          black_id: userId,
          white_id: null,
          status: 'waiting',
          board_state: JSON.stringify(GoGame.getBoardSnapshot()),
          next_turn: 'black',
          black_captures: 0,
          white_captures: 0,
        });
      if (error) throw error;

      state.roomCode = code;
      state.myColor = 'black';
      state.isInRoom = true;
      GoGame.state.isInRoom = true;
      GoGame.state.myColor = 'black';
      GoGame.setTurn('black');
      state.roomContext.roomId = code;
      state.roomContext.inviteLink = buildInviteLink(code);
      state.roomContext.blackPlayerId = userId;
      state.roomContext.whitePlayerId = null;
      state.roomContext.blackName = '黑方玩家';
      state.roomContext.whiteName = '白方玩家';

      state.roomChannel = await initRoomChannel(code);
      setConnectionStatus('等待对手');
      updateProfilePanels();
      GoGame.drawBoard();
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
        room.white_id = userId;
        room.status = 'playing';
      } else if (room.white_id === userId) {
        state.myColor = 'white';
      } else {
        alert('该房间已满');
        return;
      }

      state.roomCode = code;
      state.isInRoom = true;
      GoGame.state.isInRoom = true;
      GoGame.state.myColor = state.myColor;
      state.roomContext.roomId = code;
      state.roomContext.inviteLink = buildInviteLink(code);
      state.roomContext.blackPlayerId = room.black_id || null;
      state.roomContext.whitePlayerId = room.white_id || null;
      state.roomChannel = await initRoomChannel(code);
      applyRoomSnapshot(room);
      setConnectionStatus(room.status === 'playing' ? '实时同步中' : '等待对手');
      updateProfilePanels();
      GoGame.drawBoard();
      toast(`已加入房间：${code}`);
    } catch (err) {
      console.error('[multiplayer-ext] 加入房间失败:', err);
      alert(`加入房间失败: ${err.message}`);
    }
  }

  async function leaveRoom() {
    GoGame.clearLatestMove();
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
    state.roomContext.blackPlayerId = null;
    state.roomContext.whitePlayerId = null;
    GoGame.state.isInRoom = false;
    GoGame.state.myColor = null;
    setConnectionStatus('未建立');
    updateProfilePanels();
  }

  async function handleSurrender() {
    if (!state.isInRoom || !state.roomChannel) {
      alert('当前不在对局中');
      return;
    }
    const winner = opponentSide(state.myColor);
    const loser = normalizeSide(state.myColor);
    await state.roomChannel.send({
      type: 'broadcast',
      event: 'message',
      payload: {
        type: 'RESIGN_REQUEST',
        from: state.myColor,
        room: state.roomCode,
      },
    });
    await announceGameOver(winner, loser, 'resign');
    toast('已发送认输请求');
  }

  function bindButtons() {
    $('mp-copy-invite-btn')?.addEventListener('click', async () => {
      const text = $('room-invite-link')?.value || state.roomContext.inviteLink || '';
      if (!text) return toast('暂无可复制的邀请链接');
      try {
        if (navigator.clipboard?.writeText && window.isSecureContext) await navigator.clipboard.writeText(text);
        else {
          const input = $('room-invite-link');
          if (input) {
            input.removeAttribute('readonly');
            input.focus();
            input.select();
            document.execCommand('copy');
            input.setAttribute('readonly', 'readonly');
          }
        }
        toast('已复制房间邀请链接');
      } catch (err) {
        console.warn('[multiplayer-ext] 复制失败:', err);
        toast('复制失败，请手动复制');
      }
    });

    const resignBtn = $('surrender-btn');
    if (resignBtn && resignBtn.dataset.bound !== '1') {
      resignBtn.dataset.bound = '1';
      resignBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        const confirmSurrender = window.confirm('确定要认输吗？认输后本局将结束。');
        if (confirmSurrender) handleSurrender();
      }, true);
    }
  }

  function bindQuit() {
    const quitBtn = $('quit-game-btn');
    if (quitBtn && quitBtn.dataset.bound !== '1') {
      quitBtn.dataset.bound = '1';
      quitBtn.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        const ok = window.confirm('确定要退出当前对局吗？');
        if (!ok) return;
        await leaveRoom();
        const app = document.querySelector('.app');
        const selection = document.getElementById('game-selection');
        if (app) app.style.display = 'none';
        if (selection) selection.style.display = 'flex';
      }, true);
    }
  }

  function checkRoomParam() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('room');
    if (code && code.length === 6) {
      setTimeout(() => joinRoom(code.toUpperCase()), 300);
      return true;
    }
    return false;
  }

  function bootstrap() {
    initSupabaseClient();
    bindButtons();
    bindQuit();
    updateProfilePanels();
    if (!checkRoomParam()) {
      setConnectionStatus('未建立');
    }
  }

  window.MP = {
    bootstrap,
    createRoom,
    joinRoom,
    leaveRoom,
    handleSurrender,
    handleLocalMove,
    isMyTurn: () => {
      if (!state.isInRoom) return GoGame.isMyTurn();
      return GoGame.isMyTurn();
    },
    getLocalColor: () => state.myColor,
  };

  window.addEventListener('DOMContentLoaded', () => {
    bootstrap();
  });
})();
