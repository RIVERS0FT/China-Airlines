import { artAsset } from './art-assets.js';

/** Shared decorative sky. It never owns or advances flight state. */
export function FlightSky({ className = '' }: { className?: string }) {
  return <div className={`flight-sky ${className}`} aria-hidden="true">
    <div className="flight-panorama">
      {/* Same-direction copies overlap; each incoming left edge fades over the
          opaque previous image, without mirrored cloud shapes or a loop snap. */}
      {[0, 1, 2].map(copy => <img key={copy} src={artAsset('flight-cloudscape-v1.png')} alt="" draggable={false}/>)}
    </div>
    {(['far', 'near'] as const).map(depth => <div key={depth} className={`flight-clouds flight-clouds-${depth}`}>
      {[0, 1].map(copy => <img key={copy} src={artAsset('flight-cloud-bank-v1.png')} alt="" draggable={false}/>)}
    </div>)}
  </div>;
}
