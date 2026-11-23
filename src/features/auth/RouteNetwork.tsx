import { useReducedMotion } from '@/shared/utils/useReducedMotion';

/** Decorative GCC route network for the sign-in brand panel (aria-hidden). */
const nodes = [
  { id: 'dam', x: 120, y: 150, label: 'Dammam' },
  { id: 'ryd', x: 70, y: 300, label: 'Riyadh' },
  { id: 'doh', x: 250, y: 205, label: 'Doha' },
  { id: 'auh', x: 360, y: 330, label: 'Abu Dhabi' },
  { id: 'dxb', x: 430, y: 255, label: 'Dubai' },
  { id: 'jea', x: 395, y: 275, label: 'Jebel Ali' },
  { id: 'mct', x: 560, y: 380, label: 'Muscat' },
  { id: 'sea', x: 600, y: 120, label: 'To Asia' },
];

const routes = [
  { d: 'M70,300 C160,260 300,250 430,255', dur: '7s' },
  { d: 'M120,150 C220,170 330,200 430,255', dur: '6s' },
  { d: 'M250,205 C300,230 360,250 395,275', dur: '5s' },
  { d: 'M430,255 C470,300 510,340 560,380', dur: '5.5s' },
  { d: 'M395,275 C390,300 375,315 360,330', dur: '4s' },
  { d: 'M600,120 C540,170 470,230 395,275', dur: '8s' },
];

export function RouteNetwork() {
  const reduced = useReducedMotion();
  return (
    <svg viewBox="0 0 660 460" aria-hidden="true" className="h-auto w-full">
      <defs>
        <radialGradient id="node-glow">
          <stop offset="0%" stopColor="#e2483d" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#e2483d" stopOpacity="0" />
        </radialGradient>
      </defs>
      {routes.map((r, i) => (
        <g key={i}>
          <path d={r.d} fill="none" stroke="rgb(255 255 255 / 0.10)" strokeWidth="1.5" />
          <path d={r.d} fill="none" stroke="#c4372c" strokeWidth="1.5" strokeDasharray="4 7" opacity="0.9">
            {reduced ? null : (
              <animate
                attributeName="stroke-dashoffset"
                from="0"
                to="-110"
                dur={r.dur}
                repeatCount="indefinite"
              />
            )}
          </path>
          {reduced ? null : (
            <circle r="3.5" fill="#fff">
              <animateMotion dur={r.dur} repeatCount="indefinite" path={r.d} />
            </circle>
          )}
        </g>
      ))}
      {nodes.map((n) => (
        <g key={n.id} transform={`translate(${n.x} ${n.y})`}>
          <circle r="22" fill="url(#node-glow)" />
          <circle r="5" fill="#1a1a1a" stroke="#e2483d" strokeWidth="2" />
          <text x="10" y="-10" fill="rgb(255 255 255 / 0.62)" fontSize="12" fontFamily="var(--font-mono)">
            {n.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
