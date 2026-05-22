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
 // const BLACK = 'black';
 // const WHITE = 'white';
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
    // 🟢 【此处为新增定义】：用于隔离单机版 AI 与 多人在线联机模式 2026-05-17
    gameMode: 'MULTIPLAYER', // 默认为 MULTIPLAYER（多人在线），可选值为 'SINGLE_PLAYER'
    myColor: null,
    currentTurn: 'black',
    boardSize: 19,         // 棋盘格数
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
  /**
     * 补全缺失的获取当前用户函数
     */
    async function getCurrentUser() {
      if (!state.supabase) {
        console.error('[multiplayer-ext] Supabase 实例未初始化');
        return null;
      }
      // 从 Supabase Auth 中获取当前登录的用户会话
      const { data: { user }, error } = await state.supabase.auth.getUser();
      if (error) {
        console.error('[getCurrentUser] 获取用户失败:', error);
        return null;
      }
      return user;
    }

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
  
  /*
  function resizeCanvas() {
    if (!state.canvas || !state.ctx) return;
    const parent = state.canvas.parentElement;
    const shell = parent?.closest('.board-shell') || parent;
    const cssSize = Math.max(320, Math.floor(Math.min(shell?.clientWidth || 0, shell?.clientHeight || shell?.clientWidth || 0) || 760));
    console.log("[Canvas] 调整画布尺寸为:", cssSize);
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    state.canvas.width = cssSize * dpr;
    state.canvas.height = cssSize * dpr;
    state.canvas.style.width = `${cssSize}px`;
    state.canvas.style.height = `${cssSize}px`;
    state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    state.padding = cssSize / (SIZE + 1);
    state.cellSize = (cssSize - state.padding * 2) / (SIZE - 1);
    drawFullBoard();
  }*/
  function resizeCanvas() {
    if (!state.canvas || !state.ctx) return;

    // 1. 🌟 治本核心：绝不测量 shell，转而测量最干净的外层棋盘承载区 .board-zone
    // .board-zone 的大小由顶层 Grid 决定，绝对不会被内部的 Canvas 撑大
    const boardZone = document.querySelector('.board-zone');
    if (!boardZone) return;

    // 2. 获取不受内部组件干扰的纯净可用宽度与高度
    const zoneWidth = boardZone.clientWidth || 0;
    const zoneHeight = boardZone.clientHeight || 0;

    // 3. 严格计算正方形视觉大小（取宽高极小值）
    let cssSize = Math.floor(Math.min(zoneWidth, zoneHeight));

    // 4. 减去外壳 .board-shell 自身可能存在的 padding 内边距（如四周各有18px，共减去36）
    // 这样能确保 Canvas 缩在木纹边框内部，让边框完美露出来
    cssSize = cssSize - 36;

    // 5. 设定安全的绝对上下限，防止大屏 PC 上突破天际或调试时缩成一团
    cssSize = Math.max(320, Math.min(cssSize, 760)); // 如果你希望上限就是 760，这里死锁 760

    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));

    // 6. 🌟 性能与防闪烁优化：只有当尺寸真正改变时才动画布 Buffer
    if (state.canvas.width !== cssSize * dpr || state.canvas.height !== cssSize * dpr) {
      state.canvas.width = cssSize * dpr;
      state.canvas.height = cssSize * dpr;
      state.canvas.style.width = `${cssSize}px`;
      state.canvas.style.height = `${cssSize}px`;

      state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      state.padding = cssSize / (SIZE + 1);
      state.cellSize = (cssSize - state.padding * 2) / (SIZE - 1);

      // 7. 放入下一帧异步队列，避开浏览器的样式计算锁，确保顺滑
      requestAnimationFrame(() => {
        drawFullBoard();
      });
    }
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
   // -----------------------------------------------------------
    // 🟢 终极调优：通过改变可见性频率，实现【整个棋子本体】高频闪烁
    // -----------------------------------------------------------
    for (let row = 0; row < state.boardSize; row++) {
      for (let col = 0; col < state.boardSize; col++) {
        const color = state.board[row][col];
        if (color === EMPTY) continue;

        // 计算当前棋子的 Canvas 物理坐标
        const boardX = state.padding + col * state.cellSize;
        const boardY = state.padding + row * state.cellSize;

        // 安全读取当前激活的最新闪烁状态机
        const bMove = state.blinkingMove || null;
        const isCurrentBlinkMove = (bMove && bMove.row === row && bMove.col === col);

        if (isCurrentBlinkMove) {
          // 🚀 严格移入分支：由 bMove.visible 的频率切换来决定【整颗棋子】画不画
          if (bMove.visible) {
            // 显示状态（亮起帧）：正常绘制高清实体棋子（完全无边框线）
            drawStone(row, col, color);
          } else {
            // 隐藏状态（熄灭帧）：彻底不调用 drawStone，棋子连同阴影在这一帧完全消失
            
            // 📱 移动端/高清屏硬件自愈：部分手机浏览器 Canvas 机制如果检测到完全没画东西，
            // 可能会拒绝刷新这一帧的物理像素。这里用 3% 极淡、肉眼完全不可见的透明度强制触发 GPU 重绘。
            ctx.save();
            ctx.globalAlpha = 0.03; 
            drawStone(row, col, color);
            ctx.restore(); // 🔴 必须释放，确保后续普通历史棋子保持完全实体不透明
          }
        } else {
          // 普通历史老棋子：不受闪烁影响，一律正常绘制实体
          drawStone(row, col, color);
        }
      }
    }
  }
  /*
  function ensureCanvasSize() {
    if (!state.canvas || !state.ctx) return;
    const rect = state.canvas.getBoundingClientRect();
    const size = Math.max(320, Math.floor(Math.min(rect.width || 0, rect.height || 0) || 760));
    const current = state.canvas.width / Math.max(1, window.devicePixelRatio || 1);
    if (Math.abs(current - size) > 1) resizeCanvas();
  }*/
  function ensureCanvasSize() {
    const canvas = document.getElementById('go-canvas') || state.canvas;
    const container = document.getElementById('game-container') || document.querySelector('.app');
    if (!canvas || !container) return;

    // 1. 获取当前容器能给出的最大可用物理宽高
    const availableWidth = container.clientWidth;
    const availableHeight = container.clientHeight || window.innerHeight * 0.65; // 为上下UI留出空间

    // 2. 🌟 终极自愈核心：取宽高的最小值，强行锁死为正方形，杜绝任何裁剪溢出
    const safeSize = Math.min(availableWidth, availableHeight) - 20; // 留出 20px 安全边距

    // 3. 适配高清屏 Retinal 像素比，防止棋子线条模糊
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = safeSize + 'px';
    canvas.style.height = safeSize + 'px';
    
    canvas.width = safeSize * dpr;
    canvas.height = safeSize * dpr;

    // 4. 通知绘图上下文进行缩放，这样你原本的绘图代码不需要改动任何坐标
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // 5. 更新你全局状态机中的格子间距变量，让点击落子判定同步对齐
    if (state) {
      state.canvasWidth = safeSize;
      state.cellSize = safeSize / (state.boardSize + 1); // 适配自适应格子宽度
      state.padding = state.cellSize;
    }

    // 6. 重新绘制全盘
    if (typeof drawFullBoard === 'function') {
      drawFullBoard();
    }
  }
  // 7. 确保把这个缩放挂载到全局窗口改变事件中
  window.addEventListener('resize', ensureCanvasSize);
  /*====================================*/
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
  /*========2016-05-17==========*/
  window.state = window.state || {};
  window.state.koPoint = null; // 存储当前被锁死的劫位坐标：{ row, col }

  function placeStone(row, col, color) {
    // 🚀 核心修改 A：前置拦截劫争禁手
    if (window.state.koPoint) {
      if (window.state.koPoint.row === row && window.state.koPoint.col === col) {
        return { success: false, captured: 0, reason: '🚫 处于劫争状态，当前不能立刻提回，请先在别处落子（寻劫）' };
      }
    }

    // 检查位置是否为空
    if (state.board[row][col] !== EMPTY) {
      return { success: false, captured: 0, reason: '该位置已有棋子' };
    }

    const opponent = color === BLACK ? WHITE : BLACK;
    
    // 1. 临时落子
    state.board[row][col] = color;

    const capturedList = [];
    let totalCaptured = 0;

    // 2. 检查四周敌方棋子的气，执行提子
    for (const [dr, dc] of DIRECTIONS) {
      const nr = row + dr;
      const nc = col + dc;
      if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
      if (state.board[nr][nc] !== opponent) continue;

      const { liberties, group } = bfsLiberties(nr, nc, opponent, state.board);
      if (liberties === 0) {
        for (const [gr, gc] of group) {
          // 💡 核心自愈：执行去重判定，防止多个方向连接到同一个敌方单子时导致重复计数
          if (!capturedList.some(([exR, exC]) => exR === gr && exC === gc)) {
            state.board[gr][gc] = EMPTY;
            capturedList.push([gr, gc]);
          }
        }
      }
    }
    
    // 根据真正去重后的数组确定物理提子总数
    totalCaptured = capturedList.length;

    // 3. 检查自己的棋串是否有气（防止自杀）
    const { liberties: selfLiberties } = bfsLiberties(row, col, color, state.board);
    if (selfLiberties === 0) {
      // 自杀手，回滚落子
      state.board[row][col] = EMPTY;
      // 回滚误提的敌方棋子
      for (const [r, c] of capturedList) {
        state.board[r][c] = opponent;
      }
      return { success: false, captured: 0, reason: '禁止自杀（无气）' };
    }

    // 🚀 核心修改 B：更新或解锁打劫状态机
    // 标准打劫判定：本次正好提了对方 1 颗子，且自己落子后这块棋也只剩下 1 气
    if (totalCaptured === 1 && selfLiberties === 1) {
      // 对方刚刚被提掉的那个格子，就是下一手对方不能立刻点入的反提劫位
      window.state.koPoint = {
        row: capturedList[0][0],
        col: capturedList[0][1]
      };
      console.log(`[Ko Rule] 劫争触发！锁死对方反提坐标: [${window.state.koPoint.row}, ${window.state.koPoint.col}]`);
    } else {
      // 如果没有触发打劫（普通落子、或者提了2个子以上的大子），前一手的劫位自动无缝解禁
      window.state.koPoint = null;
    }

    // 4. 更新捕获计数
    if (color === BLACK) {
      state.blackCaptures += totalCaptured;
    } else {
      state.whiteCaptures += totalCaptured;
    }

    // 💡 保持与调用端（result.capturedGroup）解构命名的绝对一致
    return { success: true, captured: totalCaptured, capturedGroup: capturedList };
  }

  // 🟢 修改 2026-05-13：统一轮次切换
  function switchTurn() {
    state.currentTurn =
      state.currentTurn === BLACK
        ? WHITE
        : BLACK;
    console.log(
      '[轮次切换]',
      state.currentTurn
    );
  }

    function drawStone(row, col, color, isLatestMove = false) {
      if (!state.ctx) return;
      const cx = state.padding + col * state.cellSize;
      const cy = state.padding + row * state.cellSize;
      const radius = state.cellSize * 0.44;
      const alpha = isLatestMove ? (state.latestMoveVisible ? 1 : 0.14) : 1;

      state.ctx.save();
      //state.ctx.globalAlpha = 1;
      state.ctx.beginPath();
      state.ctx.arc(cx + 1.2, cy + 1.4, radius, 0, Math.PI * 2);
      state.ctx.fillStyle = 'rgba(0,0,0,0.25)';
      state.ctx.fill();
      state.ctx.restore();

      state.ctx.save();
      //state.ctx.globalAlpha = alpha;
      // 如果不是闪烁的目标，则使用默认计算出的 alpha 权重
      if (!state.blinkingMove || state.blinkingMove.row !== row || state.blinkingMove.col !== col) {
        state.ctx.globalAlpha = alpha;
      }
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

      const boardSize = state.boardSize || 19;

      let col = Math.round((x - state.padding) / state.cellSize);
      let row = Math.round((y - state.padding) / state.cellSize);

      row = Math.max(0, Math.min(boardSize - 1, row));
      col = Math.max(0, Math.min(boardSize - 1, col));

      return { row, col };
    }

 function canvasCaptureHandler(e) {
    //if (!state.isInRoom) return;
    // 🟢 【新增修改 1】：豁免单机模式下的联机状态检验，放行落子动作 2026-05-17
    if (state.gameMode === 'SINGLE_PLAYER') {
      // 在单机 AI 模式下，直接放行，不检查 isInRoom
    } else {
      // 蓝色分支：原有多人在线联机状态检验
      if (!state.isInRoom) return;
    }
    if (!state.myColor || state.currentTurn !== state.myColor) {
      e.preventDefault();
      playSound('invalidMove');
      return;
    }
    e.preventDefault();
    const pos = captureToBoardCoords(e);
    if (!pos) return;
    handleMultiplayerMove(pos.row, pos.col);
    /**
     * 点击检测 2026-05-13
     */
    console.log(
      '[点击检测]',
      'myColor:',
      state.myColor,
      'currentTurn:',
      state.currentTurn,
      'isInRoom:',
      state.isInRoom
    );
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

  //2026-05-17 打劫修复
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
          // 🚀【打劫修复】：打包当前的劫争禁手坐标传递给对手
          koPoint: window.state.koPoint 
        },
      });
    }

  // --------------------------
  // 🟢 修改 2026-05-16：最后一步持续闪烁
  // --------------------------
  let blinkInterval = null;
  let blinkingMove = null;
  
  state.blinkingMove = null;
  state.blinkTimer = null;

   /**
   * 启动最新落子本体的频率闪烁
   */
  function startBlink(row, col, color) {
    console.log(`[Blink Engine] 激活本体隐显频率闪烁 -> 坐标: [${row}, ${col}], 颜色: ${color}`);
    
    // 1. 熔断上一步棋建立的闪烁定时器
    if (state.blinkTimer) {
      clearInterval(state.blinkTimer);
    }

    // 2. 初始化闪烁棋子的数据状态（默认第一帧为显示 visible = true）
    state.blinkingMove = {
      row: parseInt(row),
      col: parseInt(col),
      color: color,
      visible: true
    };

    // 3. 调优核心频率：将翻转时间调整为 250ms，提供极高辨识度的全子隐显
    state.blinkTimer = setInterval(() => {
      if (!state.blinkingMove) {
        clearInterval(state.blinkTimer);
        state.blinkTimer = null;
        return;
      }
      
      // 🌟 核心频率翻转：true 变 false，false 变 true
      state.blinkingMove.visible = !state.blinkingMove.visible;
      
      // 4. 利用异步重绘请求，通知核心 Canvas 重新渲染整个棋盘
      if (typeof drawFullBoard === 'function') {
        requestAnimationFrame(() => {
          drawFullBoard();
        });
      }
    }, 250); // 👈 频率设为 250 毫秒最为明显
  }
  
  /**
   * 停止闪烁并恢复常态
   */
    function clearBlink() {
      if (state.blinkTimer) {
        clearInterval(state.blinkTimer);
        state.blinkTimer = null;
      }
      state.blinkingMove = null;
      
      // 全局防错，防止旧局部变量捣乱
      if (typeof blinkInterval !== 'undefined') blinkInterval = null;
      if (typeof blinkingMove !== 'undefined') blinkingMove = null;

      if (typeof drawFullBoard === 'function') {
        drawFullBoard();
      }
    }

  /// --------------------------
