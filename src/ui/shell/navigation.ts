/** Navigation is UI state only; it never issues simulation commands. */
export const WORK_PAGES = ['airports', 'fleet', 'shop', 'organization', 'career'] as const;
export type WorkPage = typeof WORK_PAGES[number];
export type ScenePage = 'airport' | 'map' | 'dispatch';
export type Page = ScenePage | WorkPage;
export interface NavigationState { page: Page; scene: ScenePage }
export type NavigationAction = { type: 'open'; page: Page } | { type: 'return' };
export function isWorkPage(page: Page): page is WorkPage {
  return (WORK_PAGES as readonly string[]).includes(page);
}
export function navigationReducer(state: NavigationState, action: NavigationAction): NavigationState {
  if (action.type === 'return') return { ...state, page: state.scene };
  return { page: action.page, scene: isWorkPage(action.page) ? state.scene : action.page };
}
export function initialNavigation(value: string | null): NavigationState {
  const page = value === 'airport' ? 'airport' : 'map';
  return { page, scene: page };
}
