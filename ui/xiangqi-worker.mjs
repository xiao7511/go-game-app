import {chooseMove} from './xiangqi-engine.mjs';
self.onmessage=event=>{const {ticket,game,depth}=event.data;try{self.postMessage({ticket,move:chooseMove(game,{depth,budgetMs:depth===3?900:400,maxNodes:depth===3?18000:6000})});}catch{self.postMessage({ticket,error:true});}};
