"use client";
// マイページ。プロフィール（ニックネーム・アイコン編集）・配送先・景品配送状況・ステータス・称号・保有・履歴。
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { lmsrPrice } from "@/lib/lmsr";
import { formatPoints, pnlText } from "@/lib/format";
import { LEDGER_REASON_LABEL, PRIZE_REASON_LABEL } from "@/lib/constants";
import type { LedgerRow, PrizeLedgerRow, ShippingInfo } from "@/lib/types";

interface Holding { marketId: string; question: string; label: string; shares: number; costBasis: number; value: number; }
interface Badge { id: string; name: string; description: string | null; earned: boolean; }
interface Stats { net_worth: number; win_count: number; resolved_count: number; current_streak: number; }
interface Redemption {
  id: string; prize_name: string; image_url: string | null; cost_points: number; status: string;
  tracking_carrier: string | null; tracking_number: string | null; shipped_at: string | null; created_at: string;
}

const RED_STATUS: Record<string, { label: string; cls: string }> = {
  requested: { label: "申込受付", cls: "text-primary bg-primary/10" },
  approved: { label: "発送準備中", cls: "text-primary bg-primary/10" },
  shipped: { label: "発送済み", cls: "text-pos bg-pos/10" },
  cancelled: { label: "取消", cls: "text-faint bg-surface2" },
};

