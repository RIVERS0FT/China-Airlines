import type { CompanyLogo as Logo } from '../core/company-identity.js';

/** Original aviation emblems: wings, sunrise, bird, compass, peaks and orbit. */
export function CompanyLogo({ logo, label = '' }: { logo: Logo; label?: string }) {
  if (logo.kind === 'custom') return <img className="company-logo" src={logo.data} alt={label} width="128" height="128" draggable={false} data-logo-kind="custom"/>;
  return <svg className="company-logo" viewBox="0 0 128 128" role={label ? 'img' : undefined} aria-label={label || undefined} aria-hidden={!label} data-logo-kind="preset" data-logo-id={logo.id}>
    {logo.id === 'wing' && <><circle cx="64" cy="64" r="57" fill="#124d77"/><path d="M23 77 100 34 81 79 64 69 42 93 49 66Z" fill="#fff9df"/><path d="m63 55 37-21-22 31Z" fill="#efbc5e"/></>}
    {logo.id === 'sunrise' && <><circle cx="64" cy="64" r="57" fill="#fff3d4"/><path d="M28 69a36 36 0 0 1 72 0Z" fill="#d97737"/><path d="M17 83q28-24 56-9t38-4v13q-16 18-43 2T17 94Z" fill="#176275"/><path d="M39 99h49" stroke="#176275" strokeWidth="6" strokeLinecap="round"/></>}
    {logo.id === 'bird' && <><circle cx="64" cy="64" r="57" fill="#a93942"/><path d="M23 38q31 2 42 24 16-28 44-25L77 70 70 97 56 77 28 85l18-18Z" fill="#fff9e5"/><path d="m65 62 7-10 14 4-10 6Z" fill="#efc36c"/></>}
    {logo.id === 'compass' && <><circle cx="64" cy="64" r="57" fill="#164e5b"/><circle cx="64" cy="64" r="39" fill="none" stroke="#eac279" strokeWidth="3"/><path d="m84 24-9 49-31 31 9-49Z" fill="#fff7dc"/><path d="m84 24-20 40 11 9Z" fill="#e4b562"/><circle cx="64" cy="64" r="6" fill="#164e5b"/></>}
    {logo.id === 'mountain' && <><circle cx="64" cy="64" r="57" fill="#e8f3ef"/><path d="m19 91 32-51 18 28 13-22 28 45Z" fill="#1d6b65"/><path d="m51 40-13 22 14-6 11 7Z" fill="#fff"/><path d="M20 39q44-23 84 0M28 101h73" fill="none" stroke="#c3944a" strokeWidth="5" strokeLinecap="round"/></>}
    {logo.id === 'orbit' && <><circle cx="64" cy="64" r="57" fill="#343f76"/><circle cx="64" cy="64" r="30" fill="none" stroke="#afbde1" strokeWidth="3"/><path d="M64 34q-25 30 0 60m0-60q25 30 0 60M35 56h58M35 72h58" fill="none" stroke="#afbde1" strokeWidth="2"/><path d="M24 92q-22-28 73-57" fill="none" stroke="#ffdf8e" strokeWidth="7" strokeLinecap="round"/><path d="m84 26 28 5-17 23 1-16Z" fill="#fff9e5"/></>}
  </svg>;
}
