/**
 * Modified Date: 2026-05-30
 * Description: Fully optimized routing & interface overlays. 
 * 1. Hijacked the post-login lifecycle to swap the original lobby with the custom APP-fullscreen launcher.
 * 2. Enabled single-click green highlight toggle, dblclick fast launch, and bottom button splitter.
 * 3. Supports instant Go (围棋) and Guandan (掼蛋) routing for both Single-player and Multiplayer modes.
 */
(() => {
  'use strict';

  let supabaseInstance = null;
  let isInitializing = false;
  let selectedGameId = 'guandan'; // 默认聚焦掼蛋

  window.state = window.state || {};

  window.getSupabaseClient = function() {
      return supabaseInstance;
  };

  // 需求4：整体界面调整为 APP 全屏沉浸式模式全局样式注入
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
      
      /* 需求2：点击选择游戏后背景颜色变为绿色 */
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

  // 渲染并接管屏幕：显示新设计的全屏大厅，同时强力隐藏任何原系统自带的老旧大厅组件
  function renderAppCentralLobby() {
    injectCentralAppStyles();
    
    // 强制肃清并隐藏原系统的所有老旧大厅元素，防止出现重叠或跳回
    const rawLobbySelectors = ['.lobby-container', '#lobby-container', '.main-lobby', '.game-selection-panel', '#app-sidebar'];
    rawLobbySelectors.forEach(sel => {
      const el = document.querySelector(sel);
      if (el) el.style.setProperty('display', 'none', 'important');
    });

    let lobbyWrapper = document.getElementById('app-central-lobby');
    if (!lobbyWrapper) {
      lobbyWrapper = document.createElement('div');
      lobbyWrapper.id = 'app-central-lobby';
      document.body.appendChild(lobbyWrapper);
    }
    lobbyWrapper.style.setProperty('display', 'flex', 'important');

    lobbyWrapper.innerHTML = `
      <div class="app-lobby-card-box">
        <h2 style="margin: 0; font-size: 30px; letter-spacing: 1px; font-weight: 800; color: #f8fafc;">🎮 游戏竞技舱中央大厅</h2>
        <p style="color: #94a3b8; font-size: 14px; margin-top: 10px;">请选中下方的游戏卡片，随后选择您要突入的竞技模式</p>
        <div class="app-game-flex">
          <div class="app-game-item active-selected" data-game-id="guandan">
            <div style="font-size: 50px; margin-bottom: 12px;">🃏</div>
            <h4 style="margin: 0; font-size: 19px; color: #fff;">江苏掼蛋</h4>
            <span style="font-size: 11px; opacity: 0.6; display:block; margin-top:6px;">经典逢人配 进贡规则</span>
          </div>
          <div class="app-game-item" data-game-id="go">
            <div style="font-size: 50px; margin-bottom: 12px;">⚪</div>
            <h4 style="margin: 0; font-size: 19px; color: #fff;">经典围棋</h4>
            <span style="font-size: 11px; opacity: 0.6; display:block; margin-top:6px;">单机与联机 多端分流</span>
          </div>
        </div>
        <div class="app-btn-container">
          <button class="app-action-btn app-btn-primary" id="app-trigger-solo">单机对战模式</button>
          <button class="app-action-btn app-btn-success" id="app-trigger-net">创建房间 (对战模式)</button>
        </div>
      </div>
    `;

    const items = lobbyWrapper.querySelectorAll('.app-game-item');
    items.forEach(item => {
      // 需求2：点击选择游戏后背景颜色变为绿色
      item.onclick = (e) => {
        e.stopPropagation();
        items.forEach(i => i.classList.remove('active-selected'));
        item.classList.add('active-selected');
        selectedGameId = item.getAttribute('data-game-id');
      };

      // 需求2：通过双击进入单机对战模式
      item.ondblclick = () => {
        selectedGameId = item.getAttribute('data-game-id');
        launchMatchGame('SINGLE');
      };
    });

    document.getElementById('app-trigger-solo').onclick = () => launchMatchGame('SINGLE');
    document.getElementById('app-trigger-net').onclick = () => launchMatchGame('NET');
  }

  // 分流启动逻辑：在此完成围棋、掼蛋的“单机/联机”四路精准分流调度
  function launchMatchGame(mode) {
    if (selectedGameId === 'guandan') {
      const gdHandler = window.GD || (window.parent && window.parent.GD);
      if (gdHandler && typeof gdHandler.initGameMatch === 'function') {
        document.getElementById('app-central-lobby').style.setProperty('display', 'none', 'important');
        gdHandler.initGameMatch(mode); 
      } else {
        alert('掼蛋对局引擎尚未就绪，请确认 guandan-game.js 已加载。');
      }
    } 
    else if (selectedGameId === 'go') {
      // 满足最新需求：围棋点击后根据此界面的选择直接进入单机版和联机版
      document.getElementById('app-central-lobby').style.setProperty('display', 'none', 'important');

      if (typeof window.applyImmersiveState === 'function') {
        window.applyImmersiveState(true);
      }
      if (typeof window.updateUI === 'function') {
        window.updateUI();
      }

      if (mode === 'SINGLE') {
        console.log("启动：围棋 -> 【单机版 AI 对局】");
        if (window.MP && typeof window.MP.startAIGame === 'function') {
          window.MP.startAIGame();
        } else if (typeof window.initGame === 'function') {
          window.initGame();
        }
      } else {
        console.log("启动：围棋 -> 【联机对战版】");
        if (window.MP && typeof window.MP.startMultiplayerGame === 'function') {
          window.MP.startMultiplayerGame();
        } else {
          const rawNetTrigger = document.getElementById('confirm-start-btn');
          if (rawNetTrigger) rawNetTrigger.click();
        }
      }
    }
  }

  // --- 4. 生命周期劫持：监听原始系统的成功登录状态 ---
  function initEventListeners() {
    // 劫持或替换原系统的 setLoggedIn 状态机，一旦登录成功，立刻擦除老界面，强切新设计大厅
    if (typeof window.setLoggedIn === 'function') {
      const originalSetLoggedIn = window.setLoggedIn;
      window.setLoggedIn = function(val) {
        originalSetLoggedIn(val);
        if (val === true) {
          // 核心修复点：登录成功的一瞬间，立即渲染我们的新选择界面，彻底隔断老界面
          setTimeout(renderAppCentralLobby, 50);
        }
      };
    } else {
      // 兜底保障
      renderAppCentralLobby();
    }
  }

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
    // 预留登录组件初次渲染的时间，随后精确劫持
    setTimeout(initEventListeners, 150);
  });

  window.backToCentralLobby = () => {
    const lobby = document.getElementById('app-central-lobby');
    if (lobby) lobby.style.setProperty('display', 'flex', 'important');
  };

})();