/**
 * Modified Date: 2026-05-30
 * Description: 游戏对局主控舱 - 智能自愈与雷达熔断版
 * 1. 【完美修复】：彻底解决点击“退出系统”时登录框闪现后又被主控舱强制拉回的死循环 Bug。
 * 2. 状态熔断：引入 window.isLoggingOut 全局锁，注销时彻底切断 setInterval 雷达，确保顺畅退至登录页。
 * 3. 免密兼容：优化了针对原生 login-container 状态的判定阈值，防止时序冲突。
 */
(() => {
  'use strict';

  // 全局核心状态机初始化
  window.selectedGameId = 'guandan';
  window.state = window.state || {};
  window.isLoggingOut = false; // 🔒 退出系统熔断锁，防止自愈雷达无限回拉

  let supabaseInstance = null;
  let isInitializing = false;

  window.getSupabaseClient = function() {
      return supabaseInstance;
  };

  // ==========================================
  // 1. APP 全屏沉浸式主控舱高强度样式静态注入（多端自适应）
  // ==========================================
  function injectCentralAppStyles() {
    if (document.getElementById('app-fs-global-style')) return;
    const style = document.createElement('style');
    style.id = 'app-fs-global-style';
    style.textContent = `
      html, body { 
        margin: 0 !important; padding: 0 !important; 
        width: 100vw !important; height: 100vh !important; 
        overflow: hidden !important; 
        background: #090d16 !important; 
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      /* 🔒【绝对物理压制】非局内匹配且未注销状态下，强行雪藏原厂所有老旧大厅外观和弹窗 */
      body:not(.app-system-logged-out) .app, 
      body:not(.app-system-logged-out) .main-layout, 
      body:not(.app-system-logged-out) #confirm-modal, 
      body:not(.app-system-logged-out) .modal-backdrop, 
      body:not(.app-system-logged-out) #guandan-lobby-container, 
      body:not(.app-system-logged-out) #lobby-container, 
      body:not(.app-system-logged-out) .lobby {
        display: none !important;
      }
      #app-perfect-selector-mask {
        position: fixed !important; inset: 0 !important; 
        width: 100vw !important; height: 100vh !important;
        background: radial-gradient(circle at center, #111827 0%, #030712 100%) !important;
        display: flex !important; flex-direction: column !important; 
        align-items: center !important; justify-content: center !important;
        z-index: 99999999 !important; color: #ffffff !important;
        box-sizing: border-box;
        padding: 20px;
      }
      .app-lobby-box {
        position: relative;
        width: 100%; max-width: 700px; background: rgba(22, 30, 49, 0.85);
        border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 24px; padding: 45px 40px;
        box-shadow: 0 30px 70px rgba(0,0,0,0.8); backdrop-filter: blur(25px); text-align: center;
        box-sizing: border-box;
        max-height: 95vh;
        overflow-y: auto;
      }
      
      .app-system-logout-btn {
        position: absolute; top: 20px; right: 20px;
        background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.4);
        color: #ef4444; padding: 6px 14px; font-size: 13px; font-weight: 600;
        border-radius: 30px; cursor: pointer; transition: all 0.2s ease;
        display: flex; align-items: center; gap: 4px;
      }
      .app-system-logout-btn:hover {
        background: #ef4444; color: #ffffff; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
      }

      .app-game-flex { display: flex; justify-content: center; gap: 35px; margin: 40px 0; }
      .app-game-item {
        flex: 1; max-width: 220px; min-width: 140px; padding: 30px 20px; 
        background: rgba(255, 255, 255, 0.02); border: 2px solid rgba(255, 255, 255, 0.06); 
        border-radius: 20px; cursor: pointer; transition: all 0.2s ease; box-sizing: border-box;
      }
      .app-game-item:hover { transform: translateY(-4px); border-color: #3b82f6; background: rgba(255, 255, 255, 0.04); }
      .app-game-item.active-selected {
        background: linear-gradient(135deg, #16a34a 0%, #15803d 100%) !important;
        border-color: #4ade80 !important; box-shadow: 0 12px 30px rgba(22, 163, 74, 0.4);
      }
      .app-btn-container { display: flex; justify-content: center; gap: 24px; margin-top: 10px; }
      .app-action-btn { padding: 14px 40px; font-size: 16px; font-weight: bold; border-radius: 30px; border: none; cursor: pointer; transition: all 0.1s ease; }
      .app-action-btn:active { transform: scale(0.96); }
      .app-btn-primary { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; box-shadow: 0 8px 20px rgba(37,99,235,0.3); }
      .app-btn-success { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; box-shadow: 0 8px 20px rgba(217,119,6,0.3); }
      
      body.in-game-match .app, body.in-game-match .main-layout { 
        display: grid !important; 
      }
      body.in-game-match #guandan-game-container {
        display: block !important;
      }
      body.in-game-match #app-perfect-selector-mask { 
        display: none !important; 
      }

      @media (max-width: 640px) {
        .app-lobby-box { padding: 30px 20px; border-radius: 18px; }
        .app-system-logout-btn { position: relative; top: 0; right: 0; display: inline-flex; margin-bottom: 20px; }
        .app-game-flex { gap: 15px; margin: 25px 0; flex-direction: row; }
        .app-game-item { padding: 15px 10px; border-radius: 14px; }
        .app-game-item div { font-size: 35px !important; margin-bottom: 6px !important; }
        .app-game-item h4 { font-size: 15px !important; }
        .app-game-item span { font-size: 10px !important; }
        .app-btn-container { flex-direction: column; gap: 12px; width: 100%; }
        .app-action-btn { width: 100%; padding: 12px 0; font-size: 15px; }
        h2 { font-size: 22px !important; }
      }
    `;
    document.head.appendChild(style);
  }

  // =========================================================================
  // 🎯 2. 穿透直通车路由：进入真实棋盘/牌桌对局
  // =========================================================================
  window.launchMatchGame = function(mode) {
    if (window.isLoggingOut) return;
    console.log(`[主控舱直通车] 正在强切对局 -> 游戏: ${window.selectedGameId}, 模式: ${mode}`);

    document.body.classList.add('in-game-match');
    const mask = document.getElementById('app-perfect-selector-mask');
    if (mask) mask.style.setProperty('display', 'none', 'important');
    
    const intermediateGarbage = [
      '#confirm-modal', '.modal-backdrop', '#guandan-lobby-container', '#login-container', 'iframe'
    ];
    intermediateGarbage.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => el.style.setProperty('display', 'none', 'important'));
    });

    if (window.selectedGameId === 'guandan') {
      if (window.GD) {
        const gdLobby = document.getElementById('guandan-lobby-container');
        if (gdLobby) gdLobby.style.setProperty('display', 'none', 'important');
        if (typeof window.GD.initGameMatch === 'function') {
          window.GD.initGameMatch();
        } else if (typeof window.GD.init === 'function') {
          window.GD.init();
        }
      }
    } 
    else if (window.selectedGameId === 'go') {
      if (typeof window.applyImmersiveState === 'function') window.applyImmersiveState(true);
      if (typeof window.updateUI === 'function') window.updateUI();

      if (window.MP) {
        if (mode === 'SINGLE') {
          if (typeof window.MP.startAIGame === 'function') {
            window.MP.startAIGame();
          } else if (typeof window.startAIGame === 'function') {
            window.startAIGame();
          }
        } else {
          if (typeof window.MP.createRoom === 'function') window.MP.createRoom();
        }
      }
      const rawGoLobby = document.getElementById('game-selection') || document.querySelector('.lobby');
      if (rawGoLobby) rawGoLobby.style.setProperty('display', 'none', 'important');
    }
  };

  // ==========================================
  // 3. 渲染构建游戏对局主控舱
  // ==========================================
  window.renderAppCentralLobby = function() {
    // 如果正在注销状态中，永久熔断禁止重新拉起主控舱
    if (window.isLoggingOut) return;

    window.selectedGameId = 'guandan';
    document.body.classList.remove('in-game-match', 'app-system-logged-out');
    injectCentralAppStyles();

    let mask = document.getElementById('app-perfect-selector-mask');
    if (!mask) {
      mask = document.createElement('div');
      mask.id = 'app-perfect-selector-mask';
      document.body.appendChild(mask);
    }
    mask.style.setProperty('display', 'flex', 'important');

    mask.innerHTML = `
      <div class="app-lobby-box">
        <button class="app-system-logout-btn" id="app-global-signout-trigger">
          <span>🚪</span> 退出系统
        </button>

        <h2 style="margin: 0; font-size: 28px; font-weight: 800; letter-spacing: 1px; color: #f3f4f6;">🎮 游戏对局主控舱</h2>
        <p style="color: #9ca3af; font-size: 14px; margin-top: 10px;">选择科目和模式后直接切入局内</p>
        
        <div class="app-game-flex">
          <div class="app-game-item active-selected" data-id="guandan">
            <div style="font-size: 50px; margin-bottom: 12px;">🃏</div>
            <h4 style="margin: 0; font-size: 18px; color: #ffffff;">江苏掼蛋</h4>
            <span style="font-size: 11px; color: #4ade80; display:block; margin-top:6px; font-weight:bold;">智能穿透直通版</span>
          </div>
          <div class="app-game-item" data-id="go">
            <div style="font-size: 50px; margin-bottom: 12px;">⚪</div>
            <h4 style="margin: 0; font-size: 18px; color: #ffffff;">经典围棋</h4>
            <span style="font-size: 11px; opacity: 0.6; display:block; margin-top:6px;">19x19 矩阵免密版</span>
          </div>
        </div>
        
        <div class="app-btn-container">
          <button class="app-action-btn app-btn-primary" id="perfect-go-solo">进入单机版</button>
          <button class="app-action-btn app-btn-success" id="perfect-go-net">进入联机版</button>
        </div>
      </div>
    `;

    const items = mask.querySelectorAll('.app-game-item');
    items.forEach(item => {
      item.onclick = (e) => {
        e.stopPropagation();
        items.forEach(i => i.classList.remove('active-selected'));
        item.classList.add('active-selected');
        window.selectedGameId = item.getAttribute('data-id');
      };
    });

    document.getElementById('perfect-go-solo').onclick = () => window.launchMatchGame('SINGLE');
    document.getElementById('perfect-go-net').onclick = () => window.launchMatchGame('NET');

    // 🚪 点击“退出系统”核心逻辑升级版
    document.getElementById('app-global-signout-trigger').onclick = async (e) => {
      e.stopPropagation();
      console.log("[主控舱核心退场] 启动物理熔断锁，正在安全移交控制权给原生登录页...");
      
      // ✨【关键修复 1】：激活熔断锁，让后台 setInterval 雷达瞬间失效，不再干扰退舱进程
      window.isLoggingOut = true;

      // 释放样式压制锁
      document.body.classList.remove('in-game-match');
      document.body.classList.add('app-system-logged-out');

      // 销毁主控舱 DOM 视窗
      if (mask) mask.style.setProperty('display', 'none', 'important');

      // 清除游戏内所有运行状态、定时器和全局用户信息
      if (typeof window.clearBlink === 'function') window.clearBlink();
      if (window.state) {
        window.state.isInRoom = false;
        window.state.gameMode = null;
        window.state.uid = null;
        window.state.userNickname = null;
      }
      if (window.GD && typeof window.GD.destroy === 'function') window.GD.destroy();

      // 调用 Supabase 注销线上 Session 会话
      const client = window.getSupabaseClient();
      if (client && client.auth && typeof client.auth.signOut === 'function') {
        try {
          await client.auth.signOut();
          console.log("[Supabase Auth] 线上登录凭证已安全注销。");
        } catch (err) {
          console.error("Supabase 注销异常:", err);
        }
      }

      // 展现原生游戏登录视窗
      const loginBox = document.getElementById('login-container');
      if (loginBox) {
        loginBox.style.setProperty('display', 'block', 'important');
        loginBox.style.setProperty('visibility', 'visible', 'important');
      } else {
        // 全量安全降级：若未找到登录节点则直接刷新页面切回初始未登录态
        window.location.reload();
      }
    };
  };

  // =========================================================================
  // 4. 全域高频【退局重定向守卫】与【状态自愈雷达】
  // =========================================================================
  function initEventListeners() {
    console.log("[主控舱防御雷达] 防御系统就绪...");

    window.setLoggedIn = function(val, userInfo) {
      if (val === true) {
        // ✨【关键修复 2】：如果用户重新登录成功，解除注销熔断锁
        window.isLoggingOut = false; 
        window.state = window.state || {};
        if (userInfo) {
          window.state.uid = userInfo.uid;
          window.state.userNickname = userInfo.nickname;
        }
        window.renderAppCentralLobby();
      }
    };

    // 退局动作拦截
    document.addEventListener('click', (e) => {
      if (window.isLoggingOut) return; // 熔断期间不拦截任何点击

      const target = e.target;
      if (!target) return;

      const isQuitAction = 
        target.id === 'quit-game-btn' || 
        target.closest('#quit-game-btn') || 
        target.classList.contains('quit-game-btn') ||
        (target.tagName === 'BUTTON' && target.textContent.includes('返回大厅')) ||
        target.id === 'gd-btn-lobby-return';

      if (isQuitAction) {
        document.body.classList.remove('in-game-match');
        window.selectedGameId = 'guandan';
        
        if (typeof window.clearBlink === 'function') window.clearBlink();
        if (window.state) {
          window.state.isInRoom = false;
          window.state.gameMode = null;
        }
        if (window.GD && typeof window.GD.destroy === 'function') window.GD.destroy();

        const gdLobby = document.getElementById('guandan-lobby-container');
        if (gdLobby) gdLobby.style.setProperty('display', 'none', 'important');

        window.renderAppCentralLobby();
      }
    }, true);

    // 🔒【物理防回头雷达升级版】
    setInterval(() => {
      // ✨【关键修复 3】：若检测到熔断锁开启（正在登出），雷达全面停摆，绝不执行任何恢复主控舱的判定
      if (window.isLoggingOut) return;

      const loginBox = document.getElementById('login-container') || document.querySelector('iframe');
      const mask = document.getElementById('app-perfect-selector-mask');
      const isInGame = document.body.classList.contains('in-game-match');

      const gdLobby = document.getElementById('guandan-lobby-container');
      if (gdLobby && gdLobby.style.display !== 'none' && gdLobby.offsetWidth > 0 && !isInGame) {
        gdLobby.style.setProperty('display', 'none', 'important');
        window.renderAppCentralLobby();
        return;
      }

      // 如果有明确的登录框展现在屏幕上，禁止强拉主控舱
      if (loginBox && loginBox.style.display !== 'none' && loginBox.offsetWidth > 0) {
        if (mask && mask.style.display !== 'none') {
          mask.style.setProperty('display', 'none', 'important');
        }
        return;
      }

      if ((!loginBox || loginBox.style.display === 'none' || loginBox.offsetWidth === 0) && !isInGame) {
        if (!mask || mask.style.display === 'none') {
          window.renderAppCentralLobby();
        }
      }
    }, 100);
  }

  // ==========================================
  // 5. 状态机通信网关代理
  // ==========================================
  window.addEventListener('configReady', function(event) {
      if (isInitializing || supabaseInstance) return;
      isInitializing = true;
      const config = event.detail;
      if (config && config.SUPABASE_URL && config.SUPABASE_ANON_KEY) {
          try {
              const { createClient } = window.supabase;
              supabaseInstance = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
          } catch (e) {}
      }
  });

  window.addEventListener('DOMContentLoaded', () => {
    setTimeout(initEventListeners, 20);
  });

  window.backToCentralLobby = () => {
    if (window.isLoggingOut) return;
    window.selectedGameId = 'guandan';
    document.body.classList.remove('in-game-match');
    const mask = document.getElementById('app-perfect-selector-mask');
    if (mask) mask.style.setProperty('display', 'flex', 'important');
  };

})();