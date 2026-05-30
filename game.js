/**
 * Modified Date: 2026-05-30
 * Description: Fully optimized routing & interface overlays. 
 * 1. Hijacked the post-login lifecycle to swap the original lobby with the custom APP-fullscreen launcher.
 * 2. Enabled single-click green highlight toggle, fast launch, and bottom button splitter.
 * 3. Supports instant Go (围棋) and Guandan (掼蛋) routing for both Single-player and Multiplayer modes.
 * 4. [CRITICAL UPDATE 2026-05-30]: Bypassed all intermediate menu selections completely to achieve pure direct-play injection.
 */
(() => {
  'use strict';

  window.selectedGameId = window.selectedGameId || 'guandan';

  let supabaseInstance = null;
  let isInitializing = false;
  window.state = window.state || {};

  window.getSupabaseClient = function() {
      return supabaseInstance;
  };

  // APP 全屏沉浸式模式全局样式注入
  function injectCentralAppStyles() {
    if (document.getElementById('app-fs-global-style')) return;
    const style = document.createElement('style');
    style.id = 'app-fs-global-style';
    style.textContent = `
      html, body { 
        margin: 0; padding: 0; 
        width: 100vw; height: 100vh; 
        overflow: hidden !important; 
        background: #090d16; 
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
    `;
    document.head.appendChild(style);
  }

  // =========================================================================
  // 🎯 核心调度：路由直通穿透函数 (修改日期: 2026-05-30)
  // =========================================================================
  window.launchMatchGame = function(mode) {
    console.log(`[主控舱路由] [2026-05-30] 正在直接拉起真实游戏局内 -> 游戏: ${window.selectedGameId}, 模式: ${mode}`);

    // 1. 隐藏主控舱主界面
    const mask = document.getElementById('app-perfect-selector-mask');
    if (mask) {
      mask.style.setProperty('display', 'none', 'important');
    }

    // 2. 🌟【根治核心】：强制将原系统所有老旧的游戏选择、模式选择、房间列表界面彻底封杀，防止它们弹出
    const intermediateSelectors = [
      '#game-choice-panel', 
      '.game-selection-wrapper', 
      '.game-select-modal', 
      '#mode-select-overlay',
      '.lobby-menu-container',
      '#guandan-lobby-container',
      '#room-lobby-container'
    ];
    intermediateSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
      });
    });

    // 3. 绕过原厂大厅菜单，直切真实游戏局内
    if (window.selectedGameId === 'guandan') {
      let gdHandler = window.GD || (window.parent && window.parent.GD);
      if (gdHandler && typeof gdHandler.initGameMatchDirect === 'function') {
        // 调用重构后的直接进入函数
        gdHandler.initGameMatchDirect(mode);
      }
    } 
    else if (window.selectedGameId === 'go') {
      if (typeof window.applyImmersiveState === 'function') window.applyImmersiveState(true);
      if (typeof window.updateUI === 'function') window.updateUI();

      if (window.MP) {
        if (mode === 'SINGLE') {
          if (typeof window.MP.startAIGame === 'function') window.MP.startAIGame();
        } else {
          if (typeof window.MP.startMultiplayerGame === 'function') window.MP.startMultiplayerGame();
        }
      }
    }
  };

  // ==========================================
  // 3. 渲染新设计的“游戏对局主控舱”
  // ==========================================
  window.renderAppCentralLobby = function() {
    injectCentralAppStyles();
    
    // 强制把原有的乱七八糟选择容器隐藏
    const intermediateSelectors = ['#game-selection', '.game-selection-wrapper', '#guandan-lobby-container'];
    intermediateSelectors.forEach(s => {
      document.querySelectorAll(s).forEach(el => el.style.setProperty('display', 'none', 'important'));
    });

    if (!document.getElementById('app-perfect-overlay-css')) {
      const style = document.createElement('style');
      style.id = 'app-perfect-overlay-css';
      style.textContent = `
        #app-perfect-selector-mask {
          position: fixed; inset: 0; width: 100vw; height: 100vh;
          background: radial-gradient(circle at center, #111827 0%, #030712 100%) !important;
          display: none; flex-direction: column; align-items: center; justify-content: center;
          z-index: 999999 !important; color: #ffffff;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .app-lobby-box {
          width: 85%; max-width: 720px; background: rgba(31, 41, 55, 0.65);
          border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 24px; padding: 40px;
          box-shadow: 0 25px 60px rgba(0,0,0,0.8); backdrop-filter: blur(20px); text-align: center;
        }
        .app-game-flex { display: flex; justify-content: center; gap: 30px; margin: 35px 0; }
        .app-game-item {
          width: 200px; padding: 25px 15px; background: rgba(255, 255, 255, 0.03);
          border: 2px solid rgba(255, 255, 255, 0.06); border-radius: 18px; cursor: pointer; transition: all 0.2s ease;
        }
        .app-game-item:hover { transform: translateY(-4px); border-color: #3b82f6; }
        .app-game-item.active-selected {
          background: linear-gradient(135deg, #16a34a 0%, #15803d 100%) !important;
          border-color: #4ade80 !important; box-shadow: 0 10px 25px rgba(22, 163, 74, 0.4);
        }
        .app-btn-container { display: flex; justify-content: center; gap: 20px; }
        .app-action-btn { padding: 12px 35px; font-size: 15px; font-weight: bold; border-radius: 30px; border: none; cursor: pointer; transition: transform 0.1s; }
        .app-action-btn:active { transform: scale(0.96); }
        .app-btn-primary { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; }
        .app-btn-success { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; }
      `;
      document.head.appendChild(style);
    }

    let mask = document.getElementById('app-perfect-selector-mask');
    if (!mask) {
      mask = document.createElement('div');
      mask.id = 'app-perfect-selector-mask';
      document.body.appendChild(mask);
    }
    
    mask.style.setProperty('display', 'flex', 'important');

    mask.innerHTML = `
      <div class="app-lobby-box">
        <h2 style="margin: 0; font-size: 26px; font-weight: 800; letter-spacing: 0.5px;">🎮 游戏对局主控舱</h2>
        <p style="color: #94a3b8; font-size: 13px; margin-top: 8px;">在这里选择科目，点击下方按钮直接进入游戏局内，免除一切中间干扰</p>
        <div class="app-game-flex">
          <div class="app-game-item active-selected" data-id="guandan">
            <div style="font-size: 45px; margin-bottom: 8px;">🃏</div>
            <h4 style="margin: 0; font-size: 17px;">江苏掼蛋</h4>
            <span style="font-size: 11px; opacity: 0.6; display:block; margin-top:4px;">智能直通版</span>
          </div>
          <div class="app-game-item" data-id="go">
            <div style="font-size: 45px; margin-bottom: 8px;">⚪</div>
            <h4 style="margin: 0; font-size: 17px;">经典围棋</h4>
            <span style="font-size: 11px; opacity: 0.6; display:block; margin-top:4px;">19x19 矩阵免密版</span>
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
  // 4. 强效单轨拦截器
  // =========================================================================
  function initSystemInterceptor() {
    // 在 game.js 中重写登录劫持
    if (typeof window.setLoggedIn === 'function') {
      const originalSetLoggedIn = window.setLoggedIn;
      
      // 拦截接收两个参数：val (布尔值) 和 userInfo (原厂传过来的用户数据)
      window.setLoggedIn = function(val, userInfo) {
        originalSetLoggedIn(val, userInfo);
        
        if (val === true) {
          console.log("[主控舱安全拦截] 检测到登录成功，正在同步用户信息...", userInfo);
          
          // 🌟 核心修复：手动将数据挂载到全局变量，打破 false 僵局
          window.state = window.state || {};
          if (userInfo) {
            window.state.uid = userInfo.uid;
            window.state.userNickname = userInfo.nickname;
          } else {
            // 如果原厂没传，塞入兜底不为 false 的标记
            window.state.uid = "logged_in_user"; 
          }
          
          // 瞬间擦除老界面，强切新设计主控舱
          setTimeout(window.renderAppCentralLobby, 20);
        }
      };
    }

    
    // 轮询拦截，确保老游戏大厅绝无可能抬头
    setInterval(() => {
      // 1. 直接检测全局状态机里是否有用户 ID 或 Token（证明已登录成功）
      const isLoggedIn = !!(window.state && (window.state.uid || window.state.userNickname));
      
      if (isLoggedIn) {
        const mask = document.getElementById('app-perfect-selector-mask');
        const containerGd = document.getElementById('guandan-game-container');
        const containerGo = document.getElementById('go-game-board-container');
        
        // 2. 如果已经登录，且当前既没在对局中，也没弹出主控舱，则强制拉起主控舱
        if ((!mask || mask.style.display === 'none') && 
            (!containerGd || containerGd.style.display === 'none') && 
            (!containerGo || containerGo.style.display === 'none')) {
          
          // 顺手清洗掉可能残留的原厂老大厅
          const rawLobby = document.getElementById('game-choice-panel');
          if (rawLobby) rawLobby.style.setProperty('display', 'none', 'important');
          
          window.renderAppCentralLobby();
        }
      }
    }, 200);
  }

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
    setTimeout(initSystemInterceptor, 50);
  });

  window.backToCentralLobby = () => {
    const mask = document.getElementById('app-perfect-selector-mask');
    if (mask) mask.style.setProperty('display', 'flex', 'important');
  };

})();