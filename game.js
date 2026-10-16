// Nobi shell coordinator. Game engines remain in their original scripts.
(() => {
  'use strict';
  window.state = window.state || {};
  window.selectedGameId = 'guandan';
  window.isLoggingOut = false;
  let launching = false;

  window.NobiSignOut = async function(e) {
    e?.stopPropagation();
    window.isLoggingOut = true;
    document.body.classList.add('app-system-logged-out');
    window.NobiAudio?.suspend();
    try { sessionStorage.removeItem('userInfo'); delete window.state.uid; } catch (_) {}
    const client = window.getSupabaseClient();
    try { await client?.auth?.signOut?.(); } catch (_) {}
    window.location.replace('login.html');
  };
  window.renderAppCentralLobby = function() {
    if(window.isLoggingOut) return;
    window.XQ?.destroy();
    document.body.classList.remove('in-game-match','app-system-logged-out','nobi-playing-go','nobi-playing-guandan','nobi-playing-xiangqi');
    let mask = document.getElementById('app-perfect-selector-mask');
    if(!mask) { mask=document.createElement('div'); mask.id='app-perfect-selector-mask'; document.body.appendChild(mask); }
    mask.style.setProperty('display','block');
    if(window.NobiLobby) window.NobiLobby.mount(mask);
    const signout=document.getElementById('app-global-signout-trigger');
    if(signout) signout.onclick=window.NobiSignOut;
    window.NobiAudio?.setScene('lobby');
  };
  window.launchMatchGame = async function(mode, room) {
    if(window.isLoggingOut || launching) return;
    const game=window.NobiGames.catalogue.get(window.selectedGameId,window.NobiGames.platform());
    if(!game || !game.modes.includes(mode)) { window.NobiLobby.notify('当前平台不提供此游戏入口'); return; }
    launching=true;
    try {
      if(mode==='NET'&&game.gameId!=='cs16'&&window.NOBI_ONLINE_CONFIG){location.href='online.html?game='+game.gameId;return;}
      if(mode==='NET' && game.gameId!=='cs16') {
        try { await window.NobiServices.requireUser(); }
        catch (_) { alert('请先登录并确认联机配置'); return; }
        location.href='online.html?game='+game.gameId;return;
      }
      if(game.gameId==='cs16') { if(window.NobiPlatform.canUsePCGames()) await window.NobiPC?.launch(mode); return; }
      if(game.gameId==='xiangqi')await window.NobiXiangqiReady;
      const launchers={ guandan: mode==='NET'?window.GD_MP?.startNetMatch:window.GD?.initGameMatch, go: mode==='NET'?window.MP?.createRoom:window.MP?.startAIGame,xiangqi:window.XQ?.startSolo };
      const launcher=launchers[game.gameId];
      if(typeof launcher!=='function') { window.NobiLobby.notify('游戏引擎尚未就绪'); return; }
      document.body.classList.add('in-game-match','nobi-playing-'+game.gameId);
      document.getElementById('app-perfect-selector-mask')?.style.setProperty('display','none');
      window.NobiAudio?.setScene(game.musicScene);
      if(game.gameId==='xiangqi'){window.XQ.startSolo();}
      else if(game.gameId==='guandan') {
        if(mode==='NET') await window.GD_MP.startNetMatch(room);
        else window.GD.initGameMatch('SINGLE_PLAYER');
      } else {
        if(mode==='SINGLE') window.MP.startAIGame();
        else if(room) await window.MP.joinRoom(room);
        else await window.MP.createRoom();
      }
    } catch (_) {
      window.backToCentralLobby(); window.NobiLobby.notify('启动失败，请检查配置后重试');
    } finally { launching=false; }
  };
  window.backToCentralLobby = function() {
    if(window.isLoggingOut) return;
    window.renderAppCentralLobby();
  };
  window.setLoggedIn = function(value, userInfo) {
    if(value && !window.isLoggingOut) {
      if(userInfo) { window.state.uid=userInfo.uid; window.state.userNickname=userInfo.nickname; }
      window.renderAppCentralLobby();
    }
  };
  window.NobiServices.ready.then(async client=>{
    if(!client) return;
    const {data,error}=await client.auth.getUser();
    if(!error && data?.user) {
      window.state.uid=data.user.id;
      window.state.userNickname=data.user.user_metadata?.nickname || '玩家';
      window.NobiLobby?.setUser(data.user);
    }
    client.auth.onAuthStateChange?.((_event,session)=>{
      if(window.isLoggingOut) return;
      if(session?.user) { window.state.uid=session.user.id; window.state.userNickname=session.user.user_metadata?.nickname || '玩家'; }
      else { delete window.state.uid; delete window.state.userNickname; }
      window.NobiLobby?.setUser(session?.user || null);
    });
  }).catch(()=>console.warn('[Auth] Session unavailable'));
  window.addEventListener('DOMContentLoaded',()=>{
    window.NobiNavigation?.setBackHandler(()=>{
      if(!document.body.classList.contains('in-game-match')) return false;
      if(!confirm('退出当前单机对局并返回大厅？')) return true;
      if(window.selectedGameId==='xiangqi'){window.XQ?.destroy();window.backToCentralLobby();return true;}
      const exit=document.querySelector(window.selectedGameId==='go'?'#quit-game-btn':'[data-gd-exit]');
      exit?.click();
      return true;
    });
    window.renderAppCentralLobby();
    document.addEventListener('click',e=>{
      if(!document.body.classList.contains('in-game-match')) return;
      if(e.target.closest('#quit-game-btn, #gd-btn-lobby-return, [data-gd-exit]')) {
        if(window.selectedGameId==='go') window.MP?.leaveRoom();
        // Switch audio immediately on exit; the lobby re-render stays deferred until engines finish cleanup.
        window.NobiAudio?.setScene('lobby');
        setTimeout(window.backToCentralLobby,0);
      }
    });
    const params=new URLSearchParams(location.search);
    const requested=params.get('game') || (params.get('room') ? 'go' : null);
    if(requested) {
      const game=window.NobiGames.catalogue.get(requested,window.NobiGames.platform());
      if(!game) { window.NobiLobby.notify('当前平台不提供此游戏'); return; }
      window.selectedGameId=requested; location.hash='/games/'+requested;
      const room=params.get('room'); const mode=params.get('mode') || (room ? 'NET' : null);
      if(mode==='SINGLE' || (mode==='NET' && room)) setTimeout(()=>window.launchMatchGame(mode,room?.trim()),0);
    }
  });
})();
