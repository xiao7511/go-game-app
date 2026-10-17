import {test,expect} from '../../tooling/node_modules/@playwright/test/index.mjs';
import {verifyDevServer} from '../../scripts/verify-dev-server.mjs';
import {dealHuaianTurn} from './guandan-fixture.mjs';
const base='http://127.0.0.1:5178';
test.beforeAll(async()=>{await verifyDevServer();});

async function launch(page){
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin!==base)return route.abort();
    if(url.pathname==='/config.local.js')return route.fulfill({contentType:'application/javascript',body:'window.CONFIG={};'});
    if(url.pathname==='/get-config')return route.fulfill({json:{}});
    return route.continue();
  });
  await page.addInitScript(()=>{
    window.audioPlays=[];
    const play=HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play=function(){window.audioPlays.push(this.src);return play.call(this);};
  });
  await page.goto(base+'/game.html');
  await page.locator('[data-launch="guandan"]').click();
  await expect(page.locator('[data-gd-hand] .gd-card')).toHaveCount(27);
}
async function deal(page,bomb=false){
  return dealHuaianTurn(page,{bomb});
}

test('solo reveals the actual first leader and uses the Huaian turn duration',async({page})=>{
  await launch(page);
  await page.waitForFunction(()=>window.GD?.state.soloEngine);
  const first=await page.evaluate(()=>{
    const {soloEngine:e,soloDeadline}=GD.state;
    return {leader:e.series.firstLeader,holder:e.state.players.findIndex(p=>p.hand.some(c=>c.id===e.series.firstCard.id)),
      turn:e.state.currentTurn,duration:e.config.turnMs,remaining:soloDeadline-Date.now()};
  });
  expect(first.holder).toBe(first.leader);expect(first.turn).toBe(first.leader);
  expect(first.duration).toBe(120000);expect(first.remaining).toBeGreaterThan(118000);
});

for(const [label,width,height]of [['pc',1440,900],['landscape',844,390],['small-landscape',568,320]]){
  test(`5178 ${label}: clock above play, final ten cue once each second, hide after play`,async({page})=>{
    await page.setViewportSize({width,height});await page.clock.install();await launch(page);await deal(page);
    const clock=page.locator('[data-gd-turn-clock]'),play=page.locator('[data-gd-play]');
    await expect(clock).toBeVisible();
    const a=await clock.boundingBox(),b=await play.boundingBox();
    expect(a.y+a.height).toBeLessThanOrEqual(b.y-3);
    expect(Math.abs(a.x+a.width/2-b.x-b.width/2)).toBeLessThan(1);
    expect(a.y).toBeGreaterThanOrEqual(0);
    await page.clock.runFor(109000);
    await expect(clock.locator('b')).toHaveText('11');
    expect(await page.evaluate(()=>audioPlays.filter(s=>s.endsWith('guandan-countdown.wav')).length)).toBe(0);
    await page.clock.runFor(10000);
    await expect(clock.locator('b')).toHaveText('1');
    expect(await page.evaluate(()=>audioPlays.filter(s=>s.endsWith('guandan-countdown.wav')).length)).toBe(10);
    const urgent=await clock.boundingBox(),button=await play.boundingBox();
    expect(Math.abs(urgent.x+urgent.width/2-button.x-button.width/2)).toBeLessThan(1);
    await page.locator('[data-gd-hint]').click();await play.click();
    await expect(clock).toBeHidden();
    await expect(page.locator('.gd-seat-msg[data-kind="think"],.gd-seat-msg[data-kind="play"]')).toHaveCount(0);
    await page.clock.runFor(1000);
    expect(await page.evaluate(()=>audioPlays.filter(s=>s.endsWith('guandan-countdown.wav')).length)).toBe(10);
  });
  test(`5178 ${label}: actual bomb play animates once without blocking controls`,async({page})=>{
    await page.setViewportSize({width,height});await launch(page);const ids=await deal(page,true);
    await page.evaluate(ids=>ids.forEach(id=>document.querySelector(`[data-gd-hand] [data-card-id="${id}"]`).click()),ids);
    await page.locator('[data-gd-play]').click();
    await expect(page.locator('[data-gd-bomb-effect]')).toBeVisible();
    await expect(page.locator('[data-gd-trick] .gd-card')).toHaveCount(4);
    expect(await page.locator('[data-gd-bomb-effect]').evaluate(n=>getComputedStyle(n).pointerEvents)).toBe('none');
    await page.screenshot({path:`test-results/guandan-feedback/${label}-bomb.png`});
    expect(await page.evaluate(()=>audioPlays.filter(s=>s.endsWith('guandan-bomb.wav')).length)).toBe(1);
    await expect(page.locator('[data-gd-bomb-effect]')).toBeHidden();
    await page.locator('[data-gd-sort]').click();
    expect(await page.evaluate(()=>audioPlays.filter(s=>s.endsWith('guandan-bomb.wav')).length)).toBe(1);
  });
}

