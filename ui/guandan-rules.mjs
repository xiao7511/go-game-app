// guandan-standard-v1: project profile, not an official certification.
export const RULES_VERSION='guandan-standard-v1';
export const HUAIAN_RULES_VERSION='guandan-huaian-2025-v1';
export const isVersionedRules=version=>[RULES_VERSION,HUAIAN_RULES_VERSION].includes(version);
export const RANKS=Object.freeze(['2','3','4','5','6','7','8','9','10','J','Q','K','A']);
export const LEGACY_RULES=Object.freeze({version:RULES_VERSION,steelTriples:2,aceLow:true,maxBomb:10,returnMax:10,returnExcludesLevel:true,returnFallback:'lowest',doubleAnti:'team-two-big-jokers',tributeTie:'clockwise',acePassPartnerMaxPlace:3,aceFailureLimit:3,aceFailureReset:'2',turnMs:120000,firstLeader:'secure-random',settlement:'per-hand',ambiguous:'lowest-winning'});
// Full-series play under DB3208/T 235—2025, effective 2025-05-02.
export const DEFAULT_RULES=Object.freeze({...LEGACY_RULES,version:HUAIAN_RULES_VERSION,aceFailureLimit:0,aceFailureReset:'A',firstLeader:'revealed-card',ambiguous:'highest-valid'});
export function ruleConfig(input={}) {
 const legacy=input.version===RULES_VERSION,base=legacy?LEGACY_RULES:DEFAULT_RULES,config={...base,...input};
 if(!isVersionedRules(config.version)||config.steelTriples!==2||config.maxBomb!==10||config.firstLeader!==base.firstLeader||config.settlement!=='per-hand'||config.ambiguous!==base.ambiguous)throw Error('unsupported rules profile');
 if(typeof config.aceLow!=='boolean'||typeof config.returnExcludesLevel!=='boolean'||!(legacy?[2,3]:[0]).includes(config.aceFailureLimit)||!(legacy?['team-two-big-jokers','single-holder-two']:['team-two-big-jokers']).includes(config.doubleAnti)||config.tributeTie!=='clockwise'||config.returnMax!==10||config.returnFallback!=='lowest'||config.aceFailureReset!==base.aceFailureReset||config.acePassPartnerMaxPlace!==3||config.turnMs!==120000||(!legacy&&(!config.aceLow||!config.returnExcludesLevel)))throw Error('unsupported rules configuration');
 return Object.freeze(config);
}
export const isWild=(c,level)=>c.kind==='normal'&&c.suit==='H'&&c.rank===level;
export function cardWeight(c,level='2'){return c.kind==='joker'?c.value:c.rank===level?15:RANKS.indexOf(c.rank)+2;}

