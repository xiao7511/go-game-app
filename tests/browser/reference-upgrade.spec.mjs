import { test, expect } from '../../tooling/node_modules/@playwright/test/index.mjs';
import path from 'node:path';
const shots=path.resolve(process.env.NOBI_SCREENSHOT_DIR || 'docs/nobi-v2/screenshots/reference-upgrade');

test('mobile subpages return to profile and scene controls retain keyboard focus', async ({ browser }) => {
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
  const page=await context.newPage();
  await page.goto('http://127.0.0.1:4174/game.html#/me');
  await page.locator('.profile-links').getByRole('link',{name:'音乐设置'}).click();
  await expect(page.getByRole('heading',{name:'音乐设置',exact:true})).toBeVisible();
  await expect(page.locator('.nobi-bottom-nav [aria-current]')).toHaveAttribute('href','#/me');
  await page.getByRole('button',{name:'围棋',exact:true}).focus();
  await page.getByRole('button',{name:'围棋',exact:true}).press('Enter');
  await expect(page.getByRole('button',{name:'围棋',exact:true})).toBeFocused();
  await expect(page.locator('.scene-preview')).toContainText('静心对弈');
  await page.screenshot({path:path.join(shots,'mobile-music-go-scene.png')});
  await page.getByRole('link',{name:'返回个人中心',exact:true}).click();
  await expect(page.locator('.profile-links')).toBeVisible();
  const identity=await page.locator('.profile-identity').boundingBox();
  const links=await page.locator('.profile-links').boundingBox();
  const picker=await page.locator('.avatar-picker').boundingBox();
  expect(identity.y+identity.height<=links.y && links.y+links.height<=picker.y).toBe(true);
  await page.locator('[data-avatar-preset="0"]').click();
  await expect(page.locator('[data-avatar-preset="0"]')).toHaveAttribute('aria-pressed','false');
  await expect(page.locator('.nobi-status')).toHaveText('请先登录后更换头像');
  await page.reload();
  await expect(page.locator('[data-avatar-preset="0"]')).toHaveAttribute('aria-pressed','false');
  await context.close();
});

test('ranking podium is accessible and long untrusted names stay bounded on a small screen', async ({ page }) => {
  await page.setViewportSize({width:320,height:844});
  await page.goto('http://127.0.0.1:4174/game.html#/rank');
  await expect(page.locator('[data-ranking-status]')).toHaveAttribute('data-ranking-status','unavailable');
  await page.evaluate(()=>{
    window.NobiRankings=window.NobiRankingFactory.create(async()=>({status:'demo',rows:Array.from({length:5},(_,i)=>({rank:i+1,score:2500-i*20,nickname:i===0?'<测试玩家>':'仅用于测试的长昵称'.repeat(6),userId:'fixture-'+i})),myRank:null}));
    window.NobiLobby.setUser({id:'fixture-3',user_metadata:{nickname:'测试本人'}});
  });
  await expect(page.getByRole('list',{name:'前三名'})).toBeVisible();
  await expect(page.getByRole('list',{name:'前三名'}).getByRole('listitem')).toHaveCount(3);
  await expect(page.locator('.podium-slot.place-1')).toContainText('<测试玩家>');
  await expect(page.locator('.ranking-list .is-me')).toContainText('4');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.locator('[data-ranking-status]')).toHaveText('演示数据 · 非线上真实积分');
  await page.screenshot({path:path.join(shots,'mobile-ranking-demo-fixture.png')});
});

test('landscape press feedback preserves the full 44px Guandan touch target', async ({ browser }) => {
  const context=await browser.newContext({viewport:{width:852,height:393},hasTouch:true});
  const page=await context.newPage();
  await page.goto('http://127.0.0.1:4174/game.html');
  await page.locator('[data-launch="guandan"]').click();
  const hint=page.locator('[data-gd-hint]');
  await expect(hint).toBeEnabled();
  const before=await hint.boundingBox();
  await page.mouse.move(before.x+before.width/2,before.y+before.height/2);
  await page.mouse.down();
  try {
    // Observe the rendered press state rather than sampling before the next paint.
    await page.evaluate(async()=>{await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});
    const pressed=await hint.boundingBox();
    // Allow only compositor float rounding, not a physically smaller touch target.
    expect(pressed.width).toBeGreaterThanOrEqual(43.999);
    expect(pressed.height).toBeGreaterThanOrEqual(43.999);
  } finally { await page.mouse.up(); }
  await expect(page.locator('[data-gd-play]')).toBeEnabled();
  await context.close();
});
