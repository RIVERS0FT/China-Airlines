import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/core/game.js';
import { passengerDestinationCounts, passengerDestinationKey } from '../src/ui/passenger-destinations.js';

const NOW = 1800000000000;

describe('passenger destination map projection', () => {
  it('aggregates only loaded passengers for the selected aircraft', () => {
    const core = new GameCore(NOW);
    core.execute({ type: 'load-destination', planeId: 'AC0001', to: 'PVG' }, NOW);
    const counts = passengerDestinationCounts(core.snapshot(), 'AC0001');
    expect(counts.get('PVG')).toBe(6);
    expect(passengerDestinationKey(counts)).toBe('PVG:6');
  });

  it('returns no markers when no aircraft is selected', () => {
    const core = new GameCore(NOW);
    expect(passengerDestinationKey(passengerDestinationCounts(core.snapshot()))).toBe('');
  });
});
