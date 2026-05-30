/**
 * Modified Date: 2026-05-30
 * Description: 1. Cancelled internal lobby; 2. Enabled green-active toggle & ondblclick on game center; 3. Integrated Supabase realtime battle; 4. Forced APP-fullscreen viewport layout; 5. Implemented Tribute/Return and Wild Card (Heart Rank) combo logic; 6. Added ergonomic cluster sorting mode.
 */

// APP全屏模式样式注入

(() => {
  'use strict';

  // 确保全局状态
  window.state = window.state || {};

  // 模拟当前选中的游戏状态
  let selectedGameId = 'guandan';

  function injectAppFullScreenStyles() {
    let s = document.getElementById('app-fullscreen-style');
    if (s) s.remove();
    s = document.createElement('style');
    s.id = 'app-fullscreen-style';
    s.textContent = `
      html, body {
        margin: 0; padding: 0;
        width: 100vw; height: 100vh;
        overflow: hidden;
        background: #060b14;
        -webkit-font-smoothing: antialiased;
      }
      #app-central-lobby {
        position: fixed; inset: 0;
        width: 100vw; height: 100vh;
        background: radial-gradient(circle at center, #111e2e 0%, #060b14 100%);
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        color: #fff; padding: 20px; z-index: 999;
      }
    `;
    document.head.appendChild(s);
  }

  function renderCentralLobby() {
    injectAppFullScreenStyles();

    let lobbyDiv = document.getElementById('app-central-lobby');
    if (!lobbyDiv) {
      lobbyDiv = document.createElement('div');
      lobbyDiv.id = 'app-central-lobby';
      document.body.appendChild(lobbyDiv);
    }

    lobbyDiv.innerHTML = `
      <div class="app-lobby-box">
        <h1 class="app-lobby-title">📱 智勇棋牌竞技中心 (APP全屏版)</h1>
        <div class="app-game-grid">
          <div class="app-game-card active-selected" data-game="guandan">
            <div class="app-game-icon">♠️</div>
            <div class="app-app-game-name">江苏掼蛋</div>
            <div class="app-game-desc">双下连升 逢六必打</div>
          </div>
          <div class="app-game-card" data-game="go">
            <div class="app-game-icon">⚪</div>
            <div class="app-app-game-name">经典围棋</div>
            <div class="app-game-desc">十九路经典 纵横博弈</div>
          </div>
        </div>
        <div class="app-lobby-footer">
          <button class="app-btn app-btn-solo" id="app-btn-solo-trigger">单机对战模式</button>
          <button class="app-btn app-btn-net" id="app-btn-net-trigger">创建游戏房间 (对战模式)</button>
        </div>
      </div>
    `;

    const cards = lobbyDiv.querySelectorAll('.app-game-card');
    cards.forEach(card => {
      card.addEventListener('click', (e) => {
        cards.forEach(c => c.classList.remove('active-selected'));
        card.classList.add('active-selected');
        selectedGameId = card.getAttribute('data-game');
      });

      card.addEventListener('dblclick', () => {
        launchSoloGame();
      });
    });

    document.getElementById('app-btn-solo-trigger').onclick = launchSoloGame;
    document.getElementById('app-btn-net-trigger').onclick = launchNetGame;
  }

  function launchSoloGame() {
    document.getElementById('app-central-lobby').style.display = 'none';
    if (selectedGameId === 'guandan' && window.GD) {
      window.GD.initGameMatch
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    renderCentralLobby();
  });
})();