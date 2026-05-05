(() => {
  // 确保这段代码只在全局出现一次

  // --- 1. 配置与状态 ---
  const AUTH_OVERLAY_ID='***';
  /**
   * Supabase 客户端单例（懒初始化）
   * 首次调用时从 window.APP_CONFIG 读取凭据并创建客户端。
   * 后续调用直接返回缓存的实例。
   * @returns {object|null} Supabase 客户端或 null（配置缺失时）
   */
  // 优化后的定义方式
  let supabaseInstance = null; // 顶层定义变量

  function getSupabaseClient() {
      // 如果已经有实例，直接返回，不再重新创建或执行逻辑
      if (supabaseInstance) return supabaseInstance; 

      const { createClient } = window.supabase; 
      if (window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
          // 创建唯一实例[cite: 2]
          supabaseInstance = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY); 
      }
      return supabaseInstance;
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
  let gameEnded = false;
  let latestMove = null;
  let latestMoveFlash = true;
  let latestMoveTimer = null;
  let resizeObserver = null;
  let canvasResizeRaf = null;
  let boardClickHandler = null;
  let roomContext = {
    roomId: null,
    inviteLink: '',
    isOnline: false,
    localSide: null,
    opponentSide: null,
    connectionLabel: '未建立',
    surrenderPending: false,
  };
  
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

  // 确保在全局作用域定义变量
let audioCtx = null;
const buffers = {};

async function initAudio() {
    // 如果已经初始化则跳过
    if (audioCtx) return;

    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();

        // 这里的 sounds 对象应包含你的音频 URL 列表
        for (const [name, url] of Object.entries(SOUNDS)) {
            const res = await fetch(url);
            const arrayBuffer = await res.arrayBuffer();
            buffers[name] = await audioCtx.decodeAudioData(arrayBuffer);
        }
    } catch (err) {
        console.error('音频引擎初始化失败:', err);
    }
}

  // 优化后的音效播放逻辑
function playSound(name) {
    if (!audioCtx || !buffers[name]) return;
    const source = audioCtx.createBufferSource();
    source.buffer = buffers[name];
    // 使用 gainNode 控制音量，避免声音重叠时的爆音
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = 0.5; 
    source.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    source.start(0);
}
const playEffect = playSound;
  // --- 3. UI 切换逻辑 ---
  function applyImmersiveState(inGame) {
    document.body.classList.toggle('is-immersive', inGame);
    const shell = document.querySelector('.board-shell');
    if (shell) {
        shell.style.display = inGame ? 'flex' : 'none';
        shell.classList.toggle('is-active', inGame);
    }
    const layout = document.querySelector('.layout');
    if (layout) {
        layout.style.display = inGame ? 'grid' : 'none';
    }
    const topbar = document.querySelector('.topbar');
    if (topbar) {
        topbar.style.display = inGame ? 'grid' : 'none';
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
      roomContext.localSide = 'black';
      roomContext.opponentSide = 'white';
      roomContext.isOnline = false;
      setConnectionStatus('离线模式', false);
      updateUI();
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
        latestMove = { row: payload.row, col: payload.col, color: payload.color };
        latestMoveFlash = true;
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
      roomContext.localSide = normalizeSide(myColor);
      roomContext.opponentSide = getOpponentSide(roomContext.localSide);
      roomContext.isOnline = true;
      setConnectionStatus('实时同步中', true);
      const turnEl = document.getElementById('currentPlayer');
      if (turnEl) turnEl.textContent = myColor === BLACK ? '黑棋（我方）' : '白棋（我方）';
      updateUI();
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
    roomContext.connectionLabel = '已同步';
    setConnectionStatus('已同步', true);
  }

  function normalizeSide(side) {
    if (side === BLACK || side === 'black' || side === 1) return 'black';
    if (side === WHITE || side === 'white' || side === 2) return 'white';
    return null;
  }

  function sideLabel(side) {
    const normalized = normalizeSide(side);
    return normalized === 'black' ? '黑棋' : normalized === 'white' ? '白棋' : '—';
  }

  function getOpponentSide(side = roomContext.localSide || myColor) {
    const normalized = normalizeSide(side);
    if (normalized === 'black') return 'white';
    if (normalized === 'white') return 'black';
    return null;
  }

  function showToast(message, duration = 2400) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => toast.classList.remove('is-visible'), duration);
  }

  function setConnectionStatus(label, isOnline = roomContext.isOnline) {
    roomContext.connectionLabel = label;
    const connectionEl = document.getElementById('connection-summary');
    if (connectionEl) connectionEl.textContent = label;
    const pill = document.getElementById('room-status-pill');
    if (pill) {
      pill.textContent = isOnline ? '进行中' : '待连接';
      pill.classList.toggle('offline', !isOnline);
    }
  }

  function updateRoomPanel() {
    const roomIdEl = document.getElementById('room-id');
    const linkEl = document.getElementById('room-invite-link');
    const localSideEl = document.getElementById('local-player-side');
    const localTurnEl = document.getElementById('local-player-turn');
    const opponentSideEl = document.getElementById('opponent-side');
    const opponentActivityEl = document.getElementById('opponent-activity');
    const turnSummaryEl = document.getElementById('turn-summary');

    if (roomIdEl) roomIdEl.textContent = roomContext.roomId || '—';
    if (linkEl) linkEl.value = roomContext.inviteLink || '';
    if (localSideEl) localSideEl.textContent = `执色：${sideLabel(roomContext.localSide)}`;
    if (opponentSideEl) opponentSideEl.textContent = `执色：${sideLabel(roomContext.opponentSide || getOpponentSide(roomContext.localSide))}`;
    if (localTurnEl) localTurnEl.textContent = roomContext.isOnline ? `状态：${currentPlayer === roomContext.localSide ? '轮到我方' : '等待对手'}` : '状态：单机/未入房';
    if (opponentActivityEl) opponentActivityEl.textContent = roomContext.isOnline ? '状态：实时同步中' : '状态：等待加入';
    if (turnSummaryEl) turnSummaryEl.textContent = `${sideLabel(currentPlayer)}回合`;
  }

  function updatePlayerProfilePanel() {
    const avatar = document.getElementById('user-avatar');
    const nickname = document.getElementById('user-nickname');
    const rank = document.getElementById('user-rank');
    if (!avatar) return;

    const info = sessionStorage.getItem('userInfo');
    if (info) {
      try {
        const u = JSON.parse(info);
        if (u.avatar) avatar.src = u.avatar;
        nickname && (nickname.textContent = u.nickname || '棋手');
        rank && (rank.textContent = u.rank || '业余1段');
      } catch (err) {
        console.warn('解析用户信息失败', err);
      }
    }
  }

  function updateLatestMoveIndicator() {
    const localTurnEl = document.getElementById('local-player-turn');
    if (latestMove && localTurnEl) {
      localTurnEl.textContent = `状态：最新落子 ${sideLabel(latestMove.color)} ${latestMove.row + 1}行${latestMove.col + 1}列${latestMoveFlash ? ' · 闪烁中' : ''}`;
    }
  }

  function updateUI() {
    const turnEl = document.getElementById('currentPlayer');
    if (turnEl) turnEl.textContent = sideLabel(currentPlayer);
    const blackCapEl = document.getElementById('blackCaptures');
    if (blackCapEl) blackCapEl.textContent = blackCaptures;
    const whiteCapEl = document.getElementById('whiteCaptures');
    if (whiteCapEl) whiteCapEl.textContent = whiteCaptures;
    updateRoomPanel();
    updatePlayerProfilePanel();
    const turnSummaryEl = document.getElementById('turn-summary');
    if (turnSummaryEl) turnSummaryEl.textContent = `${sideLabel(currentPlayer)}回合`;
  }

  /**
   * 轻量化渲染单颗棋子
   * @param {number} row - 棋盘行索引 (0-18)
   * @param {number} col - 棋盘列索引 (0-18)
   * @param {number} color - 棋子颜色 (1为黑, 2为白)
   */
  function renderSingleStone(row, col, color) {
    // 1. 获取 Canvas 元素和上下文
    const canvas = document.getElementById('chessCanvas'); 
    if (!canvas) {
      console.error("未找到 ID 为 chessCanvas 的画布元素");
      return;
    }
    const ctx = canvas.getContext('2d');

    // 2. 坐标转换逻辑
    // 假设你的网格大小 GRID_SIZE 和边距 PADDING 已在全局定义
    // 如果未定义，请在配置区添加：const GRID_SIZE = 30, PADDING = 20;
    const x = col * GRID_SIZE + PADDING; 
    const y = row * GRID_SIZE + PADDING;
    const radius = GRID_SIZE * 0.45; // 棋子半径稍小于格子的一半

    // 3. 执行绘制
    ctx.save(); // 保存当前状态
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);

    // 设置棋子颜色[cite: 2]
    if (color === BLACK) {
      // 黑色棋子：可以使用渐变增强立体感[cite: 2]
      const grad = ctx.createRadialGradient(x - radius/3, y - radius/3, radius/10, x, y, radius);
      grad.addColorStop(0, '#555');
      grad.addColorStop(1, '#000');
      ctx.fillStyle = grad;
    } else {
      // 白色棋子[cite: 2]
      const grad = ctx.createRadialGradient(x - radius/3, y - radius/3, radius/10, x, y, radius);
      grad.addColorStop(0, '#fff');
      grad.addColorStop(1, '#ccc');
      ctx.fillStyle = grad;
      // 为白棋添加浅灰色描边，防止在浅色背景下看不见[cite: 2]
      ctx.strokeStyle = '#999';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.fill();
    ctx.closePath();
    ctx.restore(); // 恢复状态

    console.log(`已在像素坐标 (${x.toFixed(1)}, ${y.toFixed(1)}) 渲染${color === BLACK ? '黑' : '白'}子`);
  }


    /**
   * 优化后的落子处理函数
   * @param {number} row - 行索引
   * @param {number} col - 列索引
   */
  async function handlePlaceStone(row, col) {
    // 调试日志：确保类型一致
    console.log(`[逻辑检查] 玩家身份: ${myColor}, 当前回合: ${currentPlayer}`);
    // 1. 使用强制类型转换，防止 "1" !== 1 的情况发生
    const isMyTurn = myColor === null || Number(myColor) === Number(currentPlayer);
    if (!isMyTurn) {
        console.warn("未轮到你落子");
        playEffect('invalidMove');
        return;
    }

    // 2. 防止动画期间重复点击
    if (animating) return;

    // 2. 逻辑层校验：调用具体的围棋/掼蛋规则
    const result = placeStone(row, col); 
    
    if (!result.success) {
      playEffect('invalidMove');
      return;
    }

    // 3. 锁定状态，开启“快路径”渲染
    animating = true;
    const prevColor = currentPlayer; // 记录当前落子颜色
    latestMove = { row, col, color: prevColor };
    latestMoveFlash = true;

    // 立即播放音效，提升响应感知
    playEffect(result.captured > 0 ? 'capture' : 'placeStone'); 

    // 4. 关键：局部渲染，让玩家瞬间看到棋子
    // 不等 drawBoard，直接在 Canvas 上画一颗子
    renderSingleStone(row, col, prevColor); 

    // 5. 状态平滑切换
    currentPlayer = (currentPlayer === BLACK) ? WHITE : BLACK;
    updateUI();

    // 6. 异步处理“重活”：数据广播与全盘重绘
    requestAnimationFrame(() => {
      // 确保底层数据同步后再重绘，防止棋子被“擦除”
      drawBoard(); 
      
      // 广播数据给后端或对手
      broadcastMove(row, col, prevColor, result.capturedGroup || null);

      // 缩短冷却期：150ms 即可解锁下次操作，手感更爽快
      setTimeout(() => {
        animating = false;
        // 轮到对方时，轻声提醒
        if (currentPlayer === myColor) {
          playEffect('yourTurn');
        }
      }, 150); 
    });
  }

  /**
 * 计算胜负并返回结果
 * @param {Array} board - 二维数组，0代表空，1代表黑子，2代表白子
 * @param {Number} blackTerritory - 黑棋围住的空点数
 * @param {Number} whiteTerritory - 白棋围住的空点数
 */
