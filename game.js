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
  // 1. 在最外层（非任何闭包内）定义核心全局变量
  // ==========================================
  window.selectedGameId = window.selectedGameId || 'guandan';

  let supabaseInstance = null;
  let isInitializing = false;

  window.state = window.state || {};

  window.getSupabaseClient = function() {
      return supabaseInstance;
  };

  // 整体界面调整为 APP 全屏沉浸式模式全局样式注入
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
      #app-central-lobby { 
        position: fixed; inset: 0; 
        width: 100vw; height: 100vh; 
        background: radial-gradient(circle at center, #111827 0%, #030712 100%); 
        display: flex; flex-direction: column; align-items: center; justify-content: center; 
        z-index: 99999 !important; color: #ffffff;
      }
      .app-lobby-card-box { 
        width: 85%; max-width: 750px; 
        background: rgba(17, 24, 39, 0.85); 
        border: 1px solid rgba(255, 255, 255, 0.08); 
        border-radius: 28px; padding: 45px 40px; 
        box-shadow: 0 30px 70px rgba(0,0,0,0.8); backdrop-filter: blur(25px);
        text-align: center;
      }
      .app-game-flex { display: flex; justify-content: center; gap: 35px; margin: 40px 0; }
      .app-game-item { 
        width: 210px; padding: 30px 15px; 
        background: rgba(255, 255, 255, 0.03); 
        border: 2px solid rgba(255, 255, 255, 0.06); 
        border-radius: 20px; cursor: pointer; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); 
      }
      .app-game-item:hover { transform: translateY(-5px); border-color: #3b82f6; background: rgba(255, 255, 255, 0.06); }
      
      /* 点击选择游戏后背景颜色变为绿色 */
      .app-game-item.active-selected { 
        background: linear-gradient(135deg, #16a34a 0%, #15803d 100%) !important; 
        border-color: #4ade80 !important; 
        box-shadow: 0 12px 30px rgba(22, 163, 74, 0.4);
      }
      .app-btn-container { display: flex; justify-content: center; gap: 25px; }
      .app-action-btn { 
        padding: 14px 40px; font-size: 16px; font-weight: bold; 
        border-radius: 35px; border: none; cursor: pointer; transition: transform 0.1s, box-shadow 0.2s;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      }
      .app-action-btn:active { transform: scale(0.96); }
      .app-btn-primary { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; }
      .app-btn-success { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; }
    `;
    document.head.appendChild(style);
  }

  // =========================================================================
  // 2. 核心路由分流调度函数 (修改日期: 2026-05-30 - 穿透劫持, 杜绝一切二次中间选单弹窗)
  // =========================================================================
  window.launchMatchGame = function(mode) {
    console.log(`[分流路由] [2026-05-30] 正在启动对局 -> 目标科目: ${window.selectedGameId}, 模式: ${mode}`);

    // 1. 隐藏我们设计的中央选择大厅遮罩层
    const mask = document.getElementById('app-perfect-selector-mask') || document.getElementById('app-central-lobby');
    if (mask) {
      mask.style.setProperty('display', 'none', 'important');
    }

    // 2. 🌟【强力精准抹除】清除并粉碎原系统残留的任何中间“选择游戏”、“模式选择”老旧弹窗，杜绝二次拦截
    const rawChoicePanels = [
      '#game-choice-panel', 
      '.game-selection-wrapper', 
      '.game-select-modal', 
      '[class*="select-game"]', 
      '[id*="select-game"]',
      '#mode-select-overlay',
      '.lobby-menu-container'
    ];
    rawChoicePanels.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
        el.style.setProperty('opacity', '0', 'important');
      });
    });

    // 遍历可能包含关键字的动态节点，从根源隐藏中间引导菜单
    document.querySelectorAll('div, section, p').forEach(node => {
      if (node.offsetWidth > 0 && (node.innerText.includes('选择游戏') || node.innerText.includes('当前版本已聚焦围棋对局') || node.innerText.includes('选择对战模式'))) {
        const modalContainer = node.closest('[class*="modal"]') || node.closest('[class*="overlay"]') || node.closest('div');
        if (modalContainer) {
          modalContainer.style.setProperty('display', 'none', 'important');
        }
      }
    });

    // 3. 执行真正的对局无缝跳入 (不再模拟点击大厅，直接注入核心初始化事件)
    if (window.selectedGameId === 'guandan') {
      console.log(`[分流路由] [2026-05-30] 绕过中间层，代理穿透直通掼蛋 -> ${mode}`);
      
      // 优先路径：如果全新的直通全局接口已暴露，直接调用
      if (window.initGuandanDirectMatch && typeof window.initGuandanDirectMatch === 'function') {
        window.initGuandanDirectMatch(mode);
        return;
      }

      // 次优先路径：检查核心处理器实例是否就绪
      let gdHandler = window.GD || (window.parent && window.parent.GD) || (window.top && window.top.GD);
      if (gdHandler && typeof gdHandler.initGameMatch === 'function') {
        gdHandler.initGameMatch(mode);
        return;
      }

      // 保底兼容量：通过触发基础初始化函数注入模式
      if (typeof window.initGuandanGame === 'function') {
        window.initGuandanGame(mode);
        return;
      }

      // 极端兼容路径：穿透代理点击法
      const rawGdCard = document.querySelector('.game-card[data-game-id="guandan"]') || 
                        document.querySelector('.app-game-item[data-game-id="guandan"]') ||
                        document.getElementById('go-guandan-btn');
      if (rawGdCard) rawGdCard.click();

      setTimeout(() => {
        let rawLaunchBtn = null;
        if (mode === 'SINGLE') {
          rawLaunchBtn = document.getElementById('launch-solo-btn') || 
                        document.getElementById('gd-btn-lobby-solo-trigger') || 
                        document.querySelector('.btn-solo');
        } else {
          rawLaunchBtn = document.getElementById('launch-net-btn') || 
                        document.getElementById('gd-btn-lobby-net-trigger') || 
                        document.querySelector('.btn-net');
        }
        if (rawLaunchBtn) {
          rawLaunchBtn.click();
        }
      }, 20);

    } 
    else if (window.selectedGameId === 'go') {
      console.log(`[分流路由] [2026-05-30] 绕过中间层，直通围棋 -> ${mode}`);
      
      // 激活原系统底层的围棋画布渲染和沉浸转换上下文
      if (typeof window.applyImmersiveState === 'function') window.applyImmersiveState(true);
      if (typeof window.updateUI === 'function') window.updateUI();

      if (mode === 'SINGLE') {
        if (window.MP && typeof window.MP.startAIGame === 'function') {
          window.MP.startAIGame();
        } else if (typeof window.initGame === 'function') {
          window.initGame();
        }
      } else {
        if (window.MP && typeof window.MP.startMultiplayerGame === 'function') {
          window.MP.startMultiplayerGame();
        } else {
          const netTrigger = document.getElementById('confirm-start-btn') || document.getElementById('create-room-submit');
          if (netTrigger) netTrigger.click();
        }
      }
    }
  };

  // ==========================================
  // 3. 渲染新设计的全屏大厅主模板（主控舱）
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
        <p style="color: #94a3b8; font-size: 13px; margin-top: 8px;">请选择科目，点击下方按钮将直接进入游戏</p>
        <div class="app-game-flex">
          <div class="app-game-item active-selected" data-id="guandan">
            <div style="font-size: 45px; margin-bottom: 8px;">🃏</div>
            <h4 style="margin: 0; font-size: 17px;">江苏掼蛋</h4>
            <span style="font-size: 11px; opacity: 0.6; display:block; margin-top:4px;">逢人配 智能理牌版</span>
          </div>
          <div class="app-game-item" data-id="go">
            <div style="font-size: 45px; margin-bottom: 8px;">⚪</div>
            <h4 style="margin: 0; font-size: 17px;">经典围棋</h4>
            <span style="font-size: 11px; opacity: 0.6; display:block; margin-top:4px;">单机 / 联机 精准分流</span>
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
  // 4. [2026-05-30 优化收拢] 统一生命周期劫持监听器，避免多个定时器及监听冲突
  // =========================================================================
  function initSystemInterceptor() {
    if (typeof window.setLoggedIn === 'function') {
      const originMethod = window.setLoggedIn;
      window.setLoggedIn = function(loggedInVal) {
        originMethod(loggedInVal);
        if (loggedInVal === true) {
          // 登录成功时以最高优先级清除老旧大厅并拉起“主控舱”
          setTimeout(window.renderAppCentralLobby, 30);
        }
      };
    } else {
      // 兜底轮询机制：检测到认证图层消失且主控舱未显示时，主动调起
      const checkInterval = setInterval(() => {
        const authOverlay = document.getElementById('auth-overlay');
        if (authOverlay && (authOverlay.style.display === 'none' || authOverlay.classList.contains('hidden'))) {
          const mask = document.getElementById('app-perfect-selector-mask');
          if (!mask || mask.style.display === 'none') {
            window.renderAppCentralLobby();
          }
        }
      }, 300);
      
      // 当 DOM 加载完成后，做一次初始安全检查
      setTimeout(() => {
        if (window.state && window.state.isLoggedIn) {
          window.renderAppCentralLobby();
        }
      }, 200);
    }
  }

  // ==========================================
  // 5. 事件代理与初始化挂载
  // ==========================================
  window.addEventListener('configReady', function(event) {
      if (isInitializing || supabaseInstance) return;
      isInitializing = true;
      const config = event.detail;
      if (config && config.SUPABASE_URL && config.SUPABASE_ANON_KEY) {
          try {
              const { createClient } = window.supabase;
              supabaseInstance = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
              console.log("Supabase 网关代理连接成功。");
          } catch (e) {
              console.error("Supabase 客户端代理崩溃:", e);
          }
      }
  });

  window.addEventListener('DOMContentLoaded', () => {
    setTimeout(initSystemInterceptor, 100);
  });

  // 全局安全桥接退回方法
  window.backToCentralLobby = () => {
    const mask = document.getElementById('app-perfect-selector-mask');
    if (mask) mask.style.setProperty('display', 'flex', 'important');
  };

})();