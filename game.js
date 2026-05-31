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
 /* window.launchMatchGame = function(mode) {
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
  };*/

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
  // 🧼 【围棋破除幽灵残留】模式切换全清场洗刷器
  // =========================================================================
  // =========================================================================
  // 🧼 【毁灭级清洗】彻底根除围棋单机/联机切换的幽灵棋子残留
  // =========================================================================
  window.clearGoBoardResidual = function() {
    console.log("[围棋引擎] 正在执行全量内存解构与画布擦除...");

    // 1. 深度清洗原厂可能存在的各种全局状态变量
    const goKeys = ['goGameState', 'goBoard', 'boardMatrix', 'chessPieces', 'goHistory', 'currentGoMove'];
    goKeys.forEach(key => {
      if (window[key]) {
        if (Array.isArray(window[key])) window[key] = [];
        else if (typeof window[key] === 'object') {
          // 针对对象型状态，清空其内部数组或调用其自带的 clear/reset 方法
          if (typeof window[key].clear === 'function') window[key].clear();
          if (typeof window[key].reset === 'function') window[key].reset();
          if (window[key].board) window[key].board = Array(19).fill(0).map(() => Array(19).fill(0));
          if (window[key].history) window[key].history = [];
          if (window[key].steps) window[key].steps = 0;
        }
      }
    });

    // 兜底重置最基础的 19x19 二维阵列
    window.boardMatrix = Array(19).fill(0).map(() => Array(19).fill(0));
    window.goHistory = [];

    // 2. 强力擦除物理 Canvas 节点
    const goSelectors = ['#go-canvas', '.go-board-canvas', '#weiqi-container canvas', 'canvas'];
    goSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(canvas => {
        // 确保这个 canvas 是围棋的容器内的
        if (canvas.closest('#weiqi-container') || canvas.id.includes('go')) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
          }
        }
      });
    });

    // 3. 强制触发一次原厂的“纯净棋盘格线条”重绘
    if (typeof window.drawGoBoard === 'function') window.drawGoBoard();
    else if (window.goBoard && typeof window.goBoard.render === 'function') window.goBoard.render();
    
    console.log("[围棋引擎] 内存与物理画布已洗刷一新。");
  };

  // =========================================================================
  // 🔄 挂载到大厅切换行为中（伪代码示范，请将 clearGoBoardResidual() 塞入你的模式切换按钮事件中）
  // =========================================================================
  // 例如在点击“围棋单机版”或“围棋联机版”的按钮点击事件首行执行：
  // document.getElementById('btn-go-single').addEventListener('click', () => {
  //     clearGoBoardResidual(); // 先洗盘
  //     startGoSingleGame();    // 后开局
  // });

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

