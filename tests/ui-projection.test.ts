import { describe, expect, it } from 'vitest';
import { GameCore, manifest, waiting, type GameState } from '../src/core/game.js';
import { routePreview, previewDescription } from '../src/ui/route-preview.js';
import { orderBlockReason, loadingLock } from '../src/ui/order-presentation.js';
const NOW = 1_800_000_000_000;
function setup() { const core = new GameCore(NOW); return { core, game: core.snapshot(), plane: core.snapshot().fleet[0]! }; }
describe('read-only map preview', () => {
  it('labels a valid unopened route without charging or opening it', () => {
    const {game,plane} = setup(), before = structuredClone(game), q = routePreview(game,plane,['PVG']);
    expect(q.legs[0]).toMatchObject({from:'PEK',to:'PVG',opened:false,error:'',number:1});
    expect(previewDescription(q)).toContain('须先开通航线'); expect(game).toEqual(before);
  });
  it('keeps repeated visits and direction, and never writes to the core', () => {
    const {core,plane} = setup(); core.execute({type:'unlock',airportId:'WUH'},NOW);
    const before = core.snapshot(), q = routePreview(before,plane,['WUH','PEK','PVG']);
    expect(q.visits.find(v=>v.airportId==='PEK')?.numbers).toEqual([0,2]);
    expect(q.legs.map(l=>[l.from,l.to])).toEqual([['PEK','WUH'],['WUH','PEK'],['PEK','PVG']]);
    expect(core.snapshot()).toEqual(before);
  });
  it('reports unopened airports as invalid rather than valid dotted routes', () => {
    const {game,plane} = setup(); expect(routePreview(game,plane,['WUH']).legs[0]?.error).toContain('解锁');
  });
  it('uses current range and airport-level checks', () => {
    const {core,plane} = setup(); core.execute({type:'unlock',airportId:'URC'},NOW);
    expect(routePreview(core.snapshot(),plane,['URC']).legs[0]?.error).toContain('航程');
    expect(routePreview(core.snapshot(),{...plane,modelId:'horizon'},['PVG']).legs[0]?.error).toContain('级');
  });
  it('marks already opened routes and resets an empty draft', () => {
    const {core,plane} = setup(); core.execute({type:'route',from:'PEK',to:'PVG'},NOW);
    expect(routePreview(core.snapshot(),plane,['PVG']).legs[0]?.opened).toBe(true);
    expect(routePreview(core.snapshot(),plane,[])).toEqual({legs:[],visits:[]});
    expect(previewDescription(null)).toBe('尚未添加航段');
  });
  it('rejects unknown coordinate IDs', () => { const {game,plane} = setup(); expect(()=>routePreview(game,plane,['UNKNOWN'])).toThrow('未知机场'); });
});
describe('loading state explanations', () => {
  it('explains absent plane and ground turnaround', () => {
    const {game,plane} = setup(); expect(loadingLock(game)).toContain('选择飞机');
    expect(loadingLock(game,{...plane,readyAt:10})).toBe('地面周转中');
  });
  it('explains specialist capacity rather than showing an actionable label', () => {
    const {game,plane} = setup(), cargo = game.orders.find(o=>o.kind==='cargo')!, person = game.orders.find(o=>o.kind==='passengers')!;
    expect(orderBlockReason(game,{...plane,modelId:'lark-p'},cargo,false)).toBe('纯客机不载货');
    expect(orderBlockReason(game,{...plane,modelId:'lark-f'},person,false)).toBe('纯货机不载客');
    expect(orderBlockReason(game,plane,person,false)).toBe('');
  });
  it('reflects loaded capacities and leaves the save unchanged', () => {
    const {core} = setup(); core.execute({type:'load-destination',planeId:'AC0001',to:'PVG'},NOW);
    const game = core.snapshot(), before = structuredClone(game), p = game.fleet[0]!;
    const remaining = waiting(game,'PEK').find(o=>o.kind==='passengers')!;
    expect(orderBlockReason(game,p,remaining,false)).toContain('客舱'); expect(game).toEqual(before);
  });
  it('disallows flight unload and automatic/plan manual loading', () => {
    const {core,plane} = setup(); core.execute({type:'route',from:'PEK',to:'PVG'},NOW);
    core.execute({type:'load-destination',planeId:plane.id,to:'PVG'},NOW);
    core.execute({type:'dispatch',planeId:plane.id,to:'PVG',auto:false},NOW);
    const game = core.snapshot(), p = game.fleet[0]!, job = manifest(game,p.id)[0]!;
    expect(orderBlockReason(game,p,job,true)).toBe('飞行中，不能装卸');
    expect(loadingLock(game,{...p,flight:null,autoRouteId:'PEK-PVG'})).toContain('自动值勤');
    expect(loadingLock(game,{...p,flight:null,itinerary:['PEK']})).toContain('剩余计划');
  });
  it('shows full waiting-room reason before an unload', () => {
    const {game,plane} = setup();
    const crowded: GameState = {...game,orders:[...game.orders,...waiting(game,'PEK')]};
    expect(orderBlockReason(crowded,plane,game.orders[0]!,true)).toBe('机场候运区已满');
  });
});
