import { useId } from 'react';

/** Shared decorative sky. It never owns or advances flight state. */
export function FlightSky({ className = '' }: { className?: string }) {
  const gradient = useId().replaceAll(':', '');
  return <svg className={`flight-sky ${className}`} viewBox="0 0 1440 520" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs><linearGradient id={gradient} x2="0" y2="1"><stop stopColor="#4aa9dc"/><stop offset=".62" stopColor="#a9def2"/><stop offset="1" stopColor="#edf9fb"/></linearGradient></defs>
    <rect width="1440" height="520" fill={`url(#${gradient})`}/>
    <g className="flight-clouds flight-clouds-far" fill="#fff" opacity=".58">
      <path d="M-80 134c-40-20-6-52 23-36 9-58 91-42 87 2 56-12 69 42 26 42H-80ZM530 76c-9-20 19-31 36-19 8-30 56-24 57 3 36-5 38 20 15 20H530ZM1120 116c-20-35 24-57 55-35 12-51 91-40 94 7 45-12 71 35 31 48h-180Z"/>
      <path d="M1460 134c-40-20-6-52 23-36 9-58 91-42 87 2 56-12 69 42 26 42h-136Z"/>
    </g>
    <g className="flight-clouds flight-clouds-near" fill="#fff" opacity=".86">
      <path d="M70 350c-34-33 13-68 55-42 15-71 123-57 132 8 73-24 113 47 51 70H70ZM790 393c-26-36 22-68 63-39 25-73 135-42 132 25 62-13 95 46 42 66H790Z"/>
      <path d="M1510 350c-34-33 13-68 55-42 15-71 123-57 132 8 73-24 113 47 51 70h-238Z"/>
    </g>
    <path d="M0 466q190-76 390-8t430-4 370 5 250-12v73H0Z" fill="#f3fbfc" opacity=".9"/>
    <path d="M0 493q220-46 460-4t500-9 480 0v40H0Z" fill="#fff"/>
  </svg>;
}