const TYPES={single:'单张',pair:'对子',triple:'三张',fullHouse:'三带两',straight:'顺子',threePairs:'三连对',steel:'钢板',bomb:'炸弹',straightFlush:'同花顺',kingBomb:'天王炸'};
export function combinations(cards,level='2',config=DEFAULT_RULES){
 if(!RANKS.includes(level)||!Array.isArray(cards)||cards.length<1||cards.length>config.maxBomb||new Set(cards.map(c=>c?.id)).size!==cards.length||cards.some(c=>!c||!((c.kind==='normal'&&RANKS.includes(c.rank)&&['S','H','C','D'].includes(c.suit))||(c.kind==='joker'&&[16,17].includes(c.value)))))return [];
 const n=cards.length,out=[],wild=cards.filter(c=>isWild(c,level)),fixed=cards.filter(c=>!isWild(c,level));
 const key=c=>c.kind==='joker'?String(c.value):c.rank;
 const match=targets=>{let deficits=0;const counts=new Map();for(const c of fixed)counts.set(key(c),(counts.get(key(c))??0)+1);for(const [r,count] of counts)if(!targets.has(r)||count>targets.get(r))return false;for(const [r,count] of targets){const missing=count-(counts.get(r)??0);if(missing&&['16','17'].includes(r))return false;deficits+=missing;}return deficits===wild.length;};
 const add=(kind,weight)=>out.push({kind,type:TYPES[kind],weight,size:n});
 const rankWeight=r=>r==='16'?16:r==='17'?17:r===level?15:RANKS.indexOf(r)+2;
 if(!fixed.length&&n===2)return [{kind:'pair',type:TYPES.pair,weight:15,size:2}];
 if(n===1)return [{kind:'single',type:TYPES.single,weight:cardWeight(cards[0],level),size:1}];
 if(n===4&&cards.every(c=>c.kind==='joker')&&cards.filter(c=>c.value===16).length===2){add('kingBomb',100);return out;}
 for(const r of [...RANKS,'16','17']){
  if(n===2&&match(new Map([[r,2]])))add('pair',rankWeight(r));
  if(n===3&&match(new Map([[r,3]])))add('triple',rankWeight(r));
  if(n>=4&&n<=config.maxBomb&&RANKS.includes(r)&&match(new Map([[r,n]])))add('bomb',rankWeight(r));
 }
 if(n===5)for(const r of RANKS)for(const p of [...RANKS,'16','17'])if(r!==p&&match(new Map([[r,3],[p,2]])))add('fullHouse',rankWeight(r));
 const seq=(groups,multiplicity,kind)=>{
  const orders=[RANKS,...(config.aceLow?[['A',...RANKS.slice(0,-1)]]:[])];
  for(const ranks of orders)for(let start=0;start<=ranks.length-groups;start++){
   const section=ranks.slice(start,start+groups);if(!match(new Map(section.map(r=>[r,multiplicity]))))continue;
   // Natural sequence ranks never promote the level card.
   const weight=ranks[0]==='A'?start+groups:RANKS.indexOf(section.at(-1))+2;
   add(kind,weight);
   if(kind==='straight')for(const suit of ['S','H','C','D'])if(fixed.every(c=>c.kind==='normal'&&c.suit===suit))add('straightFlush',weight);
  }
 };
 if(n===5)seq(5,1,'straight');if(n===6)seq(3,2,'threePairs');if(n===config.steelTriples*3)seq(config.steelTriples,3,'steel');
 return out.filter((c,i,a)=>a.findIndex(x=>x.kind===c.kind&&x.weight===c.weight)===i).sort((a,b)=>power(a)-power(b)||a.weight-b.weight);
}
export function power(c){return c.kind==='kingBomb'?1000:c.kind==='bomb'?(c.size>=6?100+c.size:10+c.size):c.kind==='straightFlush'?20:0;}
export function beats(next,previous){if(!next)return false;if(!previous)return true;const a=power(next),b=power(previous);return a!==b?a>b:next.kind===previous.kind&&next.size===previous.size&&next.weight>previous.weight;}
export function classify(cards,level='2',config=DEFAULT_RULES,previous=null,declaration=null){
 const all=combinations(cards,level,config);
 let choices=all.filter(c=>beats(c,previous)&&!(c.kind==='straight'&&all.some(x=>x.kind==='straightFlush'&&x.weight===c.weight)));
 if(config.version===HUAIAN_RULES_VERSION){choices.sort((a,b)=>power(b)-power(a)||(!previous?(b.kind==='steel')-(a.kind==='steel'):0)||b.weight-a.weight);if(choices.length)choices=[choices[0]];}
 // A declared interpretation is a claim, never authority.
 if(declaration){if(typeof declaration!=='object'||Array.isArray(declaration)||typeof declaration.kind!=='string'||!Number.isFinite(declaration.weight))return null;choices=choices.filter(c=>c.kind===declaration.kind&&c.weight===declaration.weight);}
 return choices[0]??null;
}
export function upgradeSeries(series,order,config=DEFAULT_RULES){
 if(!Array.isArray(order)||order.length!==4||new Set(order).size!==4||order.some(s=>!Number.isInteger(s)||s<0||s>3))throw Error('invalid finish order');
 const next=structuredClone(series),winner=order[0]%2,partner=(order[0]+2)%4,place=order.indexOf(partner)+1,upgrade=place===2?3:place===3?2:1;
 const level=series.teamLevels[winner];let champion=null;
 if(series.level==='A'){
  const activeTeam=series.activeTeam;
  if(winner===activeTeam&&place<=config.acePassPartnerMaxPlace){champion=winner;next.champion=winner;}else if(config.version===RULES_VERSION){next.aceFailures[activeTeam]++;if(next.aceFailures[activeTeam]>=config.aceFailureLimit){next.teamLevels[activeTeam]=config.aceFailureReset;next.aceFailures[activeTeam]=0;}}
 }
 if(champion===null&&level!=='A')next.teamLevels[winner]=RANKS[Math.min(12,RANKS.indexOf(level)+upgrade)];
 next.activeTeam=winner;next.level=next.teamLevels[winner];next.previousOrder=order.slice();next.round=series.round+1;
 return {winner,finishOrder:order.slice(),placements:order.map((seat,i)=>({seat,place:i+1,team:seat%2})),upgrade,level:series.level,nextLevel:next.level,nextSeries:next,champion,rules:config.version};
}
export const initialSeries=()=>({firstLeader:0,round:1,teamLevels:['2','2'],level:'2',activeTeam:0,aceFailures:[0,0],previousOrder:null,champion:null});
