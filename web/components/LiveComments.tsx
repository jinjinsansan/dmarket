"use client";
// ライブコメント。新着が上（or 下）に自動追加されて流れる想定。アバター枠＋Lv章＋本文で熱量を出す。
// AvatarFrame を再利用（称号ランクの枠）。
import { AvatarFrame, rankBadgeStyle, RANK_META, type RankLevel } from "./AvatarFrame";

export type LiveComment = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  level: RankLevel;
  text: string;
  side?: "yes" | "no";
  isNew?: boolean;   // 直近追加分（フェードイン）
};

export function LiveComments({ comments, title = "ライブコメント" }: { comments: LiveComment[]; title?: string }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <span style={{ width: 5, height: 5, borderRadius: 999, background: "var(--neg)", animation: "gpBlink 1.4s infinite" }} />
        <span style={{ fontSize: 12, fontWeight: 800, color: "var(--text)" }}>{title}</span>
        <span style={{ fontSize: 10, color: "var(--dim)", marginLeft: "auto" }}>流れ続ける</span>
      </div>

      {comments.length === 0 ? (
        <div style={{ textAlign: "center", padding: "18px 0", color: "var(--dim)" }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>まだコメントはありません</div>
          <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 3 }}>最初の一言を投げよう🦍</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {comments.map((c) => (
            <div key={c.id} className={c.isNew ? "dm-in" : undefined} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <AvatarFrame level={c.level} size={26} name={c.name} avatarUrl={c.avatarUrl} />
              <span style={{ fontSize: 11.5, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <b>{c.name}</b>
                {c.side && (
                  <span style={{ ...rankBadgeStyle(c.level), color: c.side === "yes" ? "var(--pos)" : "var(--neg)", background: c.side === "yes" ? "var(--pos-weak)" : "var(--neg-weak)", margin: "0 5px" }}>
                    {c.side === "yes" ? "YES" : "NO"}
                  </span>
                )}{" "}
                {c.text}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
