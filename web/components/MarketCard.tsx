"use client";
// 市場カード（ゴリラ予想リデザイン・B案）。カテゴリ＋大きな確率%＋全幅スパークライン＋YES/NO＋フッター(残り/シェア)。
import { useEffect, useMemo, useRef, useState, memo } from "react";
import { useRouter } from "next/navigation";
import { lmsrPrices } from "@/lib/lmsr";
import { toCents, toPct, timeRemaining } from "@/lib/format";
import { Sparkline } from "./Sparkline";
import { withRef } from "@/lib/ref";
import type { MarketWithOutcomes } from "@/lib/types";

const CARD_SHADOW = "0 1px 2px rgba(0,0,0,.04),0 14px 30px -20px rgba(0,0,0,.18)";

export const MarketCard = memo(function MarketCard({ market, variant = "card", spark }: { market: MarketWithOutcomes; variant?: "card" | "compact"; spark?: number[] }) {
  const router = useRouter();
  const outcomes = useMemo(() => [...market.outcomes].sort((a, b) => a.display_order - b.display_order), [market.outcomes]);
  const prices = useMemo(() => lmsrPrices(outcomes.map((o) => o.q), market.b_param), [outcomes, market.b_param]);
  const isBinary = outcomes.length === 2;
  const yes = prices[0] ?? 0.5;
  const open = () => router.push(`/market/${market.id}`);
  const pick = (i: number) => router.push(`/market/${market.id}?pick=${i}`);
  const warm = () => router.prefetch(`/market/${market.id}`);
  const isOpen = market.status === "open" && new Date(market.close_time).getTime() > Date.now();

  // Realtime 価格更新フラッシュ
  const [flash, setFlash] = useState(false);
  const prevYes = useRef(yes);
  useEffect(() => {
    if (Math.round(prevYes.current * 100) !== Math.round(yes * 100)) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 800);
      prevYes.current = yes;
      return () => clearTimeout(t);
    }
    prevYes.current = yes;
  }, [yes]);

  // 画面に入ったら先読み（モバイルでもタップ前にprefetch済みにして体感を改善）。一度きり。
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = cardRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((ents) => {
      if (ents.some((e) => e.isIntersecting)) { router.prefetch(`/market/${market.id}`); io.disconnect(); }
    }, { rootMargin: "250px" });
    io.observe(el);
    return () => io.disconnect();
  }, [market.id, router]);

  const share = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = withRef(`${window.location.origin}/market/${market.id}`);
    const text = `${market.question}\nゴリラ予想で予想中🦍`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, "_blank", "noopener,noreferrer");
  };

  const Big = () =>
    isBinary ? (
      <div className="text-center shrink-0">
        <div className={`mono text-[30px] font-extrabold leading-[.9] text-primary ${flash ? "price-flash" : ""}`}>
          {Math.round(yes * 100)}<span className="text-[16px]">%</span>
        </div>
        <div className="text-[9px] text-dim font-extrabold mt-0.5">YES</div>
      </div>
    ) : null;

  // ── compact（関連市場・リスト表示用の密集行） ──
  if (variant === "compact") {
    return (
      <div ref={cardRef} onClick={open} onMouseEnter={warm} onTouchStart={warm}
        className={`card-hover flex items-center gap-3 border border-border bg-surface rounded-[14px] px-4 py-3 cursor-pointer ${market.is_featured ? "card-featured" : ""}`}
        style={{ boxShadow: CARD_SHADOW }}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <div className="text-[11px] font-extrabold text-primary">{market.category?.name ?? "市場"}</div>
            {market.is_featured && <FeaturedBadge />}
          </div>
          <p className="text-sm font-bold truncate">{market.question}</p>
        </div>
        <Big />
      </div>
    );
  }

  // ── card（B案・サムネ無し／大きな%／全幅スパークライン） ──
  return (
    <div ref={cardRef} onClick={open} onMouseEnter={warm} onTouchStart={warm}
      className={`card-hover flex flex-col border border-border bg-surface rounded-[18px] p-4 cursor-pointer ${market.is_featured ? "card-featured" : ""}`}
      style={{ boxShadow: CARD_SHADOW }}>
      {/* メタ：カテゴリ＋LIVE */}
      <div className="flex items-center gap-[7px] mb-2">
        <span className="text-[11px] font-extrabold text-primary">{market.category?.name ?? "市場"}</span>
        {market.is_featured && <FeaturedBadge />}
        {isOpen && (
          <span className="inline-flex items-center gap-[3px] px-1.5 py-0.5 rounded-[5px] text-[9px] font-extrabold text-white" style={{ background: "var(--neg)" }}>
            <span className="w-1 h-1 rounded-full bg-white animate-pulse" />LIVE
          </span>
        )}
      </div>

      {/* 質問＋大きな% */}
      <div className="flex justify-between items-start gap-2.5">
        <h3 className="text-[14.5px] font-extrabold leading-[1.45] flex-1 line-clamp-3">{market.question}</h3>
        <Big />
      </div>

      {/* 全幅スパークライン */}
      {spark && spark.length >= 2 && (
        <div className="mt-2.5 mb-1">
          <Sparkline data={spark} color="var(--primary)" width={280} height={34} fluid />
        </div>
      )}

      {/* YES/NO（二択） or 上位アウトカム（多択） */}
      {isBinary ? (
        <div className="flex gap-2 mt-2.5">
          <Pill kind="pos" label="YES" cents={toCents(yes)} onClick={(e) => { e.stopPropagation(); pick(0); }} />
          <Pill kind="neg" label="NO" cents={toCents(1 - yes)} onClick={(e) => { e.stopPropagation(); pick(1); }} />
        </div>
      ) : (
        <div className="mt-2.5 space-y-1.5">
          {outcomes.map((o, i) => ({ label: o.label, p: prices[i] })).sort((a, b) => b.p - a.p).slice(0, 3).map((o) => (
            <div key={o.label} className="flex items-center gap-2 text-xs">
              <span className="flex-1 truncate text-dim">{o.label}</span>
              <div className="w-[70px] h-1.5 rounded bg-surface2 overflow-hidden"><div className="h-full bg-primary rounded" style={{ width: `${o.p * 100}%` }} /></div>
              <span className="mono w-8 text-right font-bold">{toPct(o.p)}</span>
            </div>
          ))}
        </div>
      )}

      {/* フッター：残り時間＋シェア */}
      <div className="flex justify-between items-center mt-3 pt-[11px] border-t border-border">
        <span className="text-[11px] text-dim font-medium">{timeRemaining(market.close_time)}</span>
        <button onClick={share}
          className="btn-press inline-flex items-center gap-[5px] text-[11px] font-bold text-primary bg-primary-weak px-2.5 py-1 rounded-full hover:opacity-80">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M18.9 1.6h3.7l-8.1 9.2L24 22.4h-7.4l-5.8-7.6-6.7 7.6H.5l8.6-9.9L0 1.6h7.6l5.2 6.9 6.1-6.9Zm-1.3 18.6h2L6.5 3.7H4.3l13.3 16.5Z" /></svg>
          シェア
        </button>
      </div>
    </div>
  );
});

function FeaturedBadge() {
  return (
    <span className="inline-flex items-center gap-[3px] px-1.5 py-0.5 rounded-[5px] text-[9px] font-extrabold text-white shrink-0" style={{ background: "var(--accent2)", color: "#2A2018" }}>
      🔥 注目
    </span>
  );
}

function Pill({ kind, label, cents, onClick }: { kind: "pos" | "neg"; label: string; cents?: string; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button onClick={onClick}
      className={`btn-press flex-1 rounded-[11px] py-2.5 text-center font-extrabold text-[13px] flex items-center justify-center gap-1.5 transition-colors ${kind === "pos" ? "bg-pos-weak text-pos hover:bg-pos hover:text-white" : "bg-neg-weak text-neg hover:bg-neg hover:text-white"}`}>
      <span>{label}</span>
      {cents && <span className="mono text-[12px] opacity-80">{cents}</span>}
    </button>
  );
}
