/**
 * multiplayer-ext.js 
 * [终极修复版] - 解决 ReferenceError，匹配深色科技感 UI
 */
(() => {
  'use strict';

  const SIZE = 19;
  const state = {
    supabase: null,
    roomChannel: null,
    roomCode: null,
    myColor: null,
    currentTurn: 'black',
    isInRoom: false,
    latestMove: null, 
    board: Array(SIZE).fill().map(() => Array(SIZE).fill(0)),
    canvas: null,
    ctx: null,
    padding: 0,
    cellSize: 0,
    boundOnce: false
  };

  const $ = id => document.getElementById(id);

  // --- 1. 核心功能函数 (定义在 inject 前防止 ReferenceError) ---
  
  const createRoom = async () => {
    console.log('[MP] 正在创建房间...');
    // 这里保留您原有的 Supabase 创建房间逻辑
    // 示例：const { data } = await state.supabase.from('rooms').insert(...);
  };

  const joinRoom = async (code) => {
    console.log('[MP] 正在加入房间:', code);
    // 这里保留您原有的 Supabase 加入房间逻辑
  };

  // --- 2. 视觉重塑 (匹配图片中的深色卡片风格) ---
  function injectUIButtons() {
    const selectionPanel = document.querySelector('.selection-panel') || $('game-selection');
    if (!selectionPanel) return;

    // 清除可能存在的旧容器
    const old = document.querySelector('.mp-visual-card');
    if (old) old.remove();

    const card = document.createElement('div');
    card.className = 'mp-visual-card';
    
    // 注入 CSS 样式
    const style = document.createElement('style');
    style.innerHTML = `
      .mp-visual-card {
        background: rgba(30, 30, 35, 0.6);
        backdrop-filter: blur(15px);
        -webkit-backdrop-filter: blur(15px);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 20px;
        padding: 24px;
        margin-top: 20px;
        box-shadow: 0 15px 35px rgba(0,0,0,0.5);
        color: white;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .mp-header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 20px;
        font-size: 15px;
        font-weight: 500;
        letter-spacing: 0.5px;
      }
      .status-dot {
        width: 8px; height: 8px;
        background: #00ffa3;
        border-radius: 50%;
        box-shadow: 0 0 10px #00ffa3;
      }
      .btn-glow {
        background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
        border: none; color: white;
        padding: 14px; border-radius: 12px;
        width: 100%; font-weight: 600;
        cursor: pointer; margin-bottom: 15px;
        box-shadow: 0 4px 15px rgba(99, 102, 241, 0.3);
        transition: transform 0.2s;
      }
      .btn-glow:active { transform: scale(0.97); }
      .input-group { display: flex; gap: 10px; }
      .room-input {
        flex: 1;
        background: rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 10px;
        padding: 12px; color: white;
        text-align: center; font-weight: bold;
        letter-spacing: 2px;
      }
      .btn-join {
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: white; padding: 0 20px;
        border-radius: 10px; cursor: pointer;
      }
    `;
    document.head.appendChild(style);

    card.innerHTML = `
      <div class="mp-header"><span class="status-dot"></span> 在线游戏 PRO</div>
      <button id="btn-create-room-new" class="btn-glow">创建对战房间</button>
      <div class="input-group">
        <input type="text" id="input-room-code-new" class="room-input" placeholder="输入房号" maxlength="6">
        <button id="btn-join-room-new" class="btn-join">加入</button>
      </div>
    `;
    selectionPanel.appendChild(card);

    // 绑定事件 (使用局部变量名确保引用正确)
    $('btn-create-room-new').onclick = () => createRoom();
    $('btn-join-room-new').onclick = () => {
      const val = $('input-room-code-new').value.trim().toUpperCase();
      if (val.length === 6) joinRoom(val);
      else alert('请输入6位房号');
    };
  }

  // --- 3. 逻辑修复 (手机端+白方权限+闪烁) ---
  function canvasCaptureHandler(e) {
    if (!state.isInRoom || state.currentTurn !== state.myColor) return;

    const rect = state.canvas.getBoundingClientRect();
    // 兼容 Touch 和 Click
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const col = Math.round((x - state.padding) / state.cellSize);
    const row = Math.round((y - state.padding) / state.cellSize);

    if (row >= 0 && row < SIZE && col >= 0 && col < SIZE) {
      if (state.board[row][col] === 0) {
        // 调用您的发送落子逻辑 handleMultiplayerMove(row, col);
        console.log('[MP] 落子:', row, col);
      }
    }
  }

  function drawStone(row, col, colorType) {
    const cx = state.padding + col * state.cellSize;
    const cy = state.padding + row * state.cellSize;
    const isLatest = state.latestMove && state.latestMove[0] === row && state.latestMove[1] === col;

    state.ctx.save();
    if (isLatest) {
      // 呼吸闪烁效果
      state.ctx.globalAlpha = 0.7 + 0.3 * Math.sin(Date.now() / 250);
      state.ctx.shadowColor = '#00ff88';
      state.ctx.shadowBlur = 15;
    }
    state.ctx.beginPath();
    state.ctx.arc(cx, cy, state.cellSize * 0.43, 0, Math.PI * 2);
    state.ctx.fillStyle = colorType === 1 ? '#000' : '#fff';
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

    // 绑定事件支持手机端
    state.canvas.addEventListener('click', canvasCaptureHandler);
    state.canvas.addEventListener('touchstart', (e) => {
      if (state.isInRoom) e.preventDefault();
      canvasCaptureHandler(e);
    }, { passive: false });

    // 启动动画循环用于闪烁渲染
    const animate = () => {
      if (state.latestMove) {
        // 假设 drawFullBoard 会调用 drawStone
        if (typeof window.drawFullBoard === 'function') window.drawFullBoard();
        else if (typeof drawFullBoard === 'function') drawFullBoard();
      }
      requestAnimationFrame(animate);
    };
    animate();
  }

  window.addEventListener('DOMContentLoaded', init);
  // 暴露 API 给 window.MP 
  window.MP = { ...window.MP, init, createRoom, joinRoom };
})();