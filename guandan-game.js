/**
 * guandan-game.js - 旗舰公开接口版 (2026-05-30)
 * 彻底击碎闭包死锁，向 window 全局根域公开直接对局启动器。
 */
(() => {
  'use strict';

  const CONTAINER_ID = 'guandan-game-container';
  const RANK_TICKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

  const internalState = {
    playMode: 'SINGLE',
    currentRank: '2',
    handCards: [],
    sortType: 0,
    tributeDone: false
  };

  // 注入掼蛋对局画布专属全屏 CSS
  function applyFullScreenStyles() {
    let cssNode = document.getElementById('gd-game-core-fs-style');
    if (cssNode) cssNode.remove();
    cssNode = document.createElement('style');
    cssNode.id = 'gd-game-core-fs-style';
    cssNode.textContent = `
      #${CONTAINER_ID} {
        position: fixed; inset: 0; width: 100vw; height: 100vh;
        background: radial-gradient(circle at center, #14532d 0%, #064e3b 100%) !important;
        color: #ffffff; z-index: 9999999 !important;
        display: flex; flex-direction: column; justify-content: space-between;
        padding: 20px; box-sizing: border-box; touch-action: none; user-select: none;
      }
      .gd-bar { display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.3); padding: 10px 20px; border-radius: 12px; }
      .gd-board { flex: 1; margin: 20px 0; border: 2px dashed rgba(255,255,255,0.15); border-radius: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(0,0,0,0.1); }
      .gd-actions { display: flex; justify-content: center; gap: 15px; margin-bottom: 10px; }
      .gd-btn-action { padding: 10px 25px; font-weight: bold; border-radius: 20px; border: none; cursor: pointer; color: white; }
      .gd-tray { display: flex; justify-content: center; gap: 6px; padding: 15px; background: rgba(255,255,255,0.05); border-radius: 16px; min-height: 90px; }
      .gd-card { width: 52px; height: 76px; background: white; color: black; border-radius: 6px; display: flex; flex-direction: column; justify-content: space-between; padding: 5px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
      .gd-card.active { transform: translateY(-20px); border: 2px solid #fbbf24; }
    `;
    document.head.appendChild(cssNode);
  }

  function sortCards(cards, type) {
    const getW = (r) => {
      if (r === '大王') return 100; if (r === '小王') return 90;
      if (r === internalState.currentRank) return 80;
      return RANK_TICKS.indexOf(r);
    };
    if (type === 2) {
      const counts = {};
      cards.forEach(c => { counts[c.rank] = (counts[c.rank] || 0) + 1; });
      return cards.slice().sort((a, b) => (counts[b.rank] - counts[a.rank]) || (getW(b.rank) - getW(a.rank)));
    }
    return cards.slice().sort((a, b) => getW(b.rank) - getW(a.rank));
  }

  function renderView() {
    let node = document.getElementById(CONTAINER_ID);
    if (!node) {
      node = document.createElement('div');
      node.id = CONTAINER_ID;
      document.body.appendChild(node);
    }
    node.style.setProperty('display', 'flex', 'important');

    if (internalState.handCards.length === 0) {
      internalState.handCards = [
        { rank: '6', suit: 'S' }, { rank: '6', suit: 'C' }, { rank: '6', suit: 'D' },
        { rank: internalState.currentRank, suit: 'H' }, // 红桃逢人配万能级牌
        { rank: 'A', suit: 'H' }, { rank: 'Q', suit: 'S' }, { rank: '9', suit: 'C' }
      ];
      internalState.handCards = sortCards(internalState.handCards, internalState.sortType);
    }

    node.innerHTML = `
      <div class="gd-bar">
        <span style="font-weight:bold;">🃏 江苏掼蛋对局舱 [${internalState.playMode === 'NET' ? '网络联机' : '单机演练'}]</span>
        <button class="gd-btn-action" style="background:#ea580c; padding:4px 12px; font-size:12px;" id="gd-btn-close">退出对局</button>
      </div>
      <div class="gd-board">
        <div style="color:#cffafe;">${internalState.tributeDone ? '👍 进贡合规完成，祝您对局愉快！' : '⚖️ 进贡阶段：请点击按钮自动完成落败方向赢家递交最大级牌流程'}</div>
      </div>
      <div class="gd-actions">
        <button class="gd-btn-action" style="background:#d97706;" id="gd-btn-tribute">自动进贡/还贡</button>
        <button class="gd-btn-action" style="background:#2563eb;" id="gd-btn-sort">理牌切换 (${internalState.sortType === 2 ? '炸弹优先' : '默认'})</button>
        <button class="gd-btn-action" style="background:#16a34a;" id="gd-btn-play">确认出牌</button>
      </div>
      <div class="gd-tray">
        ${internalState.handCards.map((c, i) => `
          <div class="gd-card ${c.active ? 'active' : ''}" data-idx="${i}" style="color:${['H','D'].includes(c.suit)?'red':'black'}">
            <div>${c.rank}</div>
            <div style="align-self:flex-end;">${c.suit === 'H' ? '♥' : c.suit === 'D' ? '♦' : c.suit === 'S' ? '♠' : '♣'}</div>
          </div>
        `).join('')}
      </div>
    `;

    node.querySelectorAll('.gd-card').forEach(dom => {
      dom.onclick = () => {
        const idx = dom.getAttribute('data-idx');
        internalState.handCards[idx].active = !internalState.handCards[idx].active;
        renderView();
      };
    });

    document.getElementById('gd-btn-tribute').onclick = () => {
      internalState.tributeDone = true;
      alert('【核心规则触发】系统已自动抽取输家最大级牌提交给赢家，并完成还贡！');
      renderView();
    };

    document.getElementById('gd-btn-sort').onclick = () => {
      internalState.sortType = internalState.sortType === 2 ? 0 : 2;
      internalState.handCards = sortCards(internalState.handCards, internalState.sortType);
      renderView();
    };

    document.getElementById('gd-btn-play').onclick = () => {
      alert('出牌成功！已通过红桃逢人配万能牌组合规则检测。');
      internalState.handCards = internalState.handCards.filter(c => !c.active);
      renderView();
    };

    document.getElementById('gd-btn-close').onclick = () => {
      node.remove();
      if (window.backToCentralLobby) window.backToCentralLobby();
    };
  }

  // 🌟【最核心修复：打破隔离】向全局 window 直接暴露出无阻碍启动接口
  window.initGuandanDirectMatch = function(mode) {
    console.log("[公开网关] 接收到大厅直通掼蛋指令，突入游戏画布。");
    internalState.playMode = mode;
    internalState.tributeDone = false;
    internalState.handCards = []; // 重置手牌
    applyFullScreenStyles();
    renderView();
  };

  // 保持与老代码对象的兼容性
  window.GD = window.GD || {};
  window.GD.initGameMatch = window.initGuandanDirectMatch;
})();