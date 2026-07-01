"use client";
// 称号ランク＝アバターのフレーム。Lv.1〜8。コメント/ランキング/マイページで共通利用。
// 小さいサイズ(36px)でも識別できるよう、色→縁取り→グラデ→グロー→エンブレムで段階化。
// 色・トークンは既存のみ（medal色 bronze/silver/gold は意味色として許容済み）。
import { GorillaFace } from "./GorillaFace";

export type RankLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const RANK_META: Record<RankLevel, { name: string; short: string; unlock: string }> = {
  1: { name: "新米",       short: "新米",     unlock: "はじめの一歩" },
  2: { name: "見習い",     short: "見習い",   unlock: "予想10回" },
  3: { name: "一人前",     short: "一人前",   unlock: "的中10回" },
  4: { name: "予想士",     short: "予想士",   unlock: "的中率55%以上" },
  5: { name: "精鋭",       short: "精鋭",     unlock: "的中50回" },
  6: { name: "予言者",     short: "予言者",   unlock: "難問を的中" },
  7: { name: "賢者",       short: "賢者",     unlock: "通算スコア上位" },
  8: { name: "ゴリラ神",   short: "ゴリラ神", unlock: "頂点" },
};

// Lv章（コメント名の横などに置くテキストバッジ）の色
export function rankBadgeStyle(level: RankLevel): React.CSSProperties {
  const map: Record<number, [string, string]> = {
    1: ["var(--dim)", "var(--surface2)"],
    2: ["var(--dim)", "var(--surface2)"],
    3: ["#8a6d0c", "var(--banana-weak)"],
    4: ["var(--primary)", "var(--primary-weak)"],
    5: ["var(--primary)", "var(--primary-weak)"],
    6: ["var(--primary)", "var(--primary-weak)"],
    7: ["var(--primary)", "var(--primary-weak)"],
    8: ["#8a6d0c", "var(--banana-weak)"],
  };
  const [color, background] = map[level];
  return { fontSize: 8, fontWeight: 800, color, background, padding: "1px 6px", borderRadius: 5, whiteSpace: "nowrap" };
}

/**
 * アバター＋ランクフレーム。
 * - name/avatarUrl のどちらかで中身を描画（画像優先）。無ければゴリラ線画。
 * - size は「フレーム外径」。コメント=36〜40, リスト=32, マイページ=80 など。
 */