// 备份原厂的 launchMatchGame（以防单机模式还需要使用）
  const _rawLaunchMatchGame = window.launchMatchGame;

  window.launchMatchGame = function(mode) {
    if (window.isLoggingOut) return;
    console.log(`[主控舱直通车] 触发深度劫持 -> 游戏: ${window.selectedGameId}, 模式: ${mode}`);

    // 🚀【核心熔断】：如果是掼蛋且是联机模式，彻底接管，绝不放行后续原厂逻辑
    if (window.selectedGameId === 'guandan' && mode === 'NET') {
      console.log("[熔断机制] 侦测到掼蛋联机，正在执行物理强切，强制终止原厂后续大厅生成！");
      
      // 1. 锁死状态机
      if (window.state) {
        window.state.gameMode = 'NET_BATTLE';
        if (!window.state.uid) window.state.uid = 'net_' + Math.random().toString(36).substr(2, 6);
      }

      // 2. 物理清除、吞噬大厅干扰源
      document.body.classList.add('in-game-match');
      
      const mask = document.getElementById('app-perfect-selector-mask');
      if (mask) mask.style.setProperty('display', 'none', 'important');

      // 强力移除截图中黑黄相间的总选单容器（根据原厂动态生成的特性进行物理 removal）
      const lobbySelectors = [
        '#game-selection', '.lobby', '#guandan-lobby-container', 
        '.main-lobby', '.game-select-panel', '.center-box', '.modal-backdrop'
      ];
      lobbySelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => el.remove());
      });

      // 3. 强行让掼蛋舞台画布直接外露
      document.querySelectorAll('#guandan-game-container, #game-container, .game-board').forEach(el => {
        el.style.setProperty('display', 'block', 'important');
        el.style.setProperty('visibility', 'visible', 'important');
        el.style.setProperty('opacity', '1', 'important');
      });

      // 4. 生成或同步房号（如果是发起人，生成新房号并挂载）
      let roomCode = new URLSearchParams(window.location.search).get('room');
      if (!roomCode) {
        // 如果是点击“联机版”按钮主动发起的，就地生成一个全新房号并直接塞给引擎
        roomCode = 'GD' + Math.floor(1000 + Math.random() * 9000);
        console.log(`[房东开房] 主动创建房间，生成房号: ${roomCode}`);
      }

      // 5. 催熟原厂游戏战场上下文，拉起扑克牌桌案
      if (window.GD && typeof window.GD.initGameMatch === 'function') {
        try {
          window.GD.initGameMatch();
        } catch(e) {
          console.warn("[画布初始化] 顺发兼容跳过:", e);
        }
      }

      // 6. 唤醒云端并线引擎（带 500ms 高频无线电握手功能，解决房间不存在与倒计时不同步）
      if (window.GD_MP && typeof window.GD_MP.startNetMatch === 'function') {
        window.GD_MP.startNetMatch(roomCode);
      } else {
        console.error("⛔ [致命] 联机包 guandan-mp-ext.js 尚未加载完成！");
      }

      // 🚨【终极熔断】：直接返回！打死也不让原厂代码执行后面弹大厅的逻辑！
      return;
    }

    // 如果是单机模式或者其他游戏，原封不动地还给原厂执行流
    if (typeof _rawLaunchMatchGame === 'function') {
      _rawLaunchMatchGame(mode);
    }
  };

  console.log("[系统监控] launchMatchGame 熔断网关已成功挂载。");




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

  /*
  window.addEventListener('DOMContentLoaded', () => {
    setTimeout(initEventListeners, 20);
  });*/
  // =========================================================================
  // 🧭 【自愈网关版】掼蛋参数一键直连雷达（带依赖催熟与重试机制）
  // =========================================================================
    // =========================================================================
  // 🧭 【网络层安全对齐版】掼蛋直连拦截雷达
  // =========================================================================
  // =========================================================================
  // 🧭 【总大厅物理隔离穿透版】掼蛋参数一键直连雷达
  // =========================================================================
  window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const gameParam = urlParams.get('game');
    const modeParam = urlParams.get('mode');
    const roomParam = urlParams.get('room');

    // 只要系统加载，先尝试洗刷一次围棋，防止大厅默认带入上局状态
    if (typeof window.clearGoBoardResidual === 'function') {
      window.clearGoBoardResidual();
    }

    if (gameParam === 'guandan' && modeParam === 'NET' && roomParam) {
      console.log(`[路由雷达] 拦截到掼蛋联机专属请求，房间号: ${roomParam}。正在物理蒸发总大厅...`);
      
      // 1. 锁定全局状态机与游戏ID
      window.selectedGameId = 'guandan';
      if (window.state) {
        window.state.gameMode = 'NET_BATTLE';
        if (!window.state.uid) window.state.uid = 'net_' + Math.random().toString(36).substr(2, 6);
      }

      // 2. ✂️ 阉割原厂大厅及总游戏选择舱的干扰
      if (window.GD) {
        // 阻止原厂 guandan-game.js 的默认二级大厅复辟
        window.GD.init = () => { console.log("[雷达拦截] 已阻止掼蛋自带二级大厅渲染。"); };
        if (window.gdAutoStartTimer) clearTimeout(window.gdAutoStartTimer);
      }

      // 3. 【核心修复】：建立 4 秒超强物理清洗流，直接蒸发截图中的“选择游戏”总大厅
      let enforcementTimer = setInterval(() => {
        const lobbySelectors = [
          '#game-selection', '.lobby', '#guandan-lobby-container', 
          '#app-perfect-selector-mask', '#login-container', '.modal-backdrop', 
          '#confirm-modal', '.main-lobby', '.game-select-panel', '.center-box'
        ];
        
        // 隐藏所有可能的大厅层
        lobbySelectors.forEach(selector => {
          document.querySelectorAll(selector).forEach(el => el.style.setProperty('display', 'none', 'important'));
        });

        // 强行把掼蛋对局画布以及联机横幅拉起来
        document.querySelectorAll('#guandan-game-container, #game-container, .game-board').forEach(el => {
          el.style.setProperty('display', 'block', 'important');
        });
        document.body.classList.add('in-game-match');
      }, 30);

      // 4 秒后清除物理清洗定时器
      setTimeout(() => clearInterval(enforcementTimer), 4000);

      // 4. 🧭 轮询催熟 Supabase 网关与掼蛋画布本体
      let retryCount = 0;
      const maxRetries = 40; 

      const tryLaunchNetMatch = () => {
        // 检查全局变量、联机扩展包、以及掼蛋游戏画布引擎是否全部就绪
        const isSupabaseReady = !!(window.getSupabaseClient || window.supabase);
        const isGDEngineReady = !!(window.GD && typeof window.GD.initGameMatch === 'function');
        const isMpReady = !!(window.GD_MP && typeof window.GD_MP.startNetMatch === 'function');

        if (isSupabaseReady && isGDEngineReady && isMpReady) {
          console.log(`[穿透成功] 所有组件加载完毕！强行启动掼蛋战场并打入联机房间。`);
          
          // 💡 第一步：强行拉起掼蛋核心对局桌案，初始化玩家座位和画布
          window.GD.initGameMatch(); 
          
          // 💡 第二步：联机引擎接管信道，开始跟房东/客军进行握手状态同步
          window.GD_MP.startNetMatch(roomParam.trim());
          
        } else if (retryCount < maxRetries) {
          retryCount++;
          console.warn(`[网关自检] 等待组件点亮... 第 ${retryCount} 次重试`);
          setTimeout(tryLaunchNetMatch, 150); 
        } else {
          console.error("⛔ [致命] 联机环境初始化超时，尝试进行兜底强开...");
          if (window.GD && typeof window.GD.initGameMatch === 'function') window.GD.initGameMatch();
          if (window.GD_MP && typeof window.GD_MP.startNetMatch === 'function') window.GD_MP.startNetMatch(roomParam.trim());
        }
      };

      // 启动自检锁
      setTimeout(tryLaunchNetMatch, 100);
    }

    // 恢复原系统 20ms 事件初始化逻辑
    setTimeout(initEventListeners, 20);
  });

  window.backToCentralLobby = () => {
    if (window.isLoggingOut) return;
    window.selectedGameId = 'guandan';
    document.body.classList.remove('in-game-match');
    const mask = document.getElementById('app-perfect-selector-mask');
    if (mask) mask.style.setProperty('display', 'flex', 'important');
  };

})();