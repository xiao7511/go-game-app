/**
 * Modified Date: 2026-05-30
 * Description: 游戏对局主控舱 - 多页面物理退场复位版
 * 1. 【完美修复】：修复由于单页面混淆导致找不到登录节点、重载后仍停留在 game.html 回流主控舱的恶性死循环。
 * 2. 清障跨页：点击退出时，全量清洗浏览器残留 Token 缓存，并强制将上下文物理重定向至原厂“login.html”登录专页。
 */
(() => {
  'use strict';

  // 全局核心状态机初始化
  window.selectedGameId = 'guandan';
  window.state = window.state || {};
  window.isLoggingOut = false; 

  let supabaseInstance = null;
  let isInitializing = false;

  window.getSupabaseClient = function() {
      return supabaseInstance;
  };

  // ==========================================
  // 1. APP 全屏沉浸式主控舱高强度样式静态注入
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
      /* 🔒【绝对物理压制】非局内匹配状态下，强行雪藏原厂所有老旧大厅外观 */
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
  // 🎯 2. 穿透直通车路由
  // =========================================================================
 /* window.launchMatchGame = function(mode) {
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
  };*/
  // =========================================================================
  // 🎯 2. 穿透直通车路由（已完美融合掼蛋一键刺穿联机网关）
  // =========================================================================
  window.launchMatchGame = function(mode) {
    if (window.isLoggingOut) return;
    console.log(`[主控舱直通车] 正在强切对局 -> 游戏: ${window.selectedGameId}, 模式: ${mode}`);

    // 🚀【核心改造】：如果选中的是掼蛋且点击的是联机版（NET），直接穿透刺入 Supabase 实时联机引擎
    if (window.selectedGameId === 'guandan' && mode === 'NET') {
      document.body.classList.add('in-game-match');
      const mask = document.getElementById('app-perfect-selector-mask');
      if (mask) mask.style.setProperty('display', 'none', 'important');

      // 清除可能产生干扰的弹窗与遮罩
      const intermediateGarbage = ['#confirm-modal', '.modal-backdrop', '#guandan-lobby-container', '#login-container', 'iframe'];
      intermediateGarbage.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => el.style.setProperty('display', 'none', 'important'));
      });

      // 强力拉起掼蛋实时联机引擎
      if (window.GD_MP && typeof window.GD_MP.startNetMatch === 'function') {
        window.GD_MP.startNetMatch();
      } else {
        alert("检测到联机数据包 guandan-mp-ext.js 尚未就绪，请检查引入顺序！");
      }
      return; // 🔥 熔断拦截，不进入下方的常规单机/二级大厅逻辑
    }

    // ==========================================
    // 常规对局切入路径（单机版或围棋对局流程）
    // ==========================================
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
        // 进入单机模式，确保状态标记为 SOLO
        if (window.state) window.state.gameMode = 'SOLO';
        
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

    // ⚡【核心改造】：退出系统 - 跨多页面硬重定向
    document.getElementById('app-global-signout-trigger').onclick = async (e) => {
      e.stopPropagation();
      console.log("[主控舱跨页退场] 正在执行全域脱敏与物理切页...");
      
      // 开启熔断锁
      window.isLoggingOut = true; 
      document.body.classList.add('app-system-logged-out');

      // 1. 高强度抹除本域下的所有本地缓存令牌，彻底掐断回流根基
      try {
        localStorage.clear();
        sessionStorage.clear();
        console.log("[本地存储] 缓存洗净成功。");
      } catch (ex) {}

      // 2. 异步阻塞向云端 Supabase 宣告登出注销
      const client = window.getSupabaseClient();
      if (client && client.auth && typeof client.auth.signOut === 'function') {
        try { 
          await client.auth.signOut(); 
          console.log("[Supabase Auth] 云端会话注销完毕。");
        } catch (err) {}
      }

      // 3. 🚀【物理跨页跳转】：彻底离开 game.html，硬切回专职的登录框界面 login.html
      console.log("[跨页重定向] 正在精准驶向登录专页...");
      window.location.replace("login.html");
    };
  };

  // =========================================================================
  // 4. 全域高频【退局重定向守卫】与【状态自愈雷达】
  // =========================================================================
  function initEventListeners() {
    window.setLoggedIn = function(val, userInfo) {
      // 💥 如果熔断锁已开启，永久屏蔽并丢弃任何干扰调用
      if (window.isLoggingOut) return; 

      if (val === true) {
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
      if (window.isLoggingOut) return;

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

    // 🔒【物理防回头雷达】
    setInterval(() => {
      if (window.isLoggingOut) return;

      const loginBox = document.getElementById('login-container') || document.querySelector('iframe');
      const mask = document.getElementById('app-perfect-selector-mask');
      const isInGame = document.body.classList.contains('in-game-match');

      if (loginBox && loginBox.style.display !== 'none' && loginBox.offsetWidth > 0) {
        if (mask && mask.style.display !== 'none') {
          mask.style.setProperty('display', 'none', 'important');
        }
        return;
      }

      const gdLobby = document.getElementById('guandan-lobby-container');
      if (gdLobby && gdLobby.style.display !== 'none' && gdLobby.offsetWidth > 0 && !isInGame) {
        gdLobby.style.setProperty('display', 'none', 'important');
        window.renderAppCentralLobby();
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

  /*window.addEventListener('DOMContentLoaded', () => {
    setTimeout(initEventListeners, 20);
  });*/
  // =========================================================================
  // 🧭 【核心注入】掼蛋参数直连自愈引导雷达
  // =========================================================================
// =========================================================================
  // 🧭 【终极防反弹】掼蛋参数直连自愈引导雷达（强力压制游戏选择大厅版）
  // =========================================================================
    // =========================================================================
  // 🧭 【终极合体版】掼蛋参数直连自愈引导雷达（防原系统清场、强拉对局版）
  // =========================================================================
  window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const gameParam = urlParams.get('game');
    const modeParam = urlParams.get('mode');
    const roomParam = urlParams.get('room');

    if (gameParam === 'guandan' && modeParam === 'NET' && roomParam) {
      console.log(`[路由雷达] 锁定掼蛋目标房: ${roomParam}。启动深度防清场劫持...`);
      
      // 1. 深度锁定状态，防止异步登录回调重置它
      window.selectedGameId = 'guandan';
      if (window.state) {
        window.state.gameMode = 'NET_BATTLE';
      }

      // 2. 高频持续压制大厅 + 持续强拉掼蛋游戏主界面
      let enforcementTimer = setInterval(() => {
        // A. 斩断大厅/登录/选择界面的生路
        const lobbySelectors = [
          '#game-selection', '.lobby', '#guandan-lobby-container', 
          '#app-perfect-selector-mask', '#login-container', '.modal-backdrop', '#confirm-modal'
        ];
        lobbySelectors.forEach(selector => {
          document.querySelectorAll(selector).forEach(el => {
            el.style.setProperty('display', 'none', 'important');
          });
        });

        // B. 【核心补丁】：如果原系统脚本把掼蛋的游戏战场容器隐藏了，我们强行把它拉起来！
        const guandanGameSelectors = ['#guandan-game-container', '#game-container', '.game-board'];
        guandanGameSelectors.forEach(selector => {
          document.querySelectorAll(selector).forEach(el => {
            el.style.setProperty('display', 'block', 'important'); // 确保掼蛋主界面是可见的
          });
        });

        // C. 保持对局激活状态
        document.body.classList.add('in-game-match');
      }, 50);

      // 3. 2.5秒后释放定时器
      setTimeout(() => {
        clearInterval(enforcementTimer);
        console.log(`[路由雷达] 环境稳固，停止压制。`);
      }, 2500);

      // 4. 【双保险唤醒机制】：由于涉及到登录成功后的时间差，我们在 600ms 和 1200ms 各精准打入一次房间
      const launchMatch = () => {
        if (window.GD_MP && typeof window.GD_MP.startNetMatch === 'function') {
          console.log(`[路由雷达] 正在向掼蛋联机引擎下达对局接入指令...`);
          window.GD_MP.startNetMatch(roomParam);
          
          // 强行补充调用一次原厂 Canvas 重绘，击碎原系统的初始化白屏
          if (typeof window.renderGameBoard === 'function') {
            setTimeout(window.renderGameBoard, 100);
          }
        }
      };

      setTimeout(launchMatch, 600);   // 第一波尝试
      setTimeout(launchMatch, 1200);  // 第二波兜底（防登录异步脚本过慢导致的第一波失效）
    }
  });

  window.backToCentralLobby = () => {
    if (window.isLoggingOut) return;
    window.selectedGameId = 'guandan';
    document.body.classList.remove('in-game-match');
    const mask = document.getElementById('app-perfect-selector-mask');
    if (mask) mask.style.setProperty('display', 'flex', 'important');
  };

})();