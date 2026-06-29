// カード用ミニ折れ線（§3.8A）。価格推移を小さく可視化。data は確率(0..1)の配列。
export function Sparkline({ data, color, width = 72, height = 22, fluid = false }: {
  data: number[]; color: string; width?: number; height?: number; fluid?: boolean;
}) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pad = 2;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - pad - ((v - min) / range) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const up = data[data.length - 1] >= data[0];
  const stroke = up ? "var(--pos)" : "var(--neg)";
  return (
    <svg width={fluid ? "100%" : width} height={height} viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={fluid ? "none" : undefined} className="overflow-visible block" aria-hidden>
      <polyline points={pts} fill="none" stroke={color || stroke} strokeWidth={fluid ? "2.5" : "1.5"}
        strokeLinecap="round" strokeLinejoin="round" opacity="0.9" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
