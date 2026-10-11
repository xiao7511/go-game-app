(() => {
  'use strict';
  const unavailable=async()=>({status:'unavailable',rows:[],myRank:null});
  function create(provider=unavailable) {
    if(typeof provider!=='function') throw new Error('Ranking provider must be a function');
    function row(value) {
      if(!value || typeof value.nickname!=='string' || !Number.isInteger(value.rank) || value.rank<1 || !Number.isFinite(value.score)) throw new Error('Invalid ranking row');
      for(const key of ['games','wins','losses','draws'])if(value[key]!==undefined&&(!Number.isSafeInteger(value[key])||value[key]<0))throw new Error('Invalid ranking statistics');
      if(value.winRate!==undefined&&(!Number.isFinite(value.winRate)||value.winRate<0||value.winRate>100))throw new Error('Invalid win rate');
      if(value.recentDelta!==undefined&&!Number.isSafeInteger(value.recentDelta))throw new Error('Invalid rating delta');
      if(value.tier!==undefined&&(typeof value.tier!=='string'||value.tier.length>40))throw new Error('Invalid tier');
      return Object.freeze({nickname:value.nickname.slice(0,80),rank:value.rank,score:value.score,...Object.fromEntries(['userId','tier','games','wins','losses','draws','winRate','recentDelta'].filter(key=>value[key]!==undefined).map(key=>[key,value[key]]))});
    }
    async function load(query) {
      if(!['guandan','go'].includes(query.gameId) || !['global','season','friends'].includes(query.scope) || !['all','week','month','season'].includes(query.period)) throw new Error('Invalid ranking query');
      const result=await provider(Object.freeze({...query}));
      if(!result || !['unavailable','demo','ready'].includes(result.status) || !Array.isArray(result.rows)) throw new Error('Invalid ranking response');
      if(result.status==='unavailable' && (result.rows.length || result.myRank)) throw new Error('Unavailable rankings cannot carry scores');
      return Object.freeze({status:result.status,rows:Object.freeze(result.rows.map(row)),myRank:result.myRank?row(result.myRank):null,...Object.fromEntries(['environment','page','limit','total','hasNext','seasonId','emptyReason','periodMode'].filter(key=>result[key]!==undefined).map(key=>[key,result[key]]))});
    }
    return Object.freeze({load});
  }
  window.NobiRankingFactory=Object.freeze({create});
  // Future Supabase adapter plugs into create(provider); no SQL, unverified RPC or score writes here.
  window.NobiRankings=create();
  const local=window.NOBI_ONLINE_CONFIG;
  if(local?.url==='http://127.0.0.1:55430'&&local.supabaseUrl==='http://127.0.0.1:55421') {
    async function request(path){const client=await window.NobiServices.requireClient(),{data}=await client.auth.getSession();if(!data.session)return null;const response=await fetch(local.url+path,{headers:{Authorization:'Bearer '+data.session.access_token},signal:AbortSignal.timeout(15000),cache:'no-store',redirect:'error'});if(!response.ok)throw new Error('竞技服务查询失败');return response.json();}
    window.NobiCompetitive=Object.freeze({history:game=>request('/me/history?game='+game),personal:game=>request('/me/ratings?game='+game),seasons:()=>request('/seasons')});
    window.NobiRankings=create(async query=>{const params=new URLSearchParams({game:query.gameId,scope:query.scope,period:query.period,page:String(query.page??0),limit:'20'});if(query.seasonId)params.set('seasonId',query.seasonId);return await request('/leaderboards?'+params)??{status:'ready',environment:'isolated-test',rows:[],myRank:null,emptyReason:'login-required'};});
  }
})();
