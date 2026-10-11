(() => {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state = { route:'home', selected:'guandan', query:'', user:null, rankTab:'guandan', period:'all',rankGame:'guandan',rankPage:0,rankSeason:'',notice:'' };
  let rankingKey='', rankingRevision=0,seasonData=null,personalData=null,historyData=null,profileLoading=false,profileGame='';
  let rankingData={status:'unavailable',rows:[],myRank:null};
  const paths = {
    home:'M3 10l9-7 9 7v10h-6v-6H9v6H3z', games:'M7 6h10l4 12-3 2-4-4h-4l-4 4-3-2zM6 11h5M8.5 8.5v5M16 10h.01M18 13h.01',
    rank:'M5 20V12h3v8M11 20V4h3v16M17 20V8h3v12', friends:'M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M2 21v-3c0-5 12-5 12 0v3M17 4a4 4 0 0 1 0 8M17 15c4 0 5 2 5 6',
    me:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21v-2c0-7 16-7 16 0v2', music:'M9 18V5l11-2v12M9 18a3 3 0 1 1-3-3h3M20 15a3 3 0 1 1-3-3h3',
    settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z',
    history:'M5 3h14v18H5zM8 8h8M8 12h8M8 16h5', bell:'M5 17h14l-2-4V8a5 5 0 0 0-10 0v5zM10 21h4', arrow:'M9 5l7 7-7 7', search:'M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14M15 15l6 6', cards:'M4 6h12v15H4zM9 3h11v14M8 13l2-3 2 3-2 3z', go:'M4 4h16v16H4zM4 9h16M4 15h16M9 4v16M15 4v16', target:'M12 3v5M12 16v5M3 12h5M16 12h5M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12'
  };
  const icon = name => `<svg class="nobi-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[name] || paths.games}"/></svg>`;
  const brand = () => '<a class="nobi-brand" href="#/home" aria-label="Nobi 游戏首页"><img src="ui/brand.svg" alt=""><div><b>Nobi</b> <span>游戏</span><small>NOBI GAMES</small></div></a>';
  const routeLink = (route, label, symbol = route) => `<a href="#/${route}" ${state.route === route || (route==='me' && ['music','settings','history','notifications','about'].includes(state.route)) ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${label}</span></a>`;
  const titles = { games:'选择游戏', rank:'排行榜', me:'个人中心', music:'音乐设置', settings:'游戏设置', history:'我的战绩', friends:'好友', notifications:'消息通知', about:'关于 Nobi' };
  const mobileHeader = () => state.route==='home' ? brand() : `<a class="icon-button mobile-back" href="#/${['music','settings','history','notifications','about'].includes(state.route)?'me':'home'}" aria-label="返回${['music','settings','history','notifications','about'].includes(state.route)?'个人中心':'大厅'}">${icon('arrow')}</a><h1 class="mobile-page-title">${titles[state.route] || '游戏大厅'}</h1>`;
  const rankingAvatar = row => { const src=window.NobiAvatars?.forKey(row.userId || row.nickname); return `<span class="nobi-avatar ${src?'has-img':''}" aria-hidden="true">${src?`<img src="${escape(src)}" alt="" loading="lazy">`:escape(row.nickname.slice(0,1))}</span>`; };
  const name = () => state.user?.user_metadata?.nickname || '访客玩家';
  const avatar = () => { const src=window.NobiAvatars?.self(name()); return `<span class="nobi-avatar ${src?'has-img':''}" aria-hidden="true">${src?`<img src="${escape(src)}" alt="" draggable="false">`:''}<i>${escape(name().slice(0,1))}</i></span>`; };
  const avatarPicker = () => { if(!window.NobiAvatars) return ''; const current=window.NobiAvatars.current(); return `<section class="nobi-panel avatar-picker"><h3>我的头像</h3><p>选择形象或上传照片，显示在大厅和对局座位上。登录后同步至账号，其他玩家也能看到。</p><div class="avatar-grid">${window.NobiAvatars.presets.map(p=>`<button type="button" data-avatar-preset="${p.id}" aria-pressed="${current?.type==='preset'&&current.id===p.id}" aria-label="使用头像 ${escape(p.name)}"><img src="${escape(p.src)}" alt=""><span>${escape(p.name)}</span></button>`).join('')}</div><div class="avatar-actions"><label class="outline-button avatar-upload">上传照片<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-avatar-upload hidden></label><button type="button" class="outline-button" data-avatar-reset ${current?'':'disabled'}>恢复默认</button></div></section>`; };
  const badge = () => `<span class="nobi-badge">${state.user ? '已登录' : '本地单机体验'}</span>`;
  const player = compact => `<section class="nobi-player ${compact ? 'compact' : ''}">${avatar()}<div><strong>${escape(name())}</strong><small>${state.user ? 'Nobi 账号 · '+escape(state.user.id.slice(0,8)) : '登录后开启好友对局'}</small>${badge()}</div></section>`;
  const metrics = () => rankingData.myRank?`<div class="nobi-metrics"><div><b>${rankingData.myRank.score}</b><span>当前积分</span></div><div><b>${rankingData.myRank.rank}</b><span>全服排名</span></div><div><b>${rankingData.myRank.winRate??'—'}%</b><span>胜率</span></div></div>`:'<div class="nobi-metrics"><div><b>—</b><span>当前积分</span></div><div><b>—</b><span>全服排名</span></div><div><b>—</b><span>胜率</span></div></div>';
  function cover(game) {
    if (game.cover === 'cards') return `<div class="nobi-cover card-table" aria-hidden="true"><div class="table-ring"></div><div class="card-fan">${['ace_of_spades','ace_of_hearts','king_of_clubs','queen_of_hearts','jack_of_spades'].map((card,i)=>`<img src="images/cards/${card}.png" alt="" style="--i:${i}" draggable="false">`).join('')}</div><span class="cover-caption">GUANDAN</span></div>`;
    if (game.cover === 'board') return `<div class="nobi-cover go-table" aria-hidden="true"><div class="mini-board">${[[2,2,0],[3,2,1],[4,2,0],[3,3,0],[4,3,1],[5,3,0],[4,4,0],[5,4,1],[2,4,1],[5,5,0],[3,5,1]].map(([x,y,w])=>`<i class="mini-stone ${w?'white':''}" style="--x:${x};--y:${y}"></i>`).join('')}</div><span class="cover-caption">THE ART OF GO</span></div>`;
    if(game.gameId==='cs16') return `<div class="nobi-cover pc-cover" aria-hidden="true">${icon(game.icon)}<span class="pc-watermark">COUNTER<br>STRIKE</span><span class="cover-caption">WINDOWS · CLASSIC</span></div>`;
    return `<div class="nobi-cover generic-cover" aria-hidden="true">${icon(game.icon)}<span class="cover-caption">NOBI GAMES · MORE TO PLAY</span></div>`;
  }
  function card(game) {
    return `<article class="nobi-game-card game-${escape(game.gameId)} ${state.selected===game.gameId?'is-selected':''}"><button class="game-select" data-id="${escape(game.gameId)}" aria-pressed="${state.selected===game.gameId}" aria-label="选择${escape(game.name)}">${cover(game)}<div class="card-copy"><span class="game-category">${game.gameId==='guandan'?'默契 · 策略':game.gameId==='go'?'思考 · 博弈':'经典 · 竞技'}</span><h3>${escape(game.name)}${game.platforms.length===1?'<em>仅 PC</em>':''}</h3><p>${escape(game.description)}</p></div></button><div class="card-actions"><span>${game.modes.includes('NET')?'单机 / 好友联机':'单机'}</span><button class="gold-button small" data-launch="${escape(game.gameId)}">快速开始 ${icon('arrow')}</button></div></article>`;
  }
  function games() { return window.NobiGames.catalogue.list(window.NobiGames.platform(), state.query); }
  const heading = (title, text) => `<div class="section-heading"><div><h2>${title}</h2>${text?`<p>${text}</p>`:''}</div></div>`;
  const empty = (title, text, symbol='rank') => `<div class="nobi-empty">${icon(symbol)}<h3>${title}</h3><p>${text}</p></div>`;
  const actions = () => `<section class="quick-actions" aria-label="所选游戏启动"><div><small>已选择</small><b>${escape(window.NobiGames.catalogue.get(state.selected,window.NobiGames.platform())?.name || '掼蛋')}</b></div><button class="gold-button" id="perfect-go-solo">进入单机版</button><button class="blue-button" id="perfect-go-net">进入联机版</button></section>${state.selected==='cs16' && window.NobiPlatform.canUsePCGames()?'<section class="nobi-panel cs-setup"><p>需要既有 Windows 启动器及协议。外部安装包与脚本未验证，请自行核验后执行。</p><a class="text-link" href="https://game-pkg.nobistudio.com/cs16_green.zip" download>下载既有 Windows 安装包</a><a class="text-link" href="https://game-pkg.nobistudio.com/一键初始化.bat" download>下载既有环境初始化脚本</a></section>':''}`;
  function home() {
    return `<section class="nobi-banner"><div><span class="eyebrow">GOOD GAMES. GREAT COMPANY.</span><h1>好游戏 · 好朋友<br><span>在 Nobi</span></h1><p>经典的默契，全新的相遇。</p><a class="gold-button" href="#/games">探索游戏 ${icon('arrow')}</a></div><div class="banner-seal" aria-hidden="true">好<br>友<br>对<br>局</div></section><div class="mobile-player">${player(true)}${metrics()}</div><div class="home-game-heading">${heading('开启你的下一局','经典的默契，全新的相遇。')}<a class="text-link" href="#/games">全部游戏 ${icon('arrow')}</a></div><div class="nobi-game-grid">${games().map(card).join('') || empty('没有匹配的游戏','试试其他关键词。','search')}</div>${actions()}<div class="home-bottom"><section class="nobi-panel">${heading('我的排名',window.NobiCompetitive?'积分与战绩':'对局之后，见证成长')}${metrics()}<a class="text-link" href="#/rank">查看排行榜 ${icon('arrow')}</a></section><section class="nobi-panel future-slot">${icon('games')}<div><h3>更多精彩，敬请期待</h3><p>新的游戏，将在这里与你见面。</p></div></section></div>`;
  }
  function catalogue() { return `${heading('选择游戏','选择一项经典，开始一场好游戏。')}<label class="catalogue-search">${icon('search')}<input data-search placeholder="搜索游戏" aria-label="搜索游戏" value="${escape(state.query)}"></label><div class="nobi-game-grid catalogue-grid">${games().map(card).join('') || empty('没有匹配的游戏','当前平台没有可用结果。','search')}</div>${actions()}<section class="nobi-panel future-slot">${icon('games')}<div><h3>更多精彩，敬请期待</h3><p>下一场好游戏，正在路上。</p></div></section>`; }
  function ranking() {
    if(window.NobiCompetitive&&!seasonData){seasonData=[];window.NobiCompetitive.seasons().then(rows=>{seasonData=rows||[];render();}).catch(()=>{});}
    const query={gameId:state.rankGame,page:state.rankPage,seasonId:state.rankSeason||null,scope:['season','friends'].includes(state.rankTab)?state.rankTab:'global',period:state.period,userId:state.user?.id || null};
    const key=JSON.stringify(query);
    if(key!==rankingKey && window.NobiRankings) {
      rankingKey=key; const revision=++rankingRevision; rankingData={status:'loading',rows:[],myRank:null};
      window.NobiRankings.load(query).then(data=>{ if(revision===rankingRevision) { rankingData=data; if(state.route==='rank') render(); } }).catch(()=>{ if(revision===rankingRevision) { rankingData={status:'error',rows:[],myRank:null}; if(state.route==='rank') render(); } });
    }
    const {status,rows,myRank}=rankingData;
    const label=rankingData.environment==='isolated-test'?'隔离测试积分 · 非生产':{unavailable:'未接入真实积分',loading:'正在加载',error:'排名加载失败',demo:'演示数据 · 非线上真实积分',ready:'排行榜数据'}[status];
    const podium=rows.length>=3&&state.rankPage===0?`<div class="rank-podium" role="list" aria-label="前三名">${[1,0,2].map(i=>{const row=rows[i];return `<div class="podium-slot place-${i+1}" role="listitem" aria-label="第 ${row.rank} 名，${escape(row.nickname)}，${row.score} 分">${i===0?'<span class="podium-crown" aria-hidden="true"></span>':''}${rankingAvatar(row)}<b>${escape(row.nickname)}</b><strong>${row.score}</strong><em>${row.rank}</em></div>`;}).join('')}</div>`:'';
    const body=rows.length ? `${podium}<ol class="ranking-list${podium?' has-podium':''}">${rows.map(row=>`<li class="${state.user?.id && row.userId===state.user.id?'is-me':''}"><b>${row.rank}</b>${rankingAvatar(row)}<span>${escape(row.nickname)}</span><strong>${row.score}</strong>${row.games!==undefined?`<small>${escape(row.tier)} · ${row.games} 场 · 胜率 ${row.winRate}% · 最近 ${row.recentDelta>=0?'+':''}${row.recentDelta??0}</small>`:''}</li>`).join('')}</ol>` : empty(status==='loading'?'正在加载排名':status==='error'?'暂时无法加载':'赛场即将开启',status==='error'?'请稍后重试；未显示任何未经验证的成绩。':rankingData.environment==='isolated-test'?({ 'friends-not-implemented':'好友关系服务未实现，当前没有可查询的真实好友。','login-required':'登录独立测试账号后查看真实测试成绩。','no-active-season':'当前没有启用的测试赛季。'}[rankingData.emptyReason]||'此条件下暂无已完成的竞技对局。'):'排行榜数据尚未接入。完成可信对局后，成绩将在这里展示。');
    return `${heading('排行榜','看看自己的成长，也为好友喝彩。')}<div class="nobi-tabs" aria-label="排行榜分类">${[['guandan','掼蛋排名'],['go','围棋排名'],['season','赛季排名'],['friends','好友排名']].map(([id,title])=>`<button data-rank="${id}" aria-pressed="${state.rankTab===id}">${title}</button>`).join('')}</div><div class="nobi-tabs secondary" aria-label="排名周期">${[['all','全部'],['week','本周'],['month','本月'],['season','赛季']].map(([id,title])=>`<button data-period="${id}" aria-pressed="${state.period===id}">${title}</button>`).join('')}</div>${window.NobiCompetitive?`<div class="nobi-tabs"><label>游戏 <select data-rank-game><option value="guandan" ${state.rankGame==='guandan'?'selected':''}>掼蛋</option><option value="go" ${state.rankGame==='go'?'selected':''}>围棋</option></select></label><label>历史赛季 <select data-rank-season><option value="">当前赛季</option>${(seasonData||[]).map(x=>`<option value="${escape(x.id)}" ${state.rankSeason===x.id?'selected':''}>${escape(x.name)} · ${escape(x.state)}</option>`).join('')}</select></label></div>`:''}<section class="nobi-panel rank-panel"><span class="nobi-badge" data-ranking-status="${status}">${label}</span>${body}<div class="my-rank">${avatar()}<div><b>${escape(name())}</b><small>我的排名 · ${myRank?myRank.rank:'暂无数据'}${myRank?.games!==undefined?` · ${escape(myRank.tier)} · ${myRank.games} 场 · 胜率 ${myRank.winRate}%`:''}</small></div><strong>${myRank?myRank.score:'—'}</strong></div>${status==='error'?'<button class="outline-button" data-retry-rank>重试</button>':''}${window.NobiCompetitive?`<div class="nobi-tabs"><button data-rank-page="${state.rankPage-1}" ${state.rankPage===0?'disabled':''}>上一页</button><span>第 ${state.rankPage+1} 页 · ${rankingData.total??0} 人</span><button data-rank-page="${state.rankPage+1}" ${!rankingData.hasNext?'disabled':''}>下一页</button><button data-retry-rank>刷新成绩</button></div>${rankingData.periodMode==='recent-activity'?'<p>本周/本月按最近 7/30 天活跃筛选，积分仍是对应评级。</p>':''}`:''}</section><a class="nobi-row" href="#/history">${icon('history')}历史战绩 ${icon('arrow')}</a>`;
  }
  function loadPersonal(){if(!window.NobiCompetitive||(profileLoading&&profileGame===state.rankGame))return;profileLoading=true;const game=state.rankGame,owner=state.user?.id;profileGame=game;personalData=null;historyData=null;Promise.all([window.NobiCompetitive.personal(state.rankGame),window.NobiCompetitive.history(state.rankGame)]).then(([personal,history])=>{if(game!==state.rankGame||owner!==state.user?.id)return;personalData=personal;historyData=history;render();}).catch(()=>{if(game!==state.rankGame)return;personalData={error:true};historyData={error:true};render();});}
  function historyView(){loadPersonal();if(!window.NobiCompetitive)return `${heading('我的战绩','历史对局与个人成长')}<section class="nobi-panel">${empty('暂无可验证的战绩','服务端战绩与可信结算尚未接入。','history')}</section>`;return `${heading('我的战绩','隔离测试记录 · 非生产')}<section class="nobi-panel"><div class="nobi-tabs"><button data-history-game="guandan">掼蛋</button><button data-history-game="go">围棋</button></div>${historyData?.rows?.length?`<ol class="ranking-list">${historyData.rows.map(row=>`<li><b>${row.kind==='go'?'围棋':'掼蛋'}</b><span>${escape(new Date(row.ended_at).toLocaleString())} · ${row.ranked?'竞技':'不计分'}<small>${row.result.winner===null?'未判胜':row.result.winner===row.seat%2?'获胜':'失利'} · ${escape(row.settlement_status)}</small></span><strong>${row.permanent_delta!==null&&row.permanent_delta!==undefined?(row.permanent_delta>=0?'+':'')+row.permanent_delta:'—'}</strong></li>`).join('')}</ol>`:empty(historyData?.error?'暂时无法加载战绩':'暂无已完成对局','只展示本人参与的服务端记录。')}</section>`;}
  function profile() {
    loadPersonal();const rating=personalData?.ratings?.find(row=>row.season_id==='00000000-0000-4000-8000-000000000001');
    return `${heading('个人中心','每一场好游戏，都值得记住。')}<section class="nobi-panel profile-identity">${player(false)}${metrics()}<p class="nobi-disclaimer">${window.NobiCompetitive?`隔离测试 ${state.rankGame==='go'?'围棋':'掼蛋'} · ${rating?`${rating.rating} 分 · ${escape(rating.tier)} · ${rating.games} 场 · 胜率 ${rating.winRate}%`:!personalData?'正在查询竞技评级':personalData.error?'评级查询暂不可用':'暂无竞技对局，初始评级 1500 · 未定级'}`:'积分、段位及战绩尚未接入；“—”不代表真实成绩。'}</p></section><div class="profile-links">${[['history','我的战绩'],['rank','我的排行榜'],['friends','好友列表'],['notifications','消息通知','bell'],['music','音乐设置'],['settings','游戏设置'],['about','关于 Nobi','games']].map(([id,label,symbol])=>`<a class="nobi-row" href="#/${id}">${icon(symbol||id)}${label}${icon('arrow')}</a>`).join('')}</div>${avatarPicker()}${state.user?'<button class="outline-button" data-signout>退出登录</button>':'<a class="gold-button" href="login.html">登录 / 注册</a>'}`;
  }
  function music() {
    const settings=window.NobiAudio.getSettings();
    const controls=[['music','背景音乐'],['effects','游戏音效'],['prompt','回合提示音']].map(([id,title])=>`<div class="audio-control"><div><label for="${id}-enabled">${icon('music')}${title}</label><input class="nobi-switch" type="checkbox" id="${id}-enabled" data-audio-setting="${id}Enabled" ${settings[id+'Enabled']?'checked':''} aria-label="${title}开关"></div><div><label class="sr-only" for="${id}-volume">${title}音量</label><input id="${id}-volume" type="range" min="0" max="100" value="${Math.round(settings[id+'Volume']*100)}" data-audio-setting="${id}Volume"><output for="${id}-volume">${Math.round(settings[id+'Volume']*100)}%</output></div></div>`).join('');
    const trackPicker=`<label class="lobby-music-choice">掼蛋背景音乐<select data-audio-setting="guandanTrack" aria-label="选择掼蛋背景音乐">${window.NobiAudio.getTracks('guandan').map(track=>`<option value="${track.id}" ${settings.guandanTrack===track.id?'selected':''}>${escape(track.composer)} · ${escape(track.title)}</option>`).join('')}</select></label><p class="nobi-disclaimer">钢琴录音：Paul Pitman / Donald Betts / <a href="https://musopen.org" target="_blank" rel="noopener noreferrer">Musopen</a></p>`;
    const scenes=[['lobby','大厅','山水之间 · 轻松相聚'],['guandan','掼蛋','默契牌局 · 热闹开场'],['go','围棋','静心对弈 · 黑白生趣'],['result','结果','一局落幕 · 期待再会']];
    return `${heading('音乐设置','独立音量 · 设置自动保存')}<section class="nobi-panel audio-settings">${controls}${trackPicker}<button class="outline-button" data-audio-track-preview>试听所选音乐</button><button class="outline-button" data-audio-bomb-preview>试听炸弹音效</button><button class="outline-button" data-audio-preview>试听音效</button></section><section class="nobi-panel music-scenes"><h3>选择音乐场景</h3><div class="nobi-tabs">${scenes.map(([id,title])=>`<button data-audio-scene="${id}" aria-pressed="${state.audioScene===id || (!state.audioScene && id==='lobby')}">${title}</button>`).join('')}</div><div class="scene-preview scene-${state.audioScene || 'lobby'}"><span class="scene-art" aria-hidden="true">${icon({lobby:'music',guandan:'cards',go:'go',result:'rank'}[state.audioScene || 'lobby'])}</span><div><strong>${scenes.find(([id])=>id===(state.audioScene || 'lobby'))[2]}</strong><small>${window.NobiAudioManifest.scenes[state.audioScene || 'lobby']?'舒缓古典钢琴 · 可选三首':'场景音乐 · 等待添加曲目'}</small></div><span class="scene-selected" aria-label="当前场景">✓</span></div><div data-audio-status class="audio-status"></div><p>掼蛋可选择三首舒缓古典钢琴曲；音量与开关偏好会保存在本设备。</p><button class="blue-button" data-audio-unlock>恢复 / 解锁音频</button></section>`;
  }
  function audioControl() {
    const enabled=window.NobiAudio?.getSettings().musicEnabled || false;
    return `<button class="icon-button ${enabled?'audio-enabled':''}" data-toggle-music aria-label="背景音乐开关" aria-pressed="${enabled}" title="背景音乐开关">${icon('music')}</button>`;
  }
  function updateAudioStatus() {
    const toggle=root?.querySelector('[data-toggle-music]');
    if(toggle && window.NobiAudio) { const enabled=window.NobiAudio.getSettings().musicEnabled; toggle.setAttribute('aria-pressed',String(enabled)); toggle.classList.toggle('audio-enabled',enabled); }
    const element=root?.querySelector('[data-audio-status]');
    const status=window.NobiAudio?.getStatus(); if(!element || !status) return;
    element.textContent=!status.available?'此场景暂无授权背景音乐':status.suspended?'音频已暂停':status.blocked?'音频受限或中断，请点击恢复':status.playing?'音乐播放中':'等待首次交互或开启音乐';
  }
  function content() {
    if(state.route==='home') return home(); if(state.route==='games') return catalogue(); if(state.route==='rank') return ranking(); if(state.route==='me') return profile(); if(state.route==='music') return music();
    if(state.route==='friends') return `${heading('好友','与熟悉的人，下一局。')}<section class="nobi-panel">${empty('好友服务尚未接入','目前不展示虚构好友或在线人数。','friends')}<a class="blue-button" href="#/games">选择游戏，创建好友对局</a></section>`;
    if(state.route==='history')return historyView();
    if(state.route==='notifications') return `${heading('通知','你的 Nobi 消息')}<section class="nobi-panel">${empty('暂无可验证的通知','消息服务尚未接入。','bell')}</section>`;
    if(state.route==='about') return `${heading('关于 Nobi','Nobi Games')}<section class="nobi-panel about-card">${brand()}<h3>好游戏 · 好朋友 · 在 Nobi</h3><p>经典掼蛋与围棋，随时开启下一场好游戏。</p><p>排名与战绩以已连接的服务为准；掼蛋已加入舒缓古典背景音乐。</p><a class="gold-button" href="#/games">探索游戏 ${icon('arrow')}</a></section>`;
    return `${heading('游戏设置','管理你的游戏体验')}<section class="nobi-panel"><a class="nobi-row" href="#/music">${icon('music')}音乐与音效 ${icon('arrow')}</a><p>游戏规则及原始牌面保持不变。账号信息请通过现有登录流程管理。</p></section>`;
  }
  let root;
  function render() {
    if(!root) return;
    const focused=document.activeElement;
    const focusKey=root.contains(focused) ? ['id','data-id','data-rank','data-period','data-audio-scene','data-avatar-preset','data-toggle-music'].map(key=>[key,focused.getAttribute(key)]).find(([,value])=>value!==null) : null;
    root.dataset.route=state.route;
    root.innerHTML = `<div class="nobi-shell"><aside class="nobi-sidebar">${brand()}<span class="nav-heading">PLAY / 游戏</span><nav aria-label="PC 主导航">${routeLink('home','游戏大厅')}${window.NobiGames.catalogue.list(window.NobiGames.platform()).map(g=>`<button data-select-game="${escape(g.gameId)}">${icon(g.icon)}<span>${escape(g.name)}</span></button>`).join('')}<span class="nav-divider"></span>${routeLink('rank','排行榜')}${routeLink('friends','好友')}${routeLink('history','我的战绩')}${routeLink('settings','设置')}</nav><div class="sidebar-foot"><p>好游戏 · 好朋友</p><small>NOBI GAMES / V3.0</small></div></aside><div class="nobi-center"><header class="nobi-topbar"><div class="mobile-brand">${mobileHeader()}</div><label class="desktop-search">${icon('search')}<input data-search aria-label="大厅游戏搜索" placeholder="寻找你的下一场游戏" value="${escape(state.query)}"></label><div class="topbar-actions">${audioControl()}<a href="#/notifications" class="icon-button" aria-label="通知">${icon('bell')}</a><a href="#/me" class="header-avatar" aria-label="个人中心">${avatar()}</a></div></header><main class="nobi-main" id="nobi-main" tabindex="-1">${content()}</main><footer class="nobi-footer">Nobi Games <span>${window.NobiCompetitive?'隔离竞技测试 · 非生产':'本地预览 · 在线服务未验证'}</span></footer></div><aside class="nobi-right">${player(false)}<section class="nobi-panel tier-placeholder"><span class="eyebrow">YOUR JOURNEY</span><h3>下一局，新的成长</h3><span class="nobi-badge">${window.NobiCompetitive?escape(rankingData.myRank?.tier||'暂无竞技段位'):'段位服务未接入'}</span></section><section class="nobi-panel">${heading('我的排名',window.NobiCompetitive?'隔离测试积分':'暂无可信积分')}${metrics()}<a class="text-link" href="#/rank">查看我的排名 ${icon('arrow')}</a></section><section class="nobi-panel">${heading('排行榜预览',window.NobiCompetitive?'隔离测试排名':'真实排名尚未接入')}<div class="rank-lines" aria-hidden="true"><i></i><i></i><i></i></div><a class="text-link" href="#/rank">全部排行榜 ${icon('arrow')}</a></section><a class="nobi-row" href="#/friends">${icon('friends')}在线好友入口 ${icon('arrow')}</a><button id="app-global-signout-trigger" class="outline-button">${state.user?'退出登录':'返回登录'}</button></aside><nav class="nobi-bottom-nav" aria-label="手机主导航">${[['home','首页'],['games','游戏'],['rank','排行'],['friends','好友'],['me','我的']].map(([id,label])=>routeLink(id,label)).join('')}</nav><p class="nobi-status" role="status" aria-live="polite">${escape(state.notice)}</p></div>`;
    document.getElementById('app-global-signout-trigger').onclick = window.NobiSignOut;
    updateAudioStatus();
    if(focusKey) { const [key,value]=focusKey; root.querySelector(`[${key}="${value}"]`)?.focus({preventScroll:true}); }
  }
  function notify(message) { state.notice=message; const el=root?.querySelector('.nobi-status'); if(el) { el.textContent=message; el.classList.add('shown'); clearTimeout(el._timer); el._timer=setTimeout(()=>el.classList.remove('shown'),3500); } }
  function route() {
    state.notice='';
    const [requested, id] = location.hash.replace(/^#\/?/,'').split('/');
    const valid=['home','games','rank','friends','me','music','settings','history','notifications','about'];
    state.route=valid.includes(requested)?requested:'home';
    if(id) { const game=window.NobiGames.catalogue.get(id,window.NobiGames.platform()); if(game) { state.selected=game.gameId; window.selectedGameId=game.gameId; } else { state.route='home'; state.notice='当前平台不提供此游戏'; } }
    // Never resolve a PC-only deep link or an arbitrary game id on mobile.
    if(!valid.includes(requested) && requested) state.notice='入口不可用，已返回大厅';
    if(state.route==='home' && window.NobiGames.platform()==='mobile') state.query='';
    render(); if(state.notice) notify(state.notice);
    window.scrollTo?.({top:0,behavior:'instant'});
    window.NobiAudio?.setScene(state.route==='music'?(state.audioScene || 'lobby'):'lobby');
  }
  function mount(element) {
    root=element;
    if(!root.dataset.nobiBound) {
      root.dataset.nobiBound='1';
      root.addEventListener('click', e=>{
        const selection=e.target.closest('[data-id], [data-select-game]');
        if(selection) { const id=selection.dataset.id || selection.dataset.selectGame; if(window.NobiGames.catalogue.get(id,window.NobiGames.platform())) { state.selected=id; window.selectedGameId=id; if(selection.dataset.selectGame) { location.hash=`/games/${id}`; } else render(); } }
        const launch=e.target.closest('[data-launch], #perfect-go-solo, #perfect-go-net');
        if(launch) { if(launch.dataset.launch) { state.selected=launch.dataset.launch; window.selectedGameId=state.selected; } if(launch.id==='perfect-go-net'&&state.selected!=='cs16'&&window.NOBI_ONLINE_CONFIG){location.href='online.html?game='+state.selected;}else window.launchMatchGame(launch.id==='perfect-go-net'?'NET':'SINGLE'); }
        if(e.target.closest('[data-signout]')) window.NobiSignOut();
        const preset=e.target.closest('[data-avatar-preset]');if(preset){window.NobiAvatars.savePreset(Number(preset.dataset.avatarPreset)).then(()=>notify('头像已同步到账号')).catch(error=>notify(error.message));}
        if(e.target.closest('[data-avatar-reset]')){window.NobiAvatars.saveReset().then(()=>notify('已恢复默认头像')).catch(error=>notify(error.message));}
        if(e.target.closest('[data-toggle-music]')) { const enabled=window.NobiAudio.getSettings().musicEnabled; window.NobiAudio.setSettings({musicEnabled:!enabled}); render(); notify(!window.NobiAudio.getStatus().available?'偏好已保存；暂无授权背景音乐':!enabled?'背景音乐已开启':'背景音乐已关闭'); }
        if(e.target.closest('[data-audio-preview]')) window.NobiAudio.playEffect('click');
        if(e.target.closest('[data-audio-bomb-preview]')) window.NobiAudio.playEffect('bomb');
        if(e.target.closest('[data-audio-track-preview]')) {state.audioScene='guandan';window.NobiAudio.setScene('guandan');window.NobiAudio.unlock();render();}
        if(e.target.closest('[data-audio-unlock]')) { if(!document.hidden) window.NobiAudio.resume(); window.NobiAudio.unlock().then(updateAudioStatus); }
        const scene=e.target.closest('[data-audio-scene]'); if(scene) { state.audioScene=scene.dataset.audioScene; window.NobiAudio.setScene(state.audioScene); render(); }
        if(e.target.closest('[data-retry-rank]')) { rankingKey=''; render(); }
        const page=e.target.closest('[data-rank-page]');if(page){state.rankPage=Number(page.dataset.rankPage);render();}
        const historyGame=e.target.closest('[data-history-game]');if(historyGame){state.rankGame=historyGame.dataset.historyGame;profileLoading=false;personalData=null;historyData=null;render();}
        const tab=e.target.closest('[data-rank], [data-period]'); if(tab) { state.rankPage=0;if(tab.dataset.rank){state.rankTab=tab.dataset.rank;if(['go','guandan'].includes(state.rankTab))state.rankGame=state.rankTab;}else state.period=tab.dataset.period; render(); }
      });
      root.addEventListener('change',e=>{if(e.target.matches('[data-avatar-upload]')&&e.target.files?.[0]){window.NobiAvatars.upload(e.target.files[0]).then(()=>notify('头像已上传')).catch(error=>notify(error.message));e.target.value='';return;}if(e.target.matches('[data-rank-game], [data-rank-season]')){if(e.target.dataset.rankGame!==undefined)state.rankGame=e.target.value;else state.rankSeason=e.target.value;state.rankPage=0;render();}});
      root.addEventListener('input', e=>{
        if(e.target.matches('[data-audio-setting]')) { const key=e.target.dataset.audioSetting; const value=e.target.tagName==='SELECT'?e.target.value:e.target.type==='checkbox'?e.target.checked:Number(e.target.value)/100; window.NobiAudio.setSettings({[key]:value}); const output=e.target.parentElement.querySelector('output'); if(output && typeof value==='number') output.textContent=Math.round(value*100)+'%'; updateAudioStatus(); }
        if(e.target.matches('[data-search]')) { const position=e.target.selectionStart; const label=e.target.getAttribute('aria-label'); state.query=e.target.value; render(); const input=root.querySelector(`[aria-label="${label}"]`); if(input) { input.focus(); input.setSelectionRange(position,position); } }
      });
      window.addEventListener('hashchange',route);
      window.NobiAudio?.subscribe(updateAudioStatus);
      window.NobiAvatars?.subscribe(()=>render());
    }
    route();
  }
  function setUser(user) {state.user=user;window.NobiAvatars?.setAccount(user);rankingKey='';rankingRevision++;rankingData={status:'unavailable',rows:[],myRank:null};profileLoading=false;personalData=null;historyData=null;render();}
  window.NobiLobby=Object.freeze({mount,render,notify,setUser,escape,icon,getState:()=>({...state})});
})();
