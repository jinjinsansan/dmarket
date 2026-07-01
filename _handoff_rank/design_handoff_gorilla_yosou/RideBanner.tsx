"use client";
// A. 乗っかり 帰属バナー（乗った人＝リダー向け）
// 配置: 市場詳細ページ /market/[id] の質問見出し直下。
// 出る条件: ?ref= 経由で来訪し、その紹介者が実在する他ユーザーのとき。
// referrerName が取れない場合はフォールバック文言。閉じるとセッション内は再表示しない。
import { useState } from "react";
import { GorillaFace } from "./GorillaFace";

export function RideBanner({
  marketId,
  referrerName,
}: {
  marketId: string;
  referrerName?: string | null;
}) {
  const [closed, setClosed] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(`gp-ride-banner-${marketId}`) === "1";
  });
  if (closed) return null;

  const close = () => {
    sessionStorage.setItem(`gp-ride-banner-${marketId}`, "1");
    setClosed(true);
  };

  return (
    <div
      role="note"
      style={{
        background: "var(--primary-weak)",
        border: "1px solid #D9C7F7",
        borderRadius: 14,
        padding: "13px 14px",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <GorillaFace size={32} expr="win" color="var(--primary)" style={{ flexShrink: 0 }} />
      <p style={{ flex: 1, margin: 0, fontSize: 13, color: "var(--text)", lineHeight: 1.55 }}>
        {referrerName ? (
          <>
            <b style={{ color: "var(--primary)" }}>{referrerName}</b>
            さんのシェアから来ました！あなたが的中すると、{referrerName}さんにも
            <b>応援ボーナス（+1%）</b>が入ります。
          </>
        ) : (
          <>
            シェアから来ました！あなたが的中すると、シェアした人に<b>応援ボーナス（+1%）</b>が入ります。
          </>
        )}
        <span style={{ color: "var(--dim)" }}> あなたの取り分は減りません。</span>
      </p>
      <button
        onClick={close}
        aria-label="閉じる"
        style={{ flexShrink: 0, alignSelf: "flex-start", background: "none", border: "none", color: "var(--faint)", fontSize: 18, lineHeight: 1, cursor: "pointer", padding: 2 }}
      >
        ×
      </button>
    </div>
  );
}
