"use client";
// マイページ上部の「見る」ゾーン：プロフィールヒーロー（グレープ）＋2大通貨ウォレット＋副次スタット。
// 既存 /mypage の冒頭（プロフィールカード＋ステータスgrid）を本コンポーネントに置き換える。
// 色・トークンは現状のまま。構成と重み付けだけの変更。
import { GorillaFace } from "./GorillaFace";
import { AvatarFrame, type RankLevel } from "./AvatarFrame";

type Props = {
  name: string;
  title: string;            // 称号ランク名（例「Lv.5 精鋭」）
  streak: number;
  hitRate: number | null;
  avatarUrl?: string | null;
  balance: number;          // 参加ポイント
  prizeBalance: number;     // ゴリラコイン
  positionsValue: number;   // 評価額
  pnl: number;              // 合計損益
  rankLevel?: RankLevel;    // 称号ランク（枠アバター用）
  xp?: number;              // 現Lv床からの相対XP
  xpForNext?: number;       // 次Lvまでの必要XP
  onClaim?: () => void;
  onEdit?: () => void;
};

export function MyPageHero(p: Props) {
  const showXp = p.rankLevel !== undefined && p.rankLevel < 8 && (p.xpForNext ?? 0) > 0;
  const pct = showXp ? Math.min(100, Math.round(((p.xp ?? 0) / (p.xpForNext as number)) * 100)) : 0;
  return (
    <div className="space-y-3">
      {/* 1) プロフィールヒーロー */}
      <div
        style={{
          background: "linear-gradient(135deg,#2A1B4D,#5a37a8)",
          borderRadius: 20,
          padding: "24px 26px",
          position: "relative",
          overflow: "hidden",
          boxShadow: "var(--shadow)",
        }}
      >
        <GorillaFace
          size={240}
          color="#fff"
          style={{ position: "absolute", right: -40, top: -40, opacity: 0.08 }}
        />
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 14 }}>
          {p.rankLevel !== undefined ? (
            <AvatarFrame level={p.rankLevel} size={66} name={p.name} avatarUrl={p.avatarUrl} />
          ) : (
            <div style={{ width: 64, height: 64, borderRadius: 999, background: "#fff", display: "grid", placeItems: "center", flexShrink: 0, overflow: "hidden", boxShadow: "0 6px 18px -6px rgba(0,0,0,.4)" }}>
              {p.avatarUrl ? <img src={p.avatarUrl} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <GorillaFace size={44} color="var(--primary)" />}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 21, fontWeight: 900, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
            <span style={{ display: "inline-block", marginTop: 5, fontSize: 11.5, fontWeight: 800, color: "#3a2566", background: "var(--accent2)", padding: "3px 11px", borderRadius: 999, whiteSpace: "nowrap" }}>★ {p.title}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,.85)" }}>🔥 連勝 {p.streak}</span>
              {p.hitRate !== null && (
                <>
                  <span style={{ width: 3, height: 3, borderRadius: 999, background: "rgba(255,255,255,.4)" }} />
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,.7)" }}>的中率 {p.hitRate}%</span>
                </>
              )}
              <button onClick={p.onEdit} style={{ fontSize: 11.5, color: "rgba(255,255,255,.65)", textDecoration: "underline", background: "none", border: "none", cursor: "pointer", marginLeft: 4 }}>編集</button>
            </div>
          </div>
        </div>

        {/* 称号ランクのXP進捗（統合） */}
        {showXp ? (
          <div style={{ position: "relative", marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "rgba(255,255,255,.75)", marginBottom: 5 }}>
              <span>次のランクまで</span>
              <span className="mono" style={{ fontWeight: 800, color: "var(--accent2)" }}>{(p.xp ?? 0).toLocaleString()} / {(p.xpForNext ?? 0).toLocaleString()} XP</span>
            </div>
            <div style={{ height: 9, borderRadius: 999, background: "rgba(255,255,255,.16)", overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent2)" }} />
            </div>
          </div>
        ) : p.rankLevel === 8 ? (
          <div style={{ position: "relative", marginTop: 14, fontSize: 12, fontWeight: 800, color: "var(--accent2)" }}>👑 最高ランク到達</div>
        ) : null}

        <button
          onClick={p.onClaim}
          className="btn-press w-full sm:w-auto"
          style={{ position: "relative", marginTop: 16, background: "var(--accent2)", color: "#3a2566", fontSize: 13.5, fontWeight: 800, padding: "12px 20px", borderRadius: 13, border: "none", cursor: "pointer" }}
        >
          デイリー受取
        </button>
      </div>

      {/* 2) 2大通貨ウォレット */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 18, padding: "16px 18px", boxShadow: "var(--shadow)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <BananaIcon />
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--dim)" }}>参加ポイント</span>
          </div>
          <div className="mono" style={{ fontSize: 32, fontWeight: 800, color: "var(--text)", marginTop: 6, lineHeight: 1 }}>
            {p.balance.toLocaleString()}<span style={{ fontSize: 14, color: "var(--dim)", fontWeight: 700 }}> pt</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 5 }}>予想に使う・換金不可</div>
        </div>
        <div style={{ background: "linear-gradient(135deg,var(--primary-weak),#F6F0FF)", border: "1px solid #E0D2FA", borderRadius: 18, padding: "16px 18px", boxShadow: "var(--shadow)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ width: 18, height: 18, borderRadius: 999, background: "var(--grad)", display: "grid", placeItems: "center", color: "#fff", fontSize: 10, fontWeight: 900 }}>G</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--primary)" }}>ゴリラコイン</span>
          </div>
          <div className="mono" style={{ fontSize: 32, fontWeight: 800, color: "var(--primary)", marginTop: 6, lineHeight: 1 }}>
            {p.prizeBalance.toLocaleString()}<span style={{ fontSize: 14, fontWeight: 700 }}> コイン</span>
          </div>
          <a href="/prizes" style={{ fontSize: 11, color: "var(--primary)", opacity: 0.8, marginTop: 5, display: "inline-block", textDecoration: "none" }}>景品と交換 →</a>
        </div>
      </div>

      {/* 3) 副次スタット（軽量チップ） */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
        <MiniStat label="評価額" value={p.positionsValue.toLocaleString()} />
        <MiniStat label="損益" value={`${p.pnl >= 0 ? "+" : ""}${p.pnl.toLocaleString()}`} color={p.pnl >= 0 ? "var(--pos)" : "var(--neg)"} />
        <MiniStat label="的中率" value={p.hitRate === null ? "—" : `${p.hitRate}%`} />
        <MiniStat label="連勝" value={`${p.streak}`} color="var(--primary)" />
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: "var(--surface2)", borderRadius: 13, padding: "11px 12px" }}>
      <div style={{ fontSize: 10, color: "var(--dim)", fontWeight: 700 }}>{label}</div>
      <div className="mono" style={{ fontSize: 17, fontWeight: 800, color: color ?? "var(--text)", marginTop: 2 }}>{value}</div>
    </div>
  );
}

