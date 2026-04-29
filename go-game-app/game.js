(() => {
  const AUTH_OVERLAY_ID='auth-overlay';
  const MATCH_OVERLAY_ID = 'match-overlay';
  const SUPABASE_URL = window.APP_CONFIG?.SUPABASE_URL || '';
  const SUPABASE_ANON_KEY = window.APP_CONFIG?.SUPABASE_ANON_KEY || '';
  const hasSupabase = Boolean(window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY);
  const supabaseClient = hasSupabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

  const SIZE = 19;
  const EMPTY = 0;
  const BLACK = 1;
  const WHITE = 2;

  let movesChannel = null;
  let authOverlay = null;
  let matchOverlay = null;
  let isLoggedIn = false;
  let authUser = null;
  let canvas = null;
  let ctx = null;
  let cell = 0;
  let margin = 0;
  const board = Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY));
  const moveHistory = [];
  let currentPlayer = BLACK;
  let blackCaptures = 0;
  let whiteCaptures = 0;
  let audioCtx = null;
  let bgmAudio = null;
  let isBgmPlaying = false;
  const sounds = {
    click: 'https://www.soundjay.com/buttons/sounds/button-16.mp3',
    undo: 'https://www.soundjay.com/buttons/sounds/button-7.mp3',
    capture: 'https://www.soundjay.com/misc/sounds/magic-chime-01.mp3',
    bgm: 'https://soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'
  };
  const buffers = {};

  async function initAudio() {
    if (audioCtx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
    for (const [name, url] of Object.entries(sounds)) {
      try {
        const res = await fetch(url);
        const arrayBuffer = await res.arrayBuffer();
        buffers[name] = await audioCtx.decodeAudioData(arrayBuffer);
      } catch (err) {
        console.warn('Failed to load sound:', name, err);
      }
    }
  }

  function playSound(name) {
    if (!audioCtx || !buffers[name]) return;
    try {
      const source = audioCtx.createBufferSource();
      source.buffer = buffers[name];
      source.connect(audioCtx.destination);
      source.start(0);
    } catch (err) {}
  }

  function toggleBgm() {
    if (!audioCtx || !buffers.bgm) return;
    if (isBgmPlaying && bgmAudio) {
      bgmAudio.stop();
      bgmAudio = null;
      isBgmPlaying = false;
    } else {
      bgmAudio = audioCtx.createBufferSource();
      bgmAudio.buffer = buffers.bgm;
      bgmAudio.loop = true;
      const gainNode = audioCtx.createGain();
      gainNode.gain.value = 0.3;
      bgmAudio.connect(gainNode).connect(audioCtx.destination);
      bgmAudio.start(0);
      isBgmPlaying = true;
    }
  }


  const boardStage = () => document.getElementById('boardStage');
  const boardShell = () => document.querySelector('.board-shell');
  const topbar = () => document.querySelector('.topbar');
  const footer = () => document.querySelector('.footer');
  const sidebar = () => document.querySelector('.sidebar');
  const loginTab = () => authOverlay?.querySelector('[data-auth-tab="login"]');
  const registerTab = () => authOverlay?.querySelector('[data-auth-tab="register"]');
  const loginForm = () => authOverlay?.querySelector('[data-auth-form="login"]');
  const registerForm = () => authOverlay?.querySelector('[data-auth-form="register"]');
  const loginEmail = () => authOverlay?.querySelector('#login-email');
  const loginPassword = () => authOverlay?.querySelector('#login-password');
  const registerName = () => authOverlay?.querySelector('#register-name');
  const registerEmail = () => authOverlay?.querySelector('#register-email');
  const registerPassword = () => authOverlay?.querySelector('#register-password');
  const moveCountEl = () => document.getElementById('moveCount');
  const blackCapturesEl = () => document.getElementById('blackCaptures');
  const whiteCapturesEl = () => document.getElementById('whiteCaptures');
  const turnBadge = () => document.getElementById('turnBadge');
  const authBadge = () => document.getElementById('authBadge');
  const matchBadge = () => document.getElementById('matchBadge');
  const roleText = () => document.getElementById('roleText');
  const userName = () => document.getElementById('userName');
  const userEmail = () => document.getElementById('userEmail');
  const moveListEl = () => document.getElementById('moveList');
  const undoBtn = () => document.getElementById('undoBtn');
  const resetBtn = () => document.getElementById('resetBtn');
  const findOpponentBtn = () => document.getElementById('findOpponentBtn');
  const leaveMatchBtn = () => document.getElementById('leaveMatchBtn');
  const logoutBtn = () => document.getElementById('logoutBtn');

  function applyImmersiveState(loggedIn) {
    isLoggedIn = loggedIn;
    document.body.classList.toggle('is-immersive', loggedIn);
    document.body.classList.toggle('is-locked', !loggedIn);
    document.body.style.overflow = loggedIn ? 'hidden' : 'auto';

    const shell = boardShell();
    const stage = boardStage();
    if (shell) {
      shell.style.display = loggedIn ? 'flex' : 'none';
      shell.classList.toggle('is-active', loggedIn);
      shell.style.pointerEvents = loggedIn ? 'auto' : 'none';
    }
    if (stage) stage.style.display = loggedIn ? 'grid' : 'none';
    if (sidebar()) sidebar().style.display = loggedIn ? '' : 'none';
    if (topbar()) topbar().style.display = loggedIn ? '' : '';
    if (footer()) footer().style.display = loggedIn ? '' : '';
  }

  function hideAuthOverlay() {
    const overlay = document.getElementById(AUTH_OVERLAY_ID) || authOverlay;
    if (!overlay) return;
    overlay.style.display = 'none';
  }

  function showAuthOverlay() {
    ensureAuthOverlay();
    authOverlay.style.display = 'grid';
  }

  function setLoggedIn(loggedIn) {
    if (loggedIn) {
      hideAuthOverlay();
      document.getElementById('game-selection').style.display = 'flex';
      document.querySelector('.app').style.display = 'none';
    } else {
      showAuthOverlay();
      document.getElementById('game-selection').style.display = 'none';
      document.querySelector('.app').style.display = 'grid';
    }
  }

  async function loginWithSupabase() {
    if (!supabaseClient) {
      alert('当前未配置 Supabase，已切换到游客模式');
      setLoggedIn(true);
      return;
    }
    const email = loginEmail()?.value?.trim();
    const password = loginPassword()?.value || '';
    if (!email || !password) return alert('请输入邮箱和密码');

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) return alert(error.message);
    authUser = data.user || null;
    setLoggedIn(true);
    console.log('Supabase 登录成功');
  }

  async function registerWithSupabase() {
    if (!supabaseClient) {
      alert('当前未配置 Supabase，已切换到游客模式');
      setLoggedIn(true);
      return;
    }
    const nickname = registerName()?.value?.trim();
    const email = registerEmail()?.value?.trim();
    const password = registerPassword()?.value || '';
    if (!nickname || !email || !password) return alert('请完整填写注册信息');

    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: { data: { nickname } }
    });
    if (error) return alert(error.message);
    authUser = data.user || null;
    setLoggedIn(true);
    console.log('Supabase 注册成功');
  }

  function ensureAuthOverlay() {
    if (authOverlay) return authOverlay;
    authOverlay = document.createElement('div');
    authOverlay.id = AUTH_OVERLAY_ID;
    authOverlay.style.cssText = 'position:fixed;inset:0;z-index:999;display:grid;place-items:center;padding:18px;background:linear-gradient(180deg, rgba(12,18,24,.88), rgba(7,10,14,.92)),radial-gradient(circle at top, rgba(110,231,255,.18), transparent 30%),radial-gradient(circle at bottom right, rgba(246,196,83,.12), transparent 28%);backdrop-filter:blur(12px);transform:translateZ(50px);';
    authOverlay.innerHTML = `
      <div class="panel" role="dialog" aria-modal="true" aria-labelledby="auth-title" style="width:min(94vw,460px);padding:24px;border-radius:28px;border:1px solid rgba(255,255,255,.12);background:rgba(16,24,32,.94);box-shadow:0 30px 80px rgba(0,0,0,.42);">
        <h2 id="auth-title" style="margin:0 0 8px;font-size:1.4rem;">围棋 Pro</h2>
        <p style="margin:0 0 16px;color:rgba(238,244,251,.72);line-height:1.6;">请先登录或注册，然后进入全屏棋盘模式。支持 Supabase 登录 + 游客模式双入口。</p>
        <form class="form" data-auth-form="login" style="display:grid;gap:10px;">
          <input id="login-email" type="email" placeholder="邮箱" autocomplete="email" style="width:100%;min-height:44px;padding:10px 14px;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:rgba(7,11,16,.82);color:#eef4fb;outline:none;">
          <input id="login-password" type="password" placeholder="密码" autocomplete="current-password" style="width:100%;min-height:44px;padding:10px 14px;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:rgba(7,11,16,.82);color:#eef4fb;outline:none;">
          <div class="actions" style="display:grid;gap:10px;margin-top:6px;">
            <button class="btn" type="button" id="login-btn" data-auth-action="login" style="min-height:44px;border:0;border-radius:14px;font-weight:700;cursor:pointer;color:#0f1720;background:linear-gradient(180deg,#ffe08a 0%,#f6c453 100%);">登录</button>
            <button class="btn secondary" type="button" data-auth-tab="register" style="min-height:44px;border-radius:14px;font-weight:700;cursor:pointer;color:#eef4fb;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.10);">注册</button>
            <button class="btn secondary" type="button" data-auth-action="guest" id="guest-login-btn" style="min-height:44px;border-radius:14px;font-weight:700;cursor:pointer;color:#eef4fb;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.10);">游客登录</button>
          </div>
        </form>
        <form class="form" data-auth-form="register" hidden style="display:grid;gap:10px;">
          <input id="register-name" type="text" placeholder="昵称" autocomplete="nickname" style="width:100%;min-height:44px;padding:10px 14px;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:rgba(7,11,16,.82);color:#eef4fb;outline:none;">
          <input id="register-email" type="email" placeholder="邮箱" autocomplete="email" style="width:100%;min-height:44px;padding:10px 14px;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:rgba(7,11,16,.82);color:#eef4fb;outline:none;">
          <input id="register-password" type="password" placeholder="密码" autocomplete="new-password" style="width:100%;min-height:44px;padding:10px 14px;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:rgba(7,11,16,.82);color:#eef4fb;outline:none;">
          <div class="actions" style="display:grid;gap:10px;margin-top:6px;">
            <button class="btn" type="button" id="register-btn" data-auth-action="register" style="min-height:44px;border:0;border-radius:14px;font-weight:700;cursor:pointer;color:#0f1720;background:linear-gradient(180deg,#ffe08a 0%,#f6c453 100%);">完成注册并登录</button>
            <button class="btn secondary" type="button" data-auth-tab="login" style="min-height:44px;border-radius:14px;font-weight:700;cursor:pointer;color:#eef4fb;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.10);">返回</button>
          </div>
        </form>
        <div class="note" style="margin-top:14px;font-size:.88rem;color:rgba(238,244,251,.68);line-height:1.6;">提示：此覆盖层会在登录成功后自动隐藏，并切换到边到边棋盘视图。</div>
      </div>
    `;

    const switchTab = tab => {
      const isLogin = tab === 'login';
      loginForm().hidden = !isLogin;
      registerForm().hidden = isLogin;
    };

    authOverlay.querySelectorAll('[data-auth-tab]').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.authTab));
    });

    authOverlay.querySelector('#guest-login-btn')?.addEventListener('click', () => {
      initAudio();
      if (!isBgmPlaying) {
        toggleBgm();
      }
      setLoggedIn(true);
    });
    authOverlay.querySelector('#login-btn')?.addEventListener('click', () => {
      initAudio();
      loginWithSupabase();
    });
    authOverlay.querySelector('#register-btn')?.addEventListener('click', () => {
      initAudio();
      registerWithSupabase();
    });

    switchTab('login');
    document.body.appendChild(authOverlay);
    return authOverlay;
  }

  function ensureMatchOverlay() {
    if (matchOverlay) return matchOverlay;
    matchOverlay = document.createElement('div');
    matchOverlay.id = MATCH_OVERLAY_ID;
    matchOverlay.hidden = true;
    matchOverlay.innerHTML = `
      <style>
        #${MATCH_OVERLAY_ID} { position: fixed; inset: 0; z-index: 9999; display: grid; place-items: center; background: rgba(7, 12, 18, 0.74); backdrop-filter: blur(10px); }
        #${MATCH_OVERLAY_ID}[hidden] { display: none; }
        #${MATCH_OVERLAY_ID} .panel { width: min(92vw, 420px); padding: 28px 24px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.12); background: linear-gradient(180deg, rgba(18,24,33,0.96), rgba(10,16,22,0.96)); text-align: center; box-shadow: 0 28px 72px rgba(0,0,0,0.45); }
        #${MATCH_OVERLAY_ID} h2 { margin: 0 0 10px; font-size: 1.25rem; }
        #${MATCH_OVERLAY_ID} p { margin: 0; color: rgba(238,244,251,0.76); }
        #${MATCH_OVERLAY_ID} .spinner { width: 72px; height: 72px; margin: 0 auto 18px; border-radius: 50%; border: 5px solid rgba(255,255,255,0.10); border-top-color: #f6c453; animation: go-spin 1s linear infinite; }
        #${MATCH_OVERLAY_ID} .dots { display: inline-flex; gap: 6px; margin-left: 6px; vertical-align: middle; }
        #${MATCH_OVERLAY_ID} .dots span { width: 8px; height: 8px; border-radius: 50%; background: #6ee7ff; animation: go-bounce 1.1s infinite ease-in-out; }
        #${MATCH_OVERLAY_ID} .dots span:nth-child(2) { animation-delay: 0.15s; }
        #${MATCH_OVERLAY_ID} .dots span:nth-child(3) { animation-delay: 0.3s; }
        @keyframes go-spin { to { transform: rotate(360deg); } }
        @keyframes go-bounce { 0%, 80%, 100% { transform: scale(0.6); opacity: 0.45; } 40% { transform: scale(1); opacity: 1; } }
      </style>
      <div class="panel" role="status" aria-live="polite">
        <div class="spinner"></div>
        <h2>正在寻找对手...</h2>
        <p>系统已进入匹配队列，请稍候<span class="dots"><span></span><span></span><span></span></span></p>
      </div>
    `;
    document.body.appendChild(matchOverlay);
    return matchOverlay;
  }

  function showMatchingOverlay() { ensureMatchOverlay().hidden = false; }
  function hideMatchingOverlay() { if (matchOverlay) matchOverlay.hidden = true; }

  function stoneName(player) {
    return player === BLACK ? '黑棋' : '白棋';
  }

  function opponent(player) {
    return player === BLACK ? WHITE : BLACK;
  }

  function cloneBoard(src) {
    return src.map(row => row.slice());
  }

  function getGroupAndLiberties(startX, startY, srcBoard = board) {
    const color = srcBoard[startY][startX];
    const stack = [[startX, startY]];
    const visited = new Set();
    const stones = [];
    let liberties = 0;

    while (stack.length) {
      const [x, y] = stack.pop();
      const key = `${x},${y}`;
      if (visited.has(key)) continue;
      visited.add(key);
      stones.push([x, y]);

      const neighbors = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ];

      for (const [nx, ny] of neighbors) {
        if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
        const value = srcBoard[ny][nx];
        if (value === EMPTY) liberties += 1;
        else if (value === color && !visited.has(`${nx},${ny}`)) stack.push([nx, ny]);
      }
    }

    return { stones, liberties };
  }

  function removeCapturedStones(placeX, placeY, player, workingBoard) {
    const captured = [];
    const enemy = opponent(player);
    const neighbors = [
      [placeX - 1, placeY], [placeX + 1, placeY], [placeX, placeY - 1], [placeX, placeY + 1]
    ];

    for (const [nx, ny] of neighbors) {
      if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
      if (workingBoard[ny][nx] !== enemy) continue;
      const group = getGroupAndLiberties(nx, ny, workingBoard);
      if (group.liberties === 0) {
        for (const [gx, gy] of group.stones) {
          workingBoard[gy][gx] = EMPTY;
          captured.push([gx, gy]);
        }
      }
    }
    return captured;
  }

  function applyMoveToState(stateBoard, x, y, player) {
    if (stateBoard[y][x] !== EMPTY) {
      return { ok: false, reason: '该点已有棋子' };
    }
    const temp = cloneBoard(stateBoard);
    temp[y][x] = player;
    const captured = removeCapturedStones(x, y, player, temp);
    const myGroup = getGroupAndLiberties(x, y, temp);
    if (myGroup.liberties === 0) return { ok: false, reason: '禁止自杀手' };
    return { ok: true, board: temp, captured };
  }

  function updateUI(lastX = null, lastY = null) {
    if (authBadge()) authBadge().textContent = isLoggedIn ? '已登录' : '未登录';
    if (matchBadge()) matchBadge().textContent = isLoggedIn ? '本地/在线' : '登录中';
    if (turnBadge()) turnBadge().textContent = `轮到：${stoneName(currentPlayer)}`;
    if (roleText()) roleText().textContent = '本地';
    if (userName()) userName().textContent = authUser?.user_metadata?.nickname || '游客';
    if (userEmail()) userEmail().textContent = authUser?.email || '请先登录后开启在线匹配';
    if (moveCountEl()) moveCountEl().textContent = String(moveHistory.length);
    if (blackCapturesEl()) blackCapturesEl().textContent = String(blackCaptures);
    if (whiteCapturesEl()) whiteCapturesEl().textContent = String(whiteCaptures);
    if (moveListEl()) {
      moveListEl().innerHTML = moveHistory.map((m, idx) => `<li>${idx + 1}. ${stoneName(m.player)} (${m.x + 1}, ${m.y + 1})${m.captured.length ? `，提 ${m.captured.length} 子` : ''}</li>`).join('');
    }
    if (undoBtn()) undoBtn().disabled = false;
    if (leaveMatchBtn()) leaveMatchBtn().disabled = true;
    if (findOpponentBtn()) findOpponentBtn().disabled = !isLoggedIn;
    if (logoutBtn()) logoutBtn().disabled = !isLoggedIn;
  }

  function resizeBoard() {
    if (!canvas || !canvas.parentElement) return;
    const size = Math.min(canvas.parentElement.clientWidth, canvas.parentElement.clientHeight);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(size * dpr);
    canvas.height = Math.floor(size * dpr);
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    margin = Math.max(18, size * 0.045);
    cell = (size - margin * 2) / (SIZE - 1);
    drawBoard();
  }

  function drawBoard() {
    if (!ctx || !canvas) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const size = Math.min(w, h);

    ctx.clearRect(0, 0, w, h);

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#ddb06c');
    bg.addColorStop(1, '#cc9655');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = '#000';
    ctx.lineWidth = Math.max(1, size * 0.002);
    for (let i = 0; i < SIZE; i++) {
      const p = margin + i * cell;
      ctx.beginPath();
      ctx.moveTo(margin, p);
      ctx.lineTo(size - margin, p);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p, margin);
      ctx.lineTo(p, size - margin);
      ctx.stroke();
    }

    const stars = [3, 9, 15];
    ctx.fillStyle = '#000';
    for (const x of stars) {
      for (const y of stars) {
        const px = margin + x * cell;
        const py = margin + y * cell;
        ctx.beginPath();
        ctx.arc(px, py, Math.max(2.5, cell * 0.08), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (board[y][x] !== EMPTY) drawStone(x, y, board[y][x]);
      }
    }
  }

  function drawStone(x, y, player) {
    const px = margin + x * cell;
    const py = margin + y * cell;
    const radius = cell * 0.44;
    const gradient = ctx.createRadialGradient(px - radius * 0.32, py - radius * 0.32, radius * 0.18, px, py, radius);
    if (player === BLACK) {
      gradient.addColorStop(0, '#777');
      gradient.addColorStop(0.55, '#111');
      gradient.addColorStop(1, '#000');
    } else {
      gradient.addColorStop(0, '#fff');
      gradient.addColorStop(0.62, '#e2e6eb');
      gradient.addColorStop(1, '#bcc3cd');
    }

    ctx.beginPath();
    ctx.fillStyle = gradient;
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  function handleBoardClick(event) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.round((event.clientX - rect.left - margin) / cell);
    const y = Math.round((event.clientY - rect.top - margin) / cell);
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;

    const result = applyMoveToState(board, x, y, currentPlayer);
    if (result.ok) {
      Object.assign(board, result.board);
      if (result.captured.length > 0) {
        if (currentPlayer === BLACK) blackCaptures += result.captured.length;
        else whiteCaptures += result.captured.length;
        playSound('capture');
      } else {
        playSound('click');
      }
      moveHistory.push({ x, y, player: currentPlayer, board: cloneBoard(board), captured: result.captured });
      currentPlayer = opponent(currentPlayer);
      drawBoard();
      updateUI(x, y);
    } else {
      console.warn(result.reason);
    }
  }

  function undoMove() {
    if (moveHistory.length === 0) return;
    moveHistory.pop();
    const lastMove = moveHistory.length > 0 ? moveHistory[moveHistory.length - 1] : null;
    if (lastMove) {
      Object.assign(board, lastMove.board);
      currentPlayer = opponent(lastMove.player);
    } else {
      board.forEach(row => row.fill(EMPTY));
      currentPlayer = BLACK;
    }
    blackCaptures = 0;
    whiteCaptures = 0;
    moveHistory.forEach(move => {
        if (move.captured.length > 0) {
            if (move.player === BLACK) blackCaptures += move.captured.length;
            else whiteCaptures += move.captured.length;
        }
    });
    playSound('undo');
    drawBoard();
    updateUI();
  }

  async function initAuth() {
    if (hasSupabase) {
      const { data: { session } } = await supabaseClient.auth.getSession();
      isLoggedIn = Boolean(session);
      authUser = session?.user || null;
      setLoggedIn(isLoggedIn);
      supabaseClient.auth.onAuthStateChange((event, session) => {
        isLoggedIn = Boolean(session);
        authUser = session?.user || null;
        setLoggedIn(isLoggedIn);
      });
    } else {
      setLoggedIn(false);
    }
    if (undoBtn()) undoBtn().addEventListener('click', undoMove);
    if (resetBtn()) resetBtn().addEventListener('click', () => {
      board.forEach(row => row.fill(EMPTY));
      moveHistory.length = 0;
      currentPlayer = BLACK;
      blackCaptures = 0;
      whiteCaptures = 0;
      drawBoard();
      updateUI();
    });
    if (logoutBtn()) {
      logoutBtn().addEventListener('click', async () => {
        if (hasSupabase) await supabaseClient.auth.signOut();
        setLoggedIn(false);
      });
    }
  }

  function initBoard() {
    canvas = document.getElementById('board');
    if (canvas.getContext) {
      ctx = canvas.getContext('2d');
      canvas.addEventListener('click', handleBoardClick);
      window.addEventListener('resize', resizeBoard, false);
    } else {
      alert('您的浏览器不支持 Canvas，无法进行游戏。');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    document.querySelector('.game-choice[data-game="go"]').addEventListener('click', () => {
        document.getElementById('game-selection').style.display = 'none';
        document.querySelector('.app').style.display = 'grid';
        initBoard();
        resizeBoard();
        drawBoard();
        updateUI();
    });
  });

})();
