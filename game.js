/**
 * Modified Date: 2026-05-30
 * Description: Fixed initEventListeners reference error. Implemented: 1. Lobby decoupling; 2. Click highlight & ondblclick single mode; 3. Supabase realtime battle sync; 4. Fullscreen app layout; 5. Tribute and Heart rank Wild Card rule checking; 6. Ergonomic cluster sorting mode.
 */
(() => {
  'use strict';

  // --- 1. 核心状态与全局变量定义 ---
  let supabaseInstance = null;
  let isInitializing = false;
  let selectedGameId = 'guandan'; // 默认选中掼蛋

  // 暴露获取 Supabase 客户端的全局方法，供掼蛋联机模块使用
  window.getSupabaseClient = function() {
      return supabaseInstance;
  };

  // --- 2. 需求4：整体界面调整为 APP 全屏沉浸式模式样式注入 ---
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
        background: radial-gradient(circle at center, #1e293b 0%, #0f172a 100%); 
        display: flex; flex-direction: column; align-items: center; justify-content: center; 
        z-index: 9999; color: #ffffff;
      }
      .app-lobby-card-box { 
        width: 85%; max-width: 750px; 
        background: rgba(30, 41, 59, 0.7); 
        border: 1px solid rgba(255, 255, 255, 0.1); 
        border-radius: 24px; padding: 40px; 
        box-shadow: 0 25px 60px rgba(0,0,0,0.6); backdrop-filter: blur(20px);
      }
      .app-game-flex { display: flex; justify-content: center; gap: 30px; margin: 35px 0; }
      .app-game-item { 
        width: 200px; padding: 25px 15px; 
        background: rgba(255, 255, 255, 0.04); 
        border: 2px solid rgba(255, 255, 255, 0.08); 
        border-radius: 18px; cursor: pointer; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); 
        text-align: center;
      }
      .app-game-item:hover { transform: translateY(-4px); border-color: #3b82f6; }
      
      /* 需求2：点击选择游戏后背景颜色变为绿色 */
      .app-game-item.active-selected { 
        background: linear-gradient(135deg, #16a34a 0%, #15803d 100%) !important; 
        border-color: #4ade80 !important; 
        box-shadow: 0 10px 25px rgba(22, 163, 74, 0.4);
      }
      .app-btn-container { display: flex; justify-content: center; gap: 20px; }
      .app-action-btn { 
        padding: 12px 36px; font-size: 16px; font-weight: bold; 
        border-radius: 30px; border: none; cursor: pointer; transition: transform 0.1s;
      }
      .app-action-btn:active { transform: scale(0.96); }
      .app-btn-primary { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; }
      .app-btn-success { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; }
    `;
    document.head.appendChild(style);
  }

  // --- 3. 渲染中央游戏大厅 ---
  function renderAppCentralLobby() {
    injectCentralAppStyles();
    let lobbyWrapper = document.getElementById('app-central-lobby');
    if (!lobbyWrapper) {
      lobbyWrapper = document.createElement('div');
      lobbyWrapper.id = 'app-central-lobby';
      document.body.appendChild(lobbyWrapper);
    }

    lobbyWrapper.innerHTML = `
      <div class="app-lobby-card-box">
        <h2 style="margin: 0; font-size: 28px; letter-spacing: 1px; font-weight: 800;">📱 竞技棋牌中央大厅</h2>
        <p style="color: #94a3b8; font-size: 14px; margin-top: 8px;">请选择游戏玩法进入竞技舱</p>
        <div class="app-game-flex">
          <div class="app-game-item active-selected" data-game-id="guandan">
            <div style="font-size: 45px; margin-bottom: 10px;">♠️</div>
            <h4 style="margin: 0; font-size: 18px;">江苏掼蛋</h4>
            <span style="font-size: 11px; opacity: 0.6; display:block; margin-top:5px;">经典规则 逢人配</span>
          </div>
          <div class="app-game-item" data-game-id="go">
            <div style="font-size: 45px; margin-bottom: 10px;">⚪</div>
            <h4 style="margin: 0; font-size: 18px;">经典围棋</h4>
            <span style="font-size: 11px; opacity: 0.6; display:block; margin-top:5px;">纵横博弈 策略对决</span>
          </div>
        </div>
        <div class="app-btn-container">
          <button class="app-action-btn app-btn-primary" id="app-trigger-solo">单机对战模式</button>
          <button class="app-action-btn app-btn-success" id="app-trigger-net">创建房间 (对战模式)</button>
        </div>
      </div>
    `;

    // 绑定卡片切换事件
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

  // 启动对应游戏和模式
  function launchMatchGame(mode) {
    if (selectedGameId === 'guandan') {
      if (window.GD && typeof window.GD.initGameMatch === 'function') {
        document.getElementById('app-central-lobby').style.display = 'none';
        window.GD.initGameMatch(mode); 
      } else {
        alert('掼蛋游戏扩展模块未就绪，请检查 guandan-game.js 是否正常载入。');
      }
    } else if (selectedGameId === 'go') {
      document.getElementById('app-central-lobby').style.display = 'none';
      if (window.MP && typeof window.MP.startAIGame === 'function') {
          window.MP.startAIGame();
      } else if (typeof window.initGame === 'function') {
          window.initGame();
      } else {
          alert('围棋初始化函数未就绪。');
      }
    }
  }

  // --- 4. 补全缺失的事件监听与原有生命周期函数 ---
  function initEventListeners() {
    console.log("游戏中央监听底座已安全建立。");
    renderAppCentralLobby();
  }

  // 监听原始配置就绪事件，保障原 Supabase 初始化流程不受破坏
  window.addEventListener('configReady', function(event) {
      if (isInitializing || supabaseInstance) return;
      isInitializing = true;

      const config = event.detail;
      if (config && config.SUPABASE_URL && config.SUPABASE_ANON_KEY) {
          try {
              const { createClient } = window.supabase;
              supabaseInstance = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
              console.log("Supabase 客户端已于中央控制舱初始化成功");
              if (window.onSupabaseReady) {
                  window.onSupabaseReady(supabaseInstance);
              }
          } catch (e) {
              console.error("初始化 Supabase 异常:", e);
          }
      }
  });

  // 页面加载完毕安全引导
  window.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
  });

  // 暴露全局返回中央大厅接口供子对局舱调用
  window.backToCentralLobby = () => {
    const lobby = document.getElementById('app-central-lobby');
    if (lobby) lobby.style.display = 'flex';
  };

})();