test('5178: account and multiplayer portraits render, switch accounts without sharing choices',async({page})=>{
  await launch(page);
  await page.evaluate(()=>{
    window.NobiAvatars.setAccount({id:'feedback-self'});window.NobiAvatars.choosePreset(7);
  });
  await deal(page);
  const actual=await page.locator('.gd-player-avatar img').evaluateAll(nodes=>nodes.map(n=>n.src));
  expect(actual).toContain(await page.evaluate(()=>NobiAvatars.presets[7].src));
  for(const i of [3,4,5])expect(actual).toContain(await page.evaluate(i=>NobiAvatars.presets[i].src,i));
  await page.evaluate(()=>{NobiAvatars.setAccount({id:'feedback-second'});NobiAvatars.choosePreset(1);});await deal(page);
  await expect(page.locator('[data-gd-player-zone] img')).toHaveAttribute('src',await page.evaluate(()=>NobiAvatars.presets[1].src));
});

test('5178: local classical music plays, mute stops it and leaving returns to lobby audio',async({page})=>{
  await launch(page);
  await expect.poll(()=>page.evaluate(()=>NobiAudio.getStatus().playing)).toBe(true);
  expect(await page.evaluate(()=>audioPlays.some(s=>s.endsWith('guandan-moonlight.mp3')))).toBe(true);
  await page.locator('[data-match-settings]').filter({visible:true}).click();
  await page.locator('[data-match-audio="musicEnabled"]').uncheck();
  await expect.poll(()=>page.evaluate(()=>NobiAudio.getStatus().playing)).toBe(false);
  await page.locator('[data-match-audio="musicEnabled"]').check();
  await expect.poll(()=>page.evaluate(()=>NobiAudio.getStatus().playing)).toBe(true);
  await page.getByRole('button',{name:'关闭面板'}).click();await page.locator('[data-gd-exit]').click();
  await expect.poll(()=>page.evaluate(()=>NobiAudio.getStatus().scene)).toBe('lobby');
  await expect.poll(()=>page.evaluate(()=>NobiAudio.getStatus().playing)).toBe(true);
  expect(await page.evaluate(()=>NobiAudio.getStatus().trackId)).toBe('dreaming');
});

test('5178: six classical recordings decode, in-game selection persists and lobby can preview it',async({page})=>{
  await launch(page);
  const decoded=await page.evaluate(async()=>{
    const context=new OfflineAudioContext(1,1,22050),out=[];
    for(const track of NobiAudio.getTracks('guandan')){
      const response=await fetch(track.src),buffer=await context.decodeAudioData(await response.arrayBuffer());
      out.push({id:track.id,status:response.status,duration:buffer.duration,channels:buffer.numberOfChannels});
    }
    const response=await fetch('assets/sounds/guandan-bomb.wav'),buffer=await context.decodeAudioData(await response.arrayBuffer());
    out.push({id:'bomb',status:response.status,duration:buffer.duration,channels:buffer.numberOfChannels});return out;
  });
  expect(decoded.slice(0,6).map(track=>track.id)).toEqual(['pingsha','liushui','duyi','moonlight','nocturne','dreaming']);
  for(const track of decoded.slice(0,6)){expect(track.status).toBe(200);expect(track.duration).toBeGreaterThan(180);}
  expect(decoded[6].duration).toBeCloseTo(1.8,2);
  await page.locator('[data-match-settings]').filter({visible:true}).click();
  const choice=page.getByLabel('选择掼蛋背景音乐');await expect(choice.locator('option')).toHaveCount(6);
  await choice.selectOption('nocturne');await expect.poll(()=>page.evaluate(()=>NobiAudio.getStatus().trackId)).toBe('nocturne');
  await expect.poll(()=>page.evaluate(()=>audioPlays.some(s=>s.endsWith('guandan-nocturne.mp3')))).toBe(true);
  await choice.selectOption('dreaming');await expect.poll(()=>page.evaluate(()=>audioPlays.some(s=>s.endsWith('guandan-dreaming.mp3')))).toBe(true);
  await page.getByRole('button',{name:'试听炸弹音效'}).click();
  await expect.poll(()=>page.evaluate(()=>audioPlays.some(s=>s.endsWith('guandan-bomb.wav')))).toBe(true);
  await page.reload();await page.locator('[data-launch="guandan"]').click();
  await expect(page.locator('[data-gd-hand] .gd-card')).toHaveCount(27);
  await expect.poll(()=>page.evaluate(()=>NobiAudio.getStatus().trackId)).toBe('dreaming');
  await page.locator('[data-gd-exit]').click();await expect(page.locator('#guandan-game-container')).toHaveCount(0);
  await page.goto(base+'/game.html#/music');
  await expect(page.getByLabel('选择掼蛋背景音乐')).toHaveValue('dreaming');
  await page.getByLabel('选择掼蛋背景音乐').selectOption('moonlight');await page.getByRole('button',{name:'试听所选音乐'}).click();
  await expect.poll(()=>page.evaluate(()=>NobiAudio.getStatus().scene)).toBe('guandan');
  await expect.poll(()=>page.evaluate(()=>NobiAudio.getStatus().trackId)).toBe('moonlight');
  await expect.poll(()=>page.evaluate(()=>NobiAudio.getStatus().playing)).toBe(true);
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'test-results/guandan-feedback/classical-selection.png'});
});
