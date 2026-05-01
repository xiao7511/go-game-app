(() => {
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
  
  // 音效资源
  const sounds = {
    click: 'https://soundjay.com',
    placeStone: 'https://soundjay.com',
    yourTurn: 'https://soundjay.com',
    invalidMove: 'https://soundjay.com',
    capture: 'https://soundjay.com'
  };
  let audioCtx = null;
  const buffers = {};

  // --- 2. 音效引擎 ---
  async function initAudio() {
    if (audioCtx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
    for (const [name, url] of Object.entries(sounds)) {
      try {
        const res = await fetch(url);
        const arrayBuffer = await res.arrayBuffer();
        buffers[name] = await audioCtx.decodeAudioData(arrayBuffer);
      } catch (err) { console.warn('音效加载失败:', name); }
    }
  }

  function playSound(name) {
    if (!audioCtx || !buffers[name]) return;
    const source = audioCtx.createBufferSource();
    source.buffer = buffers[name];
    source.connect(audioCtx.destination);
    source.start(0);
  }

  // --- 3. UI 切换逻辑 ---
  function applyImmersiveState(inGame) {
    document.body.classList.toggle('is-immersive', inGame);
    const shell = document.querySelector('.board-shell');
    if (shell) {
      shell.style.display = inGame ? 'flex' : 'none';
      shell.classList.toggle('is-active', inGame);
    }
    document.querySelector('.sidebar').style.display = inGame ? 'grid' : 'none';
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
  function updateUI() {
    const turnEl = document.getElementById('currentPlayer');
    if (turnEl) turnEl.textContent = currentPlayer === BLACK ? '黑棋' : '白棋';
    const blackCapEl = document.getElementById('blackCaptures');
    if (blackCapEl) blackCapEl.textContent = blackCaptures;
    const whiteCapEl = document.getElementById('whiteCaptures');
    if (whiteCapEl) whiteCapEl.textContent = whiteCaptures;
  }

  function handlePlaceStone(x, y) {
    // 模拟落子逻辑
    const success = true; // 此处应接入具体的围棋合法性判断
    if (success) {
      playSound('placeStone');
      currentPlayer = currentPlayer === BLACK ? WHITE : BLACK;
      updateUI();
      // 模拟提示音
      setTimeout(() => playSound('yourTurn'), 600);
    } else {
      playSound('invalidMove');
    }
  }

  function initGame() {
    const canvas = document.getElementById('goBoard');
    const ctx = canvas.getContext('2d');

    // 动态调整 Canvas 大小以填充其父容器
    const parent = canvas.parentElement;
    const size = Math.min(parent.clientWidth, parent.clientHeight);
    canvas.width = size;
    canvas.height = size;

    const cellSize = size / (SIZE - 1);

    // 清除画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 绘制棋盘线
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    for (let i = 0; i < SIZE; i++) {
      // 横线
      ctx.beginPath();
      ctx.moveTo(cellSize / 2, i * cellSize + cellSize / 2);
      ctx.lineTo(size - cellSize / 2, i * cellSize + cellSize / 2);
      ctx.stroke();

      // 竖线
      ctx.beginPath();
      ctx.moveTo(i * cellSize + cellSize / 2, cellSize / 2);
      ctx.lineTo(i * cellSize + cellSize / 2, size - cellSize / 2);
      ctx.stroke();
    }

    // 绘制星位 (以 19x19 为例)
    const starPoints = [
      [3, 3], [3, 9], [3, 15],
      [9, 3], [9, 9], [9, 15],
      [15, 3], [15, 9], [15, 15]
    ];

    starPoints.forEach(([row, col]) => {
      const x = col * cellSize + cellSize / 2;
      const y = row * cellSize + cellSize / 2;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, 2 * Math.PI);
      ctx.fillStyle = '#333';
      ctx.fill();
    });
  }

  // --- 5. 事件绑定 ---
  // --- 5. 事件绑定 ---
  function initEventListeners() {
    
    // 1. 【新增】处理登录/进入按钮
    // 请确保 HTML 中那个黄色按钮的 ID 是 'auth-btn'
    document.getElementById('auth-btn')?.addEventListener('click', async () => {
      console.log("正在尝试进入...");
      
      // 如果 Supabase 初始化成功，尝试匿名登录
      if (supabaseClient) {
        try {
          const { data, error } = await supabaseClient.auth.signInAnonymously();
          if (error) throw error;
          console.log("Supabase 登录成功:", data.user.id);
        } catch (err) {
          console.warn("Supabase 登录失败，将以离线模式进入:", err.message);
        }
      } else {
        console.warn("Supabase 未配置，启用本地模式");
      }
      
      // 无论登录成功与否，都允许进入游戏选择界面
      setLoggedIn(true); 
    });

    // 2. 围棋按钮点击：进入游戏
    document.getElementById('go-game-btn')?.addEventListener('click', async () => {
      // 检查是否已初始化音频环境
      await initAudio(); 
      playSound('click');
      document.getElementById('game-selection').style.display = 'none';
      document.querySelector('.app').style.display = 'grid';
      applyImmersiveState(true);
      updateUI();
    });

    // 3. 退出按钮点击：返回选项
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
