// -------------------------
// Multiplayer Go Game JS
// -------------------------
const state = {
  canvas: null,
  ctx: null,
  boardSize: 19,         // 棋盘格数
  cellSize: 0,
  padding: 0,
  isInRoom: false,
  myColor: null,         // 'black' 或 'white'
  currentTurn: 'black',
  board: [],             // 2D array
  supabase: null,        // Supabase client
  room: null,
  blackProfile: null,
  whiteProfile: null
};

// -------------------------
// 初始化 Supabase
// -------------------------
async function initSupabase() {
  state.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

// -------------------------
// 初始化 Canvas
// -------------------------
function initCanvasParams() {
  state.canvas = document.getElementById('goBoard');
  if (!state.canvas) {
    console.error('[MP] goBoard 未找到');
    return false;
  }

  state.ctx = state.canvas.getContext('2d');
  resizeCanvas();

  // PC + 移动端统一事件
  state.canvas.addEventListener('pointerdown', canvasCaptureHandler, {
    passive: false,
    capture: true
  });

  return true;
}

// -------------------------
// Resize Canvas
// -------------------------
function resizeCanvas() {
  const size = Math.min(window.innerWidth, window.innerHeight) - 20;

  // CSS 显示大小
  state.canvas.style.width = size + 'px';
  state.canvas.style.height = size + 'px';

  // Canvas 渲染像素 = CSS 显示像素
  state.canvas.width = size;
  state.canvas.height = size;

  state.cellSize = size / (state.boardSize - 1);
  state.padding = 0;
}

// -------------------------
// 坐标转换
// -------------------------
function captureToBoardCoords(e) {
  const rect = state.canvas.getBoundingClientRect();
  let clientX, clientY;

  if (e.touches && e.touches.length > 0) {
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
  } else if (e.changedTouches && e.changedTouches.length > 0) {
    clientX = e.changedTouches[0].clientX;
    clientY = e.changedTouches[0].clientY;
  } else {
    clientX = e.clientX;
    clientY = e.clientY;
  }

  const x = clientX - rect.left;
  const y = clientY - rect.top;

  const boardSize = state.boardSize;

  let col = Math.round((x - state.padding) / state.cellSize);
  let row = Math.round((y - state.padding) / state.cellSize);

  row = Math.max(0, Math.min(boardSize - 1, row));
  col = Math.max(0, Math.min(boardSize - 1, col));

  return { row, col };
}

// -------------------------
// 落子事件处理
// -------------------------
function canvasCaptureHandler(e) {
  if (!state.isInRoom) return;

  if (!state.myColor || state.currentTurn !== state.myColor) {
    e.preventDefault();
    playSound('invalidMove');
    return;
  }

  e.preventDefault();
  const pos = captureToBoardCoords(e);
  if (!pos) return;

  handleMultiplayerMove(pos.row, pos.col);
}

// -------------------------
// 落子逻辑
// -------------------------
function handleMultiplayerMove(row, col) {
  if (state.board[row][col] !== 0) return;

  state.board[row][col] = state.myColor === 'black' ? 1 : 2;
  drawBoard();

  // 发送给对手
  broadcastMove(row, col);

  // 切换轮次
  state.currentTurn = state.myColor === 'black' ? 'white' : 'black';
}

// -------------------------
// 绘制棋盘
// -------------------------
function drawBoard() {
  const ctx = state.ctx;
  const size = state.cellSize * (state.boardSize - 1);

  ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);

  // 画格线
  ctx.strokeStyle = '#000';
  for (let i = 0; i < state.boardSize; i++) {
    ctx.beginPath();
    ctx.moveTo(state.padding, state.padding + i * state.cellSize);
    ctx.lineTo(state.padding + size, state.padding + i * state.cellSize);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(state.padding + i * state.cellSize, state.padding);
    ctx.lineTo(state.padding + i * state.cellSize, state.padding + size);
    ctx.stroke();
  }

  // 画棋子
  for (let r = 0; r < state.boardSize; r++) {
    for (let c = 0; c < state.boardSize; c++) {
      if (state.board[r][c] === 0) continue;
      ctx.beginPath();
      ctx.arc(
        state.padding + c * state.cellSize,
        state.padding + r * state.cellSize,
        state.cellSize / 2 - 1,
        0,
        2 * Math.PI
      );
      ctx.fillStyle = state.board[r][c] === 1 ? 'black' : 'white';
      ctx.fill();
    }
  }
}

// -------------------------
// 初始化房间和玩家
// -------------------------
async function loadRoomAndPlayers() {
  // 示例：根据你的 Supabase 逻辑加载房间、玩家
  const { data: room } = await state.supabase
    .from('game_rooms')
    .select('*')
    .eq('code', state.roomCode)
    .single();

  state.room = room;
  state.isInRoom = true;
  state.myColor = room.black_id === state.userId ? 'black' : 'white';
  state.currentTurn = room.current_turn || 'black';

  // 加载玩家信息
  state.blackProfile = await getPlayerProfile(room.black_id);
  state.whiteProfile = await getPlayerProfile(room.white_id);

  // 初始化棋盘
  state.board = Array(state.boardSize)
    .fill(0)
    .map(() => Array(state.boardSize).fill(0));

  drawBoard();
}

// -------------------------
// 获取玩家信息
// -------------------------
async function getPlayerProfile(playerId) {
  if (!playerId) return null;
  const { data, error } = await state.supabase.rpc('get_player_profile', { p_id: playerId });
  if (error) {
    console.warn(error.message);
    return null;
  }
  return Array.isArray(data) ? data[0] : data;
}

// -------------------------
// 广播落子给对手
// -------------------------
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

// -------------------------
// 播放声音
// -------------------------
function playSound(name) {
    try {
      const url = SOUNDS[name];
      if (url) new Audio(url).play().catch(() => {});
    } catch (_) {}
  }

// -------------------------
// 初始化入口
// -------------------------
window.addEventListener('DOMContentLoaded', async () => {
  if (!initCanvasParams()) return;
  await initSupabase();
  await loadRoomAndPlayers();
});