(() => {
  const AUTH_OVERLAY_ID = 'auth-overlay';
  const MATCH_OVERLAY_ID = 'match-overlay';
  let movesChannel = null;
  let authOverlay = null;
  let matchOverlay = null;

  function applyImmersiveState(isLoggedIn) {
    document.body.classList.toggle('is-locked', !isLoggedIn);
    document.body.classList.toggle('is-immersive', isLoggedIn);
  }

  function ensureAuthOverlay() {
    if (authOverlay) return authOverlay;
    authOverlay = document.createElement('div');
    authOverlay.id = AUTH_OVERLAY_ID;
    authOverlay.hidden = true;
    authOverlay.innerHTML = `
      <style>
        #${AUTH_OVERLAY_ID} {
          position: fixed;
          inset: 0;
          z-index: 10000;
          display: grid;
          place-items: center;
          padding: 18px;
          background:
            linear-gradient(180deg, rgba(12, 18, 24, 0.88), rgba(7, 10, 14, 0.92)),
            radial-gradient(circle at top, rgba(110, 231, 255, 0.18), transparent 30%),
            radial-gradient(circle at bottom right, rgba(246, 196, 83, 0.12), transparent 28%);
          backdrop-filter: blur(12px);
        }
        #${AUTH_OVERLAY_ID}[hidden] { display: none; }
        #${AUTH_OVERLAY_ID} .panel {
          width: min(94vw, 460px);
          padding: 24px;
          border-radius: 28px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(16, 24, 32, 0.94);
          box-shadow: 0 30px 80px rgba(0,0,0,0.42);
        }
        #${AUTH_OVERLAY_ID} h2 { margin: 0 0 8px; font-size: 1.4rem; }
        #${AUTH_OVERLAY_ID} p { margin: 0 0 16px; color: rgba(238,244,251,0.72); line-height: 1.6; }
        #${AUTH_OVERLAY_ID} .tabs { display: flex; gap: 10px; margin-bottom: 14px; }
        #${AUTH_OVERLAY_ID} .tab {
          flex: 1;
          min-height: 42px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.06);
          color: #eef4fb;
          font-weight: 700;
          cursor: pointer;
        }
        #${AUTH_OVERLAY_ID} .tab.is-active {
          background: linear-gradient(180deg, #ffe08a 0%, #f6c453 100%);
          color: #0f1720;
          border-color: transparent;
        }
        #${AUTH_OVERLAY_ID} .form {
          display: grid;
          gap: 10px;
        }
        #${AUTH_OVERLAY_ID} .form[hidden] { display: none; }
        #${AUTH_OVERLAY_ID} input {
          width: 100%;
          min-height: 44px;
          padding: 10px 14px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(7, 11, 16, 0.82);
          color: #eef4fb;
          outline: none;
        }
        #${AUTH_OVERLAY_ID} .actions {
          display: grid;
          gap: 10px;
          margin-top: 6px;
        }
        #${AUTH_OVERLAY_ID} .btn {
          min-height: 44px;
          border: 0;
          border-radius: 14px;
          font-weight: 700;
          cursor: pointer;
          color: #0f1720;
          background: linear-gradient(180deg, #ffe08a 0%, #f6c453 100%);
        }
        #${AUTH_OVERLAY_ID} .btn.secondary {
          color: #eef4fb;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.10);
        }
        #${AUTH_OVERLAY_ID} .note {
          margin-top: 14px;
          font-size: 0.88rem;
          color: rgba(238,244,251,0.68);
          line-height: 1.6;
        }
      </style>
      <div class="panel" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <h2 id="auth-title">围棋 Pro</h2>
        <p>请先登录或注册，然后进入全屏棋盘模式。当前先使用 <strong>isLoggedIn</strong> 模拟，后续可接 Supabase。</p>
        <div class="tabs">
          <button class="tab is-active" type="button" data-auth-tab="login">登录</button>
          <button class="tab" type="button" data-auth-tab="register">注册</button>
        </div>
        <form class="form" data-auth-form="login">
          <input type="email" placeholder="邮箱" autocomplete="email">
          <input type="password" placeholder="密码" autocomplete="current-password">
          <div class="actions">
            <button class="btn" type="button" data-auth-action="login">登录并进入</button>
            <button class="btn secondary" type="button" data-auth-action="guest">游客试玩</button>
          </div>
        </form>
        <form class="form" data-auth-form="register" hidden>
          <input type="text" placeholder="昵称" autocomplete="nickname">
          <input type="email" placeholder="邮箱" autocomplete="email">
          <input type="password" placeholder="密码" autocomplete="new-password">
          <div class="actions">
            <button class="btn" type="button" data-auth-action="register">注册并进入</button>
            <button class="btn secondary" type="button" data-auth-action="guest">直接体验</button>
          </div>
        </form>
        <div class="note">提示：此覆盖层会在登录成功后自动隐藏，并切换到边到边棋盘视图。</div>
      </div>
    `;

    const loginTab = authOverlay.querySelector('[data-auth-tab="login"]');
    const registerTab = authOverlay.querySelector('[data-auth-tab="register"]');
    const loginForm = authOverlay.querySelector('[data-auth-form="login"]');
    const registerForm = authOverlay.querySelector('[data-auth-form="register"]');

    const switchTab = tab => {
      const isLogin = tab === 'login';
      loginTab.classList.toggle('is-active', isLogin);
      registerTab.classList.toggle('is-active', !isLogin);
      loginForm.hidden = !isLogin;
      registerForm.hidden = isLogin;
    };

    authOverlay.querySelectorAll('[data-auth-tab]').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.authTab));
    });

    authOverlay.querySelectorAll('[data-auth-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.authAction;
        window.dispatchEvent(new CustomEvent(action === 'register' ? 'goauth:register' : 'goauth:login', {
          detail: { source: action }
        }));
      });
    });

    switchTab('login');
    document.body.appendChild(authOverlay);
    return authOverlay;
  }

  function showAuthOverlay() {
    ensureAuthOverlay().hidden = false;
  }

  function hideAuthOverlay() {
    if (authOverlay) authOverlay.hidden = true;
  }

  function setLoggedIn(isLoggedIn) {
    applyImmersiveState(isLoggedIn);
    if (isLoggedIn) hideAuthOverlay();
    else showAuthOverlay();
  }

  function ensureMatchOverlay() {
    if (matchOverlay) return matchOverlay;
    matchOverlay = document.createElement('div');
    matchOverlay.id = MATCH_OVERLAY_ID;
    matchOverlay.hidden = true;
    matchOverlay.innerHTML = `
      <style>
        #${MATCH_OVERLAY_ID} {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: grid;
          place-items: center;
          background: rgba(7, 12, 18, 0.74);
          backdrop-filter: blur(10px);
        }
        #${MATCH_OVERLAY_ID}[hidden] { display: none; }
        #${MATCH_OVERLAY_ID} .panel {
          width: min(92vw, 420px);
          padding: 28px 24px;
          border-radius: 24px;
          border: 1px solid rgba(255,255,255,0.12);
          background: linear-gradient(180deg, rgba(18,24,33,0.96), rgba(10,16,22,0.96));
          text-align: center;
          box-shadow: 0 28px 72px rgba(0,0,0,0.45);
        }
        #${MATCH_OVERLAY_ID} h2 { margin: 0 0 10px; font-size: 1.25rem; }
        #${MATCH_OVERLAY_ID} p { margin: 0; color: rgba(238,244,251,0.76); }
        #${MATCH_OVERLAY_ID} .spinner {
          width: 72px;
          height: 72px;
          margin: 0 auto 18px;
          border-radius: 50%;
          border: 5px solid rgba(255,255,255,0.10);
          border-top-color: #f6c453;
          animation: go-spin 1s linear infinite;
        }
        #${MATCH_OVERLAY_ID} .dots {
          display: inline-flex;
          gap: 6px;
          margin-left: 6px;
          vertical-align: middle;
        }
        #${MATCH_OVERLAY_ID} .dots span {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #6ee7ff;
          animation: go-bounce 1.1s infinite ease-in-out;
        }
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

  function showMatchingOverlay() {
    ensureMatchOverlay().hidden = false;
  }

  function hideMatchingOverlay() {
    if (matchOverlay) matchOverlay.hidden = true;
  }

  function bindMoves({ supabaseClient, sessionId, currentUserId, onRemoteMove, onError }) {
    if (!supabaseClient || !sessionId) return;
    if (movesChannel) {
      supabaseClient.removeChannel(movesChannel);
      movesChannel = null;
    }
    movesChannel = supabaseClient
      .channel(`moves-${sessionId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'moves',
        filter: `session_id=eq.${sessionId}`
      }, payload => {
        const row = payload.new;
        if (!row || row.user_id === currentUserId) return;
        try {
          onRemoteMove?.(row);
        } catch (err) {
          onError?.(err);
        }
      })
      .subscribe();
  }

  function unbindMoves(supabaseClient) {
    if (movesChannel && supabaseClient) {
      supabaseClient.removeChannel(movesChannel);
    }
    movesChannel = null;
  }

  window.GoGameUI = {
    setLoggedIn,
    showAuthOverlay,
    hideAuthOverlay,
    showMatchingOverlay,
    hideMatchingOverlay,
    bindMoves,
    unbindMoves
  };

  document.addEventListener('DOMContentLoaded', () => {
    applyImmersiveState(false);
    ensureAuthOverlay();
    showAuthOverlay();
  });
})();
