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
    <div className="max-w-[760px] mx-auto px-4 md:px-[22px] py-6 pb-20 dm-in">
      <header>
        <h1 className="text-[24px] font-black">貯める</h1>
        <p className="text-[12px] text-dim mt-1">もらえるのは<b className="text-text">換金不可の参加ポイント</b>です</p>
      </header>

      {err && <p className="text-sm text-neg mt-4">{err}</p>}
      {!loggedIn && (
        <p className="text-sm text-dim border border-border bg-surface rounded-[16px] p-4 mt-4">
          参加するにはログインが必要です。<a href="/api/auth/line/login" className="text-primary underline">LINEでログイン →</a>
        </p>
      )}

      {/* ボーナス（近日公開） */}
      <h2 className="text-[13px] font-extrabold text-dim mt-6 mb-2.5">ボーナス</h2>
      <div className="space-y-3">
        <BonusRow tone="primary" title="Xでシェアボーナス" sub={<>予想をシェアで <b className="text-text mono">+20pt</b>／日</>} soon
          icon={<svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor"><path d="M18.9 1.6h3.7l-8.1 9.2L24 22.4h-7.4l-5.8-7.6-6.7 7.6H.5l8.6-9.9L0 1.6h7.6l5.2 6.9 6.1-6.9Zm-1.3 18.6h2L6.5 3.7H4.3l13.3 16.5Z" /></svg>} />
        <BonusRow tone="pos" title="友達紹介" sub={<>1人につき <b className="text-text mono">+200pt</b></>} soon
          icon={<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0 1 12 0M17 11h4M19 9v4" /></svg>} />
        <div className="border border-border bg-surface rounded-[16px] p-[15px]" style={{ boxShadow: "var(--shadow)" }}>
          <div className="text-[13px] font-extrabold mb-1.5">「乗っかり」→ 的中で +1%</div>
          <p className="text-[11.5px] text-dim leading-[1.65]">友達の予想に乗っかって、その予想が的中したら、獲得ポイントの <b className="text-primary">1%</b> がボーナスでもらえる。みんなで当てるほどお得。<span className="text-faint">（近日公開）</span></p>
        </div>
      </div>

      {/* 案件（実装済み） */}
      <h2 className="text-[13px] font-extrabold text-dim mt-7 mb-2.5">案件でためる</h2>
      <p className="text-[12px] text-dim mb-3 leading-relaxed">提携サービスの案件を完了すると参加ポイントを無償でプレゼント。①「貯める」→ ②提携先で条件達成 → ③確認後に付与（反映に数日かかる場合があります）。</p>
      {offers.length === 0 ? (
        <p className="text-dim text-sm border border-border bg-surface rounded-[16px] p-8 text-center">
          現在ご案内できる案件はありません。順次追加予定です。<br />
          <Link href="/" className="text-primary underline">市場で予想する →</Link>
        </p>
      ) : (
        <div className="space-y-3">
          {offers.map((o) => (
            <div key={o.id} className="border border-border bg-surface rounded-[16px] p-3.5 flex items-center gap-3" style={{ boxShadow: "var(--shadow)" }}>
              <div className="w-12 h-12 rounded-[12px] bg-surface2 grid place-items-center overflow-hidden shrink-0">
                {o.image_url ? <img src={o.image_url} alt={o.name} className="w-full h-full object-cover" /> : <span className="text-xl text-primary font-black">＋</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-extrabold text-[14px] leading-snug truncate">{o.name}</div>
                <div className="mono text-pos font-extrabold text-[13.5px] mt-0.5">+{formatPoints(o.reward_points)}<span className="text-[11px] text-dim font-bold"> 参加pt</span></div>
              </div>
              <button onClick={() => go(o)} disabled={!loggedIn || busy === o.id}
                className="btn-press h-[38px] px-4 rounded-[11px] text-white font-bold text-[13px] disabled:opacity-40 shrink-0"
                style={{ background: "var(--grad)", boxShadow: loggedIn ? "var(--cta-glow)" : "none" }}>
                {busy === o.id ? "…" : loggedIn ? "貯める" : "要ログイン"}
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-[10.5px] text-faint text-center leading-relaxed mt-6">付与されるポイントはすべて換金不可・無償の参加ポイントです。提携先での登録等はご自身の判断で行ってください。</p>
    </div>
  );
}

function BonusRow({ tone, title, sub, icon, soon }: { tone: "primary" | "pos"; title: string; sub: React.ReactNode; icon: React.ReactNode; soon?: boolean }) {
  const tc = tone === "primary" ? "text-primary" : "text-pos";
  const bg = tone === "primary" ? "bg-primary-weak" : "bg-pos-weak";
  return (
    <div className="border border-border bg-surface rounded-[16px] p-3.5 flex items-center gap-3" style={{ boxShadow: "var(--shadow)" }}>
      <div className={`w-10 h-10 rounded-[11px] grid place-items-center shrink-0 ${bg} ${tc}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-extrabold">{title}</div>
        <div className="text-[11px] text-dim">{sub}</div>
      </div>
      <span className={`text-[11px] font-extrabold ${tc} ${bg} px-3 py-1.5 rounded-[10px] shrink-0`}>{soon ? "近日公開" : "受け取る"}</span>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="max-w-[1100px] mx-auto px-4 md:px-[22px] py-20 text-center text-dim">{children}</div>;
}
