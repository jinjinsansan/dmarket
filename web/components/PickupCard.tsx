"use client";
// トップの主役 PickupCard。通常市場（YES/NO確率）とスポーツ（チーム対戦）の2レイアウト。
// スパークライン＋大きな2ボタン（YESに乗る/NOに乗る）＋簡易金額＋シェア。既存トークンのみ。
import { useState } from "react";

type Point = number; // 0..100 の確率系列（yes側）
type Base = {
  category: string;
  spark: Point[];              // ミニチャート用（yes%系列）
  yesPrice: number;            // ¢ (0-100)
  onBet?: (side: "yes" | "no", amount: number) => void;
  onShare?: () => void;
};
type QuestionProps = Base & {
  kind: "question";
  question: string;
  yesPct: number;              // 大きく出す確率
  deltaPct?: number;           // ▲/▼ 変化
};
type MatchProps = Base & {
  kind: "match";
  home: { name: string; short: string; color: string; pct: number; price: number };
  away: { name: string; short: string; color: string; pct: number; price: number };
  score?: string;              // "3-2"
  phase?: string;              // "6回裏"
};

export function PickupCard(p: QuestionProps | MatchProps) {
  const [amount, setAmount] = useState(100);
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, boxShadow: "var(--shadow)", padding: 18, display: "flex", flexDirection: "column", flex: 1 }}>
      {p.kind === "question" ? <QuestionBody p={p} /> : <MatchBody p={p} />}

      {/* 金額＋シェア（共通） */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 11, padding: "0 12px" }}>
          <input
            className="mono"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(Math.max(0, parseInt(e.target.value.replace(/\D/g, "") || "0", 10)))}
            style={{ flex: 1, textAlign: "right", fontSize: 16, fontWeight: 800, color: "var(--text)", padding: "9px 0", background: "transparent", border: "none", outline: "none", width: "100%" }}
          />
          <span style={{ fontSize: 11, color: "var(--dim)", marginLeft: 5 }}>pt</span>
        </div>
        <button onClick={p.onShare} aria-label="シェア" style={{ width: 44, height: 40, display: "grid", placeItems: "center", background: "var(--primary-weak)", borderRadius: 11, color: "var(--primary)", border: "none", cursor: "pointer" }}>
          <XIcon />
        </button>
      </div>
    </div>
  );

  function QuestionBody({ p }: { p: QuestionProps }) {
    const up = (p.deltaPct ?? 0) >= 0;
    return (
      <>
        <div style={{ fontSize: 11, fontWeight: 800, color: "var(--primary)", marginBottom: 10 }}>{p.category}</div>
        <h2 style={{ fontSize: 20, fontWeight: 900, color: "var(--text)", margin: 0, lineHeight: 1.4 }}>{p.question}</h2>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, margin: "16px 0 4px" }}>
          <div className="mono" style={{ fontSize: 52, fontWeight: 800, color: "var(--primary)", lineHeight: 0.82 }}>{p.yesPct}<span style={{ fontSize: 26 }}>%</span></div>
          {p.deltaPct != null && (
            <div style={{ paddingBottom: 5 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: up ? "var(--pos)" : "var(--neg)" }}>{up ? "▲" : "▼"} {Math.abs(p.deltaPct)}%</span>
              <div style={{ fontSize: 10, color: "var(--dim)" }}>が「起きる」</div>
            </div>
          )}
        </div>
        <Spark data={p.spark} color="var(--primary)" fill />
        <div style={{ display: "flex", gap: 10, marginTop: "auto", paddingTop: 12 }}>
          <BetButton label="YESに乗る" price={p.yesPrice} solid onClick={() => p.onBet?.("yes", amount)} tone="pos" />
          <BetButton label="NOに乗る" price={100 - p.yesPrice} onClick={() => p.onBet?.("no", amount)} tone="neg" />
        </div>
      </>
    );
  }

  function MatchBody({ p }: { p: MatchProps }) {
    return (
      <>
        <h2 style={{ fontSize: 15, fontWeight: 800, color: "var(--dim)", margin: "0 0 14px", textAlign: "center" }}>どっちが勝つ？</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <TeamCol t={p.home} tone="pos" />
          <div style={{ flexShrink: 0, textAlign: "center" }}>
            {p.score && <div className="mono" style={{ fontSize: 18, fontWeight: 800, color: "var(--text)" }}>{p.score}</div>}
            {p.phase && <div style={{ fontSize: 9, color: "var(--dim)" }}>{p.phase}</div>}
          </div>
          <TeamCol t={p.away} tone="neg" />
        </div>
        <Spark data={p.spark} color="var(--pos)" />
        <div style={{ display: "flex", gap: 10, marginTop: "auto", paddingTop: 12 }}>
          <BetButton label={`${p.home.short}に乗る`} price={p.home.price} solid onClick={() => p.onBet?.("yes", amount)} tone="pos" />
          <BetButton label={`${p.away.short}に乗る`} price={p.away.price} solid onClick={() => p.onBet?.("no", amount)} tone="neg" />
        </div>
      </>
    );
  }
}

function TeamCol({ t, tone }: { t: MatchProps["home"]; tone: "pos" | "neg" }) {
  return (
    <div style={{ flex: 1, textAlign: "center" }}>
      <div style={{ width: 56, height: 56, margin: "0 auto 8px", borderRadius: 16, background: t.color, display: "grid", placeItems: "center", color: "#fff", fontSize: 22, fontWeight: 900 }}>{t.short}</div>
      <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>{t.name}</div>
      <div className="mono" style={{ fontSize: 34, fontWeight: 800, color: `var(--${tone})`, lineHeight: 1, marginTop: 4 }}>{t.pct}<span style={{ fontSize: 16 }}>%</span></div>
    </div>
  );
}

function BetButton({ label, price, solid, tone, onClick }: { label: string; price: number; solid?: boolean; tone: "pos" | "neg"; onClick?: () => void }) {
  const c = `var(--${tone})`;
  return (
    <button onClick={onClick} className="btn-press" style={{
      flex: 1, borderRadius: 14, padding: "14px 0", textAlign: "center", cursor: "pointer",
      background: solid ? c : `var(--${tone}-weak)`,
      color: solid ? "#fff" : c,
      border: solid ? "none" : `1.5px solid ${c}`,
    }}>
      <div style={{ fontSize: 15, fontWeight: 800 }}>{label}</div>
      <div className="mono" style={{ fontSize: 12, opacity: 0.9, marginTop: 1 }}>{price}¢</div>
    </button>
  );
}

// 簡易スパークライン（0..100系列）
function Spark({ data, color, fill }: { data: number[]; color: string; fill?: boolean }) {
  const W = 320, H = fill ? 70 : 46;
  const max = 100, min = 0;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - min) / (max - min)) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const id = `sp${Math.round(data[0] ?? 0)}${data.length}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} style={{ display: "block", margin: "12px 0 4px" }}>
      {fill && (
        <>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity="0.18" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={`${pts.join(" ")} ${W},${H} 0,${H}`} fill={`url(#${id})`} />
        </>
      )}
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function XIcon() {
  return <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor"><path d="M18.9 1.6h3.7l-8.1 9.2L24 22.4h-7.4l-5.8-7.6-6.7 7.6H.5l8.6-9.9L0 1.6h7.6l5.2 6.9 6.1-6.9Zm-1.3 18.6h2L6.5 3.7H4.3l13.3 16.5Z" /></svg>;
}
