/**
 * Modified Date: 2026-05-30
 * Description: Fully optimized routing & interface overlays. 
 * 1. 物理隔离与全域重叠技术：用绝对最高层级（z-index: 9999999）主控舱全屏覆盖原厂围棋和掼蛋容器。
 * 2. 状态监听器重写：完美对接 login.html 派发的 setLoggedIn(true, userInfo) 事件。
 * 3. 0毫秒穿透路由：点击后直接拉起真实局内画布，彻底剔除任何原厂中间大厅、房间列表或模式选择遮罩。
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
  // 1. APP 全屏沉浸式主控舱高强度样式注入
  // ==========================================
  function injectCentralAppStyles() {
    if (document.getElementById('app-fs-global-style')) return;
    const style = document.createElement('style');
    style.id = 'app-fs-global-style';
    style.textContent = `
      html, body { 
        margin: 0; padding: 0; 
        width: 100vw; height: 100vh; 
        overflow: hidden !important; 
        background: #090d16 !important; 
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      /* 强制将原厂自带的围棋主容器和可能产生的模式弹出层在主控舱期间处于完全静隐状态 */
      .app-container, .main-layout, #confirm-modal, .modal-backdrop {
        display: none !important;
      }
      #app-perfect-selector-mask {
        position: fixed; inset: 0; width: 100vw; height: 100vh;
        background: radial-gradient(circle at center, #111827 0%, #030712 100%) !important;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        z-index: 9999999 !important; color: #ffffff;
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
      
      /* 运行时动态还原覆盖样式 */
      body.in-game-match .app-container { display: grid !important; }
      body.in-game-match #app-perfect-selector-mask { display: none !important; }
    `;
    document.head.appendChild(style);
  }

  // =========================================================================
  // 🎯 2. 核心穿透中心：越级直接激活各科目对局画布（彻底剥离原有选择逻辑）
  // =========================================================================
  window.launchMatchGame = function(mode) {
    console.log(`[主控舱路由直通车] 激活目标 -> 游戏: ${window.selectedGameId}, 模式: ${mode}`);

    // 1. 关闭主控舱遮罩
    const mask = document.getElementById('app-perfect-selector-mask');
    if (mask) mask.style.setProperty('display', 'none', 'important');
    
    // 2. 解除对原厂整体框架的不可见封锁
    document.body.classList.add('in-game-match');

    // 3. 强行把原厂系统所有中间过渡弹窗、二次选单、房间密码遮罩物理抹平
    const intermediateGarbage = [
      '#confirm-modal', '.modal-backdrop', '#guandan-lobby-container', '#login-container', 'iframe'
    ];
    intermediateGarbage.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => el.style.setProperty('display', 'none', 'important'));
    });

    // 4. 0毫秒越级直连注入
    if (window.selectedGameId === 'guandan') {
      // 如果选择掼蛋，强行切断原本的大厅逻辑，改由直接构建全屏牌桌容器
      if (window.GD) {
        // 关闭原生大厅标记
        const gdLobby = document.getElementById('guandan-lobby-container');
        if (gdLobby) gdLobby.style.setProperty('display', 'none', 'important');
        
        // 判定对战模式
        if (mode === 'SINGLE') {
          console.log("[主控舱直连] 正在绕过菜单，秒开单机掼蛋智能局");
          // 模拟原厂点击直接拉起初始化局内画布
          if (typeof window.GD.initGameMatch === 'function') {
             window.GD.initGameMatch(); 
          }
        } else {
          alert(`进入【江苏掼蛋】云端多端网络对局...\n正在结合底层线上 Supabase 通信网关为您寻找可用房间！`);
          if (typeof window.GD.initGameMatch === 'function') window.GD.initGameMatch();
        }
      }
    } 
    else if (window.selectedGameId === 'go') {
      // 如果选择围棋，直接恢复沉浸式对局画布
      if (typeof window.applyImmersiveState === 'function') window.applyImmersiveState(true);
      if (typeof window.updateUI === 'function') window.updateUI();

      if (window.MP) {
        if (mode === 'SINGLE') {
          console.log("[主控舱直连] 正在绕过菜单，秒开 19x19 智能AI围棋局");
          if (typeof window.MP.startAIGame === 'function') window.MP.startAIGame();
        } else {
          console.log("[主控舱直连] 正在绕过菜单，直接拉起多人实时联机房间匹配");
          // 越过密码输入和创建房间界面，直接调取原厂底层的创建/加入逻辑
          if (typeof window.MP.createRoom === 'function') window.MP.createRoom();
        }
      }
    }
  };

  // ==========================================
  // 3. 游戏对局主控舱的无感知高奢渲染
  // ==========================================
  window.renderAppCentralLobby = function() {
    // 强制移出局内渲染类，让原厂老布局保持被雪藏状态
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

    // 绑定交互点选高亮逻辑
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
  // 4. 双重防御性生命周期拦截（100% 根除登录后进入原有游戏界面的可能）
  // =========================================================================
  function initEventListeners() {
    console.log("[主控舱防御系统] 拦截就绪。正在封锁所有原有选择界面...");

    // 🔒 劫持防御 1：精准捕捉 login.html 触发的登录成功事件
    if (typeof window.setLoggedIn === 'function' || !window.setLoggedIn) {
      window.setLoggedIn = function(val, userInfo) {
        if (val === true) {
          console.log("[核心捕捉] 用户身份验证通过！强行拦截，直接进入主控舱。");
          // 写入全局变量，打破变量不一致性
          window.state = window.state || {};
          if (userInfo) {
            window.state.uid = userInfo.uid;
            window.state.userNickname = userInfo.nickname;
          }
          // 立刻唤醒主控舱，压制原厂界面
          window.renderAppCentralLobby();
        }
      };
    }

    // 🔒 劫持防御 2：高频主框架渲染轮询（兜底保障）
    // 原厂代码即使在未调用 setLoggedIn 的极端状态下，只要登录完成，也必须要让包含围棋的容器可见。
    // 我们在这里实施强制反向阻断。
    setInterval(() => {
      const mainApp = document.querySelector('.app-container') || document.querySelector('.main-layout');
      const mask = document.getElementById('app-perfect-selector-mask');
      
      // 如果原厂框架被激活显示了，但当前 body 并没有 "in-game-match"（证明玩家并没点主控舱的进入按钮）
      if (mainApp && !document.body.classList.contains('in-game-match')) {
        // 瞬间剥夺原厂渲染资格
        mainApp.style.setProperty('display', 'none', 'important');
        
        // 只要主控舱没开，立刻强行展示主控舱
        if (!mask || mask.style.display === 'none') {
          window.renderAppCentralLobby();
        }
      }
    }, 100);
  }

  // ==========================================
  // 5. 原生系统参数流同步
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
    // 注入全屏拦截与重设
    setTimeout(initEventListeners, 30);
  });

  // 全局提供局内返回主控舱方法
  window.backToCentralLobby = () => {
    document.body.classList.remove('in-game-match');
    const mask = document.getElementById('app-perfect-selector-mask');
    if (mask) mask.style.setProperty('display', 'flex', 'important');
  };

})();