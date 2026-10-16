import {createGame,play,positionKey,XIANGQI_RULES} from '../ui/xiangqi-engine.mjs';
export {XIANGQI_RULES};
export const XIANGQI_TURN_MS=180000;
export class XiangqiEngine {
 game:any=createGame();
 move(from:number,to:number){this.game=play(this.game,from,to);return this.game;}
 publicState(){const {board,turn,ply,quiet,log}=this.game;return {board,turn,ply,quiet,log,positionKey:positionKey(this.game),rulesVersion:XIANGQI_RULES};}
}
