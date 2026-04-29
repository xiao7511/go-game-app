(() => {
  // --- 1. 配置与状态 ---
  const AUTH_OVERLAY_ID = 'login-overlay';
  const SUPABASE_URL = window.APP_CONFIG?.SUPABASE_URL || '';
  const SUPABASE_ANON_KEY = window.APP_CONFIG?.SUPABASE_ANON_KEY || '';
  
  // 关键修复：确保调用了 createClient
  const hasSupabase = Boolean(window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY);
  const supabaseClient = hasSupabase 
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) 
    : null;

  console.log("Supabase 状态:", hasSupabase ? "初始化成功" : "配置缺失或加载失败");


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
