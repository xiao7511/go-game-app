/**
 * ============================================================================
 *  multiplayer-ext.js — 多人在线对战与房间邀请扩展
 * ============================================================================
 *
 *  约束: 不修改 game.js 源码。所有逻辑自包含。
 *
 *  功能:
 *    1. 房间管理 (createRoom / joinRoom)
 *    2. 动态 UI 注入 (创建对战 / 复制邀请链接 按钮)
 *    3. 棋盘操作拦截 (myColor 校验，防止操作对方棋子)
 *    4. Supabase Realtime 实时同步 (广播落子坐标)
 *    5. 身份识别 (黑棋 / 白棋)
 *    6. URL 参数自动加入 (?room=CODE)
 * ============================================================================
 */
(() => {
  'use strict';

  // ── 常量 ─────────────────────────────────────────────────────────
  const SIZE = 19;
  const EMPTY = 0, BLACK = 1, WHITE = 2;
  const ROOM_CODE_LENGTH = 6;

  // ── 音效映射 (与 game.js 一致) ────────────────────────────────────
  const SOUNDS = {
    placeStone: 'assets/sounds/button-22.mp3',
    capture:    'assets/sounds/button-21.mp3',
    invalidMove:'assets/sounds/button-12.mp3',
    yourTurn:   'assets/sounds/button-3.mp3',
    click:      'assets/sounds/button-25.mp3'
  };

  // ── 全局状态 ─────────────────────────────────────────────────────
  let supabase = null;          // Supabase 客户端 (扩展自有)
  let roomChannel = null;       // 房间专属 Realtime 通道
  let myColor = null;           // 'black' | 'white' | null (观战)
  let currentTurn = 'black';    // 当前轮到谁
  let roomCode = null;          // 当前房间 6 位码
  let isInRoom = false;         // 是否处于多人对局中
  let blackCaptures = 0;
  let whiteCaptures = 0;

  // 棋盘状态 (扩展维护的独立副本)
  let board = Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY));

  // Canvas 渲染参数 (从 canvas 尺寸计算)
  let canvas = null;
  let ctx = null;
  let padding = 0;
  let cellSize = 0;

  // BFS 方向
  const DIRECTIONS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  // ── 工具函数 ─────────────────────────────────────────────────────

  /** 生成 6 位随机房间码 (大写字母+数字) */
  function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 排除易混淆字符
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  /** 播放音效 (轻量 new Audio) */
  function playSound(name) {
    try {
      const url = SOUNDS[name];
      if (url) new Audio(url).play().catch(() => {});
    } catch (_) { /* 静默忽略 */ }
  }

  /** 获取当前登录用户 ID */
  async function getUserId() {
    if (!supabase) return null;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      return session?.user?.id || null;
    } catch (_) {
      return null;
    }
  }

  // ── Supabase 客户端初始化 ────────────────────────────────────────

  function initSupabaseClient() {
    const cfg = window.APP_CONFIG || {};
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
      console.warn('[multiplayer-ext] Supabase 配置缺失，多人模式不可用');
      return null;
    }
    if (!window.supabase || !window.supabase.createClient) {
      console.warn('[multiplayer-ext] Supabase CDN 未加载');
      return null;
    }
    supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    return supabase;
  }

  // ── 围棋规则 (自包含) ────────────────────────────────────────────

  /** BFS 计算棋串气数 */
  function bfsLiberties(startRow, startCol, color, boardState) {
    const queue = [[startRow, startCol]];
    const visited = new Set();
    visited.add(`${startRow},${startCol}`);
    const group = [];
    const countedLibs = new Set();
    let liberties = 0;

    while (queue.length) {
      const [r, c] = queue.shift();
      group.push([r, c]);
      for (const [dr, dc] of DIRECTIONS) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
        const key = `${nr},${nc}`;
        if (boardState[nr][nc] === EMPTY) {
          if (!countedLibs.has(key)) { countedLibs.add(key); liberties++; }
        } else if (boardState[nr][nc] === color && !visited.has(key)) {
          visited.add(key);
          queue.push([nr, nc]);
        }
      }
    }
    return { liberties, group };
  }

  /** 落子逻辑 (返回 { success, captured, capturedGroup, reason }) */
  function placeStone(row, col, color) {
    if (board[row][col] !== EMPTY) {
      return { success: false, reason: '该位置已有棋子' };
    }

    const opponent = color === BLACK ? WHITE : BLACK;
    board[row][col] = color;

    // 提走四周无气敌方棋串
    let totalCaptured = 0;
    const capturedList = [];
    for (const [dr, dc] of DIRECTIONS) {
      const nr = row + dr, nc = col + dc;
      if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && board[nr][nc] === opponent) {
        const { liberties, group } = bfsLiberties(nr, nc, opponent, board);
        if (liberties === 0) {
          for (const [r, c] of group) {
            capturedList.push([r, c]);
            board[r][c] = EMPTY;
          }
          totalCaptured += group.length;
        }
      }
    }

    // 自杀检测
    const { liberties: selfLibs } = bfsLiberties(row, col, color, board);
    if (selfLibs === 0) {
      board[row][col] = EMPTY;
      // 回滚提子
      for (const [r, c] of capturedList) board[r][c] = opponent;
      return { success: false, reason: '禁止自杀（无气）' };
    }

    if (color === BLACK) blackCaptures += totalCaptured;
    else whiteCaptures += totalCaptured;

  // 确保使用在函数开头定义的 totalCaptured
    return { success: true, captured: totalCaptured, capturedGroup: capturedList };
  }

  /** 切换回合 */
  function switchTurn() {
    currentTurn = currentTurn === 'black' ? 'white' : 'black';
    updateTurnUI();
  }

  function updateTurnUI() {
    const el = document.getElementById('currentPlayer');
    if (!el) return;
    if (myColor) {
      const isMine = currentTurn === myColor;
      el.textContent = isMine ? `${currentTurn === 'black' ? '黑棋' : '白棋'}（我方）` : `${currentTurn === 'black' ? '黑棋' : '白棋'}（对方）`;
    } else {
      el.textContent = currentTurn === 'black' ? '黑棋' : '白棋';
    }
    document.getElementById('blackCaptures').textContent = blackCaptures;
    document.getElementById('whiteCaptures').textContent = whiteCaptures;
  }

  // ── Canvas 渲染 ──────────────────────────────────────────────────

  function initCanvasParams() {
    canvas = document.getElementById('goBoard');
    if (!canvas) return false;
    ctx = canvas.getContext('2d');
    const size = canvas.width || canvas.clientWidth || 600;
    padding = size / (SIZE + 1);
    cellSize = (size - padding * 2) / (SIZE - 1);
    return true;
  }

  /** 全盘重绘 */
  function drawFullBoard() {
    if (!canvas || !ctx) return;
    const size = canvas.width;

    ctx.clearRect(0, 0, size, size);

    // 木质背景
    ctx.fillStyle = '#f3c17a';
    ctx.fillRect(0, 0, size, size);

    // 棋盘线
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    for (let i = 0; i < SIZE; i++) {
      const pos = padding + i * cellSize;
      ctx.beginPath();
      ctx.moveTo(padding, pos);
      ctx.lineTo(size - padding, pos);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pos, padding);
      ctx.lineTo(pos, size - padding);
      ctx.stroke();
    }

    // 星位
    const stars = [[3,3],[3,9],[3,15],[9,3],[9,9],[9,15],[15,3],[15,9],[15,15]];
    stars.forEach(([r, c]) => {
      ctx.beginPath();
      ctx.arc(padding + c * cellSize, padding + r * cellSize, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#333';
      ctx.fill();
    });

    // 棋子
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (board[r][c] !== EMPTY) drawStone(r, c, board[r][c]);
      }
    }
  }

  /** 绘制单颗棋子 */
  function drawStone(row, col, color) {
    if (!ctx) return;
    const cx = padding + col * cellSize;
    const cy = padding + row * cellSize;
    const radius = cellSize * 0.44;

    // 阴影
    ctx.beginPath();
    ctx.arc(cx + 1.5, cy + 1.5, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fill();

    // 棋子主体
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    if (color === BLACK) {
      const g = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.3, radius * 0.1, cx, cy, radius);
      g.addColorStop(0, '#555');
      g.addColorStop(1, '#111');
      ctx.fillStyle = g;
    } else {
      const g = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.3, radius * 0.1, cx, cy, radius);
      g.addColorStop(0, '#fff');
      g.addColorStop(1, '#bbb');
      ctx.fillStyle = g;
    }
    ctx.fill();

    // 高光
    ctx.beginPath();
    ctx.arc(cx - radius * 0.25, cy - radius * 0.25, radius * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fill();
  }

  /** 擦除单颗棋子 (重绘该交叉点背景) */
  function eraseStone(row, col) {
    if (!ctx) return;
    const cx = padding + col * cellSize;
    const cy = padding + row * cellSize;
    const r = cellSize * 0.5;

    // 用木质背景色覆盖
    ctx.fillStyle = '#f3c17a';
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

    // 重绘棋盘线交点
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    // 横线
    ctx.beginPath();
    ctx.moveTo(padding, cy);
    ctx.lineTo(canvas.width - padding, cy);
    ctx.stroke();
    // 竖线
    ctx.beginPath();
    ctx.moveTo(cx, padding);
    ctx.lineTo(cx, canvas.width - padding);
    ctx.stroke();

    // 星位检查
    const stars = [[3,3],[3,9],[3,15],[9,3],[9,9],[9,15],[15,3],[15,9],[15,15]];
    for (const [sr, sc] of stars) {
      if (sr === row && sc === col) {
        ctx.beginPath();
        ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#333';
        ctx.fill();
      }
    }
  }

  // ── 棋盘点击拦截 ─────────────────────────────────────────────────

  /** 拦截层: 在 capture 阶段校验 myColor 并阻止非法操作 */
  function canvasCaptureHandler(e) {
    if (!isInRoom) return; // 非多人模式，放行给 game.js 处理

    // 校验: 是否轮到我
    if (!myColor || currentTurn !== myColor) {
      e.stopPropagation();
      e.preventDefault();
      playSound('invalidMove');
      console.warn('[multiplayer-ext] 未轮到您落子');
      return;
    }

    // 阻止事件冒泡，由本扩展处理
    e.stopPropagation();
    e.preventDefault();

    // 坐标转换 (与 game.js 一致)
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;
    const col = Math.round((mouseX - padding) / cellSize);
    const row = Math.round((mouseY - padding) / cellSize);

    if (col < 0 || col >= SIZE || row < 0 || row >= SIZE) return;

    handleMultiplayerMove(row, col);
  }

  // ── 多人落子处理 ─────────────────────────────────────────────────

  async function handleMultiplayerMove(row, col) {
    const color = myColor === 'black' ? BLACK : WHITE;

    // 规则校验
    const result = placeStone(row, col, color);
    if (!result.success) {
      playSound('invalidMove');
      console.warn('[multiplayer-ext]', result.reason);
      return;
    }

    // 播放音效
    playSound(result.captured > 0 ? 'capture' : 'placeStone');

    // 渲染: 先快速画单子
    drawStone(row, col, color);
    // 擦除被提棋子
    if (result.capturedGroup) {
      for (const [r, c] of result.capturedGroup) {
        eraseStone(r, c);
      }
    }

    // 切换回合
    switchTurn();

    // 全盘重绘保证一致性
    requestAnimationFrame(() => drawFullBoard());

    // 广播给对手
    await broadcastMove(row, col, color, result.capturedGroup || []);
  }

  // ── Realtime 通道 ────────────────────────────────────────────────

  async function initRoomChannel(code) {
    if (!supabase) return null;

    const ch = supabase.channel(`room:${code}`, {
      config: { broadcast: { self: false } }
    });

    // 监听对手落子
    ch.on('broadcast', { event: 'move' }, ({ payload }) => {
      onOpponentMove(payload);
    });

    // 监听对手加入 / 离开
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState();
      const ids = Object.keys(state);
      console.log('[multiplayer-ext] 房间在线成员:', ids.length);
    });
    // 在 initRoomChannel 中增加[cite: 1, 2]
    ch.on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'game', // 务必匹配您的 schema
        table: 'game_rooms',
        filter: `code=eq.${code}` 
    }, payload => {
        if (payload.new.status === 'playing' && myColor === 'black') {
            console.log('对手已加入，对局开始！');
            // 可以触发一个“对局开始”的音效或 UI 提示
        }
    });

    await ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.track({ online: true });
        console.log('[multiplayer-ext] 已加入房间通道:', code);
      }
    });

    return ch;
  }

  /** 对手落子回调 */
  function onOpponentMove(payload) {
    const { row, col, color, captured } = payload;

    // 更新棋盘状态
    board[row][col] = color;
    if (captured && captured.length) {
      for (const [r, c] of captured) board[r][c] = EMPTY;
    }

    // 更新提子计数
    if (color === BLACK) blackCaptures += (captured?.length || 0);
    else whiteCaptures += (captured?.length || 0);

    // 渲染: 画对手的棋子
    drawStone(row, col, color);
    if (captured && captured.length) {
      for (const [r, c] of captured) eraseStone(r, c);
    }

    // 回合切换到己方
    currentTurn = myColor;
    updateTurnUI();
    playSound('yourTurn');

    // 全盘重绘
    requestAnimationFrame(() => drawFullBoard());
  }

  /** 广播落子 */
  async function broadcastMove(row, col, color, capturedList) {
    if (!roomChannel) return;
    await roomChannel.send({
      type: 'broadcast',
      event: 'move',
      payload: { row, col, color, captured: capturedList }
    });
  }

  // ── 房间管理 ─────────────────────────────────────────────────────

  /**
   * 创建房间: 在 game_rooms 表中插入记录，生成邀请链接
   */
  async function createRoom() {
    const userId = await getUserId();
    if (!userId) {
      alert('请先登录后再创建房间');
      window.location.href = 'login.html';
      return;
    }
    if (!supabase) {
      alert('Supabase 未配置，无法创建房间');
      return;
    }

    const code = generateRoomCode();

    try {
      const { error } = await supabase
        .schema('game') //指定特定的schema  
        .from('game_rooms')
        .insert({
          code: code,
          black_id: userId,
          white_id: null,
          status: 'waiting',
          board_state: JSON.stringify([]),
          next_turn: 'black',
          black_captures: 0,
          white_captures: 0
        });

      if (error) {
        // 如果表不存在，给出明确提示
        if (error.code === '42P01') {
          alert('game_rooms 表尚未创建。请在 Supabase SQL Editor 中执行迁移脚本。');
        } else {
          console.error('[multiplayer-ext] 创建房间失败:', error);
          alert('创建房间失败: ' + error.message);
        }
        return;
      }

      roomCode = code;
      myColor = 'black';
      currentTurn = 'black';
      isInRoom = true;

      // 初始化房间通道
      roomChannel = await initRoomChannel(code);

      // 构建邀请链接
      const inviteLink = `${window.location.origin}${window.location.pathname}?room=${code}`;

      // 显示房间信息
      showRoomUI(code, inviteLink);

      // 启动棋盘
      startMultiplayerGame();

      console.log('[multiplayer-ext] 房间创建成功:', code);
    } catch (err) {
      console.error('[multiplayer-ext] 创建房间异常:', err);
      alert('创建房间出错: ' + err.message);
    }
  }

  /**
   * 加入房间: 根据邀请码加入已有房间
   */
  async function joinRoom(code) {
    const userId = await getUserId();
    if (!userId) {
      alert('请先登录后再加入房间');
      window.location.href = 'login.html';
      return;
    }
    if (!supabase) {
      alert('Supabase 未配置，无法加入房间');
      return;
    }

    try {
      // 查询房间
      const { data: room, error } = await supabase
        .schema('game') //指定特定的schema
        .from('game_rooms')
        .select('*')
        .eq('code', code)
        .single();

      if (error || !room) {
        alert('房间不存在或已过期');
        return;
      }

      if (room.status !== 'waiting') {
        alert('该房间已开始对局或已结束');
        return;
      }

      if (room.black_id === userId) {
        // 自己是房主，直接进入
        myColor = 'black';
      } else if (!room.white_id) {
        // 以白棋身份加入
        const { error: updateErr } = await supabase
          .schema('game') //指定特定的schema
          .from('game_rooms')
          .update({ white_id: userId, status: 'playing' })
          .eq('code', code);

        if (updateErr) {
          alert('加入房间失败: ' + updateErr.message);
          return;
        }
        myColor = 'white';
      } else if (room.white_id === userId) {
        myColor = 'white';
      } else {
        alert('该房间已满');
        return;
      }

      roomCode = code;
      currentTurn = 'black';
      isInRoom = true;

      // 初始化房间通道
      roomChannel = await initRoomChannel(code);

      // 构建邀请链接
      const inviteLink = `${window.location.origin}${window.location.pathname}?room=${code}`;
      showRoomUI(code, inviteLink);

      // 启动棋盘
      startMultiplayerGame();

      console.log('[multiplayer-ext] 加入房间成功:', code, '身份:', myColor);
    } catch (err) {
      console.error('[multiplayer-ext] 加入房间异常:', err);
      alert('加入房间出错: ' + err.message);
    }
  }

  // ── 多人对局启动 ─────────────────────────────────────────────────

  function startMultiplayerGame() {
    // 切换到游戏界面
    const selection = document.getElementById('game-selection');
    const app = document.querySelector('.app');
    if (selection) selection.style.display = 'none';
    if (app) app.style.display = 'grid';

    // 初始化 Canvas
    canvas = document.getElementById('goBoard');
    if (!canvas) return;

    const parent = canvas.parentElement;
    const size = Math.min(parent.clientWidth, parent.clientHeight) || 600;
    canvas.width = size;
    canvas.height = size;

    if (!initCanvasParams()) return;

    // 重置棋盘状态
    board = Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY));
    blackCaptures = 0;
    whiteCaptures = 0;
    currentTurn = 'black';

    // 全盘绘制
    drawFullBoard();
    updateTurnUI();

    // 安装拦截器 (capture 阶段，优先级高于 game.js 的冒泡阶段监听)
    canvas.addEventListener('click', canvasCaptureHandler, { capture: true });

    // 显示当前身份
    const turnEl = document.getElementById('currentPlayer');
    if (turnEl) {
      turnEl.textContent = myColor === 'black' ? '黑棋（我方）' : '白棋（我方）';
    }

    console.log('[multiplayer-ext] 多人对局已启动, 身份:', myColor);
  }

  // ── UI 注入 ──────────────────────────────────────────────────────

  function showRoomUI(code, inviteLink) {
    let panel = document.getElementById('mp-room-panel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'mp-room-panel';
        document.body.appendChild(panel);
    }

    // 核心样式：在移动端移动到左下方
    const isMobile = window.innerWidth <= 768;
    
    panel.style.cssText = isMobile ? `
        position: fixed;
        bottom: 110px;        /* 距离底部一定高度，避开系统手势栏 */
        left: 16px;           /* 固定在左侧 */
        right: auto;
        z-index: 950;
        background: rgba(16, 24, 32, 0.85);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 12px;
        padding: 10px 14px;
        backdrop-filter: blur(8px);
        box-shadow: 0 4px 20px rgba(0,0,0,0.4);
        max-width: 200px;     /* 缩小宽度，减少存在感[cite: 1] */
    ` : `
        position: fixed;
        top: 60px;
        right: 16px;
        z-index: 950;
        background: rgba(16, 24, 32, 0.92);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 14px;
        padding: 14px 18px;
        color: #eef4fb;
        backdrop-filter: blur(10px);
        box-shadow: 0 8px 30px rgba(0,0,0,0.5);
        max-width: 280px;
    `;

    panel.innerHTML = `
      <div style="font-weight:bold;margin-bottom:6px;font-size:0.8rem;">
        🔗 房间: <span style="color:#f6c453;">${code}</span>
      </div>
      <div style="font-size:0.7rem;color:rgba(238,244,251,0.7);margin-bottom:8px;">
        身份: ${myColor === 'black' ? '⚫ 黑棋' : '⚪ 白棋'}
      </div>
      <button id="mp-copy-invite-btn" style="
        width:100%;padding:6px;border-radius:6px;border:none;
        background:#f6c453;color:#000;font-weight:bold;cursor:pointer;
        font-size:0.75rem;
      ">复制链接</button>
      <div id="mp-copy-toast" style="
        text-align:center;font-size:0.7rem;color:#4caf50;margin-top:4px;display:none;
      ">✅ 已复制</div>
    `;

    // 复制按钮事件
    document.getElementById('mp-copy-invite-btn').addEventListener('click', () => {
      navigator.clipboard.writeText(inviteLink).then(() => {
        const toast = document.getElementById('mp-copy-toast');
        if (toast) {
          toast.style.display = 'block';
          setTimeout(() => { toast.style.display = 'none'; }, 2000);
        }
      }).catch(() => {
        // fallback: 显示链接供手动复制
        prompt('请手动复制邀请链接:', inviteLink);
      });
    });
  }

  function injectUIButtons() {
    const card = document.querySelector('#game-selection .card');
    if (!card) return;

    // 避免重复注入
    if (document.getElementById('mp-create-room-btn')) return;

    // 分隔线
    const divider = document.createElement('div');
    divider.style.cssText = 'margin:10px 0;border-top:1px solid rgba(255,255,255,0.1);';

    // 按钮容器
    const btnContainer = document.createElement('div');
    btnContainer.style.cssText = 'display:flex;flex-direction:column;gap:10px;margin-top:10px;';

    // 创建对战按钮
    const createBtn = document.createElement('button');
    createBtn.id = 'mp-create-room-btn';
    createBtn.textContent = '🆚 创建对战房间';
    createBtn.style.cssText = `
      padding:12px 24px;border-radius:12px;border:none;font-weight:bold;
      cursor:pointer;transition:0.2s;background:#4caf50;color:#fff;font-size:1rem;
    `;
    createBtn.addEventListener('mouseenter', () => { createBtn.style.transform = 'translateY(-2px)'; createBtn.style.opacity = '0.9'; });
    createBtn.addEventListener('mouseleave', () => { createBtn.style.transform = ''; createBtn.style.opacity = '1'; });
    createBtn.addEventListener('click', createRoom);

    // 加入房间说明
    const joinHint = document.createElement('p');
    joinHint.style.cssText = 'font-size:0.75rem;color:rgba(238,244,251,0.5);margin:0;';
    joinHint.textContent = '收到邀请链接？直接打开即可自动加入';

    btnContainer.appendChild(createBtn);
    btnContainer.appendChild(joinHint);

    // 插入到 card 末尾
    card.appendChild(divider);
    card.appendChild(btnContainer);
  }

  // ── URL 参数处理 ─────────────────────────────────────────────────

  function checkRoomParam() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('room');
    if (code && code.length === ROOM_CODE_LENGTH) {
      console.log('[multiplayer-ext] 检测到房间邀请码:', code);
      // 延迟执行，等待 Supabase 初始化完成
      setTimeout(() => joinRoom(code.toUpperCase()), 500);
      return true;
    }
    return false;
  }

  // ── 清理函数 ─────────────────────────────────────────────────────

  function leaveRoom() {
    if (roomChannel) {
      roomChannel.untrack();
      supabase?.removeChannel(roomChannel);
      roomChannel = null;
    }
    if (canvas) {
      canvas.removeEventListener('click', canvasCaptureHandler, { capture: true });
    }
    isInRoom = false;
    roomCode = null;
    myColor = null;
    const panel = document.getElementById('mp-room-panel');
    if (panel) panel.remove();
    console.log('[multiplayer-ext] 已退出房间');
  }

  // 监听退出按钮
  function hookQuitButton() {
    const quitBtn = document.getElementById('quit-game-btn');
    if (quitBtn) {
      quitBtn.addEventListener('click', () => {
        if (isInRoom) leaveRoom();
      });
    }
  }

  // ── 启动入口 ─────────────────────────────────────────────────────

  function init() {
    // 初始化 Supabase
    initSupabaseClient();

    // 注入 UI 按钮
    injectUIButtons();

    // 检查 URL 房间参数
    const hasRoomParam = checkRoomParam();

    // 监听退出按钮
    hookQuitButton();

    // 如果没有房间参数，确保退出按钮也能清理
    const quitBtn = document.getElementById('quit-game-btn');
    if (quitBtn) {
      const origClick = quitBtn.onclick;
      quitBtn.addEventListener('click', () => {
        if (isInRoom) leaveRoom();
      });
    }

    console.log('[multiplayer-ext] 多人扩展已加载', hasRoomParam ? '(检测到房间邀请)' : '');
  }

  // DOM 就绪后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── 暴露 API 到全局作用域 (供调试/外部调用) ──────────────────────
  window.MP = {
    createRoom,
    joinRoom,
    leaveRoom,
    getRoomCode: () => roomCode,
    getMyColor: () => myColor,
    isInRoom: () => isInRoom
  };

})();
