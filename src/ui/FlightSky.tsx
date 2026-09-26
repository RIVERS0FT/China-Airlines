import { artAsset } from './art-assets.js';

/** Shared decorative sky. It never owns or advances flight state. */
export function FlightSky({ className = '' }: { className?: string }) {
  return <div className={`flight-sky ${className}`} aria-hidden="true">
    <div className="flight-panorama">
      {/* Mirrored pairs join the painted edges and repeat without a snap back. */}
      {[0, 1, 2, 3].map(copy => <img key={copy} src={artAsset('flight-cloudscape-v1.png')} alt="" draggable={false}/>)}
    </div>
    {(['far', 'near'] as const).map(depth => <div key={depth} className={`flight-clouds flight-clouds-${depth}`}>
      {[0, 1].map(copy => <img key={copy} src={artAsset('flight-cloud-bank-v1.png')} alt="" draggable={false}/>)}
    </div>)}
  </div>;
}
