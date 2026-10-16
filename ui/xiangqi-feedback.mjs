// Sound only a single confirmed move. Mounts, repeated snapshots, undo and
// reconnect catch-up establish a silent baseline instead of replaying history.
export function xiangqiMoveEffect(before,after) {
 if(!before||before.status!=='playing'||!after||after.ply!==before.ply+1||after.log?.length!==after.ply)return null;
 const move=after.log.at(-1);
 if(!move||![move.from,move.to].every(i=>Number.isInteger(i)&&i>=0&&i<90)||move.from===move.to)return null;
 if(move.side!==before.turn||!move.piece||before.board?.[move.from]!==move.piece||before.board?.[move.to]!==move.captured)return null;
 if(after.board?.[move.from]!==0||after.board?.[move.to]!==move.piece)return null;
 return move.captured?'xiangqiCapture':'xiangqiMove';
}
