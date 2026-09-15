import { artAsset } from './art-assets.js';

/** Rows 1-2: pilots. Rows 3-4: ground staff. Face assignment depends only on the permanent employee id. */
const PORTRAIT_COLUMNS = 3;
const PORTRAIT_SOURCE_CELL = 362;
const PORTRAIT_VIEW = 282;
const PORTRAIT_ATLAS = 'employee-portraits-v1.png';
const PORTRAIT_URL = artAsset(PORTRAIT_ATLAS);

export function EmployeePortrait({ id }: { id: number; department?: 'flight' | 'ground' }) {
  const row = Math.floor((id % 12) / PORTRAIT_COLUMNS);
  const column = (id % 12) % PORTRAIT_COLUMNS;
  const inset = (PORTRAIT_SOURCE_CELL - PORTRAIT_VIEW) / 2;
  const x = column * PORTRAIT_SOURCE_CELL + inset;
  const y = row * PORTRAIT_SOURCE_CELL + inset;
  const viewBox = `${x} ${y} ${PORTRAIT_VIEW} ${PORTRAIT_VIEW}`;
  return <svg className="employee-portrait" viewBox={viewBox} aria-hidden="true" data-portrait={id%12}>
    <image href={PORTRAIT_URL} x={-x} y={-y} width={1086} height={1448}/>
  </svg>;
}
