"use client";
// トップのヒーロー（紫「今日のお題」型のみ）。モバイル=縦積み / デスクトップ=横並びのレスポンシブ。
type Market = { id: string; question: string; yesPct: number; flag?: string };

export function Hero({ daily }: { daily: Market }) {
  return <HeroDaily m={daily} />;
}

/* ── 今日のお題型（グレープ全面） ── */
function HeroDaily({ m }: { m: Market }) {
  return (
    <div className="bg-primary rounded-[24px] overflow-hidden relative flex flex-col md:flex-row items-center gap-6 md:gap-9 p-7 md:px-[46px] md:py-10 text-center md:text-left md:min-h-[280px]"
      style={{ boxShadow: "var(--shadow)" }}>
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(520px 420px at 80% 10%,rgba(255,255,255,.14),rgba(255,255,255,0) 70%)" }} />

      <div className="relative shrink-0 flex flex-col items-center gap-3.5">
        <div className="bg-white text-text text-[13px] font-extrabold px-4 py-2 rounded-[14px]">今日のお題はこれ！🍌</div>
        <div className="w-28 h-28 rounded-full grid place-items-center" style={{ background: "rgba(255,255,255,.14)" }}>
          <GorillaFace size={96} stroke="#fff" eyeFill="#fff" />
        </div>
      </div>

      <div className="relative flex-1 w-full">
        <h1 className="text-[22px] md:text-[30px] font-black text-white leading-[1.4] mb-2">{m.question}</h1>
        <div className="flex items-center gap-2.5 my-3.5 justify-center md:justify-start">
          <span className="text-[12px] font-bold text-white/85 hidden sm:inline">みんなの予想</span>
          <div className="flex-1 max-w-[360px] h-3 rounded-full overflow-hidden flex" style={{ background: "rgba(255,255,255,.25)" }}>
            <div style={{ width: `${m.yesPct}%`, background: "var(--pos)" }} />
            <div className="flex-1" style={{ background: "var(--neg)" }} />
          </div>
          <span className="mono text-[12px] font-extrabold text-white">YES {m.yesPct}%</span>
        </div>
        <div className="flex gap-3 items-center justify-center md:justify-start flex-wrap">
          <a href={`/market/${m.id}?pick=0`} className="bg-pos text-white text-[15px] font-extrabold px-7 py-3 rounded-[13px]">起きる（YES）</a>
          <a href={`/market/${m.id}?pick=1`} className="bg-neg text-white text-[15px] font-extrabold px-7 py-3 rounded-[13px]">起きない（NO）</a>
        </div>
      </div>
    </div>
  );
}

function GorillaFace({ size, stroke, eyeFill, style }: { size: number; stroke: string; eyeFill: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} fill="none" stroke={stroke} strokeWidth={4.4} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <circle cx="16" cy="50" r="9" /><circle cx="84" cy="50" r="9" />
      <path d="M50 14 C30 14 18 27 18 47 C18 71 32 88 50 88 C68 88 82 71 82 47 C82 27 70 14 50 14 Z" />
      <path d="M30 45 Q50 37 70 45" />
      <circle cx="40" cy="52.5" r="2.7" fill={eyeFill} stroke="none" /><circle cx="60" cy="52.5" r="2.7" fill={eyeFill} stroke="none" />
      <path d="M39 64 Q50 59 61 64 Q66 70 60 75 Q50 79 40 75 Q34 70 39 64 Z" />
      <path d="M43 83 Q50 86.5 57 83" />
    </svg>
  );
}