export function AvatarFrame({
  level, size = 40, name, avatarUrl,
}: {
  level: RankLevel; size?: number; name?: string; avatarUrl?: string | null;
}) {
  const ring = ringStyle(level, size);
  const godInner = level === 8;
  const gap = Math.max(1.5, size * 0.04);
  const inner = size * 0.34;

  return (
    <div style={{ width: size, height: size, flexShrink: 0, position: "relative", borderRadius: 999, ...ring.pad, background: ring.bg, boxShadow: ring.glow }}>
      <div style={{ width: "100%", height: "100%", borderRadius: 999, background: "var(--surface)", padding: gap }}>
        <div style={{
          width: "100%", height: "100%", borderRadius: 999, overflow: "hidden", display: "grid", placeItems: "center",
          background: godInner ? "linear-gradient(135deg,#2A1B4D,#5a37a8)" : level >= 4 ? "var(--primary-weak)" : "var(--surface2)",
          color: godInner ? "#fff" : level >= 4 ? "var(--primary)" : "var(--dim)",
          fontSize: size * 0.32, fontWeight: 800,
        }}>
          {avatarUrl ? (
            <img src={avatarUrl} alt={name ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : name ? (
            name.slice(0, 1)
          ) : (
            <GorillaFace size={inner * 2} color={godInner ? "#fff" : level >= 4 ? "var(--primary)" : "var(--dim)"} />
          )}
        </div>
      </div>
      {/* エンブレム */}
      {level === 7 && (
        <span style={{ position: "absolute", bottom: -size * 0.05, right: -size * 0.05, width: size * 0.36, height: size * 0.36, borderRadius: 999, background: "var(--accent2)", border: "2px solid var(--surface)", display: "grid", placeItems: "center", fontSize: size * 0.2 }}>★</span>
      )}
      {level === 8 && (
        <span style={{ position: "absolute", top: -size * 0.16, left: "50%", transform: "translateX(-50%)", fontSize: size * 0.28, lineHeight: 1 }}>👑</span>
      )}
    </div>
  );
}

// レベル→リング見た目
function ringStyle(level: RankLevel, size: number) {
  const t = Math.max(2.5, size * 0.06); // リング厚
  const pad = { padding: t } as React.CSSProperties;
  switch (level) {
    case 1: return { pad, bg: "#cd7f32", glow: "none" };
    case 2: return { pad, bg: "#94a3b8", glow: "none" };
    case 3: return { pad, bg: "#F4BE1F", glow: "none" };
    case 4: return { pad, bg: "var(--primary)", glow: "none" };
    case 5: return { pad, bg: "var(--primary)", glow: "0 0 0 2px var(--accent2)" };
    case 6: return { pad, bg: "conic-gradient(from 210deg,#7B46E3,#9D6BF0,#F4BE1F,#7B46E3)", glow: "0 0 14px -2px rgba(123,70,227,.6)" };
    case 7: return { pad, bg: "conic-gradient(from 210deg,#7B46E3,#9D6BF0,#F4BE1F,#7B46E3)", glow: "0 0 16px -1px rgba(123,70,227,.7)" };
    case 8: return { pad: { padding: t * 1.15 }, bg: "conic-gradient(from 200deg,#F4BE1F,#7B46E3,#9D6BF0,#F4BE1F)", glow: "0 0 20px 0 rgba(244,190,31,.7)" };
  }
}

// 称号ランクの説明（XPの貯め方＋Lv一覧）。マイページで折りたたみ表示。
const XP_THRESHOLDS: Record<RankLevel, number> = { 1: 0, 2: 100, 3: 300, 4: 700, 5: 1500, 6: 3000, 7: 6000, 8: 12000 };
const XP_RULES: { label: string; value: string }[] = [
  { label: "予想が的中", value: "+40" },
  { label: "連続ログイン（毎日）", value: "+10" },
  { label: "コメントにいいね獲得", value: "+5" },
  { label: "Xでシェア（1日1回）", value: "+10" },
  { label: "作った市場が承認", value: "+30" },
  { label: "乗っかりボーナス発生", value: "+15" },
];

export function RankGuide({ level }: { level?: RankLevel }) {
  return (
    <div className="space-y-4">
      <div>
        <div className="text-[13px] font-bold mb-2">XPの貯め方（外してもXPは減りません）</div>
        <div className="grid grid-cols-2 gap-2">
          {XP_RULES.map((r) => (
            <div key={r.label} className="flex items-center justify-between rounded-[10px] border border-border bg-surface2 px-3 py-2">
              <span className="text-[12px] text-dim">{r.label}</span>
              <span className="mono text-[13px] font-extrabold" style={{ color: "var(--primary)" }}>{r.value} XP</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="text-[13px] font-bold mb-2">称号ランク（Lv.1〜8・下がりません）</div>
        <div className="space-y-1.5">
          {(Object.keys(RANK_META).map(Number) as RankLevel[]).map((lv) => (
            <div key={lv} className={`flex items-center gap-3 rounded-[12px] px-3 py-2 ${level === lv ? "border" : ""}`}
              style={level === lv ? { background: "var(--primary-weak)", borderColor: "var(--primary)" } : undefined}>
              <AvatarFrame level={lv} size={36} />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-bold">Lv.{lv} {RANK_META[lv].name}{level === lv ? "（現在）" : ""}</div>
                <div className="text-[11px] text-dim">{RANK_META[lv].unlock}</div>
              </div>
              <div className="mono text-[12px] text-dim shrink-0">{XP_THRESHOLDS[lv].toLocaleString()} XP</div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-faint mt-2">※ Lvは累計XPで決まり、一度上がると下がりません。週次ランキングのティアとは別です。</p>
      </div>
    </div>
  );
}

// マイページのランクヒーロー（大きな枠＋XP進捗）
export function RankHero({
  level, xp, xpForNext, breakdown,
}: {
  level: RankLevel; xp: number; xpForNext: number;
  breakdown?: { label: string; value: string }[];
}) {
  const next = (level < 8 ? (level + 1) : 8) as RankLevel;
  const pct = Math.min(100, Math.round((xp / xpForNext) * 100));
  return (
    <div style={{ background: "linear-gradient(135deg,#2A1B4D,#5a37a8)", borderRadius: 20, padding: 24, boxShadow: "var(--shadow)", position: "relative", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <AvatarFrame level={level} size={80} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.7)" }}>現在のランク</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#fff" }}>Lv.{level} {RANK_META[level].name}</div>
          {level < 8 && <div style={{ fontSize: 11, color: "rgba(255,255,255,.65)", marginTop: 2 }}>次は Lv.{next} {RANK_META[next].name}</div>}
        </div>
      </div>
      {level < 8 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "rgba(255,255,255,.75)", marginBottom: 5 }}>
            <span>次のランクまで</span>
            <span className="mono" style={{ fontWeight: 800, color: "var(--accent2)" }}>{xp.toLocaleString()} / {xpForNext.toLocaleString()} XP</span>
          </div>
          <div style={{ height: 9, borderRadius: 999, background: "rgba(255,255,255,.16)", overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent2)" }} />
          </div>
        </div>
      )}
      {breakdown && (
        <div style={{ display: "flex", gap: 14, marginTop: 14 }}>
          {breakdown.map((b) => (
            <div key={b.label}>
              <div className="mono" style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>{b.value}</div>
              <div style={{ fontSize: 9.5, color: "rgba(255,255,255,.6)" }}>{b.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
