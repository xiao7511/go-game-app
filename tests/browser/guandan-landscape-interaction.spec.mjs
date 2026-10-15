import {test,expect} from '../../tooling/node_modules/@playwright/test/index.mjs';
import {accessibleHand} from './guandan-layout-helpers.mjs';
import {dealHuaianTurn} from './guandan-fixture.mjs';

test('narrow landscape browsing retains selected physical cards and fixed confirmation',async({browser})=>{
  const context=await browser.newContext({viewport:{width:667,height:375},hasTouch:true});
  const page=await context.newPage();await page.goto('http://127.0.0.1:4174/game.html');
  await page.locator('[data-launch="guandan"]').click();
  await dealHuaianTurn(page);
  await accessibleHand(page);
  const first=page.locator('[data-gd-hand] .gd-card').first(),last=page.locator('[data-gd-hand] .gd-card').last();
  const firstId=await first.getAttribute('data-card-id'),lastId=await last.getAttribute('data-card-id');
  await first.tap({position:{x:4,y:28}});
  await page.locator('[data-gd-hand-next]').click();await expect(page.locator('[data-gd-hand-next]')).toBeDisabled();
  await last.tap({position:{x:35,y:28}});
  expect(await page.evaluate(()=>[...window.GD.state.selected].sort())).toEqual([firstId,lastId].sort());
  await expect(page.locator('[data-gd-play]')).toBeInViewport();
  expect(await page.evaluate(()=>window.GD.state.players[0].hand.length)).toBe(27);
  // Repainting/sorting and crossing the browsing breakpoint preserve the physical selection.
  await page.locator('[data-gd-sort]').click();
  expect(await page.evaluate(()=>[...window.GD.state.selected].sort())).toEqual([firstId,lastId].sort());
  await page.setViewportSize({width:852,height:393});await expect(page.locator('[data-gd-hand-navigation]')).toBeHidden();
  await accessibleHand(page);
  await page.locator('[data-gd-clear]').click();expect(await page.evaluate(()=>window.GD.state.selected.size)).toBe(0);
  await context.close();
});

for(const viewport of [{width:852,height:393},{width:667,height:375},{width:568,height:320}])test('ten-card renderer fixture keeps play content clear of seats at '+viewport.width,async({browser})=>{
  const context=await browser.newContext({viewport,hasTouch:true}),page=await context.newPage();
  await page.goto('http://127.0.0.1:4174/game.html');await page.locator('[data-launch="guandan"]').click();
  await expect(page.locator('[data-gd-hand] .gd-card')).toHaveCount(27);
  // Layout fixture only, not a claimed competitive play: use real physical cards/PNG renderer.
  await page.evaluate(()=>{
    const hands=window.GD.createNetworkDeal(),cards=hands[1].slice(0,10);
    window.GD.applyAuthoritySnapshot({rulesVersion:'guandan-standard-v1',competitive:false,version:1,status:'playing',currentTurn:0,
      players:Array.from({length:4},(_,i)=>({nickname:['南家测试玩家','东家测试玩家','北家测试玩家','西家测试玩家'][i]})),
      privateState:{seat:0,hand:hands[0]},publicState:{level:'2',handCounts:[27,17,27,27],finishOrder:[],phase:'play',
        lastPlayedTrick:{seat:1,kind:'bomb',type:'炸弹',cards,weight:3},series:{teamLevels:['2','2'],activeTeam:0,round:1}}},()=>{},true);
  });
  await expect(page.locator('[data-gd-trick] .gd-card')).toHaveCount(10);
  const g=await page.evaluate(()=>{
    const boxes=s=>[...document.querySelectorAll(s)].map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};});
    return {cards:boxes('[data-gd-trick] .gd-card'),seats:boxes('.gd-player-info'),controls:boxes('.gd-action-bar button'),center:boxes('.gd-center-table')[0],
      textFits:[...document.querySelectorAll('.gd-player-name')].every(n=>n.scrollHeight<=n.clientHeight&&n.scrollWidth<=n.clientWidth)};
  });
  const overlap=(a,b)=>a.x<b.right-.5&&a.right>b.x+.5&&a.y<b.bottom-.5&&a.bottom>b.y+.5;
  expect(g.textFits).toBe(true);
  for(const card of g.cards){expect(card.x>=g.center.x-.5&&card.right<=g.center.right+.5&&card.y>=g.center.y-.5&&card.bottom<=g.center.bottom+.5).toBe(true);for(const node of [...g.seats,...g.controls])expect(overlap(card,node)).toBe(false);}
  await context.close();
});
