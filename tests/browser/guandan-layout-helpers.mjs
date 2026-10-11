import {expect} from '../../tooling/node_modules/@playwright/test/index.mjs';

// Physical card corners must be reachable through the actual browsing controls.
// Clipped offscreen cards stay in the same hand; the page itself never overflows.
export async function accessibleHand(surface,expected=27) {
  const cards=surface.locator('[data-gd-hand] .gd-card');
  await expect(cards).toHaveCount(expected);
  const selected=await surface.evaluate(()=>[...window.GD.state.selected].sort());
  const ids=await cards.evaluateAll(nodes=>nodes.map(n=>n.dataset.cardId));
  expect(new Set(ids).size).toBe(expected);
  const seen=new Set();
  const inspect=async()=>{
    const result=await surface.evaluate(()=>{
      const viewport=document.querySelector('[data-gd-hand-viewport]'),r=viewport.getBoundingClientRect();
      return {bounded:r.x>=0&&r.right<=innerWidth+.5&&r.y>=0&&r.bottom<=innerHeight+.5,
        proportional:[...document.querySelectorAll('[data-gd-hand] .gd-card')].every(n=>{const b=n.getBoundingClientRect();return b.y>=r.y&&b.bottom<=r.bottom+.5&&Math.abs(b.height/b.width-323/222)<.025;}),
        pageBounded:document.documentElement.scrollWidth<=innerWidth,
        ids:[...document.querySelectorAll('[data-gd-hand] .gd-card')].filter(n=>{const b=n.getBoundingClientRect();return b.x+4>=r.x&&b.x+8<=r.right;}).map(n=>n.dataset.cardId)};
    });
    expect(result.bounded&&result.proportional&&result.pageBounded).toBe(true);
    for(const id of result.ids)seen.add(id);
  };
  await inspect();
  if(await surface.locator('[data-gd-hand-navigation]').isVisible()) {
    for(let i=0;i<8&&await surface.locator('[data-gd-hand-prev]').isEnabled();i++)await surface.locator('[data-gd-hand-prev]').click();
    await inspect();
    for(let i=0;i<8&&await surface.locator('[data-gd-hand-next]').isEnabled();i++){await surface.locator('[data-gd-hand-next]').click();await inspect();}
    await expect(surface.locator('[data-gd-hand-next]')).toBeDisabled();
    for(let i=0;i<8&&await surface.locator('[data-gd-hand-prev]').isEnabled();i++)await surface.locator('[data-gd-hand-prev]').click();
    await expect(surface.locator('[data-gd-hand-prev]')).toBeDisabled();
  }
  expect([...seen].sort()).toEqual(ids.sort());
  expect(await surface.evaluate(()=>[...window.GD.state.selected].sort())).toEqual(selected);
}
