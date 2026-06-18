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

  useEffect(() => {
    const sb = createClient();
    const ch = sb.channel("markets-outcomes")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "outcomes" }, (payload) => {
        const n = payload.new as { id: string; market_id: string; q: number };
        setMarkets((prev) => prev.map((m) => m.id === n.market_id
          ? { ...m, outcomes: m.outcomes.map((o) => (o.id === n.id ? { ...o, q: n.q } : o)) } : m));
      }).subscribe();
    return () => { sb.removeChannel(ch); };
  }, []);

  const yesPct = (m: MarketWithOutcomes) => {
    const os = [...m.outcomes].sort((a, b) => a.display_order - b.display_order);
    return lmsrPrice(os.map((o) => o.q), m.b_param, 0) * 100;
  };

  const filtered = useMemo(() => markets.filter((m) => {
    if (activeCat && m.category_id !== activeCat) return false;
    if (search && !m.question.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [markets, activeCat, search]);

  const trending = useMemo(() =>
    [...markets].sort((a, b) => new Date(a.close_time).getTime() - new Date(b.close_time).getTime()).slice(0, 4),
  [markets]);

  return (
    <div className="max-w-[1240px] mx-auto px-4 md:px-[22px] py-6 pb-20 dm-in">
      {/* ヒーロー行 */}
      <div className="flex flex-wrap gap-4 mb-6">
        <Hero openCount={markets.length} catCount={categories.length} />
        <Trending list={trending} yesPct={yesPct} />
      </div>

      {/* カテゴリ */}
      <div className="flex gap-2 overflow-x-auto scrollx pb-2 mb-4">
        <CatPill active={activeCat === null} onClick={() => setActiveCat(null)} label="すべて" sub="ALL" />
        {categories.map((c) => (
          <CatPill key={c.id} active={activeCat === c.id} onClick={() => setActiveCat(c.id)} label={c.name} sub={c.slug} />
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
            className="h-9 px-3 rounded-[10px] border border-border bg-surface2 text-sm outline-none focus:border-primary w-32 sm:w-44" />
          <div className="flex gap-1 p-[3px] bg-surface2 border border-border rounded-[11px]">
            <Seg active={layout === "cards"} onClick={() => setLayout("cards")}>カード</Seg>
            <Seg active={layout === "compact"} onClick={() => setLayout("compact")}>リスト</Seg>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-dim text-sm py-20 text-center border border-dashed border-border rounded-[var(--radius)]">
          このカテゴリはまだ市場がありません。
        </div>
      ) : layout === "cards" ? (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(290px,1fr))" }}>
          {filtered.map((m) => <MarketCard key={m.id} market={m} variant="card" />)}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((m) => <MarketCard key={m.id} market={m} variant="compact" />)}
        </div>
      )}
    </div>
  );
}

function Hero({ openCount, catCount }: { openCount: number; catCount: number }) {
  return (
    <div className="relative overflow-hidden flex-[2_1_480px] rounded-[var(--radius)] px-[34px] py-8 text-[#eaf2fb] border"
      style={{ background: "var(--hero-grad)", borderColor: "rgba(56,189,248,.22)", boxShadow: "0 20px 50px -28px rgba(8,20,40,.55)" }}>
      <div className="absolute -right-10 -top-10 w-56 h-56 rounded-full" style={{ background: "radial-gradient(circle,rgba(56,189,248,.25),transparent 70%)" }} />
      <div className="relative">
        <div className="text-[11px] font-bold tracking-[.28em] text-[#38bdf8] uppercase mb-3">D-MARKET · 予測市場</div>
        <h1 className="text-[30px] font-extrabold leading-tight mb-2">ポイントで読む、世界の確率。</h1>
        <p className="text-[14.5px] opacity-85 max-w-[440px] leading-relaxed mb-6">
          競馬からニュースまで、世界の「結果」をポイントで予想・売買。換金ゼロ、得るのは的中の快感と称号。
        </p>
        <div className="flex gap-8">
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
      <div className="mono text-[22px] font-bold text-[#5fcdf0]">{value}</div>
      <div className="text-[11px] opacity-70 mt-0.5">{label}</div>
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

function CatPill({ active, onClick, label, sub }: { active: boolean; onClick: () => void; label: string; sub: string }) {
  return (
    <button onClick={onClick}
      className={`flex flex-col items-start gap-px px-3.5 py-[7px] rounded-[10px] whitespace-nowrap border ${active ? "bg-primary text-white border-primary" : "bg-surface text-dim border-border hover:text-text"}`}>
      <span className="text-[13.5px] font-bold leading-none">{label}</span>
      <span className="text-[10px] uppercase opacity-70 leading-none">{sub}</span>
    </button>
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
