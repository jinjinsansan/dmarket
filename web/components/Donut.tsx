// 確率ドーナツ（SVG stroke-dasharray）。pct: 0..100。
const R = 15.5;
const C = 2 * Math.PI * R; // ≈ 97.39

export function Donut({ pct, color, size = 46 }: { pct: number; color: string; size?: number }) {
  const dash = `${(Math.max(0, Math.min(100, pct)) / 100) * C} ${C}`;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 46 46">
        <circle cx="23" cy="23" r={R} fill="none" stroke="var(--surface2)" strokeWidth="5" />
        <circle
          cx="23"
          cy="23"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={dash}
          transform="rotate(-90 23 23)"
        />
      </svg>
      <span
        className="mono"
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          fontSize: size * 0.26,
          fontWeight: 700,
          color,
        }}
      >
        {Math.round(pct)}
      </span>
    </div>
  );
}
