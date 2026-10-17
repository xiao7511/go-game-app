import {test,expect} from '../../tooling/node_modules/vitest/dist/index.js';
import fs from 'node:fs';
import {createGame,play} from '../../ui/xiangqi-engine.mjs';
import {xiangqiMoveEffect} from '../../ui/xiangqi-feedback.mjs';

test('confirmed ordinary moves and captures select distinct effects for either player',()=>{
 const initial=createGame(),red=play(initial,54,45),black=play(red,19,82);
 expect(xiangqiMoveEffect(initial,red)).toBe('xiangqiMove');
 expect(xiangqiMoveEffect(red,black)).toBe('xiangqiCapture');
 expect(xiangqiMoveEffect(initial,play(initial,64,1))).toBe('xiangqiCapture');
});
test('initial mount, duplicate, undo, catch-up and unrelated board changes stay silent',()=>{
 const initial=createGame(),one=play(initial,54,45),two=play(one,27,36);
 for(const [before,after] of [[null,one],[one,one],[two,initial],[initial,two],[{...initial,status:'waiting'},one]])expect(xiangqiMoveEffect(before,after)).toBeNull();
 const changed=structuredClone(one);changed.log[0].captured=-5;expect(xiangqiMoveEffect(initial,changed)).toBeNull();
 changed.log[0].from=-1;expect(xiangqiMoveEffect(initial,changed)).toBeNull();
 expect(xiangqiMoveEffect(one,two)).toBe('xiangqiMove');
 // A legal new move after undo should sound even if that position occurred earlier.
 expect(xiangqiMoveEffect(initial,one)).toBe('xiangqiMove');
});
test('Go-style PCM cues have stronger energy, distinct impacts, headroom and quiet tails',()=>{
 const buffers=['move','capture'].map(kind=>fs.readFileSync(new URL('../../assets/sounds/xiangqi-'+kind+'.wav',import.meta.url)));
 const summaries=buffers.map(buffer=>{
  expect(buffer.toString('ascii',0,4)).toBe('RIFF');expect(buffer.toString('ascii',8,12)).toBe('WAVE');expect(buffer.readUInt16LE(20)).toBe(1);expect(buffer.readUInt16LE(22)).toBe(1);expect(buffer.readUInt16LE(34)).toBe(16);
  const samples=Array.from({length:(buffer.length-44)/2},(_,i)=>buffer.readInt16LE(44+i*2)/32768),peak=Math.max(...samples.map(Math.abs));
  expect(peak).toBeGreaterThan(.9);expect(peak).toBeLessThan(.99);expect(samples[0]).toBe(0);expect(samples.at(-1)).toBe(0);
  const rms=Math.sqrt(samples.reduce((sum,x)=>sum+x*x,0)/samples.length);expect(rms).toBeGreaterThan(.12);
  const frames=[];for(let i=0;i<samples.length;i+=220)frames.push(Math.sqrt(samples.slice(i,i+220).reduce((sum,x)=>sum+x*x,0)/220));
  // Reject the previous second impact at ~120ms (and capture's extra layered hit).
  expect(Math.max(...frames.slice(16))).toBeLessThan(Math.max(...frames.slice(0,8))*.2);
  return {duration:samples.length/buffer.readUInt32LE(24),rms};
 });
 expect(summaries[0].duration).toBeCloseTo(.11,3);expect(summaries[1].duration).toBeCloseTo(.125,3);expect(buffers[0].equals(buffers[1])).toBe(false);
});
