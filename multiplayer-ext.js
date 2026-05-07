/**
 * multiplayer-ext.js
 * [终极修复版] - 解决函数定义错误，匹配截图 UI 风格，支持手机端与呼吸闪烁
 */
(() => {
  'use strict';

  const SIZE = 19;
  const EMPTY = 0, BLACK = 1, WHITE = 2;
  
  const state = {
    supabase: null,
    roomChannel: null,
    roomCode: null,
    myColor: null,
    currentTurn: 'black',
    isInRoom: false,
    latestMove: null, 
    board: Array(SIZE).fill().map(() => Array(SIZE).fill(EMPTY)),
    canvas: null,
    ctx: null,
    padding: 0,
    cellSize: 0,
    boundOnce: false
  };

  const $ = id => document.getElementById(id);

  // --- 1. 核心逻辑函数 (提升到顶部确保 injectUIButtons 能引用) ---

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