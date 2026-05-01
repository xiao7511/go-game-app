(() => {
  // 确保这段代码只在全局出现一次
  
  // 任务 1 的新逻辑
 async function checkUser() {
      // 通过你后面定义的函数获取实例
      const client = getSupabaseClient(); 
      
      if (!client) {
          console.error("Supabase 配置缺失！");
          return;
      }

      const { data: { session } } = await client.auth.getSession();
      if (!session) {
          // 既然你现在有了独立的 login.html，建议跳转到 login.html
          window.location.href = 'login.html'; 
      } else {
          console.log("已登录:", session.user.email);
          // 初始化棋盘逻辑...
      }
  }
  checkUser();

  // --- 1. 配置与状态 ---
  const AUTH_OVERLAY_ID='***';
  
  /**
   * Supabase 客户端单例（懒初始化）
   * 首次调用时从 window.APP_CONFIG 读取凭据并创建客户端。
   * 后续调用直接返回缓存的实例。
   * @returns {object|null} Supabase 客户端或 null（配置缺失时）
   */
  let _supabaseInstance = undefined; // undefined = 尚未初始化, null = 初始化但配置缺失
  function getSupabaseClient() {
    if (_supabaseInstance !== undefined) {
      return _supabaseInstance;
    }

    const url = (window.APP_CONFIG?.SUPABASE_URL || '').trim();
    const key = (window.APP_CONFIG?.SUPABASE_ANON_KEY || '').trim();

    if (!url || !key) {
      console.warn(
        '[game.js] Supabase 配置缺失。' +
        '本地开发请创建 config.local.js（参考 .env.example）。' +
        '将以离线模式运行。'
      );
      _supabaseInstance = null;
      return null;
    }

    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      console.error('[game.js] Supabase CDN 脚本未加载。请检查 index.html 中 supabase-js CDN 引用。');
      _supabaseInstance = null;
      return null;
    }

    try {
      _supabaseInstance = window.supabase.createClient(url, key);
      console.log('[game.js] Supabase 客户端初始化成功');
    } catch (err) {
      console.error('[game.js] Supabase 客户端创建失败:', err);
      _supabaseInstance = null;
    }

    return _supabaseInstance;
  }

  // 向后兼容的别名
  const supabaseClient = getSupabaseClient();


  const SIZE = 19;
  const EMPTY = 0, BLACK = 1, WHITE = 2;
  
  let isLoggedIn = false;
  let currentPlayer = BLACK;
  let blackCaptures = 0;
  let whiteCaptures = 0;
  
  // 棋盘状态：19x19 二维数组
  let board = Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY));
  
  // 动画锁：防止动画期间重复落子
  let animating = false;
  
  // BFS 方向偏移量（上、下、左、右）
  const DIRECTIONS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  
  /**
   * BFS 检测指定位置棋串的气数 (Liberties)
   * @param {number} startRow - 起始行
   * @param {number} startCol - 起始列
   * @param {number} color - 棋子颜色 (BLACK/WHITE)
   * @param {Array<Array<number>>} boardState - 棋盘状态（可选，默认使用全局 board）
   * @returns {{ liberties: number, group: Array<[number, number]> }} 气数和棋串坐标
   */
  function bfsCheckLiberties(startRow, startCol, color, boardState = board) {
    const queue = [[startRow, startCol]];
    const visited = new Set();
    visited.add(`${startRow},${startCol}`);
    const group = [];
    let liberties = 0;
    const countedLiberties = new Set();
    
    while (queue.length > 0) {
      const [r, c] = queue.shift();
      group.push([r, c]);
      
      for (const [dr, dc] of DIRECTIONS) {
        const nr = r + dr;
        const nc = c + dc;
        const key = `${nr},${nc}`;
        
        // 边界检查
        if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
        
        if (boardState[nr][nc] === EMPTY) {
          // 遇到空点，计为气（去重）
          if (!countedLiberties.has(key)) {
            countedLiberties.add(key);
            liberties++;
          }
        } else if (boardState[nr][nc] === color && !visited.has(key)) {
          // 遇到同色棋子，加入 BFS 队列
          visited.add(key);
          queue.push([nr, nc]);
        }
        // 遇到敌方棋子不处理（跳过）
      }
    }
    
    return { liberties, group };
  }
  
  /**
   * 在棋盘上落子并检测提子
   * @param {number} row
   * @param {number} col
   * @returns {{ success: boolean, captured: number, reason?: string }}
   */
  function placeStone(row, col) {
    // 检查位置是否为空
    if (board[row][col] !== EMPTY) {
      return { success: false, captured: 0, reason: '该位置已有棋子' };
    }
    
    const color = currentPlayer;
    const opponent = color === BLACK ? WHITE : BLACK;
    
    // 1. 临时落子
    board[row][col] = color;
    
    // 2. 先检查四周敌方棋子的气，执行提子
    let totalCaptured = 0;
    let capturedList = [];  // 记录被提坐标（供 broadcast 使用）
    for (const [dr, dc] of DIRECTIONS) {
      const nr = row + dr;
      const nc = col + dc;
      if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && board[nr][nc] === opponent) {
        const { liberties, group } = bfsCheckLiberties(nr, nc, opponent);
        if (liberties === 0) {
          // 气数为 0，移除该棋串
          for (const [r, c] of group) {
            capturedList.push([r, c]);
            board[r][c] = EMPTY;
          }
          totalCaptured += group.length;
        }
      }
    }
    
    // 3. 检查自己的棋串是否有气（防止自杀）
    const { liberties: selfLiberties } = bfsCheckLiberties(row, col, color);
    if (selfLiberties === 0) {
      // 自杀手，回滚落子
      board[row][col] = EMPTY;
      // 同时回滚已提的敌方棋子
      // 注：完整回滚较复杂，此处禁止自杀手
      return { success: false, captured: 0, reason: '禁止自杀（该落子无气）' };
    }
    
    // 4. 更新捕获计数
    if (color === BLACK) {
      blackCaptures += totalCaptured;
    } else {
      whiteCaptures += totalCaptured;
    }
    
    return { success: true, captured: totalCaptured, capturedGroup: capturedList };
  }
  
  // 音效资源 — 映射到实际文件
  const SOUNDS = {
    click: 'assets/sounds/button-25.mp3',
    placeStone: 'assets/sounds/button-22.mp3',
    yourTurn: 'assets/sounds/button-3.mp3',
    invalidMove: 'assets/sounds/button-12.mp3',
    capture: 'assets/sounds/button-21.mp3'
  };

  function playSound(name) {
    const url = SOUNDS[name];
    if (!url) return;
    try { new Audio(url).play(); } catch (e) { /* 静默失败 */ }
  }

  // --- 3. UI 切换逻辑 ---
 function applyImmersiveState(inGame) {
    document.body.classList.toggle('is-immersive', inGame);
    const shell = document.querySelector('.board-shell');
    if (shell) {
        shell.style.display = inGame ? 'flex' : 'none';
        shell.classList.toggle('is-active', inGame);
    }
    // 增加判断
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
        sidebar.style.display = inGame ? (window.innerWidth > 768 ? 'grid' : 'none') : 'none';
    }
}


  function setLoggedIn(loggedIn) {
    isLoggedIn = loggedIn;
    const selection = document.getElementById('game-selection');
    const app = document.querySelector('.app');
    
    if (loggedIn) {
      // 隐藏登录，显示游戏选项
      document.getElementById(AUTH_OVERLAY_ID)?.remove();
      if (selection) selection.style.display = 'flex';
      app.style.display = 'none'; 
    } else {
      // 显示登录弹窗逻辑（此处略去具体的 ensureAuthOverlay 绘图）
      console.log("请登录");
    }
  }

  // --- 4. 核心游戏逻辑 ---

  // Supabase 实时通道（broadcast 落子坐标 / presence 同步回合）
  let channel = null;
  let myColor = null;           // BLACK 或 WHITE，由 presence join 顺序决定

  async function initRealtime() {
    const client = getSupabaseClient();
    if (!client) {
      // 离线模式：允许立刻落子（默认执黑）
      myColor = BLACK;
      return;
    }

    channel = client.channel('go-game-room', {
      config: { broadcast: { self: false }, presence: { key: '' } }
    });

    // 监听对手落子
    channel.on('broadcast', { event: 'move' }, ({ payload }) => {
      if (payload.color !== myColor) {
        board[payload.row][payload.col] = payload.color;
        if (payload.captured && payload.captured.length) {
          for (const [r, c] of payload.captured) board[r][c] = EMPTY;
        }
        if (payload.color === BLACK) blackCaptures += payload.captured?.length || 0;
        else whiteCaptures += payload.captured?.length || 0;
        currentPlayer = myColor;
        drawBoard();
        updateUI();
        new Audio(SOUNDS[payload.captured?.length ? 'capture' : 'placeStone']).play();
      }
    });

    // Presence：首个加入者执黑，次个执白
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const ids = Object.keys(state);
      myColor = ids[0] === channel.memberId ? BLACK : WHITE;
      const turnEl = document.getElementById('currentPlayer');
      if (turnEl) turnEl.textContent = myColor === BLACK ? '黑棋（我方）' : '白棋（我方）';
    });

    await channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ online: true });
      }
    });
  }

  async function broadcastMove(row, col, color, capturedList) {
    if (!channel) return;
    await channel.send({
      type: 'broadcast',
      event: 'move',
      payload: { row, col, color, captured: capturedList }
    });
  }

  function updateUI() {
    const turnEl = document.getElementById('currentPlayer');
    if (turnEl) turnEl.textContent = currentPlayer === BLACK ? '黑棋' : '白棋';
    const blackCapEl = document.getElementById('blackCaptures');
    if (blackCapEl) blackCapEl.textContent = blackCaptures;
    const whiteCapEl = document.getElementById('whiteCaptures');
    if (whiteCapEl) whiteCapEl.textContent = whiteCaptures;
  }

  function handlePlaceStone(row, col) {
    // 回合守卫：仅当前颜色可落子
    if (myColor !== null && currentPlayer !== myColor) {
      new Audio(SOUNDS.invalidMove).play();
      return;
    }
    // 动画锁检查：防止动画期间重复落子
    if (animating) return;
    
    const result = placeStone(row, col);
    
    if (result.success) {
      // 锁定动画：添加 CSS class 触发 pointer-events: none
      animating = true;
      if (canvas) canvas.classList.add('animating');
      new Audio(SOUNDS[result.captured > 0 ? 'capture' : 'placeStone']).play();
      
      // 重绘棋盘（含 transition 效果由 CSS 控制）
      drawBoard();
      
      // 切换选手
      const prevColor = currentPlayer;
      currentPlayer = currentPlayer === BLACK ? WHITE : BLACK;
      updateUI();
      
      // 同步坐标到对手
      broadcastMove(row, col, prevColor, result.capturedGroup || null);

      // 解锁动画（300ms 后，配合 CSS transition 时长）
      setTimeout(() => {
        animating = false;
        if (canvas) canvas.classList.remove('animating');
        new Audio(SOUNDS.yourTurn).play();
      }, 300);
    } else {
      new Audio(SOUNDS.invalidMove).play();
    }
  }

  // Canvas 引用（全局用于重绘）
  let canvas = null;
  let ctx = null;
  let cellSize = 0;
  let padding = 0;

  function drawBoard() {
    if (!canvas || !ctx) return;
    const size = canvas.width;
    const currentPadding = padding;
    const currentCellSize = cellSize;

    ctx.clearRect(0, 0, size, size);

    // 1. 木质背景
    ctx.fillStyle = '#f3c17a';
    ctx.fillRect(0, 0, size, size);

    // 2. 棋盘线
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    for (let i = 0; i < SIZE; i++) {
      const pos = currentPadding + i * currentCellSize;
      // 横线
      ctx.beginPath();
      ctx.moveTo(currentPadding, pos);
      ctx.lineTo(size - currentPadding, pos);
      ctx.stroke();
      // 竖线
      ctx.beginPath();
      ctx.moveTo(pos, currentPadding);
      ctx.lineTo(pos, size - currentPadding);
      ctx.stroke();
    }

    // 3. 星位
    const starPoints = SIZE === 19 ? [
      [3, 3], [3, 9], [3, 15],
      [9, 3], [9, 9], [9, 15],
      [15, 3], [15, 9], [15, 15]
    ] : [];
    starPoints.forEach(([row, col]) => {
      ctx.beginPath();
      ctx.arc(currentPadding + col * currentCellSize, currentPadding + row * currentCellSize, 4, 0, 2 * Math.PI);
      ctx.fillStyle = '#333';
      ctx.fill();
    });

    // 4. 绘制棋子（带 transition 效果由 CSS 控制，此处仅渲染当前状态）
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (board[r][c] !== EMPTY) {
          const cx = currentPadding + c * currentCellSize;
          const cy = currentPadding + r * currentCellSize;
          const radius = currentCellSize * 0.44;

          // 阴影
          ctx.beginPath();
          ctx.arc(cx + 1.5, cy + 1.5, radius, 0, 2 * Math.PI);
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.fill();

          // 棋子
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
          if (board[r][c] === BLACK) {
            const gradient = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.3, radius * 0.1, cx, cy, radius);
            gradient.addColorStop(0, '#555');
            gradient.addColorStop(1, '#111');
            ctx.fillStyle = gradient;
          } else {
            const gradient = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.3, radius * 0.1, cx, cy, radius);
            gradient.addColorStop(0, '#fff');
            gradient.addColorStop(1, '#bbb');
            ctx.fillStyle = gradient;
          }
          ctx.fill();

          // 高光
          ctx.beginPath();
          ctx.arc(cx - radius * 0.25, cy - radius * 0.25, radius * 0.3, 0, 2 * Math.PI);
          ctx.fillStyle = 'rgba(255,255,255,0.15)';
          ctx.fill();
        }
      }
    }
  }

  function initGame() {
    canvas = document.getElementById('goBoard');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    // 1. 确保父容器已显示，否则获取不到宽度
    const parent = canvas.parentElement;
    const size = Math.min(parent.clientWidth, parent.clientHeight) || 600;
    canvas.width = size;
    canvas.height = size;

    // 2. 核心参数：间距和边距
    padding = size / (SIZE + 1);
    cellSize = (size - padding * 2) / (SIZE - 1);

    // 初始绘制
    drawBoard();

    // 初始化 Supabase 实时同步
    initRealtime();

    // 3. Canvas 点击事件：坐标转换并落子
    canvas.addEventListener('click', (e) => {
      if (animating) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const mouseX = (e.clientX - rect.left) * scaleX;
      const mouseY = (e.clientY - rect.top) * scaleY;

      const col = Math.round((mouseX - padding) / cellSize);
      const row = Math.round((mouseY - padding) / cellSize);

      if (col >= 0 && col < SIZE && row >= 0 && row < SIZE) {
        handlePlaceStone(row, col);
      }
    });
  }


  // --- 5. 事件绑定 ---
  function initEventListeners() {

    // 围棋按钮点击：进入游戏
    document.getElementById('go-game-btn')?.addEventListener('click', async () => {
        playSound('click');
        
        // 1. 切换 UI 状态
        document.getElementById('game-selection').style.display = 'none';
        const app = document.querySelector('.app');
        if (app) app.style.display = 'grid'; // 先显示容器
        
        applyImmersiveState(true);
        updateUI();

        // 2. 重要：显示容器后立即初始化棋盘
        // 使用 requestAnimationFrame 确保浏览器已经完成了 DOM 渲染
        requestAnimationFrame(() => {
            initGame();
        });
    });

    // 退出按钮点击：返回选项
    document.getElementById('quit-game-btn')?.addEventListener('click', () => {
      if (confirm('确定要退出当前对局吗？')) {
        applyImmersiveState(false);
        document.querySelector('.app').style.display = 'none';
        document.getElementById('game-selection').style.display = 'flex';
      }
    });
  }

  // 初始化执行
  window.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    // 保持 false，这样页面刷新后会先显示你截图中的“在线游戏 Pro”登录卡片
    setLoggedIn(false); 
  });

})();
