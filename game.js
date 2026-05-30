/**
 * Modified Date: 2026-05-30
 * Description: Fully optimized routing & interface overlays. 
 * 1. 放弃依赖不稳定的原厂大厅类名，改用【登录窗体退场雷达】作为核心判定。
 * 2. 动态自愈：若检测到 mask 不存在，雷达会自动调用绘制函数进行动态创建，根除 null 报错。
 * 3. 顶级隔离：利用 z-index: 99999999 全屏壁垒，在原生对局和中间菜单前筑起主控舱。
 */
(() => {
  'use strict';

  // 全局核心状态机挂载
  window.selectedGameId = window.selectedGameId || 'guandan';
  window.state = window.state || {};

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
      /* 🔒【绝对物理压制】强行雪藏原厂围棋主框架(.app)和所有中间弹窗 */
      .app, .main-layout, #confirm-modal, .modal-backdrop {
        display: none !important;
      }
      #app-perfect-selector-mask {
        position: fixed !important; inset: 0 !important; 
        width: 100vw !important; height: 100vh !important;
        background: radial-gradient(circle at center, #111827 0%, #030712 100%) !important;
        display: flex !important; flex-direction: column !important; 
        align-items: center !important; justify-content: center !important;
        z-index: 99999999 !important; color: #ffffff !important;
      }
      .app-lobby-box {
        width: 85%; max-width: 700px; background: rgba(22, 30, 49, 0.85);
        border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 24px; padding: 45px 40px;
        box-shadow: 0 30px 70px rgba(0,0,0,0.8); backdrop-filter: blur(25px); text-align: center;
      }
      .app-game-flex { display: flex; justify-content: center; gap: 35px; margin: 40px 0; }
      .app-game-item {
        width: 220px; padding: 30px 20px; background: rgba(255, 255, 255, 0.02);
        border: 2px solid rgba(255, 255, 255, 0.06); border-radius: 20px; cursor: pointer; transition: all 0.2s ease;
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
      
      /* 🔓 真实局内画布释放锁 */
      body.in-game-match .app, body.in-game-match .main-layout { display: grid !important; }
      body.in-game-match #app-perfect-selector-mask { display: none !important; }
    `;
    document.head.appendChild(style);
  }

  // =========================================================================
  // 🎯 2. 穿透直通车路由：直接越级激活局内对局（彻底剥离原有选择逻辑）
  // =========================================================================
  window.launchMatchGame = function(mode) {
    console.log(`[主控舱直通路由] 目标 -> 游戏: ${window.selectedGameId}, 模式: ${mode}`);

    // 1. 隐藏主控舱
    const mask = document.getElementById('app-perfect-selector-mask');
    if (mask) mask.style.setProperty('display', 'none', 'important');
    
    // 2. 赋予身体允许渲染原生游戏画布的权限
    document.body.classList.add('in-game-match');

    // 3. 强行物理抹平原厂可能弹出的任何多余容器
    const intermediateGarbage = [
      '#confirm-modal', '.modal-backdrop', '#guandan-lobby-container', '#login-container', 'iframe'
    ];
    intermediateGarbage.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => el.style.setProperty('display', 'none', 'important'));
    });

    // 4. 精准穿透分流
    if (window.selectedGameId === 'guandan') {
      if (window.GD) {
        const gdLobby = document.getElementById('guandan-lobby-container');
        if (gdLobby) gdLobby.style.setProperty('display', 'none', 'important');
        
        if (typeof window.GD.initGameMatch === 'function') {
           window.GD.initGameMatch(); 
        }
      }
    } 
    else if (window.selectedGameId === 'go') {
      if (typeof window.applyImmersiveState === 'function') window.applyImmersiveState(true);
      if (typeof window.updateUI === 'function') window.updateUI();

      if (window.MP) {
        if (mode === 'SINGLE') {
          if (typeof window.MP.startAIGame === 'function') window.MP.startAIGame();
        } else {
          if (typeof window.MP.createRoom === 'function') window.MP.createRoom();
        }
      }
    }
  };

  // ==========================================
  // 3. 渲染构建游戏对局主控舱（自带自愈能力）
  // ==========================================
  window.renderAppCentralLobby = function() {
    document.body.classList.remove('in-game-match');
    injectCentralAppStyles();

    let mask = document.getElementById('app-perfect-selector-mask');
    // 如果没有找到 mask，这里会即刻执行创建，绝不会返回 null
    if (!mask) {
      mask = document.createElement('div');
      mask.id = 'app-perfect-selector-mask';
      document.body.appendChild(mask);
    }
    mask.style.setProperty('display', 'flex', 'important');

    mask.innerHTML = `
      <div class="app-lobby-box">
        <h2 style="margin: 0; font-size: 28px; font-weight: 800; letter-spacing: 1px; color: #f3f4f6;">🎮 游戏对局主控舱</h2>
        <p style="color: #9ca3af; font-size: 14px; margin-top: 10px;">已绕过原生选择菜单。选择科目后直接切入对局画布</p>
        
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
  };

  // =========================================================================
  // 4. 全域高频【登录框退场雷达】检测（彻底解决 null 报错与时序死结）
  // =========================================================================
  function initEventListeners() {
    console.log("[主控舱防御雷达] 已调校至极致。监控登录组件状态中...");

    // 提前声明防止原厂回调 undefined 报错
    window.setLoggedIn = function(val, userInfo) {
      if (val === true) {
        window.state = window.state || {};
        if (userInfo) {
          window.state.uid = userInfo.uid;
          window.state.userNickname = userInfo.nickname;
        }
        window.renderAppCentralLobby();
      }
    };

    // 🔒【退场雷达核心】：每 100 毫秒扫描一次页面。
    // 如果发现页面上原本用来挡着玩家的登录层（#login-container 或 iframe）不存在或被隐藏了
    // 并且此时玩家不在核心局内，那就说明登录通过了！立刻激活拉起主控舱。
    setInterval(() => {
      const loginBox = document.getElementById('login-container') || document.querySelector('iframe');
      const mask = document.getElementById('app-perfect-selector-mask');
      const isInGame = document.body.classList.contains('in-game-match');

      // 判定依据：登录框已经撤场，且玩家没有处于局内
      if ((!loginBox || loginBox.style.display === 'none' || loginBox.offsetWidth === 0) && !isInGame) {
        // 如果主控舱还没创建或没显示，立刻强行将其渲染出来
        if (!mask || mask.style.display === 'none') {
          console.log("[雷达捕获] 检测到登录框已安全退场，正在无缝呼叫主控舱舱门...");
          window.renderAppCentralLobby();
        }
      }
    }, 100);
  }

  // ==========================================
  // 5. 状态机通信代理
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
    document.body.classList.remove('in-game-match');
    const mask = document.getElementById('app-perfect-selector-mask');
    if (mask) mask.style.setProperty('display', 'flex', 'important');
  };

})();