/**
 * multiplayer-ext.js
 * [完整修复版] - 适配深色 UI 风格、修复手机端触摸、白方权限及呼吸闪烁
 */
(() => {
  'use strict';

  const SIZE = 19;
  const EMPTY = 0;
  const BLACK = 1;
  const WHITE = 2;
  const ROOM_CODE_LENGTH = 6;

  const state = {
    supabase: null,
    roomChannel: null,
    roomCode: null,
    myColor: null,
    currentTurn: 'black',
    isInRoom: false,
    latestMove: null, // [row, col]
    board: Array(SIZE).fill().map(() => Array(SIZE).fill(EMPTY)),
    canvas: null,
    ctx: null,
    padding: 0,
    cellSize: 0,
    boundOnce: false,
    animationFrame: null
  };

  const $ = id => document.getElementById(id);

  // --- 1. 界面视觉修复 (匹配图片风格) ---
  function injectUIButtons() {
    const selectionPanel = document.querySelector('.selection-panel') || document.querySelector('.mode-selection') || $('game-selection');
    if (!selectionPanel) return;

    // 清除旧按钮
    const oldControls = document.querySelector('.multiplayer-controls');
    if (oldControls) oldControls.remove();

    const container = document.createElement('div');
    container.className = 'multiplayer-controls';
    
    // 注入图片风格的 CSS：深色卡片 + 渐变发光按钮
    const style = document.createElement('style');
    style.innerHTML = `
      .mp-card {
        background: rgba(255, 255, 255, 0.05);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 20px;
        padding: 24px;
        margin-top: 20px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.4);
        width: 100%;
        max-width: 400px;
      }
      .mp-title {
        color: #ffffff;
        font-size: 1rem;
        font-weight: 500;
        margin-bottom: 18px;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .mp-status-dot {
        width: 8px;
        height: 8px;
        background: #00ff88;
        border-radius: 50%;
        box-shadow: 0 0 12px #00ff88;
        animation: pulse 2s infinite;
      }
      @keyframes pulse { 0% { opacity: 0.5; } 50% { opacity: 1; } 100% { opacity: 0.5; } }
      .glow-btn {
        background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
        color: white;
        border: none;
        padding: 14px;
        border-radius: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: transform 0.2s;
        width: 100%;
        margin-bottom: 15px;
        font-size: 1rem;
      }
      .glow-btn:active { transform: scale(0.97); }
      .join-group { display: flex; gap: 10px; }
      .mp-input {
        flex: 1;
        background: rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: #fff;
        padding: 12px;
        border-radius: 10px;
        outline: none;
        text-align: center;
        letter-spacing: 2px;
        font-weight: bold;
      }
      .secondary-glow {
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: #fff;
        padding: 0 20px;
        border-radius: 10px;
        cursor: pointer;
        font-weight: 500;
      }
    `;
    document.head.appendChild(style);

    container.innerHTML = `
      <div class="mp-card">
        <div class="mp-title"><span class="mp-status-dot"></span> 在线对战模式</div>
        <button id="btn-create-room" class="glow-btn">创建游戏房间</button>
        <div class="join-group">
          <input type="text" id="input-room-code" class="mp-input" placeholder="输入6位房号" maxlength="6">
          <button id="btn-join-room" class="secondary-glow">加入</button>
        </div>
      </div>
    `;
    selectionPanel.appendChild(container);

    $('btn-create-room').onclick = createRoom;
    $('btn-join-room').onclick = () => {
      const code = $('input-room-code').value.trim().toUpperCase();
      if (code.length === ROOM_CODE_LENGTH) joinRoom(code);
      else alert('请输入6位有效房号');
    };
  }

  // --- 2. 权限与手机落子修复 ---
  function canvasCaptureHandler(e) {
    if (!state.isInRoom) return;

    // 修复权限判定：当前回合色必须匹配玩家颜色
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
        handleMultiplayerMove(row, col);
      }
    }
  }

  // --- 3. 渲染修复 (呼吸闪烁) ---
  function drawFullBoard() {
    if (!state.ctx) return;
    if (state.animationFrame) cancelAnimationFrame(state.animationFrame);

    const render = () => {
      // 外部定义的 drawBoard 逻辑会被执行
      renderStones();
      if (state.latestMove && state.isInRoom) {
        state.animationFrame = requestAnimationFrame(render);
      }
    };
    render();
  }

  function drawStone(row, col, colorType) {
    const cx = state.padding + col * state.cellSize;
    const cy = state.padding + row * state.cellSize;
    const isLatest = state.latestMove && state.latestMove[0] === row && state.latestMove[1] === col;

    state.ctx.save();
    if (isLatest) {
      // 高性能呼吸效果 (0.4 ~ 1.0)
      state.ctx.globalAlpha = 0.7 + 0.3 * Math.sin(Date.now() / 250);
      state.ctx.shadowColor = '#00ff88';
      state.ctx.shadowBlur = 15;
    }

    state.ctx.beginPath();
    state.ctx.arc(cx, cy, state.cellSize * 0.43, 0, Math.PI * 2);
    state.ctx.fillStyle = (colorType === BLACK) ? '#000' : '#fff';
    state.ctx.fill();
    state.ctx.restore();
  }

  // --- 4. 认输文案修复 ---
  function showGameOverOverlay(winnerColor, reason = 'game_over') {
    const overlay = $('result-overlay');
    const desc = $('result-desc');
    if (!overlay || !desc) return;

    const winLabel = winnerColor === 'black' ? '黑方' : '白方';
    const loseLabel = winnerColor === 'black' ? '白方' : '黑方';
    
    desc.textContent = reason === 'resign' 
      ? `${winLabel}获胜（${loseLabel}投降）` 
      : `${winLabel}获胜`;
      
    overlay.classList.add('is-open');
  }

  // --- 5. 初始化与事件绑定 ---
  async function init() {
    if (state.boundOnce) return;
    state.boundOnce = true;

    injectUIButtons();

    state.canvas = $('game-canvas');
    state.ctx = state.canvas.getContext('2d');

    // 绑定点击与触摸
    state.canvas.addEventListener('click', canvasCaptureHandler, { capture: true });
    state.canvas.addEventListener('touchstart', (e) => {
      if (state.isInRoom) e.preventDefault();
      canvasCaptureHandler(e);
    }, { passive: false });

    console.log('[MP] 视觉重塑版加载完成');
  }

  // 保持与原有逻辑兼容
  window.MP = { ...window.MP, init, showGameOverOverlay };
  window.addEventListener('DOMContentLoaded', init);
})();