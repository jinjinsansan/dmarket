"use client";
// 市場詳細タブ（handoff v2 §5.2）。注文板(LMSR合成) / 保有者 / 取引履歴 / コメント。
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { lmsrCost, lmsrPrice } from "@/lib/lmsr";
import { formatPoints, toCents } from "@/lib/format";
import type { Outcome } from "@/lib/types";

type Tab = "book" | "holders" | "activity" | "comments";
const TABS: [Tab, string][] = [["book", "注文板"], ["holders", "保有者"], ["activity", "取引履歴"], ["comments", "コメント"]];

const AVATAR_COLORS = ["#7b46e3", "#f4be1f", "#e08a2b", "#3fa8b5", "#e0608a", "#6e8bd8"];
const colorOf = (s: string) => AVATAR_COLORS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
const timeAgo = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "たった今";
  if (s < 3600) return `${Math.floor(s / 60)}分前`;
  if (s < 86400) return `${Math.floor(s / 3600)}時間前`;
  return `${Math.floor(s / 86400)}日前`;
};

export function MarketTabs({ marketId, outcomes, bParam, prices }: {
  marketId: string; outcomes: Outcome[]; bParam: number; prices: number[];
}) {
  const [tab, setTab] = useState<Tab>("book");
  return (
    <div className="border border-border bg-surface rounded-[var(--radius)] overflow-hidden" style={{ boxShadow: "var(--shadow)" }}>
      <div className="flex border-b border-border">
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex-1 px-2 py-3 text-[13px] sm:text-sm font-bold whitespace-nowrap border-b-2 -mb-px ${tab === k ? "border-primary text-text" : "border-transparent text-dim hover:text-text"}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === "book" && <OrderBook outcomes={outcomes} bParam={bParam} prices={prices} />}
      {tab === "holders" && <Holders marketId={marketId} outcomes={outcomes} />}
      {tab === "activity" && <Activity marketId={marketId} />}
      {tab === "comments" && <Comments marketId={marketId} />}
    </div>
  );
}

// ── 注文板（LMSRから合成した深さ） ───────────────────────────
function OrderBook({ outcomes, bParam, prices }: { outcomes: Outcome[]; bParam: number; prices: number[] }) {
  if (outcomes.length !== 2) {
    return <div className="p-5 text-dim text-sm">多択市場の板表示は準備中です。</div>;
  }
  const qY = outcomes[0].q, qN = outcomes[1].q;
  const p = prices[0];
  const C0 = lmsrCost([qY, qN], bParam);
  const levels = [0.05, 0.03, 0.02, 0.01, 0.005];

  const asks = levels.map((d) => {
    const t = Math.min(0.99, p + d);
    const qY2 = qN + bParam * Math.log(t / (1 - t));
    const size = Math.max(1, Math.ceil((lmsrCost([qY2, qN], bParam) - C0) * 100));
    return { px: t, size };
  });
  const bids = [0.005, 0.01, 0.02, 0.03, 0.05].map((d) => {
    const t = Math.max(0.01, p - d);
    const qY2 = qN + bParam * Math.log(t / (1 - t));
    const size = Math.max(1, Math.floor((C0 - lmsrCost([qY2, qN], bParam)) * 100));
    return { px: t, size };
  });
  const max = Math.max(...asks.map((a) => a.size), ...bids.map((b) => b.size), 1);

  const Row = ({ px, size, kind }: { px: number; size: number; kind: "ask" | "bid" }) => (
    <div className="relative grid grid-cols-3 gap-2 py-1.5 text-[13px] items-center">
      <div className="absolute right-0 top-0 bottom-0 rounded-[5px] z-0"
        style={{ width: `${(size / max) * 100}%`, background: kind === "ask" ? "var(--neg-weak)" : "var(--pos-weak)" }} />
      <span className="mono relative z-10 font-bold" style={{ color: kind === "ask" ? "var(--neg)" : "var(--pos)" }}>{toCents(px)}</span>
      <span className="mono relative z-10 text-right text-dim">{formatPoints(size)}</span>
      <span className="mono relative z-10 text-right text-faint text-[11.5px]">{kind === "ask" ? "売り" : "買い"}</span>
    </div>
  );

  return (
    <div className="p-4">
      <div className="grid grid-cols-3 gap-2 text-[11px] font-bold text-faint pb-2">
        <span>価格</span><span className="text-right">数量(pt)</span><span className="text-right">深さ</span>
      </div>
      {asks.map((a, i) => <Row key={`a${i}`} {...a} kind="ask" />)}
      <div className="flex items-center justify-between py-2 my-1 border-y border-dashed border-border">
        <span className="text-[11.5px] text-dim font-semibold">YES 中値</span>
        <span className="mono text-[15px] font-bold">{toCents(p)}</span>
      </div>
      {bids.map((b, i) => <Row key={`b${i}`} {...b} kind="bid" />)}
      <p className="text-[11px] text-faint mt-2">※ 取引で価格が連続的に動くため、現在の価格帯ごとの「厚み（深さ）」を表示しています。</p>
    </div>
  );
}

