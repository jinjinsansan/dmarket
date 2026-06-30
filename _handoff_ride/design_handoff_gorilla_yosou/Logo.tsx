// ゴリラ予想 ロゴ。グレープのタイル＋白の線画ゴリラフェイス。currentColor/トークン連動。
export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ display: "block" }} aria-hidden>
      <rect x="1" y="1" width="38" height="38" rx="11" fill="var(--primary)" />
      <g fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {/* 耳 */}
        <circle cx="8" cy="20" r="3.4" />
        <circle cx="32" cy="20" r="3.4" />
        {/* 顔の輪郭 */}
        <path d="M20 7.5 C13 7.5 9 12.5 9 19 C9 27.5 14 33.5 20 33.5 C26 33.5 31 27.5 31 19 C31 12.5 27 7.5 20 7.5 Z" />
        {/* 眉 */}
        <path d="M13 18.5 Q20 15 27 18.5" />
        {/* 目 */}
        <circle cx="16.5" cy="21" r="1.3" fill="#fff" stroke="none" />
        <circle cx="23.5" cy="21" r="1.3" fill="#fff" stroke="none" />
        {/* 鼻（ゴリラの識別点） */}
        <path d="M16 25.5 Q20 23.5 24 25.5 Q26.5 28 23.5 29.8 Q20 31.2 16.5 29.8 Q13.5 28 16 25.5 Z" />
      </g>
    </svg>
  );
}

export function Wordmark() {
  return (
    <span style={{ fontWeight: 800, fontSize: 20, letterSpacing: "-.01em" }} className="text-text">
      ゴリラ<span className="text-primary">予想</span>
    </span>
  );
}
