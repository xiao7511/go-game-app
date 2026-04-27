(() => {
  const AUTH_OVERLAY_ID = 'auth-overlay';
  const MATCH_OVERLAY_ID = 'match-overlay';
  const SUPABASE_URL = window.APP_CONFIG?.SUPABASE_URL || '';
  const SUPABASE_ANON_KEY = window.APP_CONFIG?.SUPABASE_ANON_KEY || '';
  const hasSupabase = Boolean(window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY);
  const supabaseClient = hasSupabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

  let movesChannel = null;
  let authOverlay = null;
  let matchOverlay = null;
  let isLoggedIn = false;
  let authUser = null;

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

  function applyImmersiveState(loggedIn) {
    isLoggedIn = loggedIn;
    document.body.classList.toggle('is-immersive', loggedIn);
    document.body.classList.toggle('is-locked', !loggedIn);

    const shell = boardShell();
    const stage = boardStage();
    if (shell) shell.style.display = loggedIn ? 'grid' : 'none';
    if (stage) stage.style.display = loggedIn ? 'grid' : 'none';
    if (sidebar()) sidebar().style.display = loggedIn ? '' : 'none';
    if (topbar()) topbar().style.display = loggedIn ? '' : '';
    if (footer()) footer().style.display = loggedIn ? '' : '';
  }

  function hideAuthOverlay() {
    if (!authOverlay) return;
    authOverlay.style.display = 'none';
    authOverlay.remove();
    authOverlay = null;
  }

  function showAuthOverlay() {
    ensureAuthOverlay();
    authOverlay.style.display = 'grid';
  }

  function setLoggedIn(loggedIn) {
    applyImmersiveState(loggedIn);
    const shell = boardShell();
    const stage = boardStage();
    if (loggedIn) {
      hideAuthOverlay();
      if (shell) shell.style.display = 'grid';
      if (stage) stage.style.display = 'grid';
      if (authOverlay) {
        authOverlay.style.display = 'none';
        authOverlay.remove();
        authOverlay = null;
      }
      console.log('游客登录成功');
    } else {
      showAuthOverlay();
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

  function handleAuthSuccess() {
    setLoggedIn(true);
  }

  function ensureAuthOverlay() {
    if (authOverlay) return authOverlay;
    authOverlay = document.createElement('div');
    authOverlay.id = AUTH_OVERLAY_ID;
    authOverlay.style.cssText = 'position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:18px;background:linear-gradient(180deg, rgba(12,18,24,.88), rgba(7,10,14,.92)),radial-gradient(circle at top, rgba(110,231,255,.18), transparent 30%),radial-gradient(circle at bottom right, rgba(246,196,83,.12), transparent 28%);backdrop-filter:blur(12px);';
    authOverlay.innerHTML = `
      <div class="panel" role="dialog" aria-modal="true" aria-labelledby="auth-title" style="width:min(94vw,460px);padding:24px;border-radius:28px;border:1px solid rgba(255,255,255,.12);background:rgba(16,24,32,.94);box-shadow:0 30px 80px rgba(0,0,0,.42);">
        <h2 id="auth-title" style="margin:0 0 8px;font-size:1.4rem;">围棋 Pro</h2>
        <p style="margin:0 0 16px;color:rgba(238,244,251,.72);line-height:1.6;">请先登录或注册，然后进入全屏棋盘模式。支持 Supabase 登录 + 游客模式双入口。</p>
        <div class="tabs" style="display:flex;gap:10px;margin-bottom:14px;">
          <button class="tab is-active" type="button" data-auth-tab="login" style="flex:1;min-height:42px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#eef4fb;font-weight:700;cursor:pointer;">登录</button>
          <button class="tab" type="button" data-auth-tab="register" style="flex:1;min-height:42px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#eef4fb;font-weight:700;cursor:pointer;">注册</button>
        </div>
        <form class="form" data-auth-form="login" style="display:grid;gap:10px;">
          <input id="login-email" type="email" placeholder="邮箱" autocomplete="email" style="width:100%;min-height:44px;padding:10px 14px;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:rgba(7,11,16,.82);color:#eef4fb;outline:none;">
          <input id="login-password" type="password" placeholder="密码" autocomplete="current-password" style="width:100%;min-height:44px;padding:10px 14px;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:rgba(7,11,16,.82);color:#eef4fb;outline:none;">
          <div class="actions" style="display:grid;gap:10px;margin-top:6px;">
            <button class="btn" type="button" id="login-btn" data-auth-action="login" style="min-height:44px;border:0;border-radius:14px;font-weight:700;cursor:pointer;color:#0f1720;background:linear-gradient(180deg,#ffe08a 0%,#f6c453 100%);">登录并进入</button>
            <button class="btn secondary" type="button" data-auth-action="guest" id="guest-login-btn" style="min-height:44px;border-radius:14px;font-weight:700;cursor:pointer;color:#eef4fb;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.10);">游客登录</button>
          </div>
        </form>
        <form class="form" data-auth-form="register" hidden style="display:grid;gap:10px;">
          <input id="register-name" type="text" placeholder="昵称" autocomplete="nickname" style="width:100%;min-height:44px;padding:10px 14px;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:rgba(7,11,16,.82);color:#eef4fb;outline:none;">
          <input id="register-email" type="email" placeholder="邮箱" autocomplete="email" style="width:100%;min-height:44px;padding:10px 14px;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:rgba(7,11,16,.82);color:#eef4fb;outline:none;">
          <input id="register-password" type="password" placeholder="密码" autocomplete="new-password" style="width:100%;min-height:44px;padding:10px 14px;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:rgba(7,11,16,.82);color:#eef4fb;outline:none;">
          <div class="actions" style="display:grid;gap:10px;margin-top:6px;">
            <button class="btn" type="button" id="register-btn" data-auth-action="register" style="min-height:44px;border:0;border-radius:14px;font-weight:700;cursor:pointer;color:#0f1720;background:linear-gradient(180deg,#ffe08a 0%,#f6c453 100%);">注册并进入</button>
            <button class="btn secondary" type="button" data-auth-action="guest" id="guest-login-btn-secondary" style="min-height:44px;border-radius:14px;font-weight:700;cursor:pointer;color:#eef4fb;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.10);">游客登录</button>
          </div>
        </form>
        <div class="note" style="margin-top:14px;font-size:.88rem;color:rgba(238,244,251,.68);line-height:1.6;">提示：此覆盖层会在登录成功后自动隐藏，并切换到边到边棋盘视图。</div>
      </div>
    `;

    const switchTab = tab => {
      const isLogin = tab === 'login';
      loginTab().classList.toggle('is-active', isLogin);
      registerTab().classList.toggle('is-active', !isLogin);
      loginForm().hidden = !isLogin;
      registerForm().hidden = isLogin;
    };

    authOverlay.querySelectorAll('[data-auth-tab]').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.authTab));
    });

    authOverlay.querySelector('#guest-login-btn')?.addEventListener('click', () => {
      console.log('Login Clicked');
      setLoggedIn(true);
    });
    authOverlay.querySelector('#guest-login-btn-secondary')?.addEventListener('click', () => {
      console.log('Login Clicked');
      setLoggedIn(true);
    });
    authOverlay.querySelector('#login-btn')?.addEventListener('click', () => {
      console.log('Login Clicked');
      loginWithSupabase();
    });
    authOverlay.querySelector('#register-btn')?.addEventListener('click', () => {
      console.log('Login Clicked');
      registerWithSupabase();
    });

    authOverlay.querySelectorAll('[data-auth-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.authAction;
        console.log('Login Clicked', action);
        if (action === 'guest') {
          setLoggedIn(true);
          return;
        }
      });
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

  function bindMoves({ supabaseClient, sessionId, currentUserId, onRemoteMove, onError }) {
    if (!supabaseClient || !sessionId) return;
    if (movesChannel) {
      supabaseClient.removeChannel(movesChannel);
      movesChannel = null;
    }
    movesChannel = supabaseClient
      .channel(`moves-${sessionId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'moves', filter: `session_id=eq.${sessionId}` }, payload => {
        const row = payload.new;
        if (!row || row.user_id === currentUserId) return;
        try { onRemoteMove?.(row); } catch (err) { onError?.(err); }
      })
      .subscribe();
  }

  function unbindMoves(supabaseClient) {
    if (movesChannel && supabaseClient) supabaseClient.removeChannel(movesChannel);
    movesChannel = null;
  }

  window.GoGameUI = { setLoggedIn, showAuthOverlay, hideAuthOverlay, showMatchingOverlay, hideMatchingOverlay, bindMoves, unbindMoves };

  document.addEventListener('DOMContentLoaded', () => {
    applyImmersiveState(false);
    ensureAuthOverlay();
    showAuthOverlay();
  });
})();
