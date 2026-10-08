import { test, expect } from '../helpers/configured-airport.js';
import { airport } from '../../src/core/catalog.js';
import { greatCircle, projectGeo, screenPoint, toVector, viewVector, type GlobeCamera } from '../../src/ui/globe-geometry.js';
import { trafficDotColor } from '../../src/ui/map-traffic.js';
import { launchRoute, selectCity } from '../helpers/dispatch-helpers.js';

interface TrafficMarker { id:string; x:number; y:number; radius:number; color:number; total:number|null;
  arrow:null | {x:number; tipY:number; topY:number; passengers:boolean; cargo:boolean} }

for(const [width,height] of [[1440,900],[844,390],[667,375]]) test(`route planning shows downward arrows and fixed traffic dots at ${width}`, async ({ page }) => {
  await page.setViewportSize({width:width!,height:height!});
  await page.clock.install({ time: new Date('2026-09-12T00:00:00Z') });
  await page.goto('./');
  await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
  await page.getByRole('button', { name: /^同目的地装载：/ }).first().click();
  await page.getByRole('button', { name: '制定航线', exact: true }).click();
  const hint = page.getByRole('button', { name: '关闭选路提示', exact: true });
  if (await hint.count()) await hint.click();
  const map = page.getByTestId('map-canvas');
  await expect(map).toHaveAttribute('data-renderer', 'ready');
  await expect(map).toHaveAttribute('data-cargo-destinations', 'PVG:passengers+cargo');
  await expect(map).toHaveAttribute('data-waiting-traffic', 'PEK:9/4,PVG:14/6');
  await expect(map.locator('canvas')).toHaveAttribute('aria-label', /上海 机上旅客目的地 机上货物目的地/);
  await expect(page.locator('.map-traffic-legend')).toHaveCount(0);
  await expect(map).toHaveAttribute('data-traffic-visual','fixed-color-dot');
  const physicalFont=Number(await map.getAttribute('data-label-font-pixels'));
  expect(Math.round(physicalFont*1000)/1000).toBeGreaterThanOrEqual(12);
  await expect.poll(async()=>JSON.parse((await map.getAttribute('data-label-targets'))!).some((label:{id:string})=>label.id==='PVG')).toBe(true);
  const readMarkers = async()=>JSON.parse((await map.getAttribute('data-traffic-markers'))!) as TrafficMarker[];
  const markers=await readMarkers(), pek=markers.find(m=>m.id==='PEK')!, pvg=markers.find(m=>m.id==='PVG')!;
  expect(pek.total).toBe(13); expect(pvg.total).toBe(20);
  expect(pek.radius).toBe(pvg.radius); expect(new Set(markers.map(m=>m.radius)).size).toBe(1);
  expect(pek.color).toBe(trafficDotColor({passengers:9,cargo:4}));
  expect(pvg.color).toBe(trafficDotColor({passengers:14,cargo:6})); expect(pek.color).not.toBe(pvg.color);
  expect(pek.arrow).toBeNull(); expect(pvg.arrow).toMatchObject({x:pvg.x,passengers:true,cargo:true});
  expect(pvg.arrow!.tipY).toBeLessThan(pvg.y-pvg.radius);
  expect(pvg.arrow!.topY).toBeLessThan(pvg.arrow!.tipY);
  const camera=JSON.parse((await map.getAttribute('data-camera'))!) as GlobeCamera, point=projectGeo(airport('PVG'),camera);
  expect(pvg.x).toBeCloseTo(point.x,5); expect(pvg.y).toBeCloseTo(point.y,5);
  const bounds=(await map.boundingBox())!, dimensions=await map.evaluate(node=>({width:node.clientWidth,height:node.clientHeight}));
  await page.mouse.click(bounds.x + pvg.arrow!.x * bounds.width / dimensions.width,
    bounds.y + (pvg.arrow!.topY + pvg.arrow!.tipY) / 2 * bounds.height / dimensions.height);
  await expect(map).toHaveAttribute('data-preview-path','PVG');
  await expect(map).toHaveAttribute('data-route-flow-motion','flowing');
  await expect.poll(async()=>JSON.parse((await map.getAttribute('data-city-labels'))!).some((label:{id:string;text:string})=>label.id==='PVG' && label.text==='上海')).toBe(true);
  const readFlow=async()=>JSON.parse((await map.getAttribute('data-route-flow'))!) as {from:string;to:string;progress:number;x:number;y:number}[];
  const firstFlow=await map.getAttribute('data-route-flow'), creditBefore=await page.getByTestId('credits').innerText();
  await page.clock.runFor(400);
  await expect(map).not.toHaveAttribute('data-route-flow',firstFlow!);
  const flowCamera=JSON.parse((await map.getAttribute('data-camera'))!) as GlobeCamera;
  for(const sample of await readFlow()){
    expect(sample.from).toBe('PEK');expect(sample.to).toBe('PVG');
    const expected=screenPoint(viewVector(greatCircle(toVector(airport('PEK')),toVector(airport('PVG')),sample.progress),flowCamera),flowCamera);
    expect(sample.x).toBeCloseTo(expected.x,5);expect(sample.y).toBeCloseTo(expected.y,5);
  }
  await expect(page.getByTestId('credits')).toHaveText(creditBefore);
  await expect(map).toHaveAttribute('data-preview-path','PVG');
  await page.screenshot({path:`artifacts/airport-traffic-dots-${width}.png`});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.clock.runFor(70);
  await expect(map).toHaveAttribute('data-route-flow-motion','static');
  const staticFlow=await map.getAttribute('data-route-flow');
  await page.clock.runFor(400);
  await expect(map).toHaveAttribute('data-route-flow',staticFlow!);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.clock.runFor(70);
  if(width===1440){
    await page.getByRole('button',{name:'取消起飞',exact:true}).click();
    for(let i=0;i<3;i++) await page.locator('[data-testid="loaded-order"].order-passengers').first().click();
    await page.getByRole('button',{name:'制定航线',exact:true}).click();
    await expect(map).toHaveAttribute('data-cargo-destinations','PVG:cargo');
    await expect(map).toHaveAttribute('data-waiting-traffic','PEK:12/4,PVG:14/6');
    await expect(map.locator('canvas')).toHaveAttribute('aria-label',/上海  机上货物目的地/);
    await expect.poll(async()=>(await readMarkers()).find(m=>m.id==='PVG')!.arrow!.passengers).toBe(false);
    await page.getByRole('button',{name:'取消起飞',exact:true}).click();
    for(let i=0;i<2;i++) await page.locator('[data-testid="loaded-order"].order-cargo').first().click();
    await page.getByRole('button',{name:'制定航线',exact:true}).click();
    await expect(map).toHaveAttribute('data-cargo-destinations','');
    await expect(map).toHaveAttribute('data-waiting-traffic','PEK:12/6,PVG:14/6');
    await expect.poll(async()=>(await readMarkers()).find(m=>m.id==='PVG')!.arrow).toBeNull();
    // Browsing retains queue dots without any plane-specific arrow or explanatory strip.
    await page.getByRole('button',{name:'取消起飞',exact:true}).click();
    await page.getByRole('button',{name:'地图',exact:true}).click();
    await expect(map).toHaveAttribute('data-renderer','ready');
    await expect(map).toHaveAttribute('data-cargo-destinations','');
    await expect.poll(async()=>(await readMarkers()).every(m=>!m.arrow)).toBe(true);
    await expect(page.locator('.map-traffic-legend')).toHaveCount(0);
  }
});

test('direction flow follows the active flight without changing its accounts',async({page})=>{
  await page.clock.install({time:new Date('2026-09-12T00:00:00Z')});
  await page.goto('./');
  await page.getByRole('button',{name:/^同目的地装载：/}).first().click();
  await page.getByRole('button',{name:'制定航线',exact:true}).click();
  await selectCity(page,'PVG');
  await launchRoute(page);
  const credits=await page.getByTestId('credits').innerText();
  await page.getByRole('button',{name:'地图',exact:true}).click();
  const map=page.getByTestId('map-canvas');
  await expect(map).toHaveAttribute('data-renderer','ready');
  await expect(map).toHaveAttribute('data-route-flow-motion','flowing');
  const flow=await map.getAttribute('data-route-flow');
  const samples=JSON.parse(flow!) as {from:string;to:string}[];
  expect(samples.length).toBeGreaterThan(0);
  expect(samples.every(sample=>sample.from==='PEK' && sample.to==='PVG')).toBe(true);
  await page.clock.runFor(400);
  await expect(map).not.toHaveAttribute('data-route-flow',flow!);
  await expect(page.getByTestId('credits')).toHaveText(credits);
  await expect(map).toHaveAttribute('data-preview-path','');
});