function BananaIcon() {
  return (
    <svg viewBox="0 0 60 60" width="18" height="18" aria-hidden>
      <path d="M12 14 C10 34 24 50 46 49 C49 49 50 46 47 45 C30 44 19 33 19 15 C19 12 13 11 12 14 Z" fill="var(--accent2)" stroke="#C99A0E" strokeWidth="3" />
    </svg>
  );
}

// 称号セクションは横スクロールの見せ場に（任意・既存 badges をそのまま使える）
export function BadgeShowcase({ badges }: { badges: { id: string; name: string; earned: boolean }[] }) {
  const earned = badges.filter((b) => b.earned).length;
  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", gap: 9, margin: "2px 2px 12px" }}>
        <span style={{ width: 4, height: 18, borderRadius: 3, background: "var(--accent2)" }} />
        <span style={{ fontSize: 15, fontWeight: 800, color: "var(--text)" }}>実績バッジ</span>
        <span style={{ fontSize: 11, color: "var(--dim)", marginLeft: "auto" }}>{earned} / {badges.length}</span>
      </div>
      <div className="hide-scrollbar" style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 2 }}>
        {badges.map((b, i) => (
          <div key={b.id} style={{ flexShrink: 0, width: 84, textAlign: "center", opacity: b.earned ? 1 : 0.45 }}>
            <div style={{ width: 84, height: 84, borderRadius: 16, background: b.earned ? "var(--grad)" : "var(--faint)", display: "grid", placeItems: "center", color: "#fff", fontSize: 26, boxShadow: b.earned && i === 0 ? "var(--cta-glow)" : "none" }}>★</div>
            <div style={{ fontSize: 10, color: b.earned ? "var(--text)" : "var(--dim)", marginTop: 5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.name}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
