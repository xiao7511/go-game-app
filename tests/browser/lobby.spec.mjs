import { test, expect } from '../../tooling/node_modules/@playwright/test/index.mjs';
import path from 'node:path';
const screenshots=path.resolve(process.env.NOBI_SCREENSHOT_DIR || 'docs/nobi-v2/screenshots/phase-1');

test('PC three-column lobby has keyboard cards, search and expandable catalogue', async ({page}) => {
  await page.setViewportSize({width:1440,height:1000});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4173/game.html');
  await expect(page.locator('.nobi-sidebar')).toBeVisible(); await expect(page.locator('.nobi-right')).toBeVisible();
  await expect(page.locator('.nobi-game-card')).toHaveCount(4);
  const go=page.locator('[data-id="go"]'); await go.focus(); await go.press('Enter');
  await expect(page.locator('[data-id="go"]')).toHaveAttribute('aria-pressed','true');
  await page.getByRole('textbox',{name:'大厅游戏搜索'}).fill('CS');
  await expect(page.locator('[data-id="cs16"]')).toBeVisible(); await expect(page.locator('.nobi-game-card')).toHaveCount(1);
  await page.getByRole('textbox',{name:'大厅游戏搜索'}).fill('');
  await page.locator('[data-id="guandan"]').click();
  await page.evaluate(()=>document.activeElement.blur());
  await page.screenshot({path:path.join(screenshots,'pc-lobby.png'),fullPage:true});
  await page.evaluate(()=>{
    window.NobiGames.catalogue.register({gameId:'future',name:'未来游戏',description:'配置扩展测试',cover:'generic',icon:'games',platforms:['pc','mobile'],modes:['SINGLE'],enabled:true,sortOrder:40,route:'game.html?game=future',musicScene:'lobby'});
    window.NobiLobby.render();
  });
  await expect(page.locator('[data-id="future"]')).toBeVisible();
  await expect(page.locator('[data-id="future"]')).not.toContainText('COUNTER');
  await page.locator('[data-id="future"]').click(); await page.locator('#perfect-go-solo').click();
  await expect(page.getByRole('status').filter({hasText:'游戏引擎尚未就绪'})).toBeVisible();
  expect(await page.evaluate(()=>document.body.classList.contains('in-game-match'))).toBe(false);
  expect(errors).toEqual([]);
});

test('mobile real screens, small viewports and bottom navigation contain no PC entry', async ({browser}) => {
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 14) Mobile'});
  const page=await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4174/game.html');
  for(const [route,label,file] of [['home','首页','mobile-home'],['games','游戏','mobile-games'],['rank','排行','mobile-rank'],['me','我的','mobile-profile']]) {
    await page.locator('.nobi-bottom-nav').getByRole('link',{name:label,exact:true}).click();
    await expect(page.locator('.nobi-bottom-nav [aria-current="page"]')).toHaveAttribute('href',`#/${route}`);
    await expect(page.locator('[data-id="cs16"], [data-select-game="cs16"]')).toHaveCount(0);
    expect(await page.locator('#app-perfect-selector-mask').innerText()).not.toMatch(/CS1\.6/);
    if(route==='rank') await expect(page.locator('[data-ranking-status]')).toHaveAttribute('data-ranking-status','unavailable');
    await page.screenshot({path:path.join(screenshots,file+'.png')});
    for(const width of [320,360,390]) {
      await page.setViewportSize({width,height:844});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    }
    await page.setViewportSize({width:390,height:844});
  }
  await page.locator('.nobi-bottom-nav').getByRole('link',{name:'好友',exact:true}).click();
  await expect(page.getByText('登录后查看对战好友', {exact:true})).toBeVisible();
  expect(errors).toEqual([]); await context.close();
});

test('mobile search and query/hash deep links reject PC-only games',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('http://127.0.0.1:4174/game.html?game=cs16&mode=SINGLE');
  await expect(page.locator('#app-perfect-selector-mask')).toBeVisible();
  expect(await page.evaluate(()=>!!window.NobiPC)).toBe(false);
  expect(await page.evaluate(()=>document.body.classList.contains('in-game-match'))).toBe(false);
  await page.goto('http://127.0.0.1:4174/game.html#/games/cs16');
  await expect(page.locator('[data-id="cs16"]')).toHaveCount(0);
  await page.locator('.nobi-bottom-nav').getByRole('link',{name:'游戏',exact:true}).click();
  await page.getByRole('textbox',{name:'搜索游戏',exact:true}).fill('CS');
  await expect(page.getByText('没有匹配的游戏')).toBeVisible();
  await page.locator('.nobi-bottom-nav').getByRole('link',{name:'首页',exact:true}).click();
  await expect(page.locator('.nobi-game-card')).toHaveCount(3);
  await page.locator('.nobi-bottom-nav').getByRole('link',{name:'游戏',exact:true}).click();
  await page.getByRole('textbox',{name:'搜索游戏',exact:true}).fill('CS');
  await page.evaluate(()=>{location.hash='/games/cs16';});
  await expect(page.locator('.nobi-game-card')).toHaveCount(3);
});

