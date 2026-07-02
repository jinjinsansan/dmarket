"use client";
// 控えめ導線。保有（予想中）の小リスト＋「すべての市場を見る →」。主張しすぎない最下部ナビ。
import Link from "next/link";

export function QuietNav({
  holdingCount, holdings, onSeeAll,
}: {
  holdingCount: number;
  holdings?: { id: string; label: string; side: "yes" | "no"; pnl: number }[];
  onSeeAll?: () => void;
}) {
  return (
    <div style={{ borderTop: "1px solid var(--border)", background: "var(--surface)" }}>
      {holdings && holdings.length > 0 && (
        <div className="hide-scrollbar" style={{ display: "flex", gap: 8, overflowX: "auto", padding: "10px 16px 0" }}>
          {holdings.map((h) => (
            <Link key={h.id} href={`/market/${h.id}`} style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 7, background: "var(--surface2)", borderRadius: 10, padding: "7px 11px", textDecoration: "none" }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: h.side === "yes" ? "var(--pos)" : "var(--neg)" }} />
              <span style={{ fontSize: 11, color: "var(--text)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.label}</span>
              <span className="mono" style={{ fontSize: 11, fontWeight: 800, color: h.pnl >= 0 ? "var(--pos)" : "var(--neg)" }}>{h.pnl >= 0 ? "+" : ""}{h.pnl}</span>
            </Link>
          ))}
        </div>
      )}
      <div style={{ padding: "10px 16px 12px", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: "var(--dim)" }}>予想中 <b className="mono" style={{ color: "var(--text)" }}>{holdingCount}</b></span>
        <Link href="/markets" onClick={onSeeAll} style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 700, color: "var(--primary)", textDecoration: "none" }}>
          すべての市場を見る →
        </Link>
      </div>
    </div>
  );
}
