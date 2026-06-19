"use client";
// マイページ（handoff §3）。プロフィール・ステータス・称号・保有・履歴。
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { lmsrPrice } from "@/lib/lmsr";
import { formatPoints, pnlText } from "@/lib/format";
import { LEDGER_REASON_LABEL, PRIZE_REASON_LABEL } from "@/lib/constants";
import type { LedgerRow, PrizeLedgerRow } from "@/lib/types";

interface Holding { marketId: string; question: string; label: string; shares: number; costBasis: number; value: number; }
interface Badge { id: string; name: string; description: string | null; earned: boolean; }
interface Stats { net_worth: number; win_count: number; resolved_count: number; current_streak: number; }

export default function MyPage() {
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [name, setName] = useState("プレイヤー");
  const [balance, setBalance] = useState(0);
  const [prizeBalance, setPrizeBalance] = useState(0);
  const [prizeLedger, setPrizeLedger] = useState<PrizeLedgerRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [claimMsg, setClaimMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { setLoggedIn(false); setLoading(false); return; }
      setLoggedIn(true);

      const [{ data: wallet }, { data: prizeWallet }, { data: profile }, { data: st }, { data: positions }, { data: led }, { data: prizeLed }, { data: allBadges }, { data: mine }] =
        await Promise.all([
          sb.from("wallets").select("balance").eq("user_id", user.id).maybeSingle(),
          sb.from("prize_wallets").select("balance").eq("user_id", user.id).maybeSingle(),
          sb.from("profiles").select("display_name").eq("user_id", user.id).maybeSingle(),
          sb.from("user_stats").select("net_worth, win_count, resolved_count, current_streak").eq("user_id", user.id).maybeSingle(),
          sb.from("positions").select("shares, cost_basis, outcome:outcomes(id, label, market_id)").gt("shares", 0),
          sb.from("point_ledger").select("id, delta, reason, shares, balance_after, created_at").order("created_at", { ascending: false }).limit(50),
          sb.from("prize_ledger").select("id, delta, reason, expires_at, balance_after, created_at").order("created_at", { ascending: false }).limit(50),
          sb.from("badges").select("id, name, description"),
          sb.from("user_badges").select("badge_id").eq("user_id", user.id),
        ]);

      setBalance(wallet?.balance ?? 0);
      setPrizeBalance(prizeWallet?.balance ?? 0);
      setPrizeLedger((prizeLed as PrizeLedgerRow[]) ?? []);
      if (profile?.display_name) setName(profile.display_name);
      setStats((st as Stats) ?? { net_worth: wallet?.balance ?? 0, win_count: 0, resolved_count: 0, current_streak: 0 });
      setLedger((led as LedgerRow[]) ?? []);
      const earned = new Set((mine ?? []).map((b) => b.badge_id));
      setBadges((allBadges ?? []).map((b) => ({ ...b, earned: earned.has(b.id) })));

      const posList = (positions ?? []) as unknown as { shares: number; cost_basis: number; outcome: { id: string; label: string; market_id: string } }[];
      const marketIds = [...new Set(posList.map((p) => p.outcome.market_id))];
      const hs: Holding[] = [];
      if (marketIds.length) {
        const { data: markets } = await sb.from("markets").select("id, question, b_param, outcomes(id, q, display_order)").in("id", marketIds);
        const mById = new Map((markets ?? []).map((m) => [m.id, m]));
        for (const p of posList) {
          const m = mById.get(p.outcome.market_id); if (!m) continue;
          const os = [...m.outcomes].sort((a, b) => a.display_order - b.display_order);
          const k = os.findIndex((o) => o.id === p.outcome.id);
          const price = lmsrPrice(os.map((o) => o.q), m.b_param, k);
          hs.push({ marketId: m.id, question: m.question, label: p.outcome.label, shares: p.shares, costBasis: p.cost_basis, value: Math.floor(price * 100 * p.shares) });
        }
      }
      setHoldings(hs);
      setLoading(false);
    })();
  }, []);

  async function claim() {
    const sb = createClient();
    const { data, error } = await sb.rpc("claim_daily_grant");
    if (error) return setClaimMsg("受け取りに失敗しました");
    if (data?.ok) { setBalance(data.balance); setClaimMsg(`+${data.granted} pt 受け取りました`); window.dispatchEvent(new Event("wallet:refresh")); }
    else setClaimMsg("本日は受け取り済みです");
  }

  if (loading) return <Center>読み込み中…</Center>;
  if (!loggedIn) return (
    <Center>
      <p className="mb-2">マイページを見るにはログインが必要です。</p>
      <p className="text-xs text-faint">LINEログインは現在準備中です。</p>
    </Center>
  );

  const holdValue = holdings.reduce((s, h) => s + h.value, 0);
  const holdCost = holdings.reduce((s, h) => s + h.costBasis, 0);
  const unrealized = holdValue - holdCost;
  const hitRate = stats && stats.resolved_count > 0 ? Math.round((stats.win_count / stats.resolved_count) * 100) : null;
  const earnedCount = badges.filter((b) => b.earned).length;
  const title = stats && stats.current_streak >= 5 ? "予言者 / Oracle" : "トレーダー / Trader";
  // 賞品ptの直近の有効期限（未失効の付与分のうち最も早いもの）
  const now = Date.now();
  const nextExpiry = prizeLedger
    .filter((l) => l.delta > 0 && l.expires_at && new Date(l.expires_at).getTime() > now)
    .map((l) => new Date(l.expires_at as string).getTime())
    .sort((a, b) => a - b)[0];

  return (
    <div className="max-w-[1100px] mx-auto px-4 md:px-[22px] py-6 pb-20 dm-in space-y-5">
      {/* プロフィール */}
      <div className="flex items-center gap-5 border border-border bg-surface rounded-[var(--radius)] p-6" style={{ boxShadow: "var(--shadow)" }}>
        <div className="w-[76px] h-[76px] rounded-full grid place-items-center text-white text-2xl font-extrabold shrink-0" style={{ background: "var(--grad)", boxShadow: "var(--cta-glow)" }}>
          {name.slice(0, 1)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-[23px] font-bold">{name}</h1>
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-primary bg-primary-weak border px-2.5 py-1 rounded-full" style={{ borderColor: "var(--accent2)" }}>★ {title}</span>
          </div>
          <div className="text-[13px] text-dim mt-1">総合ランク — · 連勝 {stats?.current_streak ?? 0}</div>
        </div>
        <button onClick={claim} className="h-[42px] px-[18px] text-white rounded-[12px] font-bold text-[13.5px] shrink-0" style={{ background: "var(--grad)", boxShadow: "var(--cta-glow)" }}>
          デイリー受取 / Claim
        </button>
      </div>
      {claimMsg && <p className="text-sm text-primary">{claimMsg}</p>}
      <div className="text-right">
        <a href="/api/auth/logout" className="text-xs text-dim hover:text-text underline">ログアウト</a>
      </div>

      {/* ステータス */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))" }}>
        <StatCard label="参加ポイント / Balance" value={`${formatPoints(balance)}`} unit="pt" />
        <StatCard label="賞品ポイント / Prize" value={`${formatPoints(prizeBalance)}`} unit="pt" cls="text-primary" />
        <StatCard label="評価額 / Positions" value={`${formatPoints(holdValue)}`} unit="pt" />
        <StatCard label="合計損益 / P&L" value={pnlText(unrealized).text} cls={pnlText(unrealized).cls} />
        <StatCard label="的中率 / Hit rate" value={hitRate === null ? "—" : `${hitRate}%`} />
        <StatCard label="連勝 / Streak" value={`${stats?.current_streak ?? 0}`} cls="text-primary" />
      </div>

      {/* 称号コレクション */}
      <section className="border border-border bg-surface rounded-[var(--radius)] p-5" style={{ boxShadow: "var(--shadow)" }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-bold">称号コレクション / Badges</h2>
          <span className="text-xs text-dim">{earnedCount} / {badges.length} 獲得</span>
        </div>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))" }}>
          {badges.map((b) => (
            <div key={b.id} className={`flex items-center gap-3 p-3 rounded-[14px] ${b.earned ? "bg-surface2" : "opacity-50"}`}>
              <div className="w-10 h-10 rounded-[11px] grid place-items-center text-white font-extrabold" style={{ background: b.earned ? "var(--grad)" : "var(--faint)" }}>★</div>
              <div className="min-w-0">
                <div className="text-[13px] font-bold truncate">{b.name}</div>
                <div className="text-[11px] text-dim truncate">{b.description}</div>
              </div>
            </div>
          ))}
          {badges.length === 0 && <p className="text-dim text-sm">称号がありません</p>}
        </div>
      </section>

      {/* 保有 */}
      <section>
        <h2 className="text-[15px] font-bold mb-2">保有ポジション</h2>
        {holdings.length === 0 ? (
          <p className="text-dim text-sm">まだ予想がありません。<Link href="/" className="text-primary underline">市場を見る →</Link></p>
        ) : (
          <div className="border border-border bg-surface rounded-[var(--radius)] divide-y divide-border" style={{ boxShadow: "var(--shadow)" }}>
            {holdings.map((h, i) => {
              const pnl = pnlText(h.value - h.costBasis);
              return (
                <Link key={i} href={`/market/${h.marketId}`} className="flex items-center gap-3 p-3 hover:bg-surface2">
                  <span className="flex-1 text-sm truncate">{h.question}</span>
                  <span className="mono text-xs text-dim">{h.label} {h.shares}株</span>
                  <span className={`mono text-sm ${pnl.cls}`}>{pnl.text}</span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* 賞品ポイント（二層ポイント制 Phase B） */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[15px] font-bold">賞品ポイント / Prize points</h2>
          <span className="text-xs text-dim">予想が的中すると貯まる・景品と交換予定</span>
        </div>
        <div className="border border-border bg-surface rounded-[var(--radius)] p-5" style={{ boxShadow: "var(--shadow)" }}>
          <div className="flex items-end justify-between flex-wrap gap-2">
            <div>
              <div className="text-xs text-dim font-semibold mb-1">残高 / Balance</div>
              <div className="mono text-[26px] font-bold text-primary">{formatPoints(prizeBalance)}<span className="text-xs text-dim"> pt</span></div>
            </div>
            {nextExpiry && (
              <div className="text-right">
                <div className="text-xs text-dim font-semibold mb-1">最短の有効期限</div>
                <div className="mono text-sm">{new Date(nextExpiry).toLocaleDateString("ja-JP")}</div>
              </div>
            )}
          </div>
          {prizeLedger.length > 0 && (
            <div className="mt-4 border-t border-border divide-y divide-border">
              {prizeLedger.map((l) => (
                <div key={l.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="mono text-dim text-xs w-32">{new Date(l.created_at).toLocaleString("ja-JP")}</span>
                  <span className="flex-1">{PRIZE_REASON_LABEL[l.reason] ?? l.reason}</span>
                  {l.delta > 0 && l.expires_at && (
                    <span className="text-xs text-dim">〜{new Date(l.expires_at).toLocaleDateString("ja-JP")}</span>
                  )}
                  <span className={`mono ${l.delta >= 0 ? "text-pos" : "text-neg"}`}>{l.delta >= 0 ? "+" : ""}{formatPoints(l.delta)}</span>
                  <span className="mono text-xs text-dim w-20 text-right">{formatPoints(l.balance_after)}</span>
                </div>
              ))}
            </div>
          )}
          {prizeLedger.length === 0 && (
            <p className="mt-3 text-dim text-sm">まだ賞品ポイントはありません。予想を的中させると貯まります。</p>
          )}
        </div>
      </section>

      {/* 履歴 */}
      <section>
        <h2 className="text-[15px] font-bold mb-2">取引履歴 / Activity</h2>
        <div className="border border-border bg-surface rounded-[var(--radius)] divide-y divide-border" style={{ boxShadow: "var(--shadow)" }}>
          {ledger.map((l) => (
            <div key={l.id} className="flex items-center gap-3 p-3 text-sm">
              <span className="mono text-dim text-xs w-32">{new Date(l.created_at).toLocaleString("ja-JP")}</span>
              <span className="flex-1">{LEDGER_REASON_LABEL[l.reason] ?? l.reason}</span>
              <span className={`mono ${l.delta >= 0 ? "text-pos" : "text-neg"}`}>{l.delta >= 0 ? "+" : ""}{formatPoints(l.delta)}</span>
              <span className="mono text-xs text-dim w-20 text-right">{formatPoints(l.balance_after)}</span>
            </div>
          ))}
          {ledger.length === 0 && <p className="p-4 text-dim text-sm text-center">履歴がありません</p>}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, unit, cls }: { label: string; value: string; unit?: string; cls?: string }) {
  return (
    <div className="border border-border bg-surface rounded-[16px] p-4" style={{ boxShadow: "var(--shadow)" }}>
      <div className="text-xs text-dim font-semibold mb-1.5">{label}</div>
      <div className={`mono text-[22px] font-bold ${cls ?? ""}`}>{value}{unit && <span className="text-xs text-dim"> {unit}</span>}</div>
    </div>
  );
}
function Center({ children }: { children: React.ReactNode }) {
  return <div className="max-w-[1100px] mx-auto px-4 md:px-[22px] py-20 text-center text-dim">{children}</div>;
}
