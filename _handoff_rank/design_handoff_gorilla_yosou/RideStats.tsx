"use client";
// B. 乗っかり実績（シェアした人向け）
// 配置: 「貯める」/earn の乗っかりカード（variant="card"）/ マイページ（variant="compact"）。
// データ: my_ride_stats() 的なRPC → { riderCount, totalBonus, recent? }
import { GorillaFace } from "./GorillaFace";

type Recent = { marketTitle: string; bonusPt: number; agoLabel: string };
type Props = {
  riderCount: number;
  totalBonus: number;
  recent?: Recent | null;
  variant?: "card" | "compact";
  onShare?: () => void;
};

export function RideStats({ riderCount, totalBonus, recent, variant = "card", onShare }: Props) {
  // 0件：空状態（card のときのみ専用UI。compact は 0 表示）
  if (variant === "card" && riderCount === 0) {
    return (
      <div style={{ ...card, padding: "24px 18px", textAlign: "center" }}>
        <GorillaFace size={62} expr="neutral" color="var(--faint)" style={{ margin: "0 auto" }} />
        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginTop: 12 }}>まだ乗っかりはありません</div>
        <p style={{ fontSize: 11.5, color: "var(--dim)", margin: "5px 0 14px", lineHeight: 1.5 }}>市場をシェアして広めよう🦍</p>
        <button onClick={onShare} className="btn-press" style={shareBtn}>
          <XIcon /> 市場をシェア
        </button>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div style={{ ...card, padding: "13px 15px", display: "flex", alignItems: "center", gap: 12 }}>
        <GorillaFace size={26} expr="win" color="var(--primary)" style={{ flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)" }}>乗っかり実績</div>
          <div style={{ fontSize: 11, color: "var(--dim)" }}>{riderCount}人が乗ってくれました</div>
        </div>
        <div className="mono" style={{ fontSize: 18, fontWeight: 800, color: "var(--primary)" }}>
          +{totalBonus.toLocaleString()}<span style={{ fontSize: 11 }}> pt</span>
        </div>
      </div>
    );
  }

  // card（実績あり）
  return (
    <div style={{ ...card, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <GorillaFace size={24} expr="win" color="var(--primary)" />
        <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text)" }}>乗っかり実績</span>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1, background: "var(--surface2)", borderRadius: 13, padding: 13 }}>
          <div style={{ fontSize: 11, color: "var(--dim)", fontWeight: 700 }}>乗ってくれた人</div>
          <div className="mono" style={{ fontSize: 26, fontWeight: 800, color: "var(--text)", marginTop: 3 }}>
            {riderCount}<span style={{ fontSize: 13, color: "var(--dim)", fontWeight: 700 }}> 人</span>
          </div>
        </div>
        <div style={{ flex: 1, background: "var(--primary-weak)", borderRadius: 13, padding: 13 }}>
          <div style={{ fontSize: 11, color: "var(--primary)", fontWeight: 700 }}>応援ボーナス累計</div>
          <div className="mono" style={{ fontSize: 26, fontWeight: 800, color: "var(--primary)", marginTop: 3 }}>
            {totalBonus.toLocaleString()}<span style={{ fontSize: 13, fontWeight: 700 }}> pt</span>
          </div>
        </div>
      </div>
      {recent && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 12, paddingTop: 11, borderTop: "1px solid var(--border)" }}>
          <span style={{ fontSize: 11, color: "var(--dim)" }}>直近：</span>
          <span style={{ fontSize: 11.5, color: "var(--text)", flex: 1 }}>
            「{recent.marketTitle}」で <b className="mono" style={{ color: "var(--pos)" }}>+{recent.bonusPt}pt</b>
          </span>
          <span style={{ fontSize: 10.5, color: "var(--faint)" }}>{recent.agoLabel}</span>
        </div>
      )}
      <p style={{ fontSize: 10, color: "var(--faint)", margin: "10px 0 0", lineHeight: 1.5 }}>
        換金不可・無償の参加ポイント。ボーナスは新規発行で、乗ってくれた人の取り分は減りません。
      </p>
    </div>
  );
}

const card: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 16,
  boxShadow: "var(--shadow)",
};
const shareBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 800,
  color: "#fff", background: "var(--primary)", padding: "9px 18px", borderRadius: 11, border: "none", cursor: "pointer",
};
function XIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden>
      <path d="M18.9 1.6h3.7l-8.1 9.2L24 22.4h-7.4l-5.8-7.6-6.7 7.6H.5l8.6-9.9L0 1.6h7.6l5.2 6.9 6.1-6.9Zm-1.3 18.6h2L6.5 3.7H4.3l13.3 16.5Z" />
    </svg>
  );
}
