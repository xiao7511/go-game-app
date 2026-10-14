// Presentation / advisory clocks only. No settlement or rules are implemented here.
(() => {
  'use strict';
  const formatTime=seconds=>`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
  function createClock(now=()=>performance.now()) {
    let last=now(),turn=null,active=false,key=null;
    let elapsed={black:0,white:0};
    return {
      update(next) {
        const time=now();
        if(next.key!==key) {elapsed={black:0,white:0};key=next.key;}
        else if(active && ['black','white'].includes(turn)) elapsed[turn]+=Math.max(0,time-last)/1000;
        last=time;turn=next.turn;active=next.active;
        return {...elapsed};
      },
      reset(){key=null;last=now();active=false;elapsed={black:0,white:0};}
    };
  }
  const coordinate=move=>move.pass?'虚着':'ABCDEFGHJKLMNOPQRST'[move.col]+(19-move.row);
  window.NobiMatchView=Object.freeze({createClock,formatTime,coordinate});
  const clock=createClock();
  let dialog,lastFocus,lastMoveNumber=0,session=0;
  const text=(selector,value)=>{const el=document.querySelector(selector);if(el) el.textContent=value;};
  function updateGo() {
    const view=window.MP?.getViewState?.();if(!view) return;
    const playing=document.body.classList.contains('nobi-playing-go') && document.body.classList.contains('in-game-match');
    document.body.dataset.goMode=view.mode;
    document.body.dataset.goPreviewActive=view.preview ? 'true' : 'false';
    if(view.moveNumber<lastMoveNumber) session++;
    lastMoveNumber=view.moveNumber;
    const elapsed=clock.update({key:session+':'+view.room,turn:view.turn,active:playing && !document.hidden && !view.ended && window.NobiAudio?.getStatus().scene!=='result'});
    text('[data-go-clock]',`本地用时 ${formatTime(elapsed.black)} / ${formatTime(elapsed.white)}`);
    text('[data-go-player]',`黑方 · ${view.mode==='SINGLE_PLAYER'?(window.state?.userNickname || '本地玩家'):view.blackName}`);
    text('[data-go-opponent]',`白方 · ${view.mode==='SINGLE_PLAYER'?'AI':view.whiteName}`);
    const latest=view.moves.at(-1);
    text('[data-go-hint]',view.ended?'本局已结束':view.preview?`预览 ${coordinate(view.preview)} · 确认后落子`:`${view.turn==='black'?'黑':'白'}方回合 · ${latest?'最近一步 '+coordinate(latest)+' · 第 '+view.moveNumber+' 手':'触屏先预览再确认 · 鼠标点击落子'} · 用时仅供参考`);
    const marker=document.querySelector('.board-shell [data-go-preview]');
    if(marker) {
      marker.hidden=!view.preview || !playing;
      if(view.preview) {
        marker.style.left=view.preview.x+'px';marker.style.top=view.preview.y+'px';
        marker.style.width=marker.style.height=view.preview.size+'px';
      }
    }
    for(const selector of ['[data-go-confirm]','[data-go-cancel]']) {
      const button=document.querySelector(selector);if(button) button.disabled=!view.preview || view.ended;
    }
    const undo=document.querySelector('[data-go-undo]');if(undo) undo.disabled=!view.canUndo;
    const solo=view.mode==='SINGLE_PLAYER';
    document.querySelectorAll('[data-go-mode-label]').forEach(el=>{el.textContent=solo?'人机对局':view.room?'好友对战':'在线对战';});
    text('[data-go-move-count]',String(view.moveNumber));
    const count=document.querySelector('[data-go-count]');if(count){const online=document.body.classList.contains('nobi-embedded');count.hidden=!solo&&!online;count.disabled=(!solo&&!online)||view.ended||!view.myColor||(online&&(!window.parent.NobiOnline?.getConnection().connected||window.parent.NobiOnline?.getConnection().pending||!!window.parent.NobiOnline?.getSnapshot()?.pending));}
    const rematch=document.querySelector('[data-go-rematch]');if(rematch) rematch.hidden=!solo;
    // Player cards: own colour first; clocks and captures follow the stone colour shown.
    const mine=view.myColor||'black',theirs=mine==='black'?'white':'black';
    for(const [selector,color,key] of [['#local-player-panel',mine,'self'],['#opponent-player-panel',theirs,'opponent']]) {
      const panel=document.querySelector(selector);if(!panel) continue;
      panel.dataset.goStone=color;panel.dataset.turnLabel=key==='self'?'轮到你':solo?'AI 思考中':'对方思考';panel.classList.toggle('is-turn',playing && !view.ended && view.turn===color);
      text(`[data-go-clock-${key}]`,formatTime(elapsed[color]));
      text(`[data-go-captures-${key}]`,String(color==='black'?view.blackCaptures??0:view.whiteCaptures??0));
    }
    const avatars=window.NobiAvatars;
    if(avatars) {
      const selfName=solo?(window.state?.userNickname||'本地玩家'):(mine==='black'?view.blackName:view.whiteName);
      const otherName=solo?'阿尔法狗 (AI)':(mine==='black'?view.whiteName:view.blackName);
      for(const [id,src] of [['user-avatar',solo?avatars.self(selfName):avatars.safe(view.players?.self?.avatar)||avatars.self(selfName)],['opponent-avatar',solo?avatars.presets[4].src:avatars.safe(view.players?.opponent?.avatar)||avatars.forKey(otherName)]]) {
        const img=document.getElementById(id);if(img && img.getAttribute('src')!==src) img.setAttribute('src',src);
      }
    }
    renderLiveRecord(view);
    if(estimateOn && view.moveNumber!==estimateMove) drawEstimate(view);
    if(estimateOn && view.ended===false && !playing) setEstimate(false);
  }
  let estimateOn=false,estimateMove=-1,recordKey='';
  function renderLiveRecord(view) {
    const list=document.querySelector('[data-go-record-live]');if(!list) return;
    const key=view.moves.length+':'+(view.moves.at(-1)?.row??'')+':'+(view.moves.at(-1)?.col??'');
    if(key===recordKey) return;recordKey=key;
    text('[data-go-record-count]',view.moves.length+' 手');
    list.replaceChildren(...view.moves.slice(-40).map(move=>{
      const item=document.createElement('li');item.dataset.color=move.color===1?'black':'white';
      item.innerHTML='<span></span>';item.firstChild.textContent=String(move.number??'');
      item.append(`${move.color===1?'黑':'白'} ${coordinate(move)}`);return item;
    }));
    list.scrollTop=list.scrollHeight;
  }
  function drawEstimate(view) {
    const layer=document.querySelector('[data-go-territory]'),label=document.querySelector('[data-go-estimate]');
    const analysis=window.NobiGoAnalysis;if(!layer || !analysis || !view?.board?.length) return;
    estimateMove=view.moveNumber;
    const result=analysis.estimate(view.board),dpr=window.devicePixelRatio||1,box=layer.getBoundingClientRect();
    layer.width=Math.round(box.width*dpr);layer.height=Math.round(box.height*dpr);
    const ctx=layer.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,box.width,box.height);
    const {padding,cellSize}=view.geometry,mark=cellSize*.38;
    result.owner.forEach((row,r)=>row.forEach((owner,c)=>{
      const stone=view.board[r][c];if(!owner || stone===owner) return;
      const x=padding+c*cellSize,y=padding+r*cellSize;
      ctx.fillStyle=owner===1?'rgba(17,17,17,.78)':'rgba(255,255,255,.88)';
      ctx.strokeStyle=owner===1?'rgba(255,255,255,.35)':'rgba(0,0,0,.35)';
      ctx.fillRect(x-mark/2,y-mark/2,mark,mark);ctx.strokeRect(x-mark/2,y-mark/2,mark,mark);
    }));
    if(label) label.textContent=`形势估算：黑 ${result.black} · 白 ${result.white}（含贴 ${result.komi}）· ${result.leader==='black'?'黑':'白'}领先约 ${Math.abs(result.margin).toFixed(1)} 目 · 仅供参考`;
  }
  function setEstimate(on) {
    estimateOn=on;estimateMove=-1;
    const layer=document.querySelector('[data-go-territory]'),label=document.querySelector('[data-go-estimate]'),toggle=document.querySelector('[data-go-estimate-toggle]');
    if(layer) layer.hidden=!on;if(label) label.hidden=!on;if(toggle) toggle.setAttribute('aria-pressed',String(on));
    if(on) drawEstimate(window.MP?.getViewState?.());
  }
  function closePanel() {if(dialog?.open) dialog.close();lastFocus?.focus?.({preventScroll:true});}
  function openPanel(title) {
    lastFocus=document.activeElement;
    if(!dialog) {
      dialog=document.createElement('dialog');dialog.className='nobi-match-dialog';dialog.setAttribute('aria-labelledby','match-dialog-title');document.body.appendChild(dialog);
      dialog.addEventListener('click',e=>{if(e.target===dialog) closePanel();});
      dialog.addEventListener('close',()=>lastFocus?.focus?.({preventScroll:true}));
    }
    dialog.replaceChildren();
    const heading=document.createElement('h2');heading.id='match-dialog-title';heading.textContent=title;dialog.appendChild(heading);
    const body=document.createElement('div');dialog.appendChild(body);
    const actions=document.createElement('div');actions.className='dialog-actions';
    const close=document.createElement('button');close.type='button';close.textContent='关闭面板';close.onclick=closePanel;actions.appendChild(close);dialog.appendChild(actions);
    if(!dialog.open) dialog.showModal();return body;
  }
  function showSettings() {
    const body=openPanel('音乐与对局设置');const settings=window.NobiAudio.getSettings();
    body.innerHTML='<p>舒缓古典钢琴；背景音乐、游戏音效与最后 10 秒倒计时提示可独立调整。</p>';
    const scene=document.body.classList.contains('nobi-playing-go')?'go':'guandan',label=scene==='go'?'围棋':'掼蛋';
    const choice=document.createElement('label');choice.className='match-music-choice';choice.textContent=label+'背景音乐';
    const select=document.createElement('select');select.dataset.matchTrack=scene+'Track';select.setAttribute('aria-label','选择'+label+'背景音乐');
    for(const track of window.NobiAudio.getTracks(scene)){const option=document.createElement('option');option.value=track.id;option.textContent=track.composer+' · '+track.title;select.appendChild(option);}
    select.value=settings[scene+'Track'];choice.appendChild(select);body.appendChild(choice);
    const credit=document.createElement('p');credit.className='match-music-credit';credit.innerHTML='钢琴录音：Paul Pitman / Donald Betts / <a href="https://musopen.org" target="_blank" rel="noopener noreferrer">Musopen</a>。爆炸录音：<a href="https://freesound.org/people/qubodup/sounds/189778/" target="_blank" rel="noopener noreferrer">qubodup</a>（CC0，节选）。';body.appendChild(credit);
    const preview=document.createElement('button');preview.type='button';preview.dataset.matchBombPreview='';preview.textContent='试听炸弹音效';if(scene==='guandan')body.appendChild(preview);
    for(const [domain,label] of [['music','背景音乐'],['effects','游戏音效'],['prompt','回合提示音']]) {
      const group=document.createElement('div');group.className='match-audio-group';
      group.innerHTML=`<label><input type="checkbox" data-match-audio="${domain}Enabled" ${settings[domain+'Enabled']?'checked':''}>${label}</label><label><span class="sr-only">${label}音量</span><input type="range" min="0" max="100" aria-label="${label}音量" data-match-audio="${domain}Volume" value="${Math.round(settings[domain+'Volume']*100)}"><output>${Math.round(settings[domain+'Volume']*100)}%</output></label>`;
      body.appendChild(group);
    }
    const mute=document.createElement('button');mute.type='button';mute.dataset.matchMute='';mute.textContent='静音全部（保存设置）';body.appendChild(mute);
    const info=document.createElement('p');info.textContent='掼蛋点选 / 连续拖选，取消后重新选牌；只有“出牌”或 PC 右击才提交。围棋触屏先预览再确认；单机悔棋撤回自己与 AI 最近一轮。全屏在竖屏提示处手动开启。';body.appendChild(info);
  }
  function showRecord() {
    const body=openPanel('本局棋谱 · 本地记录');const view=window.MP?.getViewState?.();
    const note=document.createElement('p');note.textContent='仅记录本页面会话收到的实际落子；中途加入或丢包时不完整。不是服务端裁决、历史战绩或正式 SGF。';body.appendChild(note);
    const list=document.createElement('ol');list.dataset.recordList='';
    for(const move of view?.moves || []) {const item=document.createElement('li');item.textContent=`${move.color===1?'黑':'白'} ${coordinate(move)}`;list.appendChild(item);}
    body.appendChild(list);
    if(!list.children.length) {const empty=document.createElement('p');empty.textContent='本会话尚无落子记录';body.appendChild(empty);}
  }
  window.addEventListener('nobi:go-view',updateGo);
  window.addEventListener('DOMContentLoaded',()=>{
    // Embedded authority rooms keep resign/exit/scoring in the outer online page.
    if(new URLSearchParams(location.search).has('authority-frame')) document.body.classList.add('nobi-embedded');
    window.addEventListener('resize',()=>{if(estimateOn) drawEstimate(window.MP?.getViewState?.());});
    document.addEventListener('click',e=>{
      if(e.target.closest('[data-match-settings]')) showSettings();
      if(e.target.closest('[data-match-chat]')) window.NobiRoomChat?.open();
      if(e.target.closest('[data-go-record],[data-go-record-result]')) showRecord();
      if(e.target.closest('[data-go-confirm]')) window.MP?.confirmPreview();
      if(e.target.closest('[data-go-cancel]')) window.MP?.cancelPreview();
      if(e.target.closest('[data-go-undo]')) window.MP?.undoSoloTurn();
      if(e.target.closest('[data-go-count]')) window.MP?.scoreSoloGame();
      if(e.target.closest('[data-go-estimate-toggle]')) setEstimate(!estimateOn);
      if(e.target.closest('[data-go-result-close]')) window.MP?.closeResultOverlay();
      if(e.target.closest('[data-go-rematch]')) {setEstimate(false);clock.reset();window.MP?.startAIGame();window.NobiAudio?.setScene('go');}
      if(e.target.closest('[data-go-exit]')) {window.MP?.closeResultOverlay();document.getElementById('quit-game-btn')?.click();}
      if(e.target.closest('[data-match-mute]')) {window.NobiAudio.setSettings({musicEnabled:false,effectsEnabled:false,promptEnabled:false});showSettings();}
      if(e.target.closest('[data-match-bomb-preview]')) window.NobiAudio.playEffect('bomb');
      if(e.target.closest('[data-gd-exit],#quit-game-btn')) {closePanel();clock.reset();setEstimate(false);}
    });
    document.addEventListener('input',e=>{
      if(e.target.matches('[data-match-track]')){window.NobiAudio.setSettings({[e.target.dataset.matchTrack]:e.target.value});return;}
      if(!e.target.matches('[data-match-audio]')) return;
      const key=e.target.dataset.matchAudio;const value=e.target.type==='checkbox'?e.target.checked:Number(e.target.value)/100;
      window.NobiAudio.setSettings({[key]:value});const output=e.target.parentElement.querySelector('output');if(output) output.textContent=Math.round(value*100)+'%';
    });
    document.addEventListener('visibilitychange',updateGo);window.addEventListener('pagehide',()=>clock.reset());
    setInterval(updateGo,1000);updateGo();
  });
})();
