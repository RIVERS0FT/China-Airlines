import {it,expect} from 'vitest';
import {GameCore,validateSave} from '../src/core/game.js';
const NOW=1800000000000;
it('cannot disguise a modern in-flight aircraft as a grandfathered zero-energy flight',()=>{const c=new GameCore(NOW);c.execute({type:'dispatch',planeId:'AC0001',to:'PVG',auto:false},NOW);const s=c.snapshot();s.fleet[0]!.energy.reservedSeconds=0;expect(()=>validateSave(s)).toThrow();});
it('requires a corresponding personnel record for modern automatic permissions',()=>{const s=new GameCore(NOW).snapshot();s.fleet[0]!.dispatcher=true;expect(()=>validateSave(s)).toThrow();});
