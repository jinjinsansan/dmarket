"use client";
// C. 取引時ナッジ（乗っかり中のときだけ表示）
// 配置: 市場詳細のトレードパネル内、CTAボタンの直前。
// 出る条件: ?ref= 経由で乗っかり中（rideActive）かつ シェア元名がある。
import { GorillaFace } from "./GorillaFace";

export function RideNudge({
  referrerName,
  variant = "chip",
}: {
  referrerName?: string | null;
  variant?: "chip" | "caption";
}) {
  const who = referrerName ?? "シェアした人";

  if (variant === "caption") {
    // ボタン直下に置く最小版
    return (
      <p style={{ fontSize: 11, color: "var(--pos)", fontWeight: 700, textAlign: "center", margin: "8px 0 0" }}>
        的中で {who} に +1% 応援ボーナス
      </p>
    );
  }

  // チップ版（CTA直前）
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--pos-weak)", borderRadius: 11, padding: "9px 12px" }}>
      <GorillaFace size={20} expr="win" color="var(--pos)" style={{ flexShrink: 0 }} />
      <span style={{ fontSize: 11.5, color: "var(--text)", lineHeight: 1.45 }}>
        的中すると <b style={{ color: "var(--pos)" }}>{who}</b> に <b>+1%</b> の応援ボーナス
      </span>
    </div>
  );
}
