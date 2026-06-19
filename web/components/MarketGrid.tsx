"use client";
// ホーム本体（handoff §1）。ヒーロー＋トレンド＋カテゴリ＋レイアウト切替＋グリッド＋Realtime。
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { lmsrPrice } from "@/lib/lmsr";
import { toPct, formatPoints } from "@/lib/format";
import { marketVisual } from "@/lib/market-visual";
import { MarketCard } from "./MarketCard";
import type { Category, MarketWithOutcomes } from "@/lib/types";

export function MarketGrid({ initialMarkets, categories }: { initialMarkets: MarketWithOutcomes[]; categories: Category[] }) {
  const [markets, setMarkets] = useState(initialMarkets);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [layout, setLayout] = useState<"cards" | "compact">("cards");
  const [sort, setSort] = useState<SortKey>("ending");
  const [sparks, setSparks] = useState<Record<string, number[]>>({});

  // カードの価格推移を一括取得（1RPC・軽量）
  useEffect(() => {
    const ids = initialMarkets.map((m) => m.id);
    if (ids.length === 0) return;
    createClient().rpc("market_sparklines", { p_market_ids: ids }).then(({ data }) => {
      const map: Record<string, number[]> = {};
      for (const r of (data ?? []) as { market_id: string; prices: number[] }[]) {
        map[r.market_id] = (r.prices ?? []).map(Number);
      }
      setSparks(map);
    });
  }, [initialMarkets]);

  useEffect(() => {
    const sb = createClient();
    let pending: Record<string, { market_id: string; id: string; q: number }> = {};
    let timer: ReturnType<typeof setTimeout> | null = null;

    const ch = sb.channel("markets-outcomes")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "outcomes" }, (payload) => {
        const n = payload.new as { id: string; market_id: string; q: number };
        pending[n.id] = n;
        // 100msごとにバッチ適用（高頻度更新のガクつき防止）
        if (!timer) {
          timer = setTimeout(() => {
            const updates = Object.values(pending);
            pending = {};
            timer = null;
            if (updates.length === 0) return;
            setMarkets((prev) => prev.map((m) => {
              const u = updates.find((up) => up.market_id === m.id);
              return u ? { ...m, outcomes: m.outcomes.map((o) => (o.id === u.id ? { ...o, q: u.q } : o)) } : m;
            }));
          }, 100);
        }
      }).subscribe();
    return () => { sb.removeChannel(ch); if (timer) clearTimeout(timer); };
  }, []);

  const yesPct = (m: MarketWithOutcomes) => {
    const os = [...m.outcomes].sort((a, b) => a.display_order - b.display_order);
    return lmsrPrice(os.map((o) => o.q), m.b_param, 0) * 100;
  };

  const filtered = useMemo(() => {
    const list = markets.filter((m) => {
      if (activeCat && m.category_id !== activeCat) return false;
      if (search && !m.question.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
    const contest = (m: MarketWithOutcomes) => Math.abs(yesPct(m) - 50);
    return list.sort((a, b) => {
      if (sort === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sort === "contested") return contest(a) - contest(b);
      return new Date(a.close_time).getTime() - new Date(b.close_time).getTime(); // ending
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markets, activeCat, search, sort]);

  const trending = useMemo(() =>
    [...markets].sort((a, b) => new Date(a.close_time).getTime() - new Date(b.close_time).getTime()).slice(0, 4),
  [markets]);

  return (
    <div className="max-w-[1240px] mx-auto px-4 md:px-[22px] py-6 pb-20 dm-in">
      {/* ヒーロー行（デスクトップのみ） */}
      <div className="hidden md:flex flex-wrap gap-4 mb-6">
        <Hero openCount={markets.length} catCount={categories.length} />
        <Trending list={trending} yesPct={yesPct} />
      </div>
      {/* モバイル用コンパクトヘッダー */}
      <div className="md:hidden mb-4">
        <h1 className="text-lg font-extrabold">予測市場</h1>
        <p className="text-xs text-dim">{markets.length} マーケット · Realtime</p>
      </div>

      {/* カテゴリ */}
      <div className="flex gap-2 overflow-x-auto scrollx pb-2 mb-4">
        <CatPill active={activeCat === null} onClick={() => setActiveCat(null)} label="すべて" />
        {categories.map((c) => (
          <CatPill key={c.id} active={activeCat === c.id} onClick={() => setActiveCat(c.id)} label={c.name} slug={c.slug} />
        ))}
      </div>

      {/* 検索（モバイル）＋ツールバー */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-[18px] font-extrabold">{activeCat ? categories.find((c) => c.id === activeCat)?.name : "すべての市場"}</h2>
          <span className="text-xs text-dim">{filtered.length} 件</span>
        </div>
        <div className="flex items-center gap-3">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="検索…"
            className="h-9 px-3 rounded-[10px] border border-border bg-surface2 text-base md:text-sm outline-none focus:border-primary w-28 sm:w-44" />
          <div className="flex gap-1 p-[3px] bg-surface2 border border-border rounded-[11px]">
            <Seg active={layout === "cards"} onClick={() => setLayout("cards")}>カード</Seg>
            <Seg active={layout === "compact"} onClick={() => setLayout("compact")}>リスト</Seg>
          </div>
        </div>
      </div>

      {/* ソートバー（§3.1） */}
      <SortBar sort={sort} onSort={setSort} />

      {filtered.length === 0 ? (
        <div className="text-dim text-sm py-20 text-center border border-dashed border-border rounded-[var(--radius)]">
          このカテゴリはまだ市場がありません。
        </div>
      ) : layout === "cards" ? (
        <div className="grid gap-3 sm:gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,278px),1fr))" }}>
          {filtered.map((m) => <MarketCard key={m.id} market={m} variant="card" spark={sparks[m.id]} />)}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((m) => <MarketCard key={m.id} market={m} variant="compact" spark={sparks[m.id]} />)}
        </div>
      )}
    </div>
  );
}

function Hero({ openCount, catCount }: { openCount: number; catCount: number }) {
  return (
    <div className="relative overflow-hidden flex-[2_1_460px] rounded-[16px] px-6 py-5 text-[#eaf2fb] border"
      style={{ background: "var(--hero-grad)", borderColor: "rgba(56,189,248,.22)", boxShadow: "0 16px 40px -28px rgba(8,20,40,.55)" }}>
      <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full" style={{ background: "radial-gradient(circle,rgba(56,189,248,.22),transparent 70%)" }} />
      <div className="relative">
        <div className="text-[10px] font-bold tracking-[.26em] text-[#38bdf8] uppercase mb-1.5">D-MARKET · 予測市場</div>
        <h1 className="text-[21px] font-extrabold leading-tight mb-1">ポイントで読む、世界の確率。</h1>
        <p className="text-[12.5px] opacity-80 max-w-[420px] leading-relaxed mb-3">
          世界の「結果」をポイントで予想・売買。換金ゼロ、得るのは的中の快感と称号。
        </p>
        <div className="flex gap-6">
          <Stat label="開催中" value={formatPoints(openCount)} />
          <Stat label="カテゴリ" value={formatPoints(catCount)} />
          <Stat label="換金" value="¥0" />
        </div>
      </div>
    </div>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mono text-[17px] font-bold text-[#5fcdf0] leading-none">{value}</div>
      <div className="text-[10px] opacity-70 mt-0.5">{label}</div>
    </div>
  );
}

function Trending({ list, yesPct }: { list: MarketWithOutcomes[]; yesPct: (m: MarketWithOutcomes) => number }) {
  const router = useRouter();
  return (
    <div className="flex-[1_1_300px] min-w-0 border border-border bg-surface rounded-[var(--radius)] px-[18px] py-4" style={{ boxShadow: "var(--shadow)" }}>
      <div className="flex items-center gap-2 mb-3">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2.4"><path d="M3 17l6-6 4 4 7-8" /><path d="M14 7h6v6" /></svg>
        <h3 className="text-[15px] font-extrabold">注目 / Trending</h3>
      </div>
      <div className="space-y-2.5">
        {list.map((m, i) => {
          const vis = marketVisual({ id: m.id, slug: m.category?.slug, image_url: m.image_url });
          return (
            <div key={m.id} onClick={() => router.push(`/market/${m.id}`)} className="flex items-center gap-2.5 cursor-pointer group">
              <span className="mono text-xs text-faint w-3">{i + 1}</span>
              <div className="w-7 h-7 rounded-lg grid place-items-center text-white text-xs font-extrabold shrink-0" style={{ background: vis.tint }}>{vis.glyph}</div>
              <span className="flex-1 text-[12.5px] truncate group-hover:text-primary">{m.question}</span>
              <span className="mono text-[12.5px] font-bold" style={{ color: vis.tint }}>{toPct(yesPct(m) / 100)}</span>
            </div>
          );
        })}
        {list.length === 0 && <p className="text-dim text-xs">市場がありません</p>}
      </div>
    </div>
  );
}

// カテゴリ別グリフ・色（§3.4A）
const CATEGORY_STYLE: Record<string, { glyph: string; color: string }> = {
  keiba: { glyph: "🐎", color: "#0e9488" },
  fx: { glyph: "¥", color: "#f59e0b" },
  crypto: { glyph: "₿", color: "#f59e0b" },
  news: { glyph: "🏛", color: "#6366f1" },
  politics: { glyph: "🏛", color: "#6366f1" },
  sports: { glyph: "⚽", color: "#10b981" },
  tech: { glyph: "🤖", color: "#8b5cf6" },
  entertainment: { glyph: "🎬", color: "#ec4899" },
};
const DEFAULT_CAT = { glyph: "📊", color: "var(--primary)" };

function CatPill({ active, onClick, label, slug }: { active: boolean; onClick: () => void; label: string; slug?: string }) {
  const style = (slug && CATEGORY_STYLE[slug]) || DEFAULT_CAT;
  return (
    <button onClick={onClick}
      className={`flex items-center gap-2 px-3.5 py-2 rounded-[10px] whitespace-nowrap border transition-all ${active ? "text-white border-transparent shadow-md" : "bg-surface text-dim border-border hover:text-text hover:border-primary/30"}`}
      style={active ? { background: style.color, borderColor: style.color } : {}}>
      <span className="text-base leading-none">{style.glyph}</span>
      <span className="text-[13.5px] font-bold leading-none">{label}</span>
    </button>
  );
}

// ソートバー（§3.1B）
type SortKey = "ending" | "newest" | "contested";
const SORT_OPTIONS: [SortKey, string][] = [["ending", "締切が近い"], ["newest", "新着"], ["contested", "接戦"]];
function SortBar({ sort, onSort }: { sort: SortKey; onSort: (s: SortKey) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto scrollx mb-4">
      {SORT_OPTIONS.map(([key, label]) => (
        <button key={key} onClick={() => onSort(key)}
          className={`px-3 py-1.5 rounded-full text-[12.5px] font-bold whitespace-nowrap border ${sort === key ? "bg-primary text-white border-primary" : "bg-surface border-border text-dim hover:text-text"}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Seg({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`text-[12.5px] font-bold px-3 py-1.5 rounded-lg ${active ? "bg-surface text-text shadow-sm" : "text-dim"}`}>
      {children}
    </button>
  );
}
