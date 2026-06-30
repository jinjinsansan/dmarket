// ゴリラコイン アイコン（バナナ金のコイン＋ゴリラ顔）。賞金ポイント＝ゴリラコインの表示に使用。
export function CoinIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden style={{ display: "block" }}>
      <circle cx="20" cy="20" r="18" fill="#F4BE1F" stroke="#C99A0E" strokeWidth="2" />
      <circle cx="20" cy="20" r="13.5" fill="none" stroke="#C99A0E" strokeWidth="1.4" opacity="0.45" />
      <g fill="none" stroke="#7a5c08" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 11 C14.5 11 11.5 15 11.5 20 C11.5 25.5 15 29.5 20 29.5 C25 29.5 28.5 25.5 28.5 20 C28.5 15 25.5 11 20 11 Z" />
        <path d="M15 18 Q20 15.2 25 18" />
        <circle cx="17" cy="21" r="1.2" fill="#7a5c08" stroke="none" />
        <circle cx="23" cy="21" r="1.2" fill="#7a5c08" stroke="none" />
        <path d="M16.5 24.6 Q20 22.8 23.5 24.6 Q25 27 22.6 28.6 Q20 29.7 17.4 28.6 Q15 27 16.5 24.6 Z" />
      </g>
    </svg>
  );
}