// 🟢 修改 2026-05-16：修复多人落子同步、颜色异常、闪烁异常
// --------------------------
  async function handleMultiplayerMove(row, col) {
    // 1. 严格轮次与执色检验 (全字符串比对)
    if (state.currentTurn !== state.myColor) {
      playSound('invalidMove');
      return;
    }

    // 2. 基础合法性校验
    if (state.board[row][col] !== EMPTY) {
      playSound('invalidMove');
      return;
    }

    if (state.isSyncing) return; 
    state.isSyncing = true; // 开启同步锁

    // 转换数字用于落子逻辑
    const colorNum = state.myColor === 'black' ? BLACK : WHITE;

    // 本地试落子判定
    const result = placeStone(row, col, colorNum);

    if (!result.success) {
      state.isSyncing = false;
      playSound('invalidMove');
      toast(result.reason || '非法落子');
      return;
    }
    //}else{
      // 🟢 【新增修改 1】：单机版 AI 模式核心分支拦截
    if (state.gameMode === 'SINGLE_PLAYER') {
      // 1. 本地播放音效、启动整个棋子本体高频频率闪烁
      playSound(result.captured > 0 ? 'capture' : 'placeStone');
      startBlink(row, col, colorNum);

      // 2. 严格切换轮次为白棋（即 AI 回合，全字符串格式比对）
      state.currentTurn = 'white';

      // 3. 立即触发本地重绘与交互面板刷新
      drawFullBoard();
      updateProfilePanels();
      
      // 4. 立即释放单机环境下的同步锁，防止卡死
      state.isSyncing = false; 

      // 5. 模拟 700ms 思考延迟，唤醒本地 AI 自动落子计算
      setTimeout(() => {
        if (typeof triggerAIMove === 'function') {
          triggerAIMove();
        } else {
          console.error("triggerAIMove 函数未定义，请确保 AI 落子引擎已注入");
        }
      }, 700);

      return; // 🔴 核心阻断：单机模式下在此直接返回，完全不向下执行任何 Supabase 网络同步逻辑
    }
      // 💡 细节对齐：请确保此处的函数名与你本地（例如 broadcastMove）完全一致  2026-05-17
      // 如果你原本就有 broadcastMove(row, col, color, capturedList) 这样的定义，可以直接这样传：
    if (typeof broadcastMove === 'function') {
      // 内部广播时会自动去读取最新的 window.state.koPoint
       //broadcastMove(row, col, colorNum, result.capturedGroup); 
      await broadcastMove(row, col, colorNum, result.capturedGroup);
    } else if (typeof sendBroadcast === 'function') {
        // 如果你确实封装了 sendBroadcast，那就保持你的原样并附带最新劫位
        sendBroadcast({
          row, 
          col, 
          colorNum,
          captured: result.capturedGroup,
          koPoint: window.state.koPoint // 🚀 传给对手，让对方本地同步禁手
        });
     }
    //}

    playSound(result.captured > 0 ? 'capture' : 'placeStone');
    startBlink(row, col, colorNum);

    // 严格切换为字符串格式轮次
    const nextTurn = state.myColor === 'black' ? 'white' : 'black';
    state.currentTurn = nextTurn;

    drawFullBoard();
    updateProfilePanels();

    try {
      // 广播给对手
      await broadcastMove(row, col, colorNum, result.capturedGroup || []);

      // 同步到 Supabase 数据库
      await persistRoomState({
        next_turn: nextTurn
      });
    } catch (err) {
      console.error('[multiplayer-ext] 落子同步失败:', err);
    } finally {
      state.isSyncing = false; // 释放锁
    }
  }

  // --------------------------
  // 🟢 修改 2026-05-16：修复远程落子重复切换轮次
  // --------------------------
 async function onOpponentMove(payload) {
    const { row, col, color, captured, next_turn } = payload || {};

    if (typeof row !== 'number' || typeof col !== 'number' || !color) {
      return;
    }

    // 防重处理
    if (state.board[row][col] !== EMPTY) {
      if (next_turn) state.currentTurn = next_turn;
      updateProfilePanels();
      return;
    }
  // 🟢 核心自愈：收到对方落子，先清空上一步我方的闪烁定时器
    clearBlink();
    // 写入棋子
    state.board[row][col] = color;

    // 处理提子
    if (Array.isArray(captured)) {
      for (const [r, c] of captured) {
        state.board[r][c] = EMPTY;
      }
    }

    // 吃子统计
    if (color === BLACK) {
      state.blackCaptures += Array.isArray(captured) ? captured.length : 0;
    } else {
      state.whiteCaptures += Array.isArray(captured) ? captured.length : 0;
    }

    // 优先对齐广播带过来的下一步轮次字符串，保底自动翻转
    if (next_turn) {
      state.currentTurn = next_turn;
    } else {
      state.currentTurn = color === BLACK ? 'white' : 'black';
    }

    startBlink(row, col, color);
    playSound('yourTurn');
    drawFullBoard();
    updateProfilePanels();

    console.log('[远程落子同步成功] 位置:', row, col, '下一步轮到:', state.currentTurn);
  }
  
  // 🟢 修改 2026-05-16：禁止远程覆盖整个棋盘
  function applyRemotePayload(payload) {

    if (!payload) return;

    if (typeof payload.black_captures === 'number') {
      state.blackCaptures =
        payload.black_captures;
    }

    if (typeof payload.white_captures === 'number') {
      state.whiteCaptures =
        payload.white_captures;
    }

    if (typeof payload.next_turn === 'string') {
      state.currentTurn =
        payload.next_turn;
    }
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
 
  // --------------------------
  // 🟢 修改 2026-05-10：认输逻辑
  // --------------------------
  async function handleResignRequest(fromColor) {
    if (!state.isInRoom) return;

    // 判定胜者
    const winner = fromColor === 'black' ? 'white' : 'black';
    const accepted = window.confirm(`对手请求认输，是否接受？\n\n接受后将判定 ${winner === 'black' ? '黑方' : '白方'} 获胜。`);
    if (!accepted) return;

    // 广播游戏结束
    await announceGameOver(winner, 'resign');

    // 自动退出房间
    leaveRoom(); // 🟢 修改 2026-05-10
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

  /**
   * 修复版：订阅实时通道，打通进房通道
   */
    async function initRoomChannel(code) {
      if (!state.supabase) return null;
      
      // 移除 ch.unsubscribe，确保每次都建立干净的连接
      if (state.roomChannel) {
        try { await state.roomChannel.unsubscribe(); } catch(_) {}
      }

      const ch = state.supabase.channel(`room:${code}`, { config: { broadcast: { self: false } } });
      state.roomChannel = ch; // 挂载到全局状态中

      // 收到对手落子广播 --2026-05-17 修复：增加颜色兼容解析，强化闪烁逻辑，提供外部回调接口
      ch.on('broadcast', { event: 'move' }, ({ payload }) => {
        console.log('[Realtime] 收到对手落子广播:', payload);
        // 1. 优先让核心数据结构应用对端的落子与提子（完成底层 Canvas 棋盘的物理更新）
        if (typeof applyRemotePayload === 'function') {
          applyRemotePayload(payload);
        }
        // 2. 🚀【后置核心同步】：在底层数据应用完毕后，再强行锁定/更新本地的劫争状态，防止被内部重置冲掉
        // 2. 🚀【多端劫争后置闭环】：全兼容解析，防止被内部重置冲掉
        // 提取下划线或驼峰命名的劫位状态
        const rawKo = payload && (payload.koPoint || payload.ko_point);
        //if (payload && payload.koPoint) {
        if (rawKo && typeof rawKo.row === 'number' && typeof rawKo.col === 'number') {
          window.state.koPoint = {
            row: parseInt(payload.koPoint.row),
            col: parseInt(payload.koPoint.col)
          };
          console.log(`[Ko Sync] 对手制造了劫争，本地同步锁死反提点: [${window.state.koPoint.row}, ${window.state.koPoint.col}]`);
        } else {
          window.state.koPoint = null; // 自动解禁
        }
        // 3. 解析行列与颜色，触发最新棋子的持续闪烁提示
        const r = typeof payload.row === 'number' ? payload.row : parseInt(payload.r);
        const c = typeof payload.col === 'number' ? payload.col : parseInt(payload.c);
        const color = payload.color || payload.playerColor;
        
        if (!isNaN(r) && !isNaN(c)) {
          // 激活 DOM 贴片或状态闪烁（自动移除自己上一手的闪烁，无缝接力）
          if (typeof startBlink === 'function') {
            startBlink(r, c, color);
          }
        }
        
        // 4. 触发后续对局轮次或 UI 状态的更新
        if (typeof onOpponentMove === 'function') {
          onOpponentMove(payload);
        }
      });

      // 2. 房间控制消息（如认输、游戏结束）
      ch.on('broadcast', { event: 'message' }, ({ payload }) => {
        onRoomMessage(payload);
      });

      // 3. Presence 状态同步
      ch.on('presence', { event: 'sync' }, async () => {
        try {
          const { data: latestRoom } = await state.supabase
            .schema('game')
            .from('game_rooms')
            .select('*')
            .eq('code', code)
            .single();
          if (latestRoom) {
            await refreshRoomFromServer(latestRoom);
          }
        } catch (err) {
          console.warn('[multiplayer-ext] Presence 刷新失败:', err);
        }
      });

      // 4. ✨【核心修复点】：去掉不稳定的单条 filter，改为接收全量更新后在前端过滤
      ch.on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'game', table: 'game_rooms' }, // 👈 去掉不稳定的单条 filter
        async (payload) => {
          const room = payload.new;
          
          // 在前端精确匹配当前房间号，100% 安全稳定
          if (!room || room.code !== code) return; 

          console.log('[Realtime] 捕捉到当前房间状态更新:', room);
          
          state.room = room;
          // 兼容处理字段：同时支持 next_turn 和 current_turn
          state.currentTurn = room.next_turn || room.current_turn || 'black'; 
          
          // 只要白方进入了（white_id 存在），或者状态变为 playing/waiting，即激活房间激活状态
          if (room.white_id || room.status === 'playing') {
            state.isInRoom = true;
          }

          // 🚀 核心跳转与界面点亮逻辑：当发现白方进房，打破大厅选择界面，切入对战盘面
          if (room.white_id) {
            const selectionPage = document.getElementById('game-selection');
            const appPage = document.querySelector('.app');

            if (selectionPage && selectionPage.style.display !== 'none') {
              selectionPage.style.display = 'none'; // 隐藏游戏选择大厅
              if (appPage) {
                appPage.style.display = 'grid'; // 展现生产级棋盘布局
              }
              if (typeof resizeBoard === 'function') {
                resizeBoard(); // 强制触发一次防缩放重绘
              }
            }
          }

          // 加载玩家 profile（通过类型校验保护，防止函数未定义时崩溃）
          if (typeof getPlayerProfile === 'function') {
            state.blackProfile = await getPlayerProfile(room.black_id);
            state.whiteProfile = await getPlayerProfile(room.white_id);
          }

          // 动态对齐你 HTML 中的“对手信息”面板
          const opponentNickname = document.getElementById('opponent-nickname');
          const opponentStatus = document.getElementById('opponent-status');
          if (room.white_id && opponentNickname) {
            const isBlack = state.myColor === 'black';
            opponentNickname.textContent = isBlack ? "白方已加入" : "黑方已就位";
            if (opponentStatus) {
              opponentStatus.textContent = "在线";
              opponentStatus.className = "status-pill"; // 点亮绿色在线灯
            }
          }

          // 刷新页面渲染与全量重绘
          if (typeof refreshRoomFromServer === 'function') {
            await refreshRoomFromServer(room);
          }
          if (typeof drawFullBoard === 'function') {
            drawFullBoard();
          }
          if (typeof updateProfilePanels === 'function') {
            updateProfilePanels();
          }
          
          // 顺手把遮罩层关闭，让对局大厅呈现出来
          const overlay = (typeof $ === 'function' ? ($('room-overlay') || $('match-overlay') || $('room-modal')) : null) || document.querySelector('.room-overlay');
          if (overlay && room.white_id) {
            overlay.style.display = 'none'; // 白方来了，自动关闭弹窗进入棋盘
            toast('白方已加入，对局正式开始！');
          }
        }
      );

      // 5. 激活通道订阅
      await ch.subscribe(async (status) => {
        console.log('[Realtime] 通道当前状态:', status);
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
    try {
      // 🟢 确保切换回多人在线模式 2026-05-17
      state.gameMode = 'MULTIPLAYER';
      const user = await getCurrentUser();
      if (!user) throw new Error('未登录用户，请先登录');

      const code = generateRoomCode();
      
      const { data, error } = await state.supabase
        .from('game_rooms')
        .insert([
          {
            code: code,
            black_id: user.id,
            next_turn: 'black', 
            status: 'waiting'
          },
        ])
        .select()
        .single();

      if (error) {
        console.error('[Supabase 返回错误详情]:', error);
        throw error;
      }

      state.roomCode = code;
      state.myColor = 'black'; 
      state.currentTurn = 'black';
      state.room = data;
      state.isInRoom = true;
      state.roomContext.roomId = code;
      state.roomContext.inviteLink = buildInviteLink(code);
      state.roomContext.blackName = '黑方玩家';
      state.roomContext.whiteName = '白方玩家';

      await initRoomChannel(code);

      // ==========================================
      // ✨【完美的 UI 数据对齐闭环】✨
      // ==========================================
        
      // 1. 初始化右侧真实面板数据
      const roomIdSpan = document.getElementById('room-id');
      const inviteInput = document.getElementById('room-invite-link');
      const statusPill = document.getElementById('room-status-pill');
      const copyBtn = document.getElementById('mp-copy-invite-btn');

      if (roomIdSpan) roomIdSpan.textContent = code;
      if (inviteInput) {
        const origin = window.location.origin + window.location.pathname;
        inviteInput.value = `${origin}?room=${code}`;
      }
      if (statusPill) {
        statusPill.textContent = "等待对手...";
        statusPill.style.background = "rgba(246, 196, 83, 0.15)";
        statusPill.style.color = "#f6c453";
      }

      // 🚀【关键修复】：黑方建房成功后，直接打破“选择游戏”遮罩，切入战场！
      enterGameBoardUI(); 
      updateRoomPanel({ code, inviteLink: state.roomContext.inviteLink });

      toast('房间创建成功，正在大厅静候白方加入...');
      return data;
    } catch (err) {
      console.error('[createRoom] 失败:', err);
      toast(`创建失败: ${err.message || JSON.stringify(err)}`);
    }
  }


    /**
   * 核心跳转：从游戏选择大厅切换到真正的围棋对战棋盘
   */
  function enterGameBoardUI() {
    const selectionPage = document.getElementById('game-selection');
    const appPage = document.querySelector('.app');

    if (selectionPage) {
      selectionPage.style.display = 'none'; // 隐藏选择大厅
    }
    if (appPage) {
      appPage.style.display = 'grid'; // 点亮并展开你的生产级对战布局 (grid 布局)
      
      // 强制触发一次棋盘大小重绘，防止 Canvas 渲染成 0x0 尺寸
      if (typeof resizeBoard === 'function') {
        resizeBoard();
      } else if (typeof drawFullBoard === 'function') {
        drawFullBoard();
      }
    }
  }
  
  async function joinRoom(code) {
    // 🟢 确保切换回多人在线模式 2026-05-17
    state.gameMode = 'MULTIPLAYER';
    if (!code || code.length !== ROOM_CODE_LENGTH) {
      toast('请输入正确的6位房间号');
      return;
    }
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('未登录用户');

      // 1. 获取最新房间数据
      const { data: room, error: fetchError } = await state.supabase
        .from('game_rooms')
        .select('*')
        .eq('code', code)
        .single();

      if (fetchError || !room) throw new Error('房间不存在');

      let role = null;
      if (room.black_id === user.id) {
        role = 'black';
      } else if (room.white_id === user.id) {
        role = 'white';
      } else if (!room.white_id) {
        // 白方空缺，允许加入并绑定
        const { error: updateError } = await state.supabase
          .from('game_rooms')
          .update({ white_id: user.id, status: 'playing' })
          .eq('code', code);

        if (updateError) throw updateError;
        role = 'white';
      } else {
        toast('房间已满，您当前是观战模式');
        role = 'viewer';
      }

      // 2. 严格绑定本地身份状态（核心修复点）
      state.roomCode = code;
      state.myColor = role; // 明确赋值 'white' 或 'black'
      
      // 强制转换服务器轮次状态为小写字符串
      state.currentTurn = (room.next_turn || 'black').toLowerCase(); 
      state.room = room;

      // 3. 初始化并激活实时通道
      //await initRoomChannel(code);
      // 白方加入数据库成功后
      state.myColor = 'white';
      state.isInRoom = true;
      state.roomContext.inviteLink = buildInviteLink(code);
      await initRoomChannel(code);
      
      // 🚀【关键修复】：白方加入成功，直接切入战场
      enterGameBoardUI(); 
      toast('成功进入对局！');
      
      // 4. 强制拉取并渲染一次最新的棋盘状态，确保画面同步
      await refreshRoomFromServer(room);
      updateRoomPanel({ code, inviteLink: state.roomContext.inviteLink });
      //hideRoomOverlay();
      const overlay = $('room-overlay') || $('match-overlay') || $('room-modal') || document.querySelector('.room-overlay');
      if (overlay) overlay.style.display = 'none';

      toast(`成功加入房间！您执: ${role === 'black' ? '黑子' : role === 'white' ? '白子' : '观战'}`);
    } catch (err) {
      console.error('[joinRoom] 失败:', err);
      toast(err.message);
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

    /*统一监听 */
    state.canvas.addEventListener('pointerdown', canvasCaptureHandler, {
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
  /**
   * 🟢 2026-05-17 新增：点击 "go-game-btn" 直接启动单机版 AI 对战模式
   */
  /**
   * 🟢 终极自愈：启动单机版 AI 对战模式
   * 彻底解决由于轮次颜色校验不一致导致的“无法落子”以及面板状态卡死问题
   */
  function startAIGame() {
    console.log('[AI Mode] 玩家激活单机 AI 状态机...');
    
    // 1. 【核心修复】必须与 handleMultiplayerMove 的全字符串格式完全对齐
    state.gameMode = 'SINGLE_PLAYER'; 
    state.roomCode = 'AI_LOCAL';
    state.myColor = 'black';     // 🌟 必须写全小写字符串 'black'，解除轮次锁
    state.currentTurn = 'black'; // 🌟 必须写全小写字符串 'black'，保证黑棋（玩家）先行

    // 2. 清空并重置本地棋盘矩阵数据
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        state.board[r][c] = EMPTY;
      }
    }
    
    // 3. 熔断可能残存的历史闪烁时钟
    if (typeof clearBlink === 'function') clearBlink();
    
    // 4. 【核心修复】强制将右侧侧边栏面板文本改写为单机对战状态（消除“等待加入”或“离线”提示）
    const oppName = document.getElementById('opponent-nickname');
    if (oppName) oppName.textContent = '阿尔法狗 (AI)';
    
    const oppSide = document.getElementById('opponent-side');
    if (oppSide) oppSide.textContent = '执色：白棋';
    
    const oppActivity = document.getElementById('opponent-activity');
    if (oppActivity) oppActivity.textContent = '状态：对战中'; // 🌟 纠正这里的离线显示
    
    const connSummary = document.getElementById('connection-summary');
    if (connSummary) connSummary.textContent = '单机离线模式';

    const turnSummary = document.getElementById('turn-summary');
    if (turnSummary) turnSummary.textContent = '黑棋先行 (你的回合)';

    // 5. 解除可能残存的同步锁，强制拉动画画布刷新
    state.isSyncing = false;
    updateProfilePanels();
    drawFullBoard();
    
    console.log('[AI Mode] 单机环境及轮次锁解除完毕，对局开始。');
  }
  // -----------------------------------------------------------
  // 🟢 升级版：具备实际围棋战术意识的本地 AI 下棋引擎
  // -----------------------------------------------------------
  function triggerAIMove() {
    if (state.gameMode !== 'SINGLE_PLAYER' || state.currentTurn !== 'white') {
      return;
    }

    // 1. 搜集棋盘上所有基础空位点
    let allEmptyMoves = [];
    for (let r = 0; r < state.boardSize; r++) {
      for (let c = 0; c < state.boardSize; c++) {
        if (state.board[r][c] === EMPTY) {
          allEmptyMoves.push({ r, c });
        }
      }
    }

    if (allEmptyMoves.length === 0) {
      alert('棋盘已满，对局结束！');
      return;
    }

    let bestMove = null;

    // ==========================================================
    // 🧠 【第一层思考：贪婪吃子】寻找能直接提掉黑子的暴利点
    // ==========================================================
    for (let move of allEmptyMoves) {
      // 模拟试落子，看看能不能产生吃子
      const testResult = placeStone(move.r, move.c, WHITE);
      if (testResult.success) {
        // 如果能吃子，且吃子数大于0，这无疑是好棋
        if (testResult.captured > 0) {
          bestMove = move;
          console.log(`[AI 战术层] 触发【贪婪吃子】, 目标坐标: [${move.r}, ${move.c}]`);
          break;
        }
        // 回溯棋盘：由于placeStone会真落子并提子，我们在评估后续点前必须撤销这次试落子
        // 恢复被提掉的子和当前落子
        state.board[move.r][move.c] = EMPTY;
        if (testResult.capturedGroup) {
          testResult.capturedGroup.forEach(p => {
            state.board[p.row][p.col] = BLACK; // 恢复黑子
          });
        }
      }
    }

    // ==========================================================
    // 🧠 【第二层思考：紧急逃跑】如果无子可吃，检查自身是否有白子处于被“叫吃”状态
    // ==========================================================
    if (!bestMove) {
      for (let move of allEmptyMoves) {
        // 检查这个空位的四周，是不是紧挨着气数极少的白子群体
        // 简单策略：如果落子在这里能够成合法的连片，优先考虑
        const testResult = placeStone(move.r, move.c, WHITE);
        if (testResult.success) {
          // 这里可以结合你本地的气数计算逻辑。如果没有独立的气数函数，
          // 试落子不自杀本身就是一种安全的“长气”行为
          state.board[move.r][move.c] = EMPTY; // 撤销试落子
          
          // 如果这个点紧邻高价值交战区（例如靠着黑子），赋予更高权重
          if (hasNeighborColor(move.r, move.c, BLACK)) {
            bestMove = move;
            console.log(`[AI 战术层] 触发【贴身紧逼/防守】, 目标坐标: [${move.r}, ${move.c}]`);
            break;
          }
        }
      }
    }

    // ==========================================================
    // 🧠 【第三层思考：大局观占角守边】抢占传统的 3线、4线黄金行棋点
    // ==========================================================
    if (!bestMove) {
      let goldenMoves = allEmptyMoves.filter(move => {
        // 围棋经典金角银边坐标（通常在第 3、4 行或倒数第 3、4 行）
        const isGoldenRow = (move.r === 3 || move.r === 4 || move.r === state.boardSize - 4 || move.r === state.boardSize - 5);
        const isGoldenCol = (move.c === 3 || move.c === 4 || move.c === state.boardSize - 4 || move.c === state.boardSize - 5);
        return isGoldenRow && isGoldenCol;
      });

      if (goldenMoves.length > 0) {
        // 优先在黄金星位区域选点，建立根据地
        bestMove = goldenMoves[Math.floor(Math.random() * goldenMoves.length)];
        console.log(`[AI 战术层] 触发【金角银边布局】, 目标坐标: [${bestMove.r}, ${bestMove.col}]`);
      }
    }

    // ==========================================================
    // 🧠 【第四层思考：保底防线】如果以上都没触发，执行安全空位随机落子
    // ==========================================================
    if (!bestMove) {
      // 循环筛选，直到找到一个落子成功不违规的点
      while (allEmptyMoves.length > 0) {
        const randomIndex = Math.floor(Math.random() * allEmptyMoves.length);
        const candidate = allEmptyMoves.splice(randomIndex, 1)[0];
        
        const testResult = placeStone(candidate.r, candidate.c, WHITE);
        if (testResult.success) {
          bestMove = candidate;
          console.log(`[AI 战术层] 触发【基础保底落子】, 目标坐标: [${bestMove.r}, ${bestMove.c}]`);
          // placeStone 已经坐实了落子，直接退出
          break;
        }
      }
    } else {
      // 如果是一、二、三层思考选出的最佳点，它们之前都被清空回溯了，这里执行真正的落子坐实
      placeStone(bestMove.r, bestMove.c, WHITE);
    }

    // 5. 无法找到任何合规落子点（可能全盘由于劫争或禁着点卡死）
    if (!bestMove) {
      console.warn('[AI Engine] 无合法落子点，AI 选择终局或停一手');
      state.currentTurn = 'black';
      updateProfilePanels();
      return;
    }

    // 6. 播放落子或吃子音效
    // 注意：这里的真实落子状态我们要通过重新触发一次或保存刚才的变量来确认吃子音效
    // 为了简化，再次读取棋盘或直接判定：如果全盘重绘前有最新的吃子动态，播放对应音频
    playSound('placeStone'); 

    // 7. 🌟 完美衔接：熔断上一手黑子闪烁，让 AI 最新的这颗白棋本体进入【频率闪烁流】
    clearBlink();
    startBlink(bestMove.r, bestMove.c, WHITE);

    // 8. 移交轮次还给玩家，重绘整个棋盘
    state.currentTurn = 'black';
    drawFullBoard();
    updateProfilePanels();
  }

  /**
   * 🟢 辅助工具函数：判断某个空位四周是否紧邻指定颜色的棋子
   */
  function hasNeighborColor(row, col, targetColor) {
    const DIRECTIONS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (let [dr, dc] of DIRECTIONS) {
      const nr = row + dr;
      const nc = col + dc;
      if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE) {
        if (state.board[nr][nc] === targetColor) {
          return true;
        }
      }
    }
    return false;
  }
  window.MP = {
    createRoom,
    joinRoom,
    leaveRoom,
    startAIGame, // 🟢 暴露单机 AI 启动接口给外部 game.js 调用  2026-05-17
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