export default function MyPage() {
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [uid, setUid] = useState("");
  const [lineName, setLineName] = useState("プレイヤー");
  const [nickname, setNickname] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [balance, setBalance] = useState(0);
  const [prizeBalance, setPrizeBalance] = useState(0);
  const [prizeLedger, setPrizeLedger] = useState<PrizeLedgerRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [shipping, setShipping] = useState<ShippingInfo>({ name: "", postal: "", addr: "", tel: "", note: "" });
  const [editProfile, setEditProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingShip, setSavingShip] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [claimMsg, setClaimMsg] = useState<string | null>(null);

  const name = nickname || lineName;

  async function load() {
    const sb = createClient();
    const { data: { session } } = await sb.auth.getSession();
    const user = session?.user;
    if (!user) { setLoggedIn(false); setLoading(false); return; }
    setLoggedIn(true);
    setUid(user.id);

    const [{ data: wallet }, { data: prizeWallet }, { data: profile }, { data: priv }, { data: st },
      { data: positions }, { data: led }, { data: prizeLed }, { data: allBadges }, { data: mine }, { data: reds }] =
      await Promise.all([
        sb.from("wallets").select("balance").eq("user_id", user.id).maybeSingle(),
        sb.from("prize_wallets").select("balance").eq("user_id", user.id).maybeSingle(),
        sb.from("profiles").select("display_name, nickname, avatar_url").eq("user_id", user.id).maybeSingle(),
        sb.from("profile_private").select("shipping").eq("user_id", user.id).maybeSingle(),
        sb.from("user_stats").select("net_worth, win_count, resolved_count, current_streak").eq("user_id", user.id).maybeSingle(),
        sb.from("positions").select("shares, cost_basis, outcome:outcomes(id, label, market_id)").gt("shares", 0),
        sb.from("point_ledger").select("id, delta, reason, shares, balance_after, created_at").order("created_at", { ascending: false }).limit(50),
        sb.from("prize_ledger").select("id, delta, reason, expires_at, balance_after, created_at").order("created_at", { ascending: false }).limit(50),
        sb.from("badges").select("id, name, description"),
        sb.from("user_badges").select("badge_id").eq("user_id", user.id),
        sb.rpc("my_redemptions"),
      ]);

    setBalance(wallet?.balance ?? 0);
    setPrizeBalance(prizeWallet?.balance ?? 0);
    setPrizeLedger((prizeLed as PrizeLedgerRow[]) ?? []);
    if (profile?.display_name) setLineName(profile.display_name);
    setNickname((profile?.nickname as string) ?? "");
    setAvatarUrl((profile?.avatar_url as string) ?? "");
    if (priv?.shipping) setShipping({ name: "", postal: "", addr: "", tel: "", note: "", ...(priv.shipping as ShippingInfo) });
    setStats((st as Stats) ?? { net_worth: wallet?.balance ?? 0, win_count: 0, resolved_count: 0, current_streak: 0 });
    setLedger((led as LedgerRow[]) ?? []);
    setRedemptions((reds as Redemption[]) ?? []);
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
  }
  useEffect(() => { load(); }, []);

  async function saveProfile() {
    setSavingProfile(true); setMsg(null);
    const { error } = await createClient().rpc("update_my_profile", { p_nickname: nickname, p_avatar_url: avatarUrl });
    setSavingProfile(false);
    if (error) { setMsg(error.message.includes("nickname_too_long") ? "ニックネームは20文字までです。" : `保存に失敗しました（${error.message}）`); return; }
    setMsg("プロフィールを保存しました"); setEditProfile(false);
    window.dispatchEvent(new Event("wallet:refresh"));
  }

  async function saveShipping() {
    if (!shipping.name || !shipping.addr) { setMsg("お名前と住所を入力してください。"); return; }
    setSavingShip(true); setMsg(null);
    const { error } = await createClient().rpc("update_my_shipping", { p_shipping: shipping });
    setSavingShip(false);
    setMsg(error ? `保存に失敗しました（${error.message}）` : "配送先を保存しました");
  }

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
      <p className="text-xs text-faint"><a href="/api/auth/line/login" className="text-primary underline">LINEでログイン →</a></p>
    </Center>
  );

  const holdValue = holdings.reduce((s, h) => s + h.value, 0);
  const holdCost = holdings.reduce((s, h) => s + h.costBasis, 0);
  const unrealized = holdValue - holdCost;
  const hitRate = stats && stats.resolved_count > 0 ? Math.round((stats.win_count / stats.resolved_count) * 100) : null;
  const earnedCount = badges.filter((b) => b.earned).length;
  const title = stats && stats.current_streak >= 5 ? "予言者 / Oracle" : "トレーダー / Trader";
  const now = Date.now();
  const nextExpiry = prizeLedger
    .filter((l) => l.delta > 0 && l.expires_at && new Date(l.expires_at).getTime() > now)
    .map((l) => new Date(l.expires_at as string).getTime())
    .sort((a, b) => a - b)[0];

  return (
    <div className="max-w-[1100px] mx-auto px-4 md:px-[22px] py-6 pb-20 dm-in space-y-5">
      {/* プロフィール */}
      <div className="border border-border bg-surface rounded-[var(--radius)] p-4 sm:p-6" style={{ boxShadow: "var(--shadow)" }}>
        <div className="flex items-center gap-4 sm:gap-5 flex-wrap">
          <Avatar url={avatarUrl} name={name} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[20px] sm:text-[23px] font-bold truncate max-w-full">{name}</h1>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-primary bg-primary-weak border px-2.5 py-1 rounded-full whitespace-nowrap shrink-0" style={{ borderColor: "var(--accent2)" }}>★ {title}</span>
            </div>
            <div className="text-[13px] text-dim mt-1">連勝 {stats?.current_streak ?? 0} · 表示名はニックネーム優先</div>
            <button onClick={() => { setEditProfile((v) => !v); setMsg(null); }} className="mt-2 text-[12.5px] text-primary underline">
              {editProfile ? "編集を閉じる" : "ニックネーム・アイコンを編集"}
            </button>
          </div>
          <button onClick={claim} className="h-[42px] px-[18px] text-white rounded-[12px] font-bold text-[13.5px] w-full sm:w-auto sm:shrink-0" style={{ background: "var(--grad)", boxShadow: "var(--cta-glow)" }}>
            デイリー受取 / Claim
          </button>
        </div>

        {editProfile && (
          <div className="mt-5 pt-5 border-t border-border space-y-3 max-w-md">
            <label className="block">
              <span className="text-[12px] text-dim font-semibold">ニックネーム（20文字まで）</span>
              <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={20} placeholder="表示名（未設定ならLINEの名前）"
                className="w-full mt-1 h-10 px-3 rounded-[10px] border border-border bg-surface2 text-base sm:text-sm outline-none focus:border-primary" />
              <span className="text-[11px] text-faint">空にするとLINEの名前（{lineName}）が表示されます。</span>
            </label>
            <div>
              <span className="text-[12px] text-dim font-semibold">アイコン画像</span>
              <div className="mt-1">
                <ImageUpload value={avatarUrl} onChange={setAvatarUrl} bucket="avatars" folder={uid} shape="circle" />
              </div>
            </div>
            <button onClick={saveProfile} disabled={savingProfile} className="h-[42px] px-5 rounded-[11px] text-white font-bold text-sm disabled:opacity-50" style={{ background: "var(--grad)", boxShadow: "var(--cta-glow)" }}>
              {savingProfile ? "保存中…" : "プロフィールを保存"}
            </button>
          </div>
        )}
      </div>
      {(msg || claimMsg) && <p className="text-sm text-primary">{msg ?? claimMsg}</p>}
      <div className="text-right">
        <a href="/api/auth/logout" className="text-xs text-dim hover:text-text underline">ログアウト</a>
      </div>

      {/* ステータス */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))" }}>
        <StatCard label="参加ポイント / Balance" value={`${formatPoints(balance)}`} unit="pt" />
        <StatCard label="ゴリラコイン / Prize" value={`${formatPoints(prizeBalance)}`} unit="コイン" cls="text-primary" />
        <StatCard label="評価額 / Positions" value={`${formatPoints(holdValue)}`} unit="pt" />
        <StatCard label="合計損益 / P&L" value={pnlText(unrealized).text} cls={pnlText(unrealized).cls} />
        <StatCard label="的中率 / Hit rate" value={hitRate === null ? "—" : `${hitRate}%`} />
        <StatCard label="連勝 / Streak" value={`${stats?.current_streak ?? 0}`} cls="text-primary" />
      </div>

      {/* 景品の交換・配送状況 */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[15px] font-bold">景品の交換・配送状況</h2>
          <Link href="/prizes" className="text-xs text-primary underline">景品一覧へ →</Link>
        </div>
        <div className="border border-border bg-surface rounded-[var(--radius)] divide-y divide-border" style={{ boxShadow: "var(--shadow)" }}>
          {redemptions.length === 0 ? (
            <p className="p-4 text-dim text-sm text-center">まだ景品交換の申込はありません。</p>
          ) : redemptions.map((r) => {
            const s = RED_STATUS[r.status] ?? { label: r.status, cls: "text-dim bg-surface2" };
            return (
              <div key={r.id} className="p-3.5 space-y-1.5">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-dim text-xs w-24 shrink-0">{new Date(r.created_at).toLocaleDateString("ja-JP", { year: "2-digit", month: "numeric", day: "numeric" })}</span>
                  <span className="font-semibold text-sm flex-1 min-w-0 truncate">{r.prize_name}</span>
                  <span className="mono text-primary text-[13px]">{formatPoints(r.cost_points)} コイン</span>
                  <span className={`text-[11px] rounded-full px-2.5 py-0.5 font-bold ${s.cls}`}>{s.label}</span>
                </div>
                {r.status === "shipped" && (
                  <div className="text-xs bg-surface2 rounded-[8px] px-2.5 py-1.5 flex flex-wrap gap-x-4 gap-y-0.5">
                    <span className="text-dim">発送日: <b className="text-text">{r.shipped_at ? new Date(r.shipped_at).toLocaleDateString("ja-JP") : "—"}</b></span>
                    <span className="text-dim">運送会社: <b className="text-text">{r.tracking_carrier || "—"}</b></span>
                    <span className="text-dim">追跡番号: <b className="text-text mono">{r.tracking_number || "—"}</b></span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 配送先住所 */}
      <section className="border border-border bg-surface rounded-[var(--radius)] p-5" style={{ boxShadow: "var(--shadow)" }}>
        <h2 className="text-[15px] font-bold mb-1">配送先住所</h2>
        <p className="text-[12px] text-dim mb-3">景品の発送に使います。ここに保存すると交換時に自動入力されます（本人のみ閲覧）。</p>
        <div className="grid sm:grid-cols-2 gap-2.5 max-w-2xl">
          <Field label="お名前" value={shipping.name ?? ""} onChange={(v) => setShipping({ ...shipping, name: v })} placeholder="山田 太郎" />
          <Field label="郵便番号" value={shipping.postal ?? ""} onChange={(v) => setShipping({ ...shipping, postal: v })} placeholder="100-0001" />
          <Field label="住所" value={shipping.addr ?? ""} onChange={(v) => setShipping({ ...shipping, addr: v })} placeholder="東京都千代田区…" wide />
          <Field label="電話番号" value={shipping.tel ?? ""} onChange={(v) => setShipping({ ...shipping, tel: v })} placeholder="090-0000-0000" />
        </div>
        <button onClick={saveShipping} disabled={savingShip} className="mt-3 h-[40px] px-5 rounded-[11px] text-white font-bold text-sm disabled:opacity-50" style={{ background: "var(--grad)" }}>
          {savingShip ? "保存中…" : "配送先を保存"}
        </button>
      </section>

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

      {/* ゴリラコイン */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[15px] font-bold">ゴリラコイン / Prize points</h2>
          <Link href="/prizes" className="text-xs text-primary underline">景品一覧・交換へ →</Link>
        </div>
        <div className="border border-border bg-surface rounded-[var(--radius)] p-5" style={{ boxShadow: "var(--shadow)" }}>
          <div className="flex items-end justify-between flex-wrap gap-2">
            <div>
              <div className="text-xs text-dim font-semibold mb-1">残高 / Balance</div>
              <div className="mono text-[26px] font-bold text-primary">{formatPoints(prizeBalance)}<span className="text-xs text-dim"> コイン</span></div>
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
            <p className="mt-3 text-dim text-sm">まだゴリラコインはありません。予想を的中させると貯まります。</p>
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

function Avatar({ url, name }: { url: string; name: string }) {
  if (url) return (
    <img src={url} alt={name} className="w-16 h-16 sm:w-[76px] sm:h-[76px] rounded-full object-cover shrink-0 border border-border" />
  );
  return (
    <div className="w-16 h-16 sm:w-[76px] sm:h-[76px] rounded-full grid place-items-center text-white text-xl sm:text-2xl font-extrabold shrink-0" style={{ background: "var(--grad)", boxShadow: "var(--cta-glow)" }}>
      {name.slice(0, 1)}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, wide }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; wide?: boolean }) {
  return (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className="text-[11.5px] text-dim font-semibold">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full mt-0.5 h-10 px-3 rounded-[10px] border border-border bg-surface2 text-base sm:text-sm outline-none focus:border-primary" />
    </label>
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