test('ranking filters, profile and legacy game exit keep the shell usable', async({page})=>{
  await page.goto('http://127.0.0.1:4173/game.html#/rank');
  await page.getByRole('button',{name:'围棋排名',exact:true}).click();
  await expect(page.getByRole('button',{name:'围棋排名',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('button',{name:'围棋排名',exact:true})).toBeFocused();
  await page.getByRole('button',{name:'本月',exact:true}).click();
  await expect(page.getByRole('button',{name:'本月',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByText('未接入真实积分')).toBeVisible();
  await page.goto('http://127.0.0.1:4173/game.html');
  await page.locator('[data-launch="guandan"]').click();
  await expect(page.locator('[data-gd-hand] .gd-card')).toHaveCount(27);
  await page.locator('[data-gd-exit]').click();
  await expect(page.locator('#app-perfect-selector-mask')).toBeVisible();
});

test('music settings persist on refresh, expose classical BGM and use real effects',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('http://127.0.0.1:4174/game.html#/music');
  await page.getByRole('checkbox',{name:'背景音乐开关',exact:true}).check();
  await page.locator('#music-volume').fill('23');
  await page.locator('#effects-volume').fill('41');
  await page.locator('#prompt-volume').fill('67');
  await page.getByRole('checkbox',{name:'游戏音效开关',exact:true}).uncheck();
  await page.reload();
  await expect(page.getByRole('checkbox',{name:'背景音乐开关',exact:true})).toBeChecked();
  await expect(page.getByRole('checkbox',{name:'游戏音效开关',exact:true})).not.toBeChecked();
  await expect(page.locator('#music-volume')).toHaveValue('23');await expect(page.locator('#effects-volume')).toHaveValue('41');await expect(page.locator('#prompt-volume')).toHaveValue('67');
  expect(await page.evaluate(()=>NobiAudio.getStatus().available)).toBe(true);
  await expect(page.getByLabel('选择围棋背景音乐').locator('option')).toHaveCount(3);
  await page.getByRole('button',{name:'围棋',exact:true}).click();
  expect(await page.evaluate(()=>window.NobiAudio.getStatus().scene)).toBe('go');
  await page.getByRole('checkbox',{name:'游戏音效开关',exact:true}).check();
  const request=page.waitForRequest(r=>r.url().includes('/assets/sounds/button-25.mp3'));
  await page.getByRole('button',{name:'试听音效',exact:true}).click();await request;
  expect(await page.evaluate(()=>window.NobiAudio.playEffect('click'))).toBe(true);
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:path.join(screenshots,'mobile-music.png')});
  await page.getByRole('button',{name:'背景音乐开关',exact:true}).click();
  await expect(page.getByRole('button',{name:'背景音乐开关',exact:true})).toHaveAttribute('aria-pressed','false');
});

test('ranking abstraction labels demonstration data and recovers from adapter errors',async({page})=>{
  await page.goto('http://127.0.0.1:4173/game.html#/rank');
  await expect(page.locator('[data-ranking-status]')).toHaveAttribute('data-ranking-status','unavailable');
  await page.evaluate(()=>{window.NobiRankings=window.NobiRankingFactory.create(async()=>({status:'demo',rows:[{nickname:'<演示玩家>',rank:1,score:10}],myRank:null}));});
  await page.getByRole('button',{name:'围棋排名',exact:true}).click();
  await expect(page.getByText('演示数据 · 非线上真实积分')).toBeVisible();
  await expect(page.locator('.ranking-list')).toContainText('<演示玩家>');
  await page.evaluate(()=>{window.NobiRankings=window.NobiRankingFactory.create(async()=>{throw Error('fixture failure');});});
  await page.getByRole('button',{name:'本周',exact:true}).click();
  await expect(page.getByText('排名加载失败',{exact:true})).toBeVisible();
  await page.evaluate(()=>{window.NobiRankings=window.NobiRankingFactory.create();});
  await page.getByRole('button',{name:'重试',exact:true}).click();
  await expect(page.locator('[data-ranking-status]')).toHaveAttribute('data-ranking-status','unavailable');
});
