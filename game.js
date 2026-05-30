/**
 * Modified Date: 2026-05-30
 * Description: Fully resolved interface locks.
 * 1. Restored original game lobby element flows to guarantee Guandan activates smoothly.
 * 2. Rewired Go game launchers to directly boot into Single Player or Multiplayer based on the bottom-left deck console selection.
 * 3. Forced App-fullscreen container responsive layouts.
 */
(() => {
  'use strict';

  // --- 1. 核心状态维护与懒初始化 ---
  let supabaseInstance = null;
  let isInitializing = false;
  let currentActiveGame = 'guandan'; // 默认聚焦掼蛋

  // 全局共享状态保障
  window.state = window.state || {};

  // 暴露 Supabase 客户端，供掼蛋等联机对战引擎使用
  window.getSupabaseClient = function() {
      return supabaseInstance;
  };

  // --- 2. 需求4：整体界面强制注入全屏 APP 沉浸式样式 ---
  function applyAppFullScreenCSS() {
    if (document.getElementById('app-fs-core-style')) return;
    const style = document.createElement('style');
    style.id = 'app-fs-core-style';
    style.textContent = `
      html, body { 
        margin: 0; padding: 0; 
        width: 100vw; height: 100vh; 
        overflow: hidden !important; 
        background: #0f172a; 
      }
      /* 游戏选择项激活时的绿色背景样式 */
      .game-card-active-green {
        background: linear-gradient(135deg, #16a34a 0%, #15803d 100%) !important;
        border-color: #4ade80 !important;
        color: #ffffff !important;
        box-shadow: 0 8px 20px rgba(22, 163, 74, 0.3) !important;
      }
    `;
    document.head.appendChild(style);
  }

  // --- 3. 重构与补全核心事件绑定 (解决掼蛋拦截与围棋分流) ---
  function initEventListeners() {
    applyAppFullScreenCSS();

    // 针对原有大厅中的游戏卡片选择器进行增强劫持
    const gameCards = document.querySelectorAll('.game-card, .app-game-item');
    if (gameCards && gameCards.length > 0) {
      gameCards.forEach(card => {
        
        // 确保点击时赋予绿色高亮背景
        card.addEventListener('click', (e) => {
          gameCards.forEach(c => c.classList.remove('game-card-active-green'));
          card.classList.add('game-card-active-green');
          
          // 判定当前选中的是围棋还是掼蛋
          const gameId = card.getAttribute('data-game-id') || (card.innerText.includes('掼蛋') ? 'guandan' : 'go');
          currentActiveGame = gameId;
          console.log("当前选定竞技科目:", currentActiveGame);
        });

        // 双击默认直接触发单机快开
        card.addEventListener('ondblclick', (e) => {
          executeGameRouting('SINGLE');
        });
      });
    }

    // 劫持底部的【单机模式】与【创建房间/联机对战】按钮，根据当前选定的游戏进入对应系统
    const soloBtn = document.getElementById('launch-solo-btn') || document.getElementById('app-trigger-solo') || document.querySelector('.btn-solo');
    const netBtn = document.getElementById('launch-net-btn') || document.getElementById('app-trigger-net') || document.querySelector('.btn-net');

    if (soloBtn) {
      soloBtn.onclick = (e) => {
        if (e) e.preventDefault();
        executeGameRouting('SINGLE');
      };
    }

    if (netBtn) {
      netBtn.onclick = (e) => {
        if (e) e.preventDefault();
        executeGameRouting('NET');
      };
    }
  }

  // 根据当前卡片的选择，路由分流至单机或联机
  function executeGameRouting(mode) {
    console.log(`执行游戏分流: 目标游戏=${currentActiveGame}, 目标模式=${mode}`);

    if (currentActiveGame === 'guandan') {
      // 激活掼蛋引擎，隐藏原大厅骨架
      const gdEngine = window.GD || (window.parent && window.parent.GD);
      if (gdEngine && typeof gdEngine.initGameMatch === 'function') {
        hideLobbyPanels();
        gdEngine.initGameMatch(mode);
      } else {
        // 如果异步尚未载入，进行第二路径尝试
        if (typeof window.initGuandanGame === 'function') {
          hideLobbyPanels();
          window.initGuandanGame(mode);
        } else {
          alert('掼蛋模块正在加载中，请稍后或检查 guandan-game.js');
        }
      }
    } 
    else if (currentActiveGame === 'go') {
      // 满足最新需求：围棋游戏点击后根据当前界面的选择直接进入单机版和联机版
      hideLobbyPanels();

      // 执行原框架自带的沉浸式状态和UI刷新
      if (typeof window.applyImmersiveState === 'function') {
        window.applyImmersiveState(true);
      }
      if (typeof window.updateUI === 'function') {
        window.updateUI();
      }

      if (mode === 'SINGLE') {
        console.log("正在突入：围棋【单机AI对战】");
        if (window.MP && typeof window.MP.startAIGame === 'function') {
          window.MP.startAIGame();
        } else if (typeof window.initGame === 'function') {
          window.initGame();
        }
      } else {
        console.log("正在突入：围棋【多人联机对战】");
        if (window.MP && typeof window.MP.startMultiplayerGame === 'function') {
          window.MP.startMultiplayerGame();
        } else {
          // 兼容原版系统的联机触发器
          const rawNetTrigger = document.getElementById('confirm-start-btn');
          if (rawNetTrigger) rawNetTrigger.click();
        }
      }
    }
  }

  // 安全隐藏大厅容器面板
  function hideLobbyPanels() {
    const panels = ['#app-central-lobby', '#central-lobby-container', '.lobby-panel', '.main-lobby-ui'];
    panels.forEach(selector => {
      const el = document.querySelector(selector);
      if (el) el.style.display = 'none';
    });
  }

  // --- 4. 配置中心与原有登录认证桥接生命周期 ---
  window.addEventListener('configReady', function(event) {
      if (isInitializing || supabaseInstance) return;
      isInitializing = true;

      const config = event.detail;
      if (config && config.SUPABASE_URL && config.SUPABASE_ANON_KEY) {
          try {
              const { createClient } = window.supabase;
              supabaseInstance = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
              console.log("Supabase 云端网关建立就绪。");
              if (window.onSupabaseReady) {
                  window.onSupabaseReady(supabaseInstance);
              }
          } catch (e) {
              console.error("Supabase 客户端加载失败:", e);
          }
      }
  });

  // DOM 就绪后自启动底座监听
  window.addEventListener('DOMContentLoaded', () => {
    // 延时执行，确保原有系统动态生成的 HTML 卡片渲染完毕后进行完美事件绑定
    setTimeout(() => {
      initEventListeners();
    }, 200);
  });

  // 全局暴露返回接口
  window.backToCentralLobby = () => {
    const elements = ['#app-central-lobby', '#central-lobby-container'];
    elements.forEach(sel => {
      const el = document.querySelector(sel);
      if (el) el.style.display = 'flex';
    });
  };

})();