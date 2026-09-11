import { airport, routeId } from '../core/catalog.js';
import { legQuote, type GameState, type Plane } from '../core/game.js';
export interface PreviewLeg { from: string; to: string; number: number; opened: boolean; error: string }
export interface RoutePreview { legs: PreviewLeg[]; visits: { airportId: string; numbers: number[] }[] }
/** Pure UI projection: previewing or cancelling a draft never builds routes or charges money. */
export function routePreview(game: GameState, plane: Plane, stops: readonly string[]): RoutePreview {
  const visits = new Map<string, number[]>();
  if (stops.length) visits.set(plane.airportId, [0]);
  let from = plane.airportId;
  const legs = stops.map((to, index) => {
    // Rendering coordinates must be known even when an airport is not yet unlocked.
    airport(to);
    let error = '';
    try { legQuote(game, plane, from, to); } catch (e) { error = e instanceof Error ? e.message : '航段不可用'; }
    const leg = { from, to, number: index + 1, opened: game.routes.some(r => r.id === routeId(from, to)), error };
    visits.set(to, [...(visits.get(to) ?? []), index + 1]); from = to;
    return leg;
  });
  return { legs, visits: [...visits].map(([airportId, numbers]) => ({ airportId, numbers })) };
}
export function previewDescription(preview: RoutePreview | null | undefined): string {
  if (!preview?.legs.length) return '尚未添加航段';
  return preview.legs.map(leg => `${leg.number}. ${airport(leg.from).city}→${airport(leg.to).city}：${leg.error || (leg.opened ? '可飞，航线已开通' : '可飞，须先开通航线')}`).join('；');
}
