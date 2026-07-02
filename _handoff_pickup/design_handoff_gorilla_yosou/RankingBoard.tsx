"use client";
// ランキング（刷新版）: 予想スコア + シーズン制リーグ + カテゴリ王。
// データはサーバー(RPC)から渡す前提。色・トークンは既存のみ。
// 参照: reference/proposal.html 「13 — ランキング刷新」
import { GorillaFace } from "./GorillaFace";

/* ───────── 型 ───────── */
export type Tier = "oracle" | "platinum" | "gold" | "silver" | "bronze";

export type RankRow = {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  isYou?: boolean;
  rank: number;
  score: number;        // 予想スコア（下記 spec 参照）
  hit: number;          // 的中数
  total: number;        // 判定済み予想数
  tier: Tier;
  crown?: boolean;      // 👑 ゴリラ王
  note?: string;        // 「難問王」等の称号（任意）
};

export type MyRank = {
  rank: number;
  percentile: number;   // 上位 X%
  delta: number;        // 順位変動（+上昇 / -下降）
  tier: Tier;
  score: number;
  hit: number;
  total: number;
  nextTier: Tier | null;      // 昇格先（最上位なら null）
  toPromote: number | null;   // 昇格まで残りスコア
  promoteProgress: number;    // 0..1
};

/* ───────── ティア定義 ───────── */
export const TIER_META: Record<Tier, { label: string; color: string; emoji?: string; range: string }> = {
  oracle:   { label: "ゴリラ王", color: "#8a6d0c", emoji: "👑", range: "上位1名" },
  platinum: { label: "プラチナ", color: "var(--primary)", range: "上位5%" },
  gold:     { label: "ゴールド", color: "#F4BE1F", range: "上位20%" },
  silver:   { label: "シルバー", color: "#94a3b8", range: "上位50%" },
  bronze:   { label: "ブロンズ", color: "#cd7f32", range: "見習い〜" },
};

const MEDAL = ["#eab308", "#94a3b8", "#cd7f32"]; // 1,2,3位

/* ───────── メイン ───────── */
export function RankingBoard({
  season, endsIn, tab, onTab, me, rows, promoteCutoff = 5,
}: {
  season: number;
  endsIn: string;            // "3日 12:04" 等（サーバー整形 or クライアント計算）
  tab: "week" | "all" | "category";
  onTab: (t: "week" | "all" | "category") => void;
  me: MyRank;
  rows: RankRow[];
  promoteCutoff?: number;    // 昇格ラインの順位（この順位の後に区切りを入れる）
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <h2 style={{ fontSize: 22, fontWeight: 900, color: "var(--text)", margin: 0 }}>ランキング</h2>
        <span style={{ fontSize: 11, fontWeight: 800, color: "var(--primary)", background: "var(--primary-weak)", padding: "3px 10px", borderRadius: 999 }}>SEASON {season}</span>
        <span className="mono" style={{ marginLeft: "auto", fontSize: 11, color: "var(--dim)" }}>残り {endsIn}</span>
      </div>

      {/* tabs */}
      <div style={{ display: "flex", gap: 4, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 4 }}>
        {([["week", "今週"], ["all", "通算"], ["category", "カテゴリ別"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => onTab(k)} style={segStyle(tab === k)}>{label}</button>
        ))}
      </div>

      {/* your rank hero */}
      <MyRankHero me={me} />

      {/* list */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: "var(--text)" }}>今週のトップ</span>
          <span style={{ fontSize: 10, color: "var(--dim)", marginLeft: "auto" }}>予想スコア順</span>
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, boxShadow: "var(--shadow)", overflow: "hidden" }}>
          {rows.map((r, i) => (
            <div key={r.userId}>
              <RankRowItem row={r} />
              {i + 1 === promoteCutoff && <PromoteDivider />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* あなたの順位ヒーロー */
function MyRankHero({ me }: { me: MyRank }) {
  const t = TIER_META[me.tier];
  const up = me.delta >= 0;
  return (
    <div style={{ background: "linear-gradient(135deg,#2A1B4D,#5a37a8)", borderRadius: 18, padding: "16px 18px", position: "relative", overflow: "hidden", boxShadow: "var(--shadow)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <TierBadge tier={me.tier} size={58} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.7)" }}>あなたの順位</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span className="mono" style={{ fontSize: 30, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{me.rank}<span style={{ fontSize: 14, color: "rgba(255,255,255,.7)" }}>位</span></span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 12, fontWeight: 800, color: up ? "#5ff0b0" : "#ff9b8c" }}>
              <Caret up={up} />{Math.abs(me.delta)}
            </span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,.6)" }}>上位 {me.percentile}%</span>
          </div>
        </div>
      </div>
      {me.nextTier && me.toPromote !== null && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(255,255,255,.75)", marginBottom: 5 }}>
            <span>{TIER_META[me.nextTier].label}昇格まで</span>
            <span className="mono" style={{ fontWeight: 800, color: "var(--accent2)" }}>あと {me.toPromote} pt</span>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,.16)", overflow: "hidden" }}>
            <div style={{ width: `${Math.round(me.promoteProgress * 100)}%`, height: "100%", background: "var(--accent2)" }} />
          </div>
        </div>
      )}
    </div>
  );
}

function RankRowItem({ row: r }: { row: RankRow }) {
  const medal = r.rank <= 3 ? MEDAL[r.rank - 1] : null;
  const t = TIER_META[r.tier];
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 11, padding: "11px 14px",
      borderBottom: "1px solid var(--border)",
      background: r.isYou ? "var(--primary-weak)" : medal ? `linear-gradient(90deg,${hexA(medal, 0.1)},transparent)` : "transparent",
    }}>
      {medal ? (
        <span className="mono" style={{ width: 22, height: 22, borderRadius: 7, background: medal, color: "#fff", fontSize: 12, fontWeight: 800, display: "grid", placeItems: "center", flexShrink: 0 }}>{r.rank}</span>
      ) : (
        <span className="mono" style={{ width: 22, textAlign: "center", color: r.isYou ? "var(--primary)" : "var(--dim)", fontSize: 12, fontWeight: r.isYou ? 800 : 400, flexShrink: 0 }}>{r.rank}</span>
      )}
      <div style={{ width: 32, height: 32, borderRadius: 999, background: r.isYou ? "var(--primary)" : "var(--surface2)", display: "grid", placeItems: "center", flexShrink: 0, overflow: "hidden", color: r.isYou ? "#fff" : "var(--dim)", fontSize: 13, fontWeight: 800 }}>
        {r.avatarUrl ? <img src={r.avatarUrl} alt={r.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : r.name.slice(0, 1)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: r.isYou ? "var(--primary)" : "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
          {r.crown && <span style={{ fontSize: 8, fontWeight: 800, color: "#8a6d0c", background: "var(--banana-weak)", padding: "1px 6px", borderRadius: 5, whiteSpace: "nowrap" }}>👑 ゴリラ王</span>}
          {!r.crown && r.isYou && <span style={{ fontSize: 8, fontWeight: 800, color: "var(--primary)", background: "#fff", padding: "1px 6px", borderRadius: 5 }}>{t.label}</span>}
        </div>
        <div style={{ fontSize: 10, color: "var(--dim)" }}>的中 {r.hit}/{r.total}{r.note ? ` ・ ${r.note}` : ""}</div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div className="mono" style={{ fontSize: 16, fontWeight: 800, color: r.isYou ? "var(--primary)" : "var(--text)" }}>{r.score.toLocaleString()}</div>
        <div style={{ fontSize: 9, color: "var(--dim)" }}>スコア</div>
      </div>
    </div>
  );
}

