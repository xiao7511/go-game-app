/**
 * Modified Date: 2026-05-30
 * Description: Non-destructive Visual Overlay Engine.
 * 1. Retains all original DOM structures to prevent null pointer exceptions inside original setLoggedIn().
 * 2. Overlays a high-priority Z-Index launcher right after login.
 * 3. Bridges selections to drive both Guandan and Go (Single/Net modes) smoothly.
 */
(() => {
  'use strict';

  let selectedGameId = 'guandan'; // 默认聚焦掼蛋

  // 注入全屏竞技选单样式
  function injectAppOverlayCSS() {
    if (document.getElementById('app-perfect-overlay-css')) return;
    const style = document.createElement('style');
    style.id = 'app-perfect-overlay-css';
    style.textContent = `
      #app-perfect-selector-mask {
        position: fixed; inset: 0;
        width: 100vw; height: 100vh;
        background: radial-gradient(circle at center, #111827 0%, #030712 100%) !important;
        display: none; flex-direction: column; align-items: center; justify-content: center;
        z-index: 999999 !important; color: #ffffff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .app-lobby-box {
        width: 85%; max-width: 720px;
        background: rgba(31, 41, 55, 0.65);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 24px; padding: 40px;
        box-shadow: 0 25px 60px rgba(0,0,0,0.8); backdrop-filter: blur(20px);
        text-align: center;
      }
      .app-game-flex { display: flex; justify-content: center; gap: 30px; margin: 35px 0; }
      .app-game-item {
        width: 200px; padding: 25px 15px;
        background: rgba(255, 255, 255, 0.03);
        border: 2px solid rgba(255, 255, 255, 0.06);
        border-radius: 18px; cursor: pointer; transition: all 0.2s ease;
      }
      .app-game-item:hover { transform: translateY(-4px); border-color: #3b82f6; }
      .app-game-item.active-selected {
        background: linear-gradient(135deg, #16a34a 0%, #15803d 100%) !important;
        border-color: #4ade80 !important;
        box-shadow: 0 10px 25px rgba(22, 163, 74, 0.4);
      }
      .app-btn-container { display: flex; justify-content: center; gap: 20px; }
      .app-action-btn {
        padding: 12px 35px; font-size: 15px; font-weight: bold;
        border-radius: 30px; border: none; cursor: pointer; transition: transform 0.1s;
      }
      .app-action-btn:active { transform: scale(0.96); }
      .app-btn-primary { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; }
      .app-btn-success { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; }
    `;
    document.head.appendChild(style);
  }

  // 构建并展现覆盖层
  function showPerfectSelectorOverlay() {
    injectAppOverlayCSS();
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
        <p style="color: #94a3b8; font-size: 13px; margin-top: 8px;">请选择游戏，随后直接推入对局战场</p>
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
        selectedGameId = item.getAttribute('data-id');
      };
    });

    document.getElementById('perfect-go-solo').onclick = () => routeMatch('SINGLE');
    document.getElementById('perfect-go-net').onclick = () => routeMatch('NET');
  }

  // 路由分流核心机制
  function routeMatch(mode) {
    const mask = document.getElementById('app-perfect-selector-mask');
    if (mask) mask.style.setProperty('display', 'none', 'important');

    if (selectedGameId === 'guandan') {
      console.log(`[路由] 触发掼蛋 -> 模式: ${mode}`);
      if (window.GD && typeof window.GD.initGameMatch === 'function') {
        window.GD.initGameMatch(mode);
      } else {
        // 尝试触发原网页中可能绑定的掼蛋选择器按钮
        const rawGdCard = document.querySelector('.game-card[data-game-id="guandan"]') || document.querySelector('.game-card');
        if (rawGdCard) rawGdCard.click();
        setTimeout(() => {
          const rawBtn = mode === 'SINGLE' ? document.getElementById('launch-solo-btn') : document.getElementById('launch-net-btn');
          if (rawBtn) rawBtn.click();
        }, 50);
      }
    } 
    else if (selectedGameId === 'go') {
      console.log(`[路由] 触发围棋 -> 模式: ${mode}`);
      // 触发原系统自带的沉浸转换，确保不报任何画布缺失错误
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
          const netTrigger = document.getElementById('confirm-start-btn');
          if (netTrigger) netTrigger.click();
        }
      }
    }
  }

  // 劫持生命周期：等待原系统安全完成登录态及DOM挂载后，一拍即合罩上新选单
  function interceptLifecycle() {
    if (typeof window.setLoggedIn === 'function') {
      const originMethod = window.setLoggedIn;
      window.setLoggedIn = function(loggedInVal) {
        // 先让原版逻辑平稳运行，把内部该刷新的变量、数据全部跑完，杜绝报错
        originMethod(loggedInVal);
        if (loggedInVal === true) {
          // 在原大厅渲染完毕后的 100 毫秒，用最高优先级罩上绿色卡片选单层
          setTimeout(showPerfectSelectorOverlay, 100);
        }
      };
    } else {
      // 兜底策略
      setInterval(() => {
        const authOverlay = document.getElementById('auth-overlay');
        if (authOverlay && authOverlay.style.display === 'none') {
          const mask = document.getElementById('app-perfect-selector-mask');
          if (!mask || mask.style.display === 'none') {
            showPerfectSelectorOverlay();
          }
        }
      }, 500);
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    setTimeout(interceptLifecycle, 200);
  });

  // 全局安全桥接退回方法
  window.backToCentralLobby = () => {
    const mask = document.getElementById('app-perfect-selector-mask');
    if (mask) mask.style.setProperty('display', 'flex', 'important');
  };
})();