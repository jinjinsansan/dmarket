"use client";
// 空 / ローディング / エラー の状態表示（ゴリラ付き）。
// 参照: reference/proposal.html ⑤「空・ローディング・エラー状態」
import { GorillaFace } from "./GorillaFace";

/* ── 空状態 ── */
export function EmptyState({
  title = "まだ予想がありません",
  body = "気になるお題に乗ってみよう",
  actionLabel,
  onAction,
}: {
  title?: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div style={wrap}>
      <GorillaFace size={78} color="var(--faint)" />
      <div style={titleStyle}>{title}</div>
      <p style={bodyStyle}>{body}</p>
      {actionLabel && (
        <button onClick={onAction} className="btn-press" style={primaryBtn}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/* ── エラー状態 ── */
export function ErrorState({
  title = "うまく読み込めませんでした",
  body = "時間をおいて再度お試しください",
  onRetry,
}: {
  title?: string;
  body?: string;
  onRetry?: () => void;
}) {
  return (
    <div style={wrap}>
      <GorillaFace size={78} expr="sad" color="var(--neg)" />
      <div style={titleStyle}>{title}</div>
      <p style={bodyStyle}>{body}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-press" style={softBtn}>
          再読み込み
        </button>
      )}
    </div>
  );
}

/* ── ローディング（ゴリラ＋スケルトン）── */
export function LoadingState() {
  return (
    <div style={{ ...card, padding: "26px 20px" }}>
      <div style={{ textAlign: "center" }}>
        <GorillaFace size={60} color="var(--faint)" />
        <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--dim)", marginTop: 8 }}>読み込み中…</div>
      </div>
      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 9 }}>
        <Skeleton style={{ height: 14, width: "70%" }} />
        <Skeleton style={{ height: 34 }} />
        <div style={{ display: "flex", gap: 8 }}>
          <Skeleton style={{ height: 30, flex: 1 }} />
          <Skeleton style={{ height: 30, flex: 1 }} />
        </div>
      </div>
    </div>
  );
}

// スケルトン（shimmer は globals.css の .sk を使うか、下の inline keyframes）
export function Skeleton({ style }: { style?: React.CSSProperties }) {
  return <div className="sk" style={{ borderRadius: 8, ...style }} />;
}

const wrap: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 20,
  padding: "26px 20px",
  textAlign: "center",
  boxShadow: "var(--shadow)",
};
const card: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 20,
  boxShadow: "var(--shadow)",
};
const titleStyle: React.CSSProperties = { fontSize: 13.5, fontWeight: 800, color: "var(--text)", marginTop: 14 };
const bodyStyle: React.CSSProperties = { fontSize: 11.5, color: "var(--dim)", margin: "6px 0 14px", lineHeight: 1.5 };
const primaryBtn: React.CSSProperties = {
  fontSize: 12, fontWeight: 800, color: "#fff", background: "var(--primary)",
  padding: "9px 20px", borderRadius: 11, border: "none", cursor: "pointer",
};
const softBtn: React.CSSProperties = {
  fontSize: 12, fontWeight: 800, color: "var(--primary)", background: "var(--primary-weak)",
  padding: "9px 20px", borderRadius: 11, border: "none", cursor: "pointer",
};
