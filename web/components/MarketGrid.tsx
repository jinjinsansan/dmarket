"use client";
// ホーム本体（本家Polymarket風）。細いカテゴリナビ＋回転ヒーロー＋Trending＋密集グリッド＋Realtime。
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { lmsrPrice } from "@/lib/lmsr";
import { toPct } from "@/lib/format";
import { marketVisual } from "@/lib/market-visual";
import { MarketCard } from "./MarketCard";
import { Hero } from "./Hero";
import type { Category, MarketWithOutcomes } from "@/lib/types";

export function MarketGrid({ initialMarkets, categories }: { initialMarkets: MarketWithOutcomes[]; categories: Category[] }) {
  const [markets, setMarkets] = useState(initialMarkets);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [layout, setLayout] = useState<"cards" | "compact">("cards");
  const [sort, setSort] = useState<SortKey>("ending");
  const [sparks, setSparks] = useState<Record<string, number[]>>({});

  useEffect(() => {
    const ids = initialMarkets.map((m) => m.id);
    if (ids.length === 0) return;
    createClient().rpc("market_sparklines", { p_market_ids: ids }).then(({ data }) => {
      const map: Record<string, number[]> = {};
      for (const r of (data ?? []) as { market_id: string; prices: number[] }[]) map[r.market_id] = (r.prices ?? []).map(Number);
      setSparks(map);
    });
  }, [initialMarkets]);

  // Realtime: outcomes の q 変更を100msバッチで反映
  useEffect(() => {
    const sb = createClient();
    let pending: Record<string, { market_id: string; id: string; q: number }> = {};
    let timer: ReturnType<typeof setTimeout> | null = null;
    const ch = sb.channel("markets-outcomes")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "outcomes" }, (payload) => {
        const n = payload.new as { id: string; market_id: string; q: number };
        pending[n.id] = n;
        if (!timer) timer = setTimeout(() => {
          const updates = Object.values(pending); pending = {}; timer = null;
          if (updates.length === 0) return;
          setMarkets((prev) => prev.map((m) => {
            const u = updates.find((up) => up.market_id === m.id);
            return u ? { ...m, outcomes: m.outcomes.map((o) => (o.id === u.id ? { ...o, q: u.q } : o)) } : m;
          }));
        }, 100);
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
      return new Date(a.close_time).getTime() - new Date(b.close_time).getTime();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markets, activeCat, search, sort]);

  const trending = useMemo(() => [...markets].sort((a, b) => new Date(a.close_time).getTime() - new Date(b.close_time).getTime()).slice(0, 6), [markets]);

  // ヒーロー用データ（注目＝先頭、今日のお題＝天気優先）
  const catEmoji = (slug?: string | null) => (({ weather: "🌤", ent: "🎬", crypto: "₿", fx: "💱", news: "📰", keiba: "🐎", sports: "⚽" }) as Record<string, string>)[slug ?? ""] ?? "🌍";
  const toHero = (m: MarketWithOutcomes) => ({ id: m.id, question: m.question, yesPct: Math.round(yesPct(m)), flag: catEmoji(m.category?.slug) });
  // 今日のお題＝天気カテゴリを優先、無ければ締切が近い先頭
  const heroDaily = markets.find((m) => m.category?.slug === "weather") ?? trending[0];

  return (
    <div className="max-w-[1240px] mx-auto px-4 md:px-[22px] py-5 pb-20 dm-in">
      {/* 細いカテゴリナビ（本家風） */}
      <CategoryNav categories={categories} active={activeCat} onSelect={setActiveCat} />

      {/* ヒーロー（紫「今日のお題」・モバイル/デスクトップ両対応）＋注目トピック（デスクトップのみ右） */}
      {heroDaily && (
        <div className="flex flex-col md:flex-row gap-4 mb-6 md:items-stretch">
          <div className="md:flex-[2_1_460px] min-w-0">
            <Hero daily={toHero(heroDaily)} />
          </div>
          <div className="hidden md:block flex-[1_1_280px] min-w-0">
            <Trending list={trending} yesPct={yesPct} />
          </div>
        </div>
      )}

      {/* マーケット一覧ヘッダー */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="text-[18px] font-extrabold">{activeCat ? categories.find((c) => c.id === activeCat)?.name : "すべての市場"}</h2>
          <span className="text-xs text-dim">{filtered.length} 件</span>
        </div>
        <div className="flex items-center gap-3">
          <a href="/create" className="hidden sm:inline-flex items-center gap-1 h-9 px-3 rounded-[10px] text-white text-[13px] font-bold shrink-0" style={{ background: "var(--grad)" }}>＋ 市場を作る</a>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="検索…"
            className="h-9 px-3 rounded-[10px] border border-border bg-surface2 text-base md:text-sm outline-none focus:border-primary w-28 sm:w-44" />
          <div className="flex gap-1 p-[3px] bg-surface2 border border-border rounded-[11px]">
            <Seg active={layout === "cards"} onClick={() => setLayout("cards")}>カード</Seg>
            <Seg active={layout === "compact"} onClick={() => setLayout("compact")}>リスト</Seg>
          </div>
        </div>
      </div>

      <SortBar sort={sort} onSort={setSort} />

      {filtered.length === 0 ? (
        <div className="text-dim text-sm py-20 text-center border border-dashed border-border rounded-[var(--radius)]">このカテゴリはまだ市場がありません。</div>
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

function Trending({ list, yesPct }: { list: MarketWithOutcomes[]; yesPct: (m: MarketWithOutcomes) => number }) {
  const router = useRouter();
  return (
    <div className="flex-[1_1_280px] min-w-0 border border-border bg-surface rounded-[16px] px-[18px] py-4" style={{ boxShadow: "var(--shadow)" }}>
      <div className="flex items-center gap-2 mb-3">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2.4"><path d="M3 17l6-6 4 4 7-8" /><path d="M14 7h6v6" /></svg>
        <h3 className="text-[15px] font-extrabold">注目のトピック</h3>
      </div>
      <div className="space-y-2.5">
        {list.map((m, i) => {
          const vis = marketVisual({ id: m.id, slug: m.category?.slug, image_url: m.image_url });
          return (
            <div key={m.id} onClick={() => router.push(`/market/${m.id}`)} onMouseEnter={() => router.prefetch(`/market/${m.id}`)} className="flex items-center gap-2.5 cursor-pointer group">
              <span className="mono text-xs text-faint w-3">{i + 1}</span>
              <div className="w-7 h-7 rounded-lg grid place-items-center text-white text-xs font-extrabold shrink-0 overflow-hidden" style={{ background: vis.image ? `url(${vis.image}) center/cover` : vis.tint }}>{!vis.image && vis.glyph}</div>
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

// 細いカテゴリナビ（本家風・アンダーライン・テキストのみ）
function CategoryNav({ categories, active, onSelect }: { categories: Category[]; active: string | null; onSelect: (id: string | null) => void }) {
  const items: { id: string | null; name: string }[] = [
    { id: null, name: "すべて" },
    ...categories.map((c) => ({ id: c.id, name: c.name })),
  ];
  return (
    <div className="flex items-center gap-0.5 overflow-x-auto overflow-y-hidden hide-scrollbar border-b border-border mb-5"
      style={{ touchAction: "pan-x", overscrollBehaviorX: "contain" }}>
      {items.map((c) => {
        const isAct = active === c.id;
        return (
          <button key={c.id ?? "all"} onClick={() => onSelect(c.id)}
            className={`px-3.5 py-2.5 text-[13.5px] font-bold whitespace-nowrap border-b-2 -mb-px transition-colors ${isAct ? "border-primary text-text" : "border-transparent text-dim hover:text-text"}`}>
            {c.name}
          </button>
        );
      })}
    </div>
  );
}

type SortKey = "ending" | "newest" | "contested";
const SORT_OPTIONS: [SortKey, string][] = [["ending", "締切が近い"], ["newest", "新着"], ["contested", "接戦"]];
function SortBar({ sort, onSort }: { sort: SortKey; onSort: (s: SortKey) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto overflow-y-hidden scrollx mb-4" style={{ touchAction: "pan-x", overscrollBehaviorX: "contain" }}>
      {SORT_OPTIONS.map(([key, label]) => (
        <button key={key} onClick={() => onSort(key)}
          className={`px-3 py-1.5 rounded-full text-[12.5px] font-bold whitespace-nowrap border ${sort === key ? "bg-primary text-white border-primary" : "bg-surface border-border text-dim hover:text-text"}`}>{label}</button>
      ))}
    </div>
  );
}

function Seg({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`text-[12.5px] font-bold px-3 py-1.5 rounded-lg ${active ? "bg-surface text-text shadow-sm" : "text-dim"}`}>{children}</button>
  );
}
