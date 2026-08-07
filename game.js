/**
 * Modified Date: 2026-06-23
 * Description: 游戏对局主控舱 - 多页面物理退场复位版 (融合免密VBS CS1.6路由)
 * 🛠️ 修改日志：
 * - 将 CS1.6 联机版请求的 fetch 路径由硬编码测试格式修改为相对路径 `/api/games/cs16/launch-config?mode=${apiMode}`
 * - 完美适配 Cloudflare Workers 的边缘计算路由拦截规则（game.nobistudio.com/api/*）
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
  // 🎯 2. 穿透直通车路由（完美融合掼蛋一键刺穿联机与 CS1.6 免密协议拉起）
  // =========================================================================
  window.launchMatchGame = function(mode) {
    if (window.isLoggingOut) return;
    console.log(`[主控舱直通车] 正在强切对局 -> 游戏: ${window.selectedGameId}, 模式: ${mode}`);

    // -------------------------------------------------------------
    // ⚔️ 专属分支 A：CS1.6 智能重定向隔离区
    // -------------------------------------------------------------
    if (window.selectedGameId === 'cs16') {
      const apiMode = (mode === 'SINGLE') ? 'single' : 'multiplayer';
      console.log(`[CS1.6 调度器] 正在走免密 VBS 路由拉起游戏, 模式: ${apiMode}`);

      if (apiMode === 'single') {
        // 单机版直接通过本地 VBS 唤起
        window.location.href = "cs16://";
      } else {
        // 🚀【核心升级】联机版：先获取当前登录用户的昵称，再请求 Worker 联机 IP
        const supabase = window.getSupabaseClient && window.getSupabaseClient();
        
        // 1. 尝试从 Supabase Auth 或用户表获取当前玩家昵称
        let userNickname = "Player";
        
        (async () => {
          try {
            if (supabase) {
              const { data: { user } } = await supabase.auth.getUser();
              if (user) {
                let profile = null;
            
                // 1. 尝试从 profiles 表中获取昵称
                const { data: profileData } = await supabase
                  .from('profiles')
                  .select('nickname')
                  .eq('id', user.id)
                  .maybeSingle();
            
                if (profileData && profileData.nickname) {
                  userNickname = profileData.nickname;
                } else {
                  // 2. 如果 profiles 里没有，尝试去你的 custom users 表中查一下（或者用邮箱前缀兜底）
                  const { data: userData } = await supabase
                    .from('users')
                    .select('*')
                    .eq('id', user.id)
                    .maybeSingle();
            
                  if (userData && userData.email) {
                    // 用邮箱@前面的部分当做临时昵称
                    userNickname = userData.email.split('@')[0];
                  } else if (user.user_metadata && user.user_metadata.nickname) {
                    // 3. 兜底：尝试从 auth 的 metadata 获取
                    userNickname = user.user_metadata.nickname;
                  } else {
                    // 4. 终极兜底：生成一个默认玩家名
                    userNickname = "玩家_" + user.id.slice(0, 6);
                  }
                }
              }
            }
          } catch (e) {
            console.warn("[CS1.6 昵称获取提示] 使用默认昵称", e);
          }

          // 2. 请求 Cloudflare Workers 边缘网关获取联机房主的 IP 与端口
          fetch(`/api/games/cs16/launch-config?mode=${apiMode}`)
            .then(response => {
              if (!response.ok) throw new Error("Backend return non-200 status");
              return response.json();
            })
            .then(data => {
              console.log("Worker返回完整数据:", data);
              if (data && data.launchUrl) {
                // data.launchUrl 假设后端返回的是形如：cs16://connect/47.100.x.x:27015
                // 我们在这里把动态查到的昵称用 /name/ 拼接到协议后面
                let finalUrl = data.launchUrl;
                
                // 如果后端返回的协议没带昵称，我们在后面追加
                if (!finalUrl.includes('name/')) {
                  // 去除末尾斜杠
                  if (finalUrl.endsWith('/')) finalUrl = finalUrl.slice(0, -1);
                  finalUrl = `${finalUrl}/name/${encodeURIComponent(userNickname)}`;
                }
                
                console.log('[CS1.6 调度器] 成功获取带昵称的公网对战协议:', finalUrl);
                window.location.href = finalUrl; 
              } else {
                // 兜底：无 IP 时降级拉起单机客户端并带上昵称
                window.location.href = `cs16://name/${encodeURIComponent(userNickname)}`;
              }
            })
            .catch(error => {
              console.error('[CS1.6 启动异常]', error);
              alert("无法连接到大厅联机后端，已为你自动降级拉起带有你昵称的本地单机版客户端！");
              window.location.href = `cs16://name/${encodeURIComponent(userNickname)}`;
            });
        })();
      }
      return; // 🔥 强力熔断
    }

    // 🚀 专属分支 B：如果选中的是掼蛋且点击的是联机版（NET），直接穿透刺入 Supabase 实时联机引擎
    if (window.selectedGameId === 'guandan' && mode === 'NET') {
      document.body.classList.add('in-game-match');
      const mask = document.getElementById('app-perfect-selector-mask');
      if (mask) mask.style.setProperty('display', 'none', 'important');

      const intermediateGarbage = ['#confirm-modal', '.modal-backdrop', '#guandan-lobby-container', '#login-container', 'iframe'];
      intermediateGarbage.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => el.style.setProperty('display', 'none', 'important'));
      });

      if (window.GD_MP && typeof window.GD_MP.startNetMatch === 'function') {
        window.GD_MP.startNetMatch();
      } else {
        alert("检测到联机数据包 guandan-mp-ext.js 尚未就绪，请检查引入顺序！");
      }
      return; 
    }

    // -------------------------------------------------------------
    // 常规对局切入路径（掼蛋单机版或围棋对局流程）
    // -------------------------------------------------------------
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
  };

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
          
          <div class="app-game-item" data-id="cs16">
            <div style="font-size: 50px; margin-bottom: 12px;">🔫</div>
            <h4 style="margin: 0; font-size: 18px; color: #ffffff;">CS 1.6</h4>
            <span style="font-size: 11px; color: #f59e0b; display:block; margin-top:6px; font-weight:bold;">免密 VBS 唤醒版</span>
            <div style="margin-top: 10px; padding: 4px; background: rgba(0,0,0,0.2); border-radius: 8px;">
              <a href="https://game-pkg.nobistudio.com/cs16_green.zip" download 
                 style="color: #3b82f6; font-size: 11px; text-decoration: underline; font-weight: bold; display: block;" 
                 onclick="event.stopPropagation();">
                 📥 下载清洁安装包。注意：一定要解压到d:\Cs16目录下。
              </a>
            </div>
            <button onclick="initEnvironment()">一键初始化游戏环境</button>
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

    // ⚡退出系统 - 跨多页面硬重定向
    document.getElementById('app-global-signout-trigger').onclick = async (e) => {
      e.stopPropagation();
      window.isLoggingOut = true; 
      document.body.classList.add('app-system-logged-out');

      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch (ex) {}

      const client = window.getSupabaseClient();
      if (client && client.auth && typeof client.auth.signOut === 'function') {
        try { await client.auth.signOut(); } catch (err) {}
      }
      window.location.replace("login.html");
    };
  };

  // =========================================================================
  // 🧼 【毁灭级清洗】彻底根除围棋单机/联机切换的幽灵棋子残留
  // =========================================================================
  window.clearGoBoardResidual = function() {
    const goKeys = ['goGameState', 'goBoard', 'boardMatrix', 'chessPieces', 'goHistory', 'currentGoMove'];
    goKeys.forEach(key => {
      if (window[key]) {
        if (Array.isArray(window[key])) window[key] = [];
        else if (typeof window[key] === 'object') {
          if (typeof window[key].clear === 'function') window[key].clear();
          if (typeof window[key].reset === 'function') window[key].reset();
          if (window[key].board) window[key].board = Array(19).fill(0).map(() => Array(19).fill(0));
          if (window[key].history) window[key].history = [];
          if (window[key].steps) window[key].steps = 0;
        }
      }
    });

    window.boardMatrix = Array(19).fill(0).map(() => Array(19).fill(0));
    window.goHistory = [];

    const goSelectors = ['#go-canvas', '.go-board-canvas', '#weiqi-container canvas', 'canvas'];
    goSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(canvas => {
        if (canvas.closest('#weiqi-container') || canvas.id.includes('go')) {
          const ctx = canvas.getContext('2d');
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      });
    });

    if (typeof window.drawGoBoard === 'function') window.drawGoBoard();
    else if (window.goBoard && typeof window.goBoard.render === 'function') window.goBoard.render();
  };

  // =========================================================================
  // 4. 全域高频【退局重定向守卫】与【状态自愈雷达】
  // =========================================================================
  function initEventListeners() {
    window.setLoggedIn = function(val, userInfo) {
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

      // 如果当前高亮是 CS1.6 且没在对局内，绝对不要让掼蛋大厅死灰复燃
      if (window.selectedGameId === 'cs16' && !isInGame) {
        if (mask && mask.style.display === 'none') window.renderAppCentralLobby();
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

  // =========================================================================
  // 🧭 【总大厅物理隔离穿透版】掼蛋参数一键直连雷达
  // =========================================================================
  window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const gameParam = urlParams.get('game');
    const modeParam = urlParams.get('mode');
    const roomParam = urlParams.get('room');

    if (typeof window.clearGoBoardResidual === 'function') {
      window.clearGoBoardResidual();
    }

    if (gameParam === 'guandan' && modeParam === 'NET' && roomParam) {
      window.selectedGameId = 'guandan';
      if (window.state) {
        window.state.gameMode = 'NET_BATTLE';
        if (!window.state.uid) window.state.uid = 'net_' + Math.random().toString(36).substr(2, 6);
      }

      if (window.GD) {
        window.GD.init = () => {};
        if (window.gdAutoStartTimer) clearTimeout(window.gdAutoStartTimer);
      }

      let enforcementTimer = setInterval(() => {
        const lobbySelectors = [
          '#game-selection', '.lobby', '#guandan-lobby-container', 
          '#app-perfect-selector-mask', '#login-container', '.modal-backdrop', 
          '#confirm-modal', '.main-lobby', '.game-select-panel', '.center-box'
        ];
        
        lobbySelectors.forEach(selector => {
          document.querySelectorAll(selector).forEach(el => el.style.setProperty('display', 'none', 'important'));
        });

        document.querySelectorAll('#guandan-game-container, #game-container, .game-board').forEach(el => {
          el.style.setProperty('display', 'block', 'important');
        });
        document.body.classList.add('in-game-match');
      }, 30);

      setTimeout(() => clearInterval(enforcementTimer), 4000);

      let retryCount = 0;
      const maxRetries = 40; 

      const tryLaunchNetMatch = () => {
        const isSupabaseReady = !!(window.getSupabaseClient || window.supabase);
        const isGDEngineReady = !!(window.GD && typeof window.GD.initGameMatch === 'function');
        const isMpReady = !!(window.GD_MP && typeof window.GD_MP.startNetMatch === 'function');

        if (isSupabaseReady && isGDEngineReady && isMpReady) {
          window.GD.initGameMatch(); 
          window.GD_MP.startNetMatch(roomParam.trim());
        } else if (retryCount < maxRetries) {
          retryCount++;
          setTimeout(tryLaunchNetMatch, 150); 
        } else {
          if (window.GD && typeof window.GD.initGameMatch === 'function') window.GD.initGameMatch();
          if (window.GD_MP && typeof window.GD_MP.startNetMatch === 'function') window.GD_MP.startNetMatch(roomParam.trim());
        }
      };
      setTimeout(tryLaunchNetMatch, 100);
    }

    setTimeout(initEventListeners, 20);
  });

  window.backToCentralLobby = () => {
    if (window.isLoggingOut) return;
    window.selectedGameId = 'guandan';
    document.body.classList.remove('in-game-match');
    const mask = document.getElementById('app-perfect-selector-mask');
    if (mask) mask.style.setProperty('display', 'flex', 'important');
  };
  
// ==========================================
  // 4. 一键初始化环境全局函数（对接 R2 的 start.vbs）
  // ==========================================
  window.initEnvironment = function() {
    const regContent = `Windows Registry Editor Version 5.00

[HKEY_CLASSES_ROOT\\cs16]
@="URL:CS16 Protocol"
"URL Protocol"=""

[HKEY_CLASSES_ROOT\\cs16\\shell]

[HKEY_CLASSES_ROOT\\cs16\\shell\\open]

[HKEY_CLASSES_ROOT\\cs16\\shell\\open\\command]
@="powershell -WindowStyle Hidden -Command \\"$url='https://game-pkg.nobistudio.com/start.vbs'; $dest='$env:TEMP\\\\start.vbs'; Invoke-WebRequest -Uri $url -OutFile $dest; wscript.exe $dest '%1'\\""`;

    const blob = new Blob([regContent], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "init_cs16.reg";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    alert("初始化文件已下载！\n\n请在浏览器下载栏点击并运行刚刚下载的【init_cs16.reg】文件，点击“是/确定”导入注册表，之后就可以直接点击网页进服了！");
  };
})();
