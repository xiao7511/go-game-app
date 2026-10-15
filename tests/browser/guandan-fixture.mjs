// Deterministic local authority for interaction tests. Production solo play reveals
// a random first leader; tests that click the local hand must explicitly own the turn.
export async function dealHuaianTurn(page,{bomb=false}={}) {
  await page.waitForFunction(()=>window.GD?.state.standardRules&&window.GD.state.authorityPublic?.rulesConfig&&window.GD.state.active);
  return page.evaluate(async bomb=>{
    const [{GuandanEngine},rules]=await Promise.all([import('./ui/guandan-engine.mjs'),import('./ui/guandan-rules.mjs')]);
    const deck=GD.createNetworkDeal().flat();
    const chosen=bomb?deck.filter(c=>c.kind==='normal'&&c.rank==='5').slice(0,4):[];
    const rest=deck.filter(c=>!chosen.includes(c));
    const hands=[[...chosen,...rest.splice(0,27-chosen.length)],...Array.from({length:3},()=>rest.splice(0,27))];
    const engine=new GuandanEngine(hands,{...rules.initialSeries(),firstLeader:0,firstCard:hands[0][0]});
    let version=9000;
    clearInterval(GD.state.timer);GD.state.soloEngine=null;
    const publish=()=>{
      const s=engine.state;
      GD.applyAuthoritySnapshot({roomId:'browser-huaian-fixture',version:version++,rulesVersion:rules.HUAIAN_RULES_VERSION,competitive:false,
        players:Array.from({length:4},(_,seat)=>({seat,userId:'fixture-'+seat,nickname:'玩家 '+seat,avatar:seat===0?NobiAvatars.self('玩家 0'):NobiAvatars.presets[seat+2].src})),
        privateState:{seat:0,hand:s.players[0].hand,tributeOptions:engine.tributeOptions(0)},
        publicState:{level:engine.series.level,handCounts:s.players.map(p=>p.hand.length),finishOrder:engine.order,
          phase:s.phase,trick:s.trick,lastPlayedTrick:s.lastPlayedTrick,series:engine.series,rulesConfig:engine.config,tribute:engine.publicTribute()},
        currentTurn:s.currentTurn,status:s.active?'playing':'ended',deadline:Date.now()+engine.config.turnMs},
        (type,payload)=>{
          const ok=type==='play'?engine.play(0,payload.cardIds,payload.combination):type==='pass'?engine.pass(0):false;
          if(!ok)throw Error('Fixture authority rejected '+type);
          publish();
        },true);
    };
    publish();
    return chosen.map(c=>c.id);
  },bomb);
}
