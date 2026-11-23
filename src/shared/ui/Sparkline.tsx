/**
 * Single-series sparkline (no legend needed — the card title names the series).
 * 2px line, recessive area, end marker; values exposed to AT via the label.
 */
export function Sparkline({
  values,
  label,
  className,
}: {
  values: number[];
  label: string;
  className?: string;
}) {
  const w = 120;
  const h = 36;
  const pad = 3;
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map(
    (v, i) =>
      [
        pad + (i * (w - pad * 2)) / (values.length - 1),
        h - pad - ((v - min) / span) * (h - pad * 2),
      ] as const,
  );
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1]!;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={className}
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
    >
      <path d={`${d} L${last[0]},${h} L${pts[0]![0]},${h} Z`} fill="var(--color-brand)" opacity="0.08" />
      <path
        d={d}
        fill="none"
        stroke="var(--color-brand)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={last[0]}
        cy={last[1]}
        r="3"
        fill="var(--color-brand)"
        stroke="var(--color-surface)"
        strokeWidth="2"
      />
    </svg>
  );
}
