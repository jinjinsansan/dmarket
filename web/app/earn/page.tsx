"use client";
// 参加ポイントを貯める（アフィリエイト成果型 Phase 1）。提携案件を完了すると参加ptを無償付与。
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatPoints } from "@/lib/format";
import type { AffiliateOffer } from "@/lib/types";

export default function EarnPage() {
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [offers, setOffers] = useState<AffiliateOffer[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = createClient();
    const { data: { session } } = await sb.auth.getSession();
    setLoggedIn(Boolean(session?.user));
    const { data } = await sb.from("affiliate_offers").select("*").eq("is_active", true).order("display_order").order("created_at");
    setOffers((data as AffiliateOffer[]) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function go(offer: AffiliateOffer) {
    setBusy(offer.id); setErr(null);
    const { data, error } = await createClient().rpc("create_affiliate_click", { p_offer_id: offer.id });
    if (error || !data?.url) {
      setBusy(null);
      setErr(error?.message?.includes("not_authenticated") ? "ログインが必要です。" : "開始できませんでした。時間をおいて再度お試しください。");
      return;
    }
    window.location.href = data.url as string;
  }

  if (loading) return <Center>読み込み中…</Center>;

  return (
    <div className="max-w-[1100px] mx-auto px-4 md:px-[22px] py-6 pb-20 dm-in space-y-5">
      <div>
        <h1 className="text-[23px] font-bold">ポイントを貯める / Earn</h1>
        <p className="text-[13px] text-dim mt-1">提携サービスの案件を完了すると、<b className="text-text">参加ポイント</b>を無償でプレゼント。お金は一切かかりません。</p>
      </div>

      <div className="border border-border bg-surface rounded-[var(--radius)] p-4 text-[12.5px] text-dim leading-relaxed" style={{ boxShadow: "var(--shadow)" }}>
        ① 案件の「貯める」を押す → ② 提携先で登録などの条件を達成 → ③ 確認後に参加ポイントを付与（反映に数日かかる場合があります）。
      </div>

      {err && <p className="text-sm text-neg">{err}</p>}
      {!loggedIn && (
        <p className="text-sm text-dim border border-border bg-surface rounded-[var(--radius)] p-4">
          案件に参加するにはログインが必要です。<a href="/api/auth/line/login" className="text-primary underline">LINEでログイン →</a>
        </p>
      )}

      {offers.length === 0 ? (
        <p className="text-dim text-sm border border-border bg-surface rounded-[var(--radius)] p-8 text-center">
          現在ご案内できる案件はありません。順次追加予定です。<br />
          <Link href="/" className="text-primary underline">市場で予想する →</Link>
        </p>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,300px),1fr))" }}>
          {offers.map((o) => (
            <div key={o.id} className="border border-border bg-surface rounded-[var(--radius)] overflow-hidden flex flex-col" style={{ boxShadow: "var(--shadow)" }}>
              <div className="flex items-stretch">
                <div className="w-24 shrink-0 bg-surface2 grid place-items-center overflow-hidden">
                  {o.image_url ? <img src={o.image_url} alt={o.name} className="w-full h-full object-cover" /> : <span className="text-3xl">＋</span>}
                </div>
                <div className="p-3.5 flex-1 min-w-0">
                  <div className="font-bold text-[14.5px] leading-snug">{o.name}</div>
                  {o.description && <p className="text-[12px] text-dim leading-relaxed mt-1 line-clamp-3">{o.description}</p>}
                </div>
              </div>
              <div className="px-3.5 pb-3.5 mt-auto flex items-center justify-between gap-2">
                <span className="mono text-pos font-bold text-[15px]">+{formatPoints(o.reward_points)} <span className="text-xs text-dim">参加pt</span></span>
                <button onClick={() => go(o)} disabled={!loggedIn || busy === o.id}
                  className="h-[38px] px-4 rounded-[11px] text-white font-bold text-[13px] disabled:opacity-40"
                  style={{ background: "var(--grad)", boxShadow: loggedIn ? "var(--cta-glow)" : "none" }}>
                  {busy === o.id ? "…" : loggedIn ? "貯める" : "要ログイン"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-faint">参加ポイントは予想の売買に使う換金不可のポイントです（景品交換は賞品ポイント）。提携先での登録等はご自身の判断で行ってください。</p>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="max-w-[1100px] mx-auto px-4 md:px-[22px] py-20 text-center text-dim">{children}</div>;
}
