import { describe, expect, it } from 'vitest';
import { GameCore, manifest, waiting, type GameState } from '../helpers/configured-game.js';
import { routePreview, previewDescription } from '../../src/ui/route-preview.js';
import { orderBlockReason, loadingLock } from '../../src/ui/order-presentation.js';
const NOW = 1_800_000_000_000;
function setup() { const funded=new GameCore(NOW).snapshot();funded.credits=100000;const core = new GameCore(NOW,funded); return { core, game: core.snapshot(), plane: core.snapshot().fleet[0]! }; }
describe('read-only map preview', () => {
  it('labels a valid unoperated route as directly flyable without charging or writing', () => {
    const {game,plane} = setup(), before = structuredClone(game), q = routePreview(game,plane,['PVG']);
    expect(q.legs[0]).toMatchObject({from:'PEK',to:'PVG',opened:false,error:'',number:1});
    expect(previewDescription(q)).toContain('城市已解锁'); expect(game).toEqual(before);
  });
  it('keeps repeated visits and direction, and never writes to the core', () => {
    const {core,plane} = setup(); core.execute({type:'unlock',airportId:'WUH'},NOW);
    const before = core.snapshot(), q = routePreview(before,plane,['WUH','PEK','PVG']);
    expect(q.visits.find(v=>v.airportId==='PEK')?.numbers).toEqual([0,2]);
    expect(q.legs.map(l=>[l.from,l.to])).toEqual([['PEK','WUH'],['WUH','PEK'],['PEK','PVG']]);
    expect(core.snapshot()).toEqual(before);
  });
  it('reports locked airports as invalid rather than valid routes', () => {
    const { core, game, plane } = setup();
    expect(routePreview(game, plane, ['WUH']).legs[0]?.error).not.toBe('');
    expect(() => core.execute({ type: 'dispatch', planeId: plane.id, to: 'WUH', auto: false }, NOW)).toThrow();
    expect(core.snapshot()).toEqual(game);
    core.execute({ type: 'unlock', airportId: 'WUH' }, NOW);
    expect(routePreview(core.snapshot(), plane, ['WUH']).legs[0]?.error).toBe('');
    core.execute({ type: 'dispatch', planeId: plane.id, to: 'WUH', auto: false }, NOW);
    expect(core.snapshot().fleet[0]!.flight?.to).toBe('WUH');
  });
  it('uses current range and airport-level checks', () => {
    const {core} = setup(); core.execute({type:'buy',modelId:'diamond-da40',airportId:'PEK',passengers:1,cargo:0},NOW); const plane=core.snapshot().fleet[1]!; core.execute({type:'unlock',airportId:'URC'},NOW);
    const before = core.snapshot();
    expect(routePreview(before,plane,['URC']).legs[0]?.error).not.toBe('');
    expect(() => core.execute({ type: 'dispatch', planeId: plane.id, to: 'URC', auto: false }, NOW)).toThrow();
    expect(core.snapshot()).toEqual(before);
    const funded = structuredClone(before); funded.credits = 500000; funded.career.xp = 20000;
    const other = new GameCore(NOW, funded);
    other.execute({ type: 'upgrade', airportId: 'PEK' }, NOW);
    other.execute({ type: 'upgrade', airportId: 'PEK' }, NOW);
    other.execute({ type: 'buy', modelId: 'aurora-p', airportId: 'PEK', passengers: 1, cargo: 0 }, NOW);
    const large = other.snapshot(), purchased = large.fleet.at(-1)!;
    expect(routePreview(large,purchased,['PVG']).legs[0]?.error).not.toBe('');
    expect(() => other.execute({ type: 'dispatch', planeId: purchased.id, to: 'PVG', auto: false }, NOW)).toThrow();
    expect(other.snapshot()).toEqual(large);
  });
  it('marks previously operated relations without making them a flight prerequisite', () => {
    const {core,plane} = setup(); core.execute({type:'route',from:'PEK',to:'PVG'},NOW);
    const preview=routePreview(core.snapshot(),plane,['PVG']);expect(preview.legs[0]?.opened).toBe(true);expect(previewDescription(preview)).toContain('已有运营记录');
    expect(routePreview(core.snapshot(),plane,[])).toEqual({legs:[],visits:[]});
    expect(previewDescription(null)).toBe('尚未选择路线城市');
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
    expect(orderBlockReason(game,{...plane,allocation:{passengers:2,cargo:0}},cargo,false)).toBe('请先分配货位');
    expect(orderBlockReason(game,{...plane,allocation:{passengers:0,cargo:2}},person,false)).toBe('请先分配客位');
    expect(orderBlockReason(game,plane,person,false)).toBe('');
  });
  it('reflects loaded capacities and leaves the save unchanged', () => {
    const {core} = setup(); core.execute({type:'load-destination',planeId:'AC0001',to:'PVG'},NOW);
    const game = core.snapshot(), before = structuredClone(game), p = game.fleet[0]!;
    const remaining = waiting(game,'PEK').find(o=>o.kind==='passengers')!;
    expect(orderBlockReason(game,p,remaining,false)).toContain('客舱'); expect(game).toEqual(before);
  });
  it('disallows flight unload and automatic/plan manual loading', () => {
    const {core,plane} = setup(); core.execute({type:'load-destination',planeId:plane.id,to:'PVG'},NOW);
    core.execute({type:'dispatch',planeId:plane.id,to:'PVG',auto:false},NOW);
    const game = core.snapshot(), p = game.fleet[0]!, job = manifest(game,p.id)[0]!;
    expect(orderBlockReason(game,p,job,true)).toBe('飞行中，不能装卸');
    expect(loadingLock(game,{...p,flight:null,autoRouteId:'PEK-PVG'})).toContain('自动值勤');
    expect(loadingLock(game,{...p,flight:null,itinerary:['PEK']})).toContain('剩余计划');
  });
  it('shows full waiting-room reason before an unload', () => {
    const {game,plane} = setup();
    // An unload explanation requires a genuinely onboard order, not a waiting one.
    const onboard = {...game.orders[0]!,id:'JB9999',location:plane.id,expiresAt:null};
    const crowded: GameState = {...game,orders:[...game.orders,...waiting(game,'PEK'),onboard]};
    expect(orderBlockReason(crowded,plane,onboard,true)).toBe('机场候运区已满');
  });
});
