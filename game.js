/**
 * Modified Date: 2026-05-30
 * Description: Fixed game loading blocks. Optimized: 1. Routed Go (围棋) to bypass selection lobby and enter gameplay directly; 2. Corrected Guandan global reference pathways; 3. Re-aligned authentication lifecycle while forcing App-fullscreen UI layout.
 */
(() => {
  'use strict';

  // --- 1. 核心状态与全局变量 ---
  let supabaseInstance = null;
  let isInitializing = false;
  let selectedGameId = 'guandan'; 

  // 保证全局状态机和配置能安全挂载
  window.state = window.state || {};

  // 暴露获取 Supabase 客户端的全局方法，供掼蛋联机模块实时调用
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
      
      /* 点击选择游戏后背景颜色变为绿色 */
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

  // --- 3. 动态维护中央控制大厅 ---
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
            <span style="font-size: 11px; opacity: 0.6; display:block; margin-top:5px;">【直接进局】免大厅干扰</span>
          </div>
        </div>
        <div class="app-btn-container">
          <button class="app-action-btn app-btn-primary" id="app-trigger-solo">单机对战模式</button>
          <button class="app-action-btn app-btn-success" id="app-trigger-net">创建房间 (对战模式)</button>
        </div>
      </div>
    `;

    // 卡片事件绑定
    const items = lobbyWrapper.querySelectorAll('.app-game-item');
    items.forEach(item => {
      item.onclick = (e) => {
        e.stopPropagation();
        const gid = item.getAttribute('data-game-id');
        
        // 优化需求：围棋游戏点击后要求直接进入游戏界面，不需要选择大厅
        if (gid === 'go') {
          selectedGameId = 'go';
          launchMatchGame('SINGLE'); // 围棋点击直接突入对局
          return;
        }

        // 掼蛋保持高亮并选择
        items.forEach(i => i.classList.remove('active-selected'));
        item.classList.add('active-selected');
        selectedGameId = gid;
      };

      // 双击卡片直接切入
      item.ondblclick = () => {
        selectedGameId = item.getAttribute('data-game-id');
        launchMatchGame('SINGLE');
      };
    });

    document.getElementById('app-trigger-solo').onclick = () => launchMatchGame('SINGLE');
    document.getElementById('app-trigger-net').onclick = () => launchMatchGame('NET');
  }

  // 执行启动路由
  function launchMatchGame(mode) {
    if (selectedGameId === 'guandan') {
      // 解决无法进入掼蛋游戏的映射冲突
      const gdHandler = window.GD || (window.parent && window.parent.GD);
      if (gdHandler && typeof gdHandler.initGameMatch === 'function') {
        const lobby = document.getElementById('app-central-lobby');
        if (lobby) lobby.style.display = 'none';
        gdHandler.initGameMatch(mode); 
      } else {
        alert('掼蛋底座尚未就绪，请确保页面已引入 guandan-game.js');
      }
    } else if (selectedGameId === 'go') {
      // 核心需求：围棋游戏直接进入游戏界面，不需要大厅中转
      const lobby = document.getElementById('app-central-lobby');
      if (lobby) lobby.style.display = 'none';

      // 适配原有系统的沉浸态切换逻辑
      if (typeof window.applyImmersiveState === 'function') {
        window.applyImmersiveState(true);
      }
      if (typeof window.updateUI === 'function') {
        window.updateUI();
      }

      // 执行原系统围棋脚本内核
      if (window.MP && typeof window.MP.startAIGame === 'function') {
          window.MP.startAIGame();
      } else if (typeof window.initGame === 'function') {
          window.initGame();
      } else {
          // 兜底：如果原 game.js 中有未被包裹的传统初始化，进行触发
          const goBtn = document.getElementById('confirm-start-btn') || document.querySelector('.start-game-btn');
          if (goBtn) goBtn.click();
      }
    }
  }

  // --- 4. 生命周期管理与安全注册 ---
  function initEventListeners() {
    console.log("游戏综合舱核心事件底座加载完毕。");
    renderAppCentralLobby();
  }

  // 接收系统外部凭证
  window.addEventListener('configReady', function(event) {
      if (isInitializing || supabaseInstance) return;
      isInitializing = true;

      const config = event.detail;
      if (config && config.SUPABASE_URL && config.SUPABASE_ANON_KEY) {
          try {
              const { createClient } = window.supabase;
              supabaseInstance = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
              console.log("Supabase 实时云桥接成功。");
              if (window.onSupabaseReady) {
                  window.onSupabaseReady(supabaseInstance);
              }
          } catch (e) {
              console.error("Supabase 客户端建立异常:", e);
          }
      }
  });

  // 安全挂载到全局载入监听
  window.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
  });

  // 跨作用域桥接返回大厅接口
  window.backToCentralLobby = () => {
    const lobby = document.getElementById('app-central-lobby');
    if (lobby) lobby.style.display = 'flex';
  };

})();