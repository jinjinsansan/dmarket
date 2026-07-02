"use client";
// トップページ組み立て例。/（ホーム）を丸ごとこの構成に。
// LiveBar → PickupCard(主役) → NextPickup → LiveComments → QuietNav。
// data はサーバー/SWR/Realtime から供給する前提のダミー結線。
import { LiveBar } from "./LiveBar";
import { PickupCard } from "./PickupCard";
import { NextPickup } from "./NextPickup";
import { LiveComments, type LiveComment } from "./LiveComments";
import { QuietNav } from "./QuietNav";

type PickupData =
  | { kind: "question"; category: string; question: string; yesPct: number; deltaPct: number; yesPrice: number; spark: number[] }
  | { kind: "match"; sport: string; home: any; away: any; score?: string; phase?: string; yesPrice: number; spark: number[] };

export function PickupTop({
  live, closesAt, participants, liveLabel,
  pickup, next, comments, holdingCount, holdings,
}: {
  live: boolean;
  closesAt?: string | number | Date;
  participants: number;
  liveLabel?: string;
  pickup: PickupData | null;
  next: { at: string | number | Date; timeLabel: string; title: string; emoji?: string } | null;
  comments: LiveComment[];
  holdingCount: number;
  holdings?: { id: string; label: string; side: "yes" | "no"; pnl: number }[];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg)" }}>
      <div style={{ padding: "6px 12px 0" }}>
        <LiveBar mode={live ? "live" : "countdown"} closesAt={closesAt} liveLabel={liveLabel} participants={participants} />
      </div>

      {/* brand row */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "12px 16px 8px" }}>
        <span style={{ fontSize: 15, fontWeight: 900, color: "var(--text)" }}>ゴリラ予想</span>
        <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 800, color: "var(--accent2)", background: "var(--banana-weak)", padding: "3px 10px", borderRadius: 999 }}>★ 今のピックアップ</span>
      </div>

      <div style={{ flex: 1, overflow: "hidden", padding: "0 16px", display: "flex", flexDirection: "column" }}>
        {pickup ? (
          <PickupCard {...(pickup as any)} />
        ) : (
          <PickupFallback />
        )}
        {next && <div style={{ marginTop: 11 }}><NextPickup nextAt={next.at} timeLabel={next.timeLabel} title={next.title} emoji={next.emoji} /></div>}
        <div style={{ marginTop: 11 }}><LiveComments comments={comments} /></div>
      </div>

      <QuietNav holdingCount={holdingCount} holdings={holdings} />
    </div>
  );
}

function PickupFallback() {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, boxShadow: "var(--shadow)", padding: 18, flex: 1, display: "grid", placeItems: "center", textAlign: "center" }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>まもなく次のピックアップ</div>
        <p style={{ fontSize: 11, color: "var(--dim)", margin: "5px 0 12px" }}>準備中です。先に他の市場を見てみる？</p>
        <a href="/markets" style={{ fontSize: 12, fontWeight: 800, color: "var(--primary)", background: "var(--primary-weak)", padding: "9px 20px", borderRadius: 11, textDecoration: "none" }}>すべての市場を見る</a>
      </div>
    </div>
  );
}