// ── 保有者 ───────────────────────────────────────────────
function Holders({ marketId, outcomes }: { marketId: string; outcomes: Outcome[] }) {
  const [rows, setRows] = useState<{ outcome_id: string; display_name: string; shares: number }[]>([]);
  useEffect(() => {
    createClient().rpc("market_holders", { p_market_id: marketId }).then(({ data }) => setRows(data ?? []));
  }, [marketId]);
  const byOutcome = (oid: string) => rows.filter((r) => r.outcome_id === oid).slice(0, 8);

  return (
    <div className="grid grid-cols-2">
      {outcomes.slice(0, 2).map((o, i) => (
        <div key={o.id} className={`p-4 ${i === 0 ? "border-r border-border" : ""}`}>
          <div className="text-xs font-extrabold mb-2.5" style={{ color: i === 0 ? "var(--pos)" : "var(--neg)" }}>{o.label} 保有者</div>
          {byOutcome(o.id).length === 0 ? <p className="text-dim text-xs">まだいません</p> : byOutcome(o.id).map((h, j) => (
            <div key={j} className="flex items-center gap-2.5 py-1.5">
              <div className="w-7 h-7 rounded-full grid place-items-center text-white text-xs font-bold shrink-0" style={{ background: colorOf(h.display_name) }}>{h.display_name.slice(0, 1)}</div>
              <span className="flex-1 text-[13px] font-semibold truncate">{h.display_name}</span>
              <span className="mono text-[12.5px] text-dim">{formatPoints(Math.round(h.shares))}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── 取引履歴 ─────────────────────────────────────────────
function Activity({ marketId }: { marketId: string }) {
  const [rows, setRows] = useState<{ side: string; size: number; price: number; created_at: string; display_name: string; outcome_label: string }[]>([]);
  useEffect(() => {
    createClient().rpc("market_activity", { p_market_id: marketId }).then(({ data }) => setRows(data ?? []));
  }, [marketId]);
  if (rows.length === 0) return <div className="p-5 text-dim text-sm">まだ取引がありません。</div>;
  return (
    <div className="py-2">
      {rows.map((a, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-t border-border first:border-0">
          <span className="flex-1 text-[13px] min-w-0 truncate">
            <b className="font-bold">{a.display_name}</b> が <span className="font-bold" style={{ color: a.side === "buy" ? "var(--pos)" : "var(--neg)" }}>{a.side === "buy" ? "購入" : "売却"}</span> · {a.outcome_label}
          </span>
          <span className="mono text-[12.5px] text-dim">{formatPoints(Math.round(a.size))}株</span>
          <span className="mono text-[12.5px] font-bold w-10 text-right">{a.price != null ? toCents(a.price) : "—"}</span>
          <span className="text-[11px] text-faint w-14 text-right">{timeAgo(a.created_at)}</span>
        </div>
      ))}
    </div>
  );
}

// ── コメント ─────────────────────────────────────────────
function Comments({ marketId }: { marketId: string }) {
  const [list, setList] = useState<{ id: number; body: string; created_at: string; display_name: string; like_count: number; liked: boolean }[]>([]);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await createClient().rpc("market_comments", { p_market_id: marketId });
    setList(data ?? []);
  }, [marketId]);
  useEffect(() => { load(); }, [load]);

  async function post() {
    const t = text.trim(); if (!t) return;
    const { error } = await createClient().rpc("post_comment", { p_market_id: marketId, p_body: t });
    if (error) { setMsg(error.message === "not_authenticated" ? "コメントするにはログインしてください" : "投稿に失敗しました"); return; }
    setText(""); setMsg(null); load();
  }
  async function like(id: number) {
    const { error } = await createClient().rpc("toggle_comment_like", { p_comment_id: id });
    if (error) { setMsg("いいねにはログインが必要です"); return; }
    load();
  }

  return (
    <div className="p-4">
      <div className="flex gap-2.5 mb-4">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="コメントを書く / Add a comment"
          className="flex-1 h-10 px-3 border border-border bg-surface2 rounded-[10px] text-base md:text-[13.5px] outline-none focus:border-primary" />
        <button onClick={post} className="font-bold text-[13px] px-4 rounded-[10px] text-white" style={{ background: "var(--grad)" }}>投稿</button>
      </div>
      {msg && <p className="text-xs text-dim mb-3">{msg}</p>}
      {list.length === 0 ? <p className="text-dim text-sm">まだコメントがありません。最初の一言を。</p> : list.map((c) => (
        <div key={c.id} className="flex gap-3 py-3 border-t border-border first:border-0">
          <div className="w-8 h-8 rounded-full grid place-items-center text-white text-[13px] font-bold shrink-0" style={{ background: colorOf(c.display_name) }}>{c.display_name.slice(0, 1)}</div>
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] mb-0.5"><b className="font-bold">{c.display_name}</b> <span className="text-faint">· {timeAgo(c.created_at)}</span></div>
            <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap break-words">{c.body}</p>
            <button onClick={() => like(c.id)} className={`inline-flex items-center gap-1.5 mt-1.5 text-xs font-semibold ${c.liked ? "text-primary" : "text-dim hover:text-text"}`}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill={c.liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M7 10v11M2 13v6a2 2 0 0 0 2 2h13.5a2 2 0 0 0 2-1.6l1.3-7A1.6 1.6 0 0 0 19 11h-6l1-5a2 2 0 0 0-2-2.5L7 10" /></svg>
              {c.like_count}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
