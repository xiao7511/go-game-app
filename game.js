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

  // ==========================================
  // 1. 全局变量初始化
  // ==========================================
  window.selectedGameId = window.selectedGameId || 'guandan';

  let supabaseInstance = null;
  let isInitializing = false;

  window.state = window.state || {};

  window.getSupabaseClient = function() {
      return supabaseInstance;
  };

  // APP 全屏沉浸式主控舱基础全局样式
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
  // 作用：直接透传核心参数进入真实游戏对局，深度封杀所有原大厅中间二次界面
  // =========================================================================
  window.launchMatchGame = function(mode) {
    console.log(`[主控舱路由] [2026-05-30] 正在直接拉起对局 -> 游戏: ${window.selectedGameId}, 模式: ${mode}`);

    // 1. 隐蔽主控舱主界面
    const mask = document.getElementById('app-perfect-selector-mask');
    if (mask) {
      mask.style.setProperty('display', 'none', 'important');
    }

    // 2. 🌟【重点修改 2026-05-30】：强制隐藏老系统大厅可能残留或弹出的所有中间阻挡容器、二次选单
    const intermediateSelectors = [
      '#game-choice-panel', 
      '.game-selection-wrapper', 
      '.game-select-modal', 
      '#mode-select-overlay',
      '.lobby-menu-container',
      '#guandan-lobby-container' // 掼蛋原来的二级模式选择大厅
    ];
    intermediateSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
      });
    });

    // 3. 直通穿透分流至具体的游戏底层对局
    if (window.selectedGameId === 'guandan') {
      console.log(`[路由直通] [2026-05-30] 跳过中间选择，直切掼蛋竞技对局`);
      let gdHandler = window.GD || (window.parent && window.parent.GD);
      
      // 调用 2026-05-30 在 guandan-game.js 中重构拓展的直通接口
      if (gdHandler && typeof gdHandler.initGameMatchDirect === 'function') {
        gdHandler.initGameMatchDirect(mode);
      } else if (gdHandler && typeof gdHandler.initGameMatch === 'function') {
        // 兜底降级方案
        gdHandler.initGameMatch();
      }
    } 
    else if (window.selectedGameId === 'go') {
      console.log(`[路由直通] [2026-05-30] 跳过中间选择，直切围棋核心画布`);
      
      // 激活围棋底层的沉浸渲染状态
      if (typeof window.applyImmersiveState === 'function') window.applyImmersiveState(true);
      if (typeof window.updateUI === 'function') window.updateUI();

      // 调用 2026-05-30 在 multiplayer-ext.js 中重构暴露的直通接口
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
  // 3. 渲染游戏对局主控舱界面
  // ==========================================
  window.renderAppCentralLobby = function() {
    injectCentralAppStyles();
    
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
        <p style="color: #94a3b8; font-size: 13px; margin-top: 8px;">选择游戏科目与模式，一键越过传统大厅直接进入局内</p>
        <div class="app-game-flex">
          <div class="app-game-item active-selected" data-id="guandan">
            <div style="font-size: 45px; margin-bottom: 8px;">🃏</div>
            <h4 style="margin: 0; font-size: 17px;">江苏掼蛋</h4>
            <span style="font-size: 11px; opacity: 0.6; display:block; margin-top:4px;">逢人配 智能直通版</span>
          </div>
          <div class="app-game-item" data-id="go">
            <div style="font-size: 45px; margin-bottom: 8px;">⚪</div>
            <h4 style="margin: 0; font-size: 17px;">经典围棋</h4>
            <span style="font-size: 11px; opacity: 0.6; display:block; margin-top:4px;">19x19 矩阵免密对局</span>
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
  // 4. 单轨生命周期登录状态拦截器 (修改日期: 2026-05-30)
  // =========================================================================
  function initSystemInterceptor() {
    if (typeof window.setLoggedIn === 'function') {
      const originMethod = window.setLoggedIn;
      window.setLoggedIn = function(loggedInVal) {
        originMethod(loggedInVal);
        if (loggedInVal === true) {
          // 登录成功瞬间拉起主控舱
          setTimeout(window.renderAppCentralLobby, 30);
        }
      };
    } else {
      setInterval(() => {
        const authOverlay = document.getElementById('auth-overlay');
        if (authOverlay && (authOverlay.style.display === 'none' || authOverlay.classList.contains('hidden'))) {
          const mask = document.getElementById('app-perfect-selector-mask');
          if (!mask || mask.style.display === 'none') {
            window.renderAppCentralLobby();
          }
        }
      }, 300);
    }
  }

  // ==========================================
  // 5. 初始化与配置就绪挂载
  // ==========================================
  window.addEventListener('configReady', function(event) {
      if (isInitializing || supabaseInstance) return;
      isInitializing = true;
      const config = event.detail;
      if (config && config.SUPABASE_URL && config.SUPABASE_ANON_KEY) {
          try {
              const { createClient } = window.supabase;
              supabaseInstance = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
          } catch (e) {
              console.error("Supabase 代理崩溃:", e);
          }
      }
  });

  window.addEventListener('DOMContentLoaded', () => {
    setTimeout(initSystemInterceptor, 100);
  });

  // 退出对局后返回主控舱的全局安全网关
  window.backToCentralLobby = () => {
    const mask = document.getElementById('app-perfect-selector-mask');
    if (mask) mask.style.setProperty('display', 'flex', 'important');
  };

})();