import { test, expect } from './fixture.js';
import { GameCore } from '../src/core/game.js';
import { ALL_MODELS } from '../src/core/catalog.js';
import { readFile } from 'node:fs/promises';
const NOW=Date.parse('2026-09-16T00:00:00Z');

for(const model of ALL_MODELS)test(`dedicated layers cover ${model.id} without remounting or changing orders`,async({page})=>{
  await page.clock.install({time:new Date(NOW)});await page.clock.pauseAt(new Date(NOW+1000));
  await page.goto('./');await expect(page.getByTestId('aircraft-cabin')).toBeVisible();
  const s=new GameCore(NOW).snapshot();s.fleet[0]!.modelId=model.id;s.airports.forEach(a=>a.level=3);
  await page.getByRole('button',{name:'存档设置',exact:true}).click();page.once('dialog',d=>void d.accept());
  await page.getByLabel('选择存档文件').setInputFiles({name:'current-aircraft.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(s))});
  await expect(page.getByRole('status').filter({hasText:'存档导入成功'})).toBeVisible();
  await page.getByRole('button',{name:'关闭存档设置',exact:true}).click();
  const furniture = () => page.locator('.cabin-place-art').evaluateAll(nodes => nodes.map(node => {
    const style = getComputedStyle(node);
    return { slot: node.closest('.cabin-anchor')!.getAttribute('data-anchor-id'), width: style.width,
      height: style.height, bottom: style.bottom, left: style.left, transform: style.transform };
  }));
  const captionClearance = async () => {
    const slots = await page.locator('.cabin-anchor[data-slot-active=true]').evaluateAll(nodes => nodes.map(node => {
      const slot = node.getBoundingClientRect();
      const caption = node.querySelector('.job-info,.cabin-empty>span')!.getBoundingClientRect();
      const furniture = node.querySelector('.cabin-place-art')!.getBoundingClientRect();
      const occupant = node.querySelector('.job-art')?.getBoundingClientRect();
      return { id: node.getAttribute('data-anchor-id'), slotLeft: slot.left, slotRight: slot.right, slotCenter: slot.x + slot.width / 2,
        captionLeft: caption.left, captionRight: caption.right, captionTop: caption.top, captionCenter: caption.x + caption.width / 2,
        captionWidth: caption.width, furnitureBottom: furniture.bottom, occupantBottom: occupant?.bottom };
    }));
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      expect(slot.captionWidth, `${model.id}/${slot.id}: caption width`).toBeGreaterThan(0);
      expect(Math.abs(slot.captionCenter - slot.slotCenter), `${model.id}/${slot.id}: caption centered below load`).toBeLessThan(.75);
      expect(slot.captionTop, `${model.id}/${slot.id}: caption below furniture`).toBeGreaterThanOrEqual(slot.furnitureBottom - 1);
      if (slot.occupantBottom !== undefined) expect(slot.captionTop, `${model.id}/${slot.id}: caption below occupant`).toBeGreaterThanOrEqual(slot.occupantBottom - 1);
      expect(slot.captionLeft, `${model.id}/${slot.id}: caption left containment`).toBeGreaterThanOrEqual(slot.slotLeft - .1);
      expect(slot.captionRight, `${model.id}/${slot.id}: caption containment`).toBeLessThanOrEqual(slot.slotRight + .1);
    }
  };
  await captionClearance();
  await page.locator('.cabin-place-art').evaluateAll(nodes => nodes.forEach((node, i) => node.setAttribute('data-furniture-node', String(i))));
  const identity = () => page.locator('.cabin-place-art').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-furniture-node')));
  const before = await furniture(), identities = await identity(); expect(before.length).toBeGreaterThan(0);
  await page.getByRole('button',{name:/^同目的地装载：/}).first().click();
  expect(await furniture()).toEqual(before); expect(await identity()).toEqual(identities);
  await captionClearance();
  const inactive = page.locator('.cabin-anchor[data-slot-active=false]');
  for (const anchor of await inactive.all()) {
    await expect(anchor).toHaveAttribute('inert', '');
    await expect(anchor).toBeHidden();
    await expect(anchor.locator('[data-testid=loaded-order],[data-testid=cabin-empty-place]')).toHaveCount(0);
  }
  const frame=page.getByTestId('plane-art'),cabin=page.getByTestId('aircraft-cabin'),near=page.getByTestId('aircraft-near-layer');
  await expect(frame).toHaveAttribute('data-model-id',model.id);
  const revision='v5';
  await expect(frame.locator('.cutaway-airframe')).toHaveAttribute('src',new RegExp(`aircraft-${model.id}-cutaway-${revision}.png$`));
  await expect(near).toHaveAttribute('src',new RegExp(`aircraft-${model.id}-near-${revision}.png$`));
  await expect.poll(()=>frame.locator('img').evaluateAll(nodes=>nodes.every(n=>(n as HTMLImageElement).complete&&(n as HTMLImageElement).naturalWidth>0))).toBe(true);
  await expect(page.locator('.cabin-deck')).toHaveCount(model.seats&&model.cargo?2:1);
  if(model.seats&&model.cargo){
    const top=(await page.getByTestId('cabin-passengers').boundingBox())!,bottom=(await page.getByTestId('cabin-cargo').boundingBox())!;
    expect(bottom.y).toBeGreaterThanOrEqual(top.y+top.height-.5);expect(bottom.x).toBeCloseTo(top.x,0);
  }
  if(model.seats)await expect(page.getByTestId('cabin-passengers').locator('.cabin-anchor')).toHaveCount(model.seats);
  if(model.cargo)await expect(page.getByTestId('cabin-cargo').locator('.cabin-anchor')).toHaveCount(model.cargo);
  const ids=await cabin.getByTestId('loaded-order').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-order-id')));
  await cabin.evaluate(n=>n.setAttribute('data-mount-marker','kept'));
  await page.screenshot({path:`artifacts/aircraft-layers-${model.id}-interior.png`});
  await page.getByRole('button',{name:'查看外观',exact:true}).click();await expect(near).toBeVisible();
  await expect(cabin).toHaveAttribute('inert','');await expect(cabin).toHaveAttribute('data-mount-marker','kept');
  expect(await cabin.getByTestId('loaded-order').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-order-id')))).toEqual(ids);
  // Sample actual layer pixels across the whole room, not just an image bounding box.
  const coverage=await frame.evaluate(el=>{
    const n=el.querySelector<HTMLImageElement>('.aircraft-near-layer')!,r=n.getBoundingClientRect(),room=el.querySelector('.cabin-interior')!.getBoundingClientRect();
    const canvas=document.createElement('canvas');canvas.width=n.naturalWidth;canvas.height=n.naturalHeight;
    const ctx=canvas.getContext('2d')!;ctx.drawImage(n,0,0);let min=255;
    for(let u=.05;u<1;u+=.1)for(let v=.05;v<1;v+=.1){
      const x=Math.floor((room.x+u*room.width-r.x)/r.width*canvas.width),y=Math.floor((room.y+v*room.height-r.y)/r.height*canvas.height);
      min=Math.min(min,ctx.getImageData(x,y,1,1).data[3]!);
    }
    return {min,corner:ctx.getImageData(0,0,1,1).data[3]};
  });
  expect(coverage.corner).toBe(0);expect(coverage.min).toBeGreaterThan(245);
  const sameCanvas = async () => {
    const geometry = await frame.locator('.cutaway-airframe,.aircraft-near-layer').evaluateAll(nodes => nodes.map(node => {
      const image = node as HTMLImageElement, rect = image.getBoundingClientRect();
      return { width: image.naturalWidth, height: image.naturalHeight, x: rect.x, y: rect.y, w: rect.width, h: rect.height };
    }));
    expect(geometry).toHaveLength(2);
    expect(geometry[0]!.width).toBe(1536); expect(geometry[0]!.height).toBe(590);
    expect(geometry[0]).toEqual(geometry[1]);
    expect(geometry[0]!.w / geometry[0]!.h).toBeCloseTo(1536 / 590, 4);
  };
  await sameCanvas();
  await page.screenshot({path:`artifacts/aircraft-layers-${model.id}-exterior.png`});
  await page.setViewportSize({width:844,height:390});
  await page.clock.runFor(34);
  await sameCanvas();
  await page.getByRole('button',{name:'查看机舱',exact:true}).click();await expect(near).toBeHidden();
  await expect(cabin).not.toHaveAttribute('inert','');await expect(cabin).toHaveAttribute('data-mount-marker','kept');
  await captionClearance();
  await cabin.getByTestId('loaded-order').first().click({trial:true});
  await page.getByRole('button',{name:'存档设置',exact:true}).click();const pending=page.waitForEvent('download');
  await page.getByRole('button',{name:'导出存档',exact:true}).click();const saved=JSON.parse(await readFile((await (await pending).path())!,'utf8'));
  expect(saved.fleet[0].modelId).toBe(model.id);
  const core=new GameCore(NOW,s);core.execute({type:'load-destination',planeId:'AC0001',to:'PVG'},NOW);
  expect(saved.orders.filter((o:{location:string})=>o.location==='AC0001')).toEqual(core.snapshot().orders.filter(o=>o.location==='AC0001'));
});
