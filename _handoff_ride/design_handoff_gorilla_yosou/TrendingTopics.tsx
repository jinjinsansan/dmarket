"use client";
// 注目のトピック（背景b：淡グレープ＋グレープのヘッダー帯）。
// 行頭は YES%ミニリング（緑=YES寄り / 赤=NO寄り）。トップ右カラムに配置。
import Link from "next/link";

type Topic = { id: string; question: string; yesPct: number };

export function TrendingTopics({ topics }: { topics: Topic[] }) {
  return (
    <section
      style={{
        background: "var(--primary-weak)",
        border: "1px solid #E0D2FA",
        borderRadius: 18,
        boxShadow: "var(--shadow)",
        overflow: "hidden",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "13px 18px",
          background: "var(--primary)",
        }}
      >
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 17l6-6 4 4 8-8" />
        </svg>
        <span style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>注目のトピック</span>
      </header>

      <ol style={{ listStyle: "none", margin: 0, padding: "8px 18px 14px" }}>
        {topics.map((t, i) => (
          <li key={t.id}>
            <Link
              href={`/market/${t.id}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                padding: "7px 0",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <span className="mono" style={{ width: 14, color: "var(--primary)", opacity: 0.6, fontSize: 12, fontWeight: 700 }}>
                {i + 1}
              </span>
              <ProbRing pct={t.yesPct} />
              <span style={{ flex: 1, fontSize: 13, color: "var(--text)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t.question}
              </span>
              <span className="mono" style={{ fontSize: 13, fontWeight: 800, color: "var(--primary)" }}>
                {t.yesPct}%
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

// YES確率リング。track は白（淡グレープ地で抜けが良い）。50%以上は緑、未満は赤。
function ProbRing({ pct }: { pct: number }) {
  const C = 94.2; // 2πr (r=15)
  const offset = C * (1 - pct / 100);
  const color = pct >= 50 ? "var(--pos)" : "var(--neg)";
  return (
    <svg viewBox="0 0 36 36" width="26" height="26" style={{ flexShrink: 0 }} aria-hidden>
      <circle cx="18" cy="18" r="15" fill="none" stroke="#fff" strokeWidth="5" />
      <circle
        cx="18"
        cy="18"
        r="15"
        fill="none"
        stroke={color}
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={C}
        strokeDashoffset={offset}
        transform="rotate(-90 18 18)"
      />
    </svg>
  );
}
