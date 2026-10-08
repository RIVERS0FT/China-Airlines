import { describe, expect, it } from 'vitest';
import { GameCore, waiting } from '../helpers/configured-game.js';
import { mapTraffic, trafficDotColor } from '../../src/ui/map-traffic.js';
const NOW = 1_800_000_000_000;
describe('read-only map traffic', () => {
  it('encodes the combined queue with color, including empty and high-volume airports', () => {
    const colors = [0,1,9,10,19,20,39,40,1000].map(passengers => trafficDotColor({passengers,cargo:0}));
    expect(new Set([colors[0],colors[1],colors[3],colors[5],colors[7]]).size).toBe(5);
    expect(colors[1]).toBe(colors[2]); expect(colors[3]).toBe(colors[4]);
    expect(colors[5]).toBe(colors[6]); expect(colors[7]).toBe(colors[8]);
    expect(trafficDotColor({passengers:0,cargo:20})).toBe(trafficDotColor({passengers:14,cargo:6}));
    expect(trafficDotColor({passengers:5,cargo:5})).toBe(colors[3]);
  });
  it('shows types for loaded destinations and actual amounts for airport queues', () => {
    const core = new GameCore(NOW), initial = core.snapshot();
    expect(mapTraffic(initial).waiting.get('PEK')).toEqual({ passengers:12,cargo:6 });
    core.execute({ type:'load-destination',planeId:'AC0001',to:'PVG' },NOW);
    const state=core.snapshot(), before=structuredClone(state), traffic=mapTraffic(state,'AC0001');
    expect(traffic.destinationKey).toBe('PVG:passengers+cargo');
    expect(traffic.destinations.get('PVG')).toEqual({ passengers:true,cargo:true });
    expect(traffic.waiting.get('PEK')).toEqual({ passengers:9,cargo:4 });
    expect(traffic.waiting.get('PVG')).toEqual({ passengers:14,cargo:6 });
    expect(traffic.waiting.has('WUH')).toBe(false); expect(state).toEqual(before);
    expect(mapTraffic(state).destinationKey).toBe('');
    expect(mapTraffic(state,'AC9999').destinationKey).toBe('');
  });
  it('tracks unloading and expiry, retains accepted transfers, excludes other planes', () => {
    const core = new GameCore(NOW); core.execute({type:'load-destination',planeId:'AC0001',to:'PVG'},NOW);
    const state=core.snapshot(), transfer=state.orders.find(o=>o.location==='AC0001' && o.kind==='cargo')!;
    transfer.location='PVG'; transfer.to='PEK';
    const expired=waiting(state,'PEK').find(o=>o.kind==='passengers')!; expired.expiresAt=state.simTime;
    const traffic=mapTraffic(state,'AC0001');
    expect(traffic.waiting.get('PEK')!.passengers).toBe(8);
    expect(traffic.waiting.get('PVG')!.cargo).toBe(7);
    expect(traffic.destinationKey).toBe('PVG:passengers+cargo');
    state.orders.filter(o=>o.location==='AC0001' && o.kind==='cargo').forEach(o=>{o.location='PVG';});
    expect(mapTraffic(state,'AC0001').destinationKey).toBe('PVG:passengers');
    expect(mapTraffic(state,'AC0001').key).not.toBe(traffic.key);
  });
});
