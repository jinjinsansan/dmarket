"use client";
// 参加ポイントを貯める（アフィリエイト成果型 Phase 1）。提携案件を完了すると参加ptを無償付与。
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatPoints } from "@/lib/format";
import { Toast } from "@/components/Toast";
import { setRefCode as cacheRefCode, withRef } from "@/lib/ref";
import type { AffiliateOffer } from "@/lib/types";

export default function EarnPage() {
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [offers, setOffers] = useState<AffiliateOffer[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [refCode, setRefCode] = useState<string | null>(null);
  const [refCount, setRefCount] = useState(0);
  const [refInput, setRefInput] = useState("");
  const [origin, setOrigin] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2800); };

  const load = useCallback(async () => {
    const sb = createClient();
    setOrigin(window.location.origin);
    const { data: { session } } = await sb.auth.getSession();
    const li = Boolean(session?.user);
    setLoggedIn(li);
    const { data } = await sb.from("affiliate_offers").select("*").eq("is_active", true).order("display_order").order("created_at");
    setOffers((data as AffiliateOffer[]) ?? []);
    if (li) {
      const { data: rc } = await sb.rpc("my_referral_code");
      if (rc?.code) { setRefCode(rc.code as string); cacheRefCode(rc.code as string); setRefCount(Number(rc.count ?? 0)); }
    }
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

  async function claimDaily() {
    if (!loggedIn) { flash("ログインが必要です"); return; }
    const { data, error } = await createClient().rpc("claim_daily_grant");
    if (error) { flash("受け取りに失敗しました"); return; }
    if (data?.ok) { window.dispatchEvent(new Event("wallet:refresh")); flash(`デイリーボーナス +${data.granted}pt`); }
    else flash("本日は受け取り済みです");
  }

  async function claimShare() {
    if (!loggedIn) { flash("シェアにはログインが必要です"); return; }
    const { data, error } = await createClient().rpc("claim_share_bonus");
    // 付与可否に関わらずシェア画面は開く（拡散が目的）。紹介コードを ?ref= で自動付与。
    const text = "ゴリラ予想で未来を予想中🦍 換金不可ポイントで遊ぶ予測市場。このリンクから始めると2人ともボーナス！";
    const url = withRef(window.location.origin);
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, "_blank", "noopener,noreferrer");
    if (error) { flash("付与に失敗しました"); return; }
    if (data?.ok) { window.dispatchEvent(new Event("wallet:refresh")); flash(`シェアボーナス +${data.granted}pt`); }
    else flash("本日のシェアボーナスは受取済みです");
  }

  async function applyRef() {
    const code = refInput.trim().toUpperCase();
    if (!loggedIn) { flash("紹介にはログインが必要です"); return; }
    if (!code) return;
    const { data, error } = await createClient().rpc("apply_referral", { p_code: code });
    if (error) { flash("適用に失敗しました"); return; }
    const r = data?.reason;
    if (data?.ok) { window.dispatchEvent(new Event("wallet:refresh")); setRefInput(""); flash(`紹介ボーナス +${data.granted}pt`); }
    else flash(r === "already_referred" ? "既にコード適用済みです" : r === "self" ? "自分のコードは使えません" : "コードが無効です");
  }

  const refUrl = refCode && origin ? `${origin}/?ref=${refCode}` : "";
  function copyCode() { if (refCode) { navigator.clipboard?.writeText(refCode); flash("コードをコピーしました"); } }
  function copyUrl() { if (refUrl) { navigator.clipboard?.writeText(refUrl); flash("紹介URLをコピーしました"); } }
  function shareRefUrl() {
    if (!refUrl) return;
    const text = "ゴリラ予想を一緒にやろう🦍 このリンクから始めると2人ともボーナス！";
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(refUrl)}`, "_blank", "noopener,noreferrer");
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

      {/* ボーナス */}
      <h2 className="text-[13px] font-extrabold text-dim mt-6 mb-2.5">ボーナス</h2>
      <div className="space-y-3">
        {/* ログインボーナス（1日1回） */}
        <div className="border border-border bg-surface rounded-[16px] p-3.5 flex items-center gap-3" style={{ boxShadow: "var(--shadow)" }}>
          <div className="w-10 h-10 rounded-[11px] grid place-items-center shrink-0" style={{ background: "#FCF1CF", color: "#C99A0E" }}>
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-extrabold">ログインボーナス</div>
            <div className="text-[11px] text-dim">1日1回 <b className="text-text mono">+100pt</b> もらえる</div>
          </div>
          <button onClick={claimDaily} className="btn-press text-[12px] font-extrabold text-white px-4 py-2 rounded-[10px] shrink-0" style={{ background: "var(--grad)" }}>受け取る</button>
        </div>
        {/* Xでシェアボーナス（1日1回 +20） */}
        <div className="border border-border bg-surface rounded-[16px] p-3.5 flex items-center gap-3" style={{ boxShadow: "var(--shadow)" }}>
          <div className="w-10 h-10 rounded-[11px] grid place-items-center shrink-0 bg-primary-weak text-primary">
            <svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor"><path d="M18.9 1.6h3.7l-8.1 9.2L24 22.4h-7.4l-5.8-7.6-6.7 7.6H.5l8.6-9.9L0 1.6h7.6l5.2 6.9 6.1-6.9Zm-1.3 18.6h2L6.5 3.7H4.3l13.3 16.5Z" /></svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-extrabold">Xでシェアボーナス</div>
            <div className="text-[11px] text-dim">予想をシェアで <b className="text-text mono">+20pt</b>／日</div>
          </div>
          <button onClick={claimShare} className="btn-press text-[12px] font-extrabold text-white px-4 py-2 rounded-[10px] shrink-0" style={{ background: "var(--grad)" }}>シェア</button>
        </div>

        {/* 友達紹介（紹介者+200 / 自分+100） */}
        <div className="border border-border bg-surface rounded-[16px] p-3.5" style={{ boxShadow: "var(--shadow)" }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[11px] grid place-items-center shrink-0 bg-pos-weak text-pos">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0 1 12 0M17 11h4M19 9v4" /></svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-extrabold">友達紹介</div>
              <div className="text-[11px] text-dim">紹介で友達に <b className="text-text mono">+200pt</b>・あなたも <b className="text-text mono">+100pt</b></div>
            </div>
          </div>
          {loggedIn ? (
            <div className="mt-3 space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-dim">あなたのコード</span>
                <span className="mono text-[15px] font-extrabold text-primary tracking-wider">{refCode ?? "—"}</span>
                <button onClick={copyCode} className="text-[11px] font-bold text-primary bg-primary-weak px-2.5 py-1 rounded-full">コピー</button>
                <span className="ml-auto text-[11px] text-dim">紹介 {refCount}人</span>
              </div>

              {/* 紹介URL（コピペ＆Xでシェア） */}
              <div>
                <span className="text-[11px] text-dim">あなたの紹介URL</span>
                <div className="flex gap-2 mt-1">
                  <input readOnly value={refUrl} onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 min-w-0 h-9 px-3 border border-border bg-surface2 rounded-[10px] text-[12px] mono outline-none" />
                  <button onClick={copyUrl} className="btn-press text-[12px] font-extrabold text-primary bg-primary-weak px-3 rounded-[10px] shrink-0">URLをコピー</button>
                  <button onClick={shareRefUrl} className="btn-press inline-flex items-center gap-1 text-[12px] font-extrabold text-white px-3 rounded-[10px] shrink-0" style={{ background: "var(--grad)" }}>
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M18.9 1.6h3.7l-8.1 9.2L24 22.4h-7.4l-5.8-7.6-6.7 7.6H.5l8.6-9.9L0 1.6h7.6l5.2 6.9 6.1-6.9Zm-1.3 18.6h2L6.5 3.7H4.3l13.3 16.5Z" /></svg>
                    シェア
                  </button>
                </div>
                <p className="text-[10.5px] text-faint mt-1">このURLから友達が始めると、紹介が自動で適用されます。</p>
              </div>

              <div className="flex gap-2">
                <input value={refInput} onChange={(e) => setRefInput(e.target.value)} placeholder="友達のコードを入力" maxLength={8}
                  className="flex-1 h-9 px-3 border border-border bg-surface2 rounded-[10px] text-base md:text-[13px] outline-none focus:border-primary uppercase" />
                <button onClick={applyRef} className="btn-press text-[12px] font-extrabold text-white px-4 rounded-[10px]" style={{ background: "var(--grad)" }}>適用</button>
              </div>
              <p className="text-[10.5px] text-faint">※ 友達のコードを入力できるのは一度きりです。</p>
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-dim">ログインすると紹介コードが使えます。</p>
          )}
        </div>

        {/* 乗っかり（近日公開） */}
        <div className="border border-border bg-surface rounded-[16px] p-[15px]" style={{ boxShadow: "var(--shadow)" }}>
          <div className="text-[13px] font-extrabold mb-1.5">「乗っかり」→ 的中で +1% <span className="text-[10px] font-bold text-pos bg-pos-weak px-1.5 py-px rounded">稼働中</span></div>
          <p className="text-[11.5px] text-dim leading-[1.65]">市場の<b className="text-text">シェア</b>ボタンであなたのリンクを拡散 → 友達がそのリンクから乗って予想が的中すると、友達の獲得ポイントの <b className="text-primary">1%</b> があなたにボーナスで入ります（参加pt・換金不可）。みんなで当てるほどお得🦍</p>
        </div>
      </div>

      {toast && (
        <Toast
          title={toast}
          kind={/失敗|エラー|必要/.test(toast) ? "error" : /\+\s*\d/.test(toast) ? "success" : "info"}
          onClose={() => setToast(null)}
        />
      )}

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

function Center({ children }: { children: React.ReactNode }) {
  return <div className="max-w-[1100px] mx-auto px-4 md:px-[22px] py-20 text-center text-dim">{children}</div>;
}
