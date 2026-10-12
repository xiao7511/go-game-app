import {dealCards,type Card} from './guandan-cards.ts';
import {GuandanEngine as SharedEngine} from '../ui/guandan-engine.mjs';
import {initialSeries} from '../ui/guandan-rules.mjs';
export class GuandanEngine extends SharedEngine {
 constructor(hands:Card[][]=dealCards(),series:any=initialSeries(),config:any={}){super(hands,series,config);}
}