function judgeWinner(board, blackTerritory, whiteTerritory) {
    let blackStones = 0;
    let whiteStones = 0;

    // 1. 统计棋盘上的子数
    board.forEach(row => {
        row.forEach(cell => {
            if (cell === 1) blackStones++;
            if (cell === 2) whiteStones++;
        });
    });

    // 2. 中国规则数子：子数 + 围地
    const blackTotal = blackStones + blackTerritory;
    const whiteTotal = whiteStones + whiteTerritory;

    // 3. 贴子计算 (中国规则黑棋贴3.75子)
    const komi = 3.75;
    const finalResult = blackTotal - (180.5 + komi); 

    let resultMsg = "";
    if (finalResult > 0) {
        resultMsg = `🎊 恭喜黑方胜出！\n黑棋总子数：${blackTotal}\n超过184.25子，胜 ${finalResult} 子。`;
    } else {
        resultMsg = `🎊 恭喜白方胜出！\n白棋总数：${whiteTotal}\n超过176.75子，胜 ${Math.abs(finalResult)} 子。`;
    }

    return {
        winner: finalResult > 0 ? "黑方" : "白方",
        message: resultMsg + "\n胜败乃兵家常事，失败方也要加油哦！"
    };
  }

  function onGameEnd(board, bT, wT) {
    const result = judgeWinner(board, bT, wT);
    gameEnded = true;
    if (latestMoveTimer) {
      clearInterval(latestMoveTimer);
      latestMoveTimer = null;
    }
    
    // 使用简单的原生弹窗，或者自定义 HTML 模态框
    const alertBox = document.createElement('div');
    alertBox.style = "position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); background:white; padding:20px; border-radius:10px; box-shadow:0 0 10px rgba(0,0,0,0.5); z-index:1000; text-align:center;";
    alertBox.innerHTML = `
        <h2 style="color:#d32f2f;">游戏结束</h2>
        <p style="white-space:pre-line;">${result.message}</p>
        <button onclick="location.reload()" style="padding:10px 20px; cursor:pointer;">再来一局</button>
    `;
    document.body.appendChild(alertBox);
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

    // 4. 绘制棋子（带最新落子闪烁效果）
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (board[r][c] !== EMPTY) {
          const isLatestMove = latestMove && latestMove.row === r && latestMove.col === c;
          if (isLatestMove && !latestMoveFlash) continue;
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

    if (latestMove) {
      const { row, col } = latestMove;
      const cx = currentPadding + col * currentCellSize;
      const cy = currentPadding + row * currentCellSize;
      const pulse = Math.abs(Math.sin(Date.now() / 220));
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, currentCellSize * (0.52 + pulse * 0.08), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(246, 196, 83, ${0.42 + pulse * 0.35})`;
      ctx.lineWidth = 2 + pulse * 2;
      ctx.stroke();
      ctx.restore();
    }
  }

  function initGame() {
    canvas = document.getElementById('goBoard');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    // 1. 确保父容器已显示，否则获取不到宽度
    const shell = canvas.parentElement;
    const boardZone = document.querySelector('.board-zone');
    const availableWidth = shell?.clientWidth || boardZone?.clientWidth || 600;
    const availableHeight = Math.max(360, (window.innerHeight || 720) - 170);
    const size = Math.max(320, Math.floor(Math.min(availableWidth, availableHeight)));
    canvas.width = size;
    canvas.height = size;

    // 2. 核心参数：间距和边距
    padding = size / (SIZE + 1);
    cellSize = (size - padding * 2) / (SIZE - 1);

    // 1.5 最新落子闪烁控制
    if (latestMoveTimer) clearInterval(latestMoveTimer);
    latestMoveTimer = setInterval(() => {
      if (!latestMove) return;
      latestMoveFlash = !latestMoveFlash;
      drawBoard();
    }, 280);

    // 初始绘制
    drawBoard();

    // 初始化 Supabase 实时同步
    initRealtime();

    // 3. Canvas 点击事件：坐标转换并落子
    if (boardClickHandler) {
      canvas.removeEventListener('click', boardClickHandler);
    }
    boardClickHandler = (e) => {
      if (animating || gameEnded) return;
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
    };
    canvas.addEventListener('click', boardClickHandler);

    if (!resizeObserver && 'ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(() => {
        if (canvasResizeRaf) cancelAnimationFrame(canvasResizeRaf);
        canvasResizeRaf = requestAnimationFrame(() => {
          if (!canvas || !canvas.parentElement) return;
          const nextAvailableWidth = canvas.parentElement.clientWidth || boardZone?.clientWidth || 600;
          const nextSize = Math.max(320, Math.floor(Math.min(nextAvailableWidth, Math.max(360, (window.innerHeight || 720) - 170))));
          if (canvas.width !== nextSize || canvas.height !== nextSize) {
            canvas.width = nextSize;
            canvas.height = nextSize;
            padding = nextSize / (SIZE + 1);
            cellSize = (nextSize - padding * 2) / (SIZE - 1);
            drawBoard();
          }
        });
      });
      resizeObserver.observe(shell);
    }

    if (!window.__goGameResizeBound) {
      window.__goGameResizeBound = true;
      window.addEventListener('resize', () => {
        if (canvasResizeRaf) cancelAnimationFrame(canvasResizeRaf);
        canvasResizeRaf = requestAnimationFrame(() => {
          if (canvas && canvas.parentElement) {
            const nextAvailableWidth = canvas.parentElement.clientWidth || boardZone?.clientWidth || 600;
            const nextSize = Math.max(320, Math.floor(Math.min(nextAvailableWidth, Math.max(360, (window.innerHeight || 720) - 170))));
            canvas.width = nextSize;
            canvas.height = nextSize;
            padding = nextSize / (SIZE + 1);
            cellSize = (nextSize - padding * 2) / (SIZE - 1);
            drawBoard();
          }
        });
      });
    }
  }


  // --- 5. 事件绑定 ---
  function openConfirmDialog(message, onConfirm, confirmLabel = '确认') {
    const modal = document.getElementById('confirm-modal');
    const msgEl = document.getElementById('confirm-modal-message');
    const okBtn = document.getElementById('confirm-modal-ok');
    const cancelBtn = document.getElementById('confirm-modal-cancel');
    if (!modal || !msgEl || !okBtn || !cancelBtn) {
      if (window.confirm(message)) onConfirm?.();
      return;
    }

    msgEl.textContent = message;
    okBtn.textContent = confirmLabel;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');

    const cleanup = () => {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      okBtn.onclick = null;
      cancelBtn.onclick = null;
    };

    okBtn.onclick = () => {
      cleanup();
      onConfirm?.();
    };
    cancelBtn.onclick = cleanup;
  }

  function bindTopBarActions() {
    const quitBtn = document.getElementById('quit-game-btn');
    const surrenderBtn = document.getElementById('surrender-btn');

    if (quitBtn) {
      quitBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        openConfirmDialog('确定要退出当前对局吗？', () => {
          try {
            window.MP?.leaveRoom?.();
          } catch (err) {
            console.warn('leaveRoom 执行失败', err);
          }
          applyImmersiveState(false);
          const app = document.querySelector('.app');
          const selection = document.getElementById('game-selection');
          if (app) app.style.display = 'none';
          if (selection) selection.style.display = 'flex';
        }, '退出');
      }, true);
    }

    if (surrenderBtn) {
      surrenderBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        openConfirmDialog('确定要认输吗？认输后本局将结束。', () => {
          window.MP?.handleSurrender?.();
        }, '认输');
      }, true);
    }
  }

  function initEventListeners() {
    bindTopBarActions();
    // 将逻辑合并为一个监听器，确保流程线性执行
    document.getElementById('go-game-btn')?.addEventListener('click', async () => {
        try {
            // 1. 优先加载音频资源，防止后续 playSound 报错
            await initAudio(); 
            playSound('click'); 

            // 2. 统一切换 UI 状态[cite: 1, 2]
            const selection = document.getElementById('game-selection');
            const app = document.querySelector('.app');
            
            if (selection) selection.style.display = 'none';
            if (app) {
                app.style.display = 'grid'; // 确保容器先显示，Canvas 才能正确获取宽高
            }

            // 3. 更新沉浸式状态与文本[cite: 1, 2]
            applyImmersiveState(true);
            updateUI();

            // 4. 初始化棋盘逻辑
            // 使用 requestAnimationFrame 确保 DOM 挂载完成后再绘制
            requestAnimationFrame(() => {
                if (typeof initGame === 'function') {
                    initGame();
                } else {
                    console.error("initGame 函数未定义，请检查逻辑脚本");
                }
            });
        } catch (error) {
            console.error("启动游戏失败:", error);
        }
    });

  }

  // 初始化执行
  window.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    // 保持 false，这样页面刷新后会先显示你截图中的“在线游戏 Pro”登录卡片
    setLoggedIn(false); 
  });
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
})();
