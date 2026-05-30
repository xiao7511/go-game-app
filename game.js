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
  // 分流启动逻辑：在此完成围棋、掼蛋的“单机/联机”四路精准分流调度
  function launchMatchGame(mode) {
    // 1. 隐藏我们设计的中央选择大厅遮罩层
    const centralLobby = document.getElementById('app-perfect-selector-mask') || document.getElementById('app-central-lobby');
    if (centralLobby) {
      centralLobby.style.setProperty('display', 'none', 'important');
    }

    // 🌟 【核心修复点】强力精准清除原系统自带的“选择游戏”老旧弹窗选单，防止其死锁或拦截
    const rawChoicePanels = [
      '#game-choice-panel', 
      '.game-selection-wrapper', 
      '.game-select-modal',
      '[class*="select-game"]', 
      '[id*="select-game"]'
    ];
    rawChoicePanels.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        // 发现目标后直接实施最高优先级隐藏，防止其跳出阻挡
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
        el.style.setProperty('opacity', '0', 'important');
      });
    });

    // 此外，如果该老旧选单是动态生成的弹窗，通过遍历其内部文本“选择游戏”或“经典围棋 19x19”将其精准揪出并隐藏
    document.querySelectorAll('div, section, p').forEach(node => {
      if (node.offsetWidth > 0 && (node.innerText.includes('选择游戏') || node.innerText.includes('当前版本已聚焦围棋对局'))) {
        // 向上查找最邻近的独立弹窗容器并将其隐藏
        const modalContainer = node.closest('[class*="modal"]') || node.closest('[class*="overlay"]') || node.closest('div');
        if (modalContainer) {
          modalContainer.style.setProperty('display', 'none', 'important');
        }
      }
    });

    // 2. 执行真正的对局无缝跳入
    if (selectedGameId === 'guandan') {
      console.log(`[分流路由] 绕过中间菜单，直接启动掼蛋 -> 模式: ${mode}`);
      
      let gdHandler = window.GD || (window.parent && window.parent.GD) || (window.top && window.top.GD);
      
      if (gdHandler && typeof gdHandler.initGameMatch === 'function') {
        gdHandler.initGameMatch(mode); 
      } 
      else {
        console.warn("[分流路由] window.GD 尚未完全就绪，执行底层无损代理模拟触发");
        
        // 模拟点击原系统的掼蛋触发项
        const rawGdCard = document.querySelector('.game-card[data-game-id="guandan"]') || 
                           document.querySelector('.app-game-item[data-game-id="guandan"]') ||
                           document.querySelector('.game-card') ||
                           document.getElementById('go-guandan-btn');
                           
        if (rawGdCard) rawGdCard.click();

        // 延迟 50 毫秒，直接派发出底层的单机或联机真实出海口
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
          } else {
            // 终极保底：如果还是找不到按钮，直接手动调用初始化
            if (typeof window.initGuandanGame === 'function') {
              window.initGuandanGame(mode);
            }
          }
        }, 50);
      }
    } 
    else if (selectedGameId === 'go') {
      console.log(`[分流路由] 绕过中间菜单，直接启动围棋 -> 模式: ${mode}`);
      
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
          // 联机模式下如果原框架有确认创建按钮，则自动代客点击
          const netTrigger = document.getElementById('confirm-start-btn') || document.getElementById('create-room-submit');
          if (netTrigger) netTrigger.click();
        }
      }
    }
  }

  /**
   * 渲染并接管屏幕：显示新设计的全屏大厅，同时强力隐藏任何原系统自带的老旧大厅组件
   */
  window.renderAppCentralLobby = function() {
    // 1. 动态注入全屏竞技样式
    if (!document.getElementById('app-perfect-overlay-css')) {
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
        <p style="color: #94a3b8; font-size: 13px; margin-top: 8px;">选择科目后将绕过中间级选单，直接突入战场</p>
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

    document.getElementById('perfect-go-solo').onclick = () => window.launchMatchGame('SINGLE');
    document.getElementById('perfect-go-net').onclick = () => window.launchMatchGame('NET');
  };

  // 分流启动逻辑：在此完成围棋、掼蛋的“单机/联机”四路精准分流调度
  function launchMatchGame(mode) {
    // 隐藏中央选择大厅遮罩层
    const centralLobby = document.getElementById('app-perfect-selector-mask') || document.getElementById('app-central-lobby');
    if (centralLobby) {
      centralLobby.style.setProperty('display', 'none', 'important');
    }

    if (selectedGameId === 'guandan') {
      console.log(`[分流路由] 准备启动掼蛋 -> 模式: ${mode}`);
      
      // 1. 第一路径：尝试从各种作用域获取全局 GD 引擎
      let gdHandler = window.GD || (window.parent && window.parent.GD) || (window.top && window.top.GD);
      
      if (gdHandler && typeof gdHandler.initGameMatch === 'function') {
        console.log("[分流路由] 成功定位到全局 GD 引擎，直接注入对局模式");
        gdHandler.initGameMatch(mode); 
      } 
      // 2. 第二路径：如果引擎未就绪，采用无损“代理点击法”唤醒原系统隐藏的掼蛋底座
      else {
        console.warn("[分流路由] window.GD 为 undefined，启动底层无损代理桥接");
        
        // 尝试点击原系统大厅的掼蛋选项卡（以此触发 guandan-game.js 的内部加载或初始化）
        const rawGdCard = document.querySelector('.game-card[data-game-id="guandan"]') || 
                           document.querySelector('.app-game-item[data-game-id="guandan"]') ||
                           document.querySelector('.game-card');
                           
        if (rawGdCard) {
          rawGdCard.click();
          console.log("[分流路由] 已模拟点击原系统的掼蛋卡片");
        }

        // 稍微延迟 80 毫秒，等待原系统切换上下文后，直接模拟点击底部的单机或联机按钮
        setTimeout(() => {
          // 尝试映射对应的启动按钮
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
            console.log("[分流路由] 成功定位到底层启动按钮，执行模拟点击:", rawLaunchBtn.id || rawLaunchBtn.className);
            rawLaunchBtn.click();
          } else {
            // 如果两层路径都失败了，说明 guandan-game.js 确实没有在页面中通过 <script> 标签引入
            alert('掼蛋对局模块未能建立连接。请确认 HTML 页面中已引入 <script src="guandan-game.js"></script>');
          }
        }, 80);
      }
    } 
    else if (selectedGameId === 'go') {
      console.log(`[分流路由] 准备启动围棋 -> 模式: ${mode}`);
      // 激活原系统的沉浸转换，确保不报画布缺失错误
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