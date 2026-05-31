/**
 * Modified Date: 2026-05-30
 * Description: 游戏对局主控舱 - 旗舰自愈与状态物理清洗版
 * 1. 【完美修复】：彻底解决从围棋退局后，新主控舱默认高亮掼蛋但点击按钮仍旧进入围棋的恶性 Bug。
 * 2. 状态强洗：在退出对局（quit-game-btn）及重绘大厅（renderAppCentralLobby）时，强制重置 window.selectedGameId 为默认值 'guandan'。
 * 3. 拦截增强：全面劫持围棋与掼蛋的“退出/返回大厅”动作，消除一切内存残留。
 */
(() => {
  'use strict';

  // 全局核心状态机初始化（默认聚焦掼蛋）
  window.selectedGameId = 'guandan';
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
      /* 🔒【绝对物理压制】非局内匹配状态下，强行雪藏原厂所有老旧大厅外观和弹窗 */
      .app, .main-layout, #confirm-modal, .modal-backdrop, #guandan-lobby-container, #lobby-container, .lobby {
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
      
      /* 🔓 【局内真视窗释放锁】仅在局内时释放原厂容器 */
      body.in-game-match .app, body.in-game-match .main-layout { 
        display: grid !important; 
      }
      body.in-game-match #guandan-game-container {
        display: block !important;
      }
      body.in-game-match #app-perfect-selector-mask { 
        display: none !important; 
      }
    `;
    document.head.appendChild(style);
  }

  // =========================================================================
  // 🎯 2. 穿透直通车路由：强行抹平原生菜单，进入真实棋盘/牌桌对局
  // =========================================================================
  window.launchMatchGame = function(mode) {
    console.log(`[主控舱直通车] 正在强切对局 -> 当前选择游戏ID: ${window.selectedGameId}, 模式: ${mode}`);

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
    // ✨【核心修复点 1】：每次调用重绘时，确保内存状态与 UI 的默认高亮（掼蛋）100% 同步
    window.selectedGameId = 'guandan';
    console.log("[主控舱状态强洗] 选择舱渲染，已强设内存 window.selectedGameId = 'guandan'");

    document.body.classList.remove('in-game-match');
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
        console.log(`[主控舱动态切换] 用户手动切换游戏项目为: ${window.selectedGameId}`);
      };
    });

    document.getElementById('perfect-go-solo').onclick = () => window.launchMatchGame('SINGLE');
    document.getElementById('perfect-go-net').onclick = () => window.launchMatchGame('NET');
  };

  // =========================================================================
  // 4. 全域高频【退局重定向守卫】与【状态自愈雷达】
  // =========================================================================
  function initEventListeners() {
    console.log("[主控舱防御雷达] 系统就绪。全向监控残留拦截锁...");

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

    // ⚡【退局动作深度劫持】：全向拦截并重置底层状态
    document.addEventListener('click', (e) => {
      const target = e.target;
      if (!target) return;

      const isQuitAction = 
        target.id === 'quit-game-btn' || 
        target.closest('#quit-game-btn') || 
        target.classList.contains('quit-game-btn') ||
        (target.tagName === 'BUTTON' && target.textContent.includes('返回大厅')) ||
        target.id === 'gd-btn-lobby-return';

      if (isQuitAction) {
        console.log("[主控舱防御机制] 捕捉到退局信号，启动数据脱敏与状态硬清洗...");
        
        // 剥离局内核心视窗显示锁
        document.body.classList.remove('in-game-match');
        
        // ✨【核心修复点 2】：退局时不仅清空局内状态，立刻硬洗全局选择标记为 'guandan'
        window.selectedGameId = 'guandan';
        
        // 擦除围棋可能残留的闪烁高光定时器
        if (typeof window.clearBlink === 'function') window.clearBlink();
        if (window.state) {
          window.state.isInRoom = false;
          window.state.gameMode = null;
        }
        if (window.GD && typeof window.GD.destroy === 'function') {
          window.GD.destroy();
        }

        const gdLobby = document.getElementById('guandan-lobby-container');
        if (gdLobby) gdLobby.style.setProperty('display', 'none', 'important');

        // 重新渲染选择主控舱（内部会再次兜底洗一次变量）
        window.renderAppCentralLobby();
      }
    }, true); // 激活捕获流，优先于任何原厂底层逻辑运行

    // 🔒【物理防回头雷达】
    setInterval(() => {
      const loginBox = document.getElementById('login-container') || document.querySelector('iframe');
      const mask = document.getElementById('app-perfect-selector-mask');
      const isInGame = document.body.classList.contains('in-game-match');

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

  window.addEventListener('DOMContentLoaded', () => {
    setTimeout(initEventListeners, 20);
  });

  window.backToCentralLobby = () => {
    window.selectedGameId = 'guandan';
    document.body.classList.remove('in-game-match');
    const mask = document.getElementById('app-perfect-selector-mask');
    if (mask) mask.style.setProperty('display', 'flex', 'important');
  };

})();