import {randomInt,randomUUID} from 'node:crypto';
import {RANKS} from '../ui/guandan-rules.mjs';
export type Card={id:string,deck:number,kind:'normal'|'joker',suit:string,rank:string,value:number,label?:string};
export function createDeck():Card[]{
 const cards:Card[]=[];
 for(let deck=0;deck<2;deck++){
  for(const suit of ['S','H','C','D'])for(const rank of RANKS)cards.push({id:randomUUID(),deck,kind:'normal',suit,rank,value:RANKS.indexOf(rank)+2});
  for(const value of [16,17])cards.push({id:randomUUID(),deck,kind:'joker',suit:'J',rank:value===16?'BJ':'RJ',value,label:value===16?'小王':'大王'});
 }
 return cards;
}
export function dealCards():Card[][]{const deck=createDeck();for(let i=deck.length-1;i>0;i--){const j=randomInt(i+1);[deck[i],deck[j]]=[deck[j],deck[i]];}return [0,1,2,3].map(seat=>deck.filter((_,i)=>i%4===seat));}
export function validateDeal(hands:any):asserts hands is Card[][]{
 if(!Array.isArray(hands)||hands.length!==4||hands.some(h=>!Array.isArray(h)||h.length!==27))throw Error('four 27-card hands required');
 const all=hands.flat(),ids=new Set<string>(),faces=new Map<string,number>();
 for(const c of all){
  if(!c||typeof c.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(c.id)||ids.has(c.id)||![0,1].includes(c.deck))throw Error('invalid physical card');ids.add(c.id);
  if(c.kind==='normal'&&RANKS.includes(c.rank)&&['S','H','C','D'].includes(c.suit)&&c.value===RANKS.indexOf(c.rank)+2){}else if(c.kind==='joker'&&c.suit==='J'&&((c.value===16&&c.rank==='BJ'&&c.label==='小王')||(c.value===17&&c.rank==='RJ'&&c.label==='大王'))){}else throw Error('invalid card face');
  const face=c.deck+':'+c.suit+':'+c.rank;faces.set(face,(faces.get(face)??0)+1);
 }
 if(ids.size!==108||faces.size!==108||[...faces.values()].some(n=>n!==1))throw Error('incomplete double deck');
}
