"use client";
// 市場一覧グリッド（SPEC-05 §4・§7）。カテゴリタブ・検索・Realtime価格更新。
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MarketCard } from "./MarketCard";
import type { Category, MarketWithOutcomes } from "@/lib/types";

export function MarketGrid({
  initialMarkets,
  categories,
}: {
  initialMarkets: MarketWithOutcomes[];
  categories: Category[];
}) {
  const [markets, setMarkets] = useState(initialMarkets);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Realtime: outcomes の q 変更を受けて該当市場の q を更新（価格はカード側で再計算）
  useEffect(() => {
    const sb = createClient();
    const channel = sb
      .channel("markets-outcomes")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "outcomes" },
        (payload) => {
          const next = payload.new as { id: string; market_id: string; q: number };
          setMarkets((prev) =>
            prev.map((m) =>
              m.id === next.market_id
                ? { ...m, outcomes: m.outcomes.map((o) => (o.id === next.id ? { ...o, q: next.q } : o)) }
                : m,
            ),
          );
        },
      )
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, []);

  const filtered = useMemo(() => {
    return markets.filter((m) => {
      if (activeCat && m.category_id !== activeCat) return false;
      if (search && !m.question.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [markets, activeCat, search]);

  return (
    <div>
      <div className="flex flex-col gap-3 mb-5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="市場を検索…"
          className="w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Tab active={activeCat === null} onClick={() => setActiveCat(null)}>すべて</Tab>
          {categories.map((c) => (
            <Tab key={c.id} active={activeCat === c.id} onClick={() => setActiveCat(c.id)}>
              {c.name}
            </Tab>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-dim text-sm py-16 text-center">
          このカテゴリはまだ市場がありません。
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((m) => (
            <MarketCard key={m.id} market={m} />
          ))}
        </div>
      )}
    </div>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm border transition-colors ${
        active ? "border-primary text-text bg-primary/10" : "border-border text-dim hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}