function PromoteDivider() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 14px", background: "var(--pos-weak)" }}>
      <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="var(--pos)" strokeWidth="3"><path d="M18 15l-6-6-6 6" /></svg>
      <span style={{ fontSize: 9, fontWeight: 800, color: "var(--pos)" }}>ここまで昇格</span>
    </div>
  );
}

/* 六角形ティア章 */
export function TierBadge({ tier, size = 58 }: { tier: Tier; size?: number }) {
  const t = TIER_META[tier];
  return (
    <div style={{ width: size, height: size, flexShrink: 0, position: "relative", display: "grid", placeItems: "center" }}>
      <svg viewBox="0 0 60 60" width={size} height={size}>
        <polygon points="30,3 54,16 54,44 30,57 6,44 6,16" fill="rgba(255,255,255,.12)" stroke={t.emoji ? "var(--accent2)" : t.color} strokeWidth="2.5" />
      </svg>
      <div style={{ position: "absolute", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <span style={{ fontSize: size * 0.33, lineHeight: 1 }}>{t.emoji ?? "🦍"}</span>
        <span style={{ fontSize: size * 0.14, fontWeight: 800, color: t.emoji ? "var(--accent2)" : "#fff", marginTop: 1, textTransform: "uppercase" }}>{tier}</span>
      </div>
    </div>
  );
}

/* カテゴリ王カード */
export function CategoryChampion({
  icon, name, entrants, leader, accent = "var(--primary-weak)",
}: {
  icon: string; name: string; entrants: number;
  leader: { name: string; score: number; avatarUrl?: string | null; isYou?: boolean; crown?: boolean };
  accent?: string;
}) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, boxShadow: "var(--shadow)", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "13px 15px", background: `linear-gradient(90deg,${accent},transparent)` }}>
        <span style={{ width: 38, height: 38, borderRadius: 11, background: "var(--surface)", border: "1px solid var(--border)", display: "grid", placeItems: "center", flexShrink: 0, fontSize: 18 }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>{name}</div>
          <div style={{ fontSize: 10.5, color: "var(--dim)" }}>{entrants}人が参戦中</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: 999, background: leader.isYou ? "var(--primary)" : "var(--surface2)", display: "grid", placeItems: "center", color: leader.isYou ? "#fff" : "var(--dim)", fontSize: 12, fontWeight: 800, overflow: "hidden" }}>
            {leader.avatarUrl ? <img src={leader.avatarUrl} alt={leader.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : leader.name.slice(0, 1)}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: leader.isYou ? "var(--primary)" : "var(--text)" }}>{leader.name}{leader.crown ? " 👑" : ""}</div>
            <div className="mono" style={{ fontSize: 10, color: "var(--primary)", fontWeight: 800 }}>{leader.score.toLocaleString()}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────── 小物 ───────── */
function segStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1, textAlign: "center", fontSize: 12.5, fontWeight: active ? 800 : 700,
    color: active ? "var(--text)" : "var(--dim)", padding: "7px 0", borderRadius: 9, border: "none", cursor: "pointer",
    background: active ? "var(--surface)" : "transparent",
    boxShadow: active ? "0 1px 2px rgba(0,0,0,.06)" : "none",
  };
}
function Caret({ up }: { up: boolean }) {
  return <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor">{up ? <path d="M12 5l7 9H5z" /> : <path d="M12 19l-7-9h14z" />}</svg>;
}
function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
