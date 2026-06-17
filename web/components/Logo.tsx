// D-market ロゴ（D-swipe ファミリー共有）。ネイビータイル＋シアングラデのD＋スワイプシェブロン。
export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ display: "block" }} aria-hidden>
      <defs>
        <linearGradient id="dmLogo" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0ea5e9" />
          <stop offset="1" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="38" height="38" rx="11" fill="#0b1f3a" />
      <path d="M11 13h6c4 0 7 2.8 7 7s-3 7-7 7h-6z" fill="none" stroke="url(#dmLogo)" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M25 20l6-5m-6 5l6 5" fill="none" stroke="url(#dmLogo)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span style={{ fontWeight: 700, fontSize: 20, letterSpacing: "-.01em" }} className="text-text">
      D-<span className="text-dim font-medium">market</span>
    </span>
  );
}
