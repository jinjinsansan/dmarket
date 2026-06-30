"use client";
// 景品一覧＋確定交換（二層ポイント制 Phase C）。ゴリラコインで景品と交換（抽選なし）。
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatPoints } from "@/lib/format";
import { CoinIcon } from "@/components/CoinIcon";
import type { Prize, ShippingInfo } from "@/lib/types";

const REDEEM_ERROR: Record<string, string> = {
  not_authenticated: "交換にはログインが必要です（LINEログイン）。",
  prize_unavailable: "この景品は現在交換できません。",
  out_of_stock: "在庫切れです。",
  insufficient_prize_points: "ゴリラコインが不足しています。",
};

export default function PrizesPage() {
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [balance, setBalance] = useState(0);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [target, setTarget] = useState<Prize | null>(null);

  const load = useCallback(async () => {
    const sb = createClient();
    const { data: { session } } = await sb.auth.getSession();
    const user = session?.user;
    const [{ data: pz }, prizeWallet] = await Promise.all([
      sb.from("prizes").select("*").eq("is_active", true).order("display_order").order("created_at"),
      user ? sb.from("prize_wallets").select("balance").eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    setLoggedIn(Boolean(user));
    setBalance((prizeWallet?.data?.balance as number) ?? 0);
    setPrizes((pz as Prize[]) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <Center>読み込み中…</Center>;

  return (
    <div className="max-w-[1100px] mx-auto px-4 md:px-[22px] py-6 pb-20 dm-in space-y-5">
      <div>
        <h1 className="text-[24px] font-black">景品交換</h1>
        <p className="text-[12px] text-dim mt-1 mb-3">予想を当てて貯めた<b className="text-text">ゴリラコイン</b>を交換（<b className="text-text">1コイン=1円相当</b>・確定交換・抽選なし）</p>
        {loggedIn && (
          <div className="flex justify-between items-center rounded-[14px] px-4 py-3 border" style={{ background: "var(--primary-weak)", borderColor: "var(--primary)" }}>
            <span className="text-[12px] font-extrabold text-primary inline-flex items-center gap-1.5"><CoinIcon size={16} />ゴリラコイン残高</span>
            <span className="mono text-[20px] font-extrabold text-primary">{formatPoints(balance)} <span className="text-[12px]">コイン</span></span>
          </div>
        )}
      </div>

      {!loggedIn && (
        <p className="text-sm text-dim border border-border bg-surface rounded-[var(--radius)] p-4">
          交換にはログインが必要です。<a href="/api/auth/line/login" className="text-primary underline">LINEでログイン →</a>
        </p>
      )}

      {prizes.length === 0 ? (
        <p className="text-dim text-sm border border-border bg-surface rounded-[var(--radius)] p-8 text-center">
          現在交換できる景品はありません。順次追加予定です。<br />
          <Link href="/" className="text-primary underline">市場で予想する →</Link>
        </p>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))" }}>
          {prizes.map((p) => {
            const soldOut = p.stock !== null && p.stock <= 0;
            const canAfford = loggedIn && balance >= p.cost_points;
            return (
              <div key={p.id} className="border border-border bg-surface rounded-[var(--radius)] overflow-hidden flex flex-col" style={{ boxShadow: "var(--shadow)" }}>
                <div className="aspect-[3/2] bg-surface2 grid place-items-center overflow-hidden">
                  {p.image_url
                    ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                    : <span className="text-4xl">🎁</span>}
                </div>
                <div className="p-3.5 flex-1 flex flex-col gap-2">
                  <div className="font-bold text-[14.5px] leading-snug">{p.name}</div>
                  {p.description && <p className="text-[12.5px] text-dim leading-relaxed flex-1">{p.description}</p>}
                  <div className="flex items-center justify-between mt-1">
                    <span className="mono text-primary font-bold text-[17px] inline-flex items-center gap-1"><CoinIcon size={15} />{formatPoints(p.cost_points)}<span className="text-xs text-dim">コイン</span></span>
                    <span className="text-[11px] text-dim">{p.stock === null ? "" : soldOut ? "在庫切れ" : `残り${p.stock}`}</span>
                  </div>
                  <button
                    onClick={() => setTarget(p)}
                    disabled={!loggedIn || soldOut || !canAfford}
                    className="h-[40px] rounded-[11px] text-white font-bold text-[13.5px] disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: "var(--grad)", boxShadow: canAfford && !soldOut ? "var(--cta-glow)" : "none" }}>
                    {soldOut ? "在庫切れ" : !loggedIn ? "ログインで交換" : !canAfford ? "コイン不足" : "交換する"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {target && (
        <RedeemModal prize={target} onClose={() => setTarget(null)} onDone={() => { setTarget(null); load(); }} />
      )}
    </div>
  );
}

function RedeemModal({ prize, onClose, onDone }: { prize: Prize; onClose: () => void; onDone: () => void }) {
  const [ship, setShip] = useState<ShippingInfo>({ name: "", postal: "", addr: "", tel: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!ship.name || !ship.addr) { setErr("お名前と住所を入力してください。"); return; }
    setBusy(true); setErr(null);
    const { data, error } = await createClient().rpc("redeem_prize", { p_prize_id: prize.id, p_shipping: ship });
    setBusy(false);
    if (error) {
      const code = error.message.replace(/^.*: /, "").trim();
      setErr(REDEEM_ERROR[code] ?? `交換に失敗しました（${error.message}）`);
      return;
    }
    if (data?.ok) { window.dispatchEvent(new Event("wallet:refresh")); onDone(); }
    else setErr("交換に失敗しました。");
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-surface border border-border rounded-[var(--radius)] w-full max-w-md p-5 space-y-3" style={{ boxShadow: "var(--shadow)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-[16px] font-bold">{prize.name} と交換</h2>
            <p className="text-[12.5px] text-dim mt-0.5">必要 <b className="text-primary mono">{formatPoints(prize.cost_points)} コイン</b> ・確定交換（取消は発送前のみ）</p>
          </div>
          <button onClick={onClose} className="text-dim hover:text-text text-xl leading-none">×</button>
        </div>

        <div className="space-y-2">
          <Field label="お名前" value={ship.name ?? ""} onChange={(v) => setShip({ ...ship, name: v })} placeholder="山田 太郎" />
          <Field label="郵便番号" value={ship.postal ?? ""} onChange={(v) => setShip({ ...ship, postal: v })} placeholder="100-0001" />
          <Field label="住所" value={ship.addr ?? ""} onChange={(v) => setShip({ ...ship, addr: v })} placeholder="東京都千代田区…" />
          <Field label="電話番号" value={ship.tel ?? ""} onChange={(v) => setShip({ ...ship, tel: v })} placeholder="090-0000-0000" />
          <Field label="備考（任意）" value={ship.note ?? ""} onChange={(v) => setShip({ ...ship, note: v })} placeholder="" />
        </div>

        {err && <p className="text-sm text-neg">{err}</p>}
        <p className="text-[11px] text-faint">配送先は景品発送のためにのみ利用し、適切に管理します（<a href="/legal/privacy" className="underline">プライバシーポリシー</a>）。デジタル景品の場合、住所は不要なことがあります。</p>

        <div className="flex gap-2">
          <button onClick={submit} disabled={busy} className="flex-1 h-[42px] rounded-[11px] text-white font-bold text-sm disabled:opacity-50" style={{ background: "var(--grad)", boxShadow: "var(--cta-glow)" }}>
            {busy ? "処理中…" : "交換を確定する"}
          </button>
          <button onClick={onClose} className="h-[42px] px-4 rounded-[11px] border border-border text-dim text-sm">やめる</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-[11.5px] text-dim font-semibold">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full mt-0.5 h-10 px-3 rounded-[10px] border border-border bg-surface2 text-base md:text-sm outline-none focus:border-primary" />
    </label>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="max-w-[1100px] mx-auto px-4 md:px-[22px] py-20 text-center text-dim">{children}</div>;
}
