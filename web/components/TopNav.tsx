"use client";
// 固定ヘッダー（ゴリラ予想）。ロゴ・検索・ナビ・テーマ・残高ピル・受取。
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatPoints } from "@/lib/format";
import { Logo, Wordmark } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { Confetti } from "./Confetti";
import { Toast, type ToastKind } from "./Toast";
import { RANK_META, type RankLevel } from "./AvatarFrame";
import { getRefCode, setRefCode } from "@/lib/ref";

const NAV = [
  { href: "/", label: "マーケット" },
  { href: "/leaderboard", label: "ランキング" },
  { href: "/earn", label: "貯める" },
  { href: "/prizes", label: "景品" },
  { href: "/guide", label: "使い方" },
  { href: "/mypage", label: "マイページ" },
];
// 管理は is_admin のときのみ表示（BottomNav と同方針）
const ADMIN_NAV = { href: "/admin", label: "管理" };

export function TopNav() {
  const pathname = usePathname();
  const [balance, setBalance] = useState<number | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [toast, setToast] = useState<{ title: string; sub?: string; kind: ToastKind } | null>(null);
  const [winnings, setWinnings] = useState(0);   // 未受取の的中払戻し合計（pending）
  const [fire, setFire] = useState(0);           // 紙吹雪トリガ

  const refresh = useCallback(async () => {
    const sb = createClient();
    // 共有リンクの ?ref= を保留（未ログインでも保持し、ログイン後に友達紹介として自動適用）
    try { const r = new URLSearchParams(window.location.search).get("ref"); if (r) localStorage.setItem("gp-pending-ref", r.toUpperCase()); } catch { /* noop */ }

    const { data: { session } } = await sb.auth.getSession();
    const user = session?.user;
    if (!user) { setLoggedIn(false); setBalance(null); setIsAdmin(false); setWinnings(0); return; }
    setLoggedIn(true);
    const [{ data: wallet }, { data: adm }, { data: pend }] = await Promise.all([
      sb.from("wallets").select("balance").eq("user_id", user.id).maybeSingle(),
      sb.rpc("is_admin"),
      sb.from("pending_winnings").select("amount").is("claimed_at", null),
    ]);
    setBalance(wallet?.balance ?? 0);
    setIsAdmin(Boolean(adm));
    setWinnings(((pend as { amount: number }[]) ?? []).reduce((a, r) => a + r.amount, 0));
    // 紹介コードをキャッシュ（市場カード等のシェアに ?ref= を付けるため）。未取得時のみ。
    if (!getRefCode()) {
      sb.rpc("my_referral_code").then(({ data }) => { if (data?.code) setRefCode(data.code as string); });
    }
    // 称号ランクの昇格を検知（前回Lvより上がっていたら昇格トースト＋紙吹雪）
    sb.rpc("my_rank").then(({ data }) => {
      const lv = Number((data as { level?: number } | null)?.level ?? 1);
      try {
        const prev = parseInt(localStorage.getItem("gp-rank-level") || "", 10);
        if (!Number.isNaN(prev) && lv > prev) {
          setFire((f) => f + 1);
          showToast(`Lv.${lv} ${RANK_META[lv as RankLevel]?.name ?? ""} に昇格！`, "🎉 ランクアップ", "success");
        }
        localStorage.setItem("gp-rank-level", String(lv));
      } catch { /* noop */ }
    });
    // 保留中の友達紹介コードを適用（共有リンク経由・一度きり）
    let pendRef: string | null = null;
    try { pendRef = localStorage.getItem("gp-pending-ref"); } catch { /* noop */ }
    if (pendRef) {
      const { data: ap } = await sb.rpc("apply_referral", { p_code: pendRef });
      try { localStorage.removeItem("gp-pending-ref"); } catch { /* noop */ }
      if (ap?.ok) {
        if (typeof ap.balance === "number") setBalance(ap.balance);
        showToast("紹介ボーナス", `+${ap.granted} pt`, "success");
      }
    }
  }, []);

  useEffect(() => {
    refresh();
    const h = () => refresh();
    window.addEventListener("wallet:refresh", h);
    return () => window.removeEventListener("wallet:refresh", h);
  }, [refresh]);

  async function claimWinnings() {
    const { data, error } = await createClient().rpc("claim_winnings");
    if (error) { showToast("受け取りに失敗しました", undefined, "error"); return; }
    if (!data?.ok) { showToast("受け取れる的中はありません", undefined, "info"); return; }
    setFire((f) => f + 1);
    showToast("的中！受け取りました", `+${formatPoints(data.claimed)} pt`, "success");
    window.dispatchEvent(new Event("wallet:refresh"));
  }
  function showToast(title: string, sub?: string, kind: ToastKind = "success") {
    setToast({ title, sub, kind }); setTimeout(() => setToast(null), 2600);
  }

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      <header className="sticky top-0 z-40 bg-surface border-b border-border">
        <div className="max-w-[1240px] mx-auto px-4 md:px-[22px] h-[60px] md:h-[66px] flex items-center gap-3 md:gap-[22px]">
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <Logo />
            <Wordmark />
          </Link>

          <div className="flex-1 max-w-[420px] relative hidden md:block">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" strokeWidth="2"
              className="absolute left-[13px] top-1/2 -translate-y-1/2">
              <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
            </svg>
            <Link href="/" className="block w-full h-10 pl-9 pr-3.5 border border-border bg-surface2 rounded-[11px] text-sm text-faint leading-10">
              市場を検索 / Search markets
            </Link>
          </div>

          {/* ナビリンクはデスクトップのみ。モバイルは下部タブバー(BottomNav) */}
          <nav className="hidden md:flex items-center gap-1.5 shrink-0">
            {(isAdmin ? [...NAV, ADMIN_NAV] : NAV).map((n) => (
              <Link key={n.href} href={n.href}
                className={`text-sm font-semibold px-2.5 py-2 rounded-[9px] ${isActive(n.href) ? "text-text" : "text-dim hover:text-text"}`}>
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2 md:gap-2.5 shrink-0 ml-auto">
            <ThemeToggle />
            {loggedIn ? (
              <>
                <div title="参加ポイント残高（売買に使うポイント）" className="flex items-center gap-[6px] h-[38px] px-2.5 md:px-3 bg-surface2 border border-border rounded-[10px]">
                  <svg width="14" height="14" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#F4BE1F" /><circle cx="12" cy="12" r="4.4" fill="#fff" /></svg>
                  <span className="mono text-sm font-bold">{balance === null ? "—" : formatPoints(balance)}</span>
                  <span className="text-xs text-dim font-semibold hidden sm:inline">参加pt</span>
                </div>
                {winnings > 0 && (
                  <button onClick={claimWinnings}
                    className="btn-press h-[38px] px-2.5 md:px-4 text-white border-none rounded-[11px] font-extrabold text-[13px] md:text-[13.5px] whitespace-nowrap"
                    style={{ background: "var(--grad)", boxShadow: "var(--cta-glow)" }}>
                    🎉<span className="hidden sm:inline"> 受け取る</span> +{formatPoints(winnings)}
                  </button>
                )}
                <a href="/api/auth/logout" title="ログアウト"
                  className="hidden md:grid w-[38px] h-[38px] border border-border bg-surface rounded-[10px] place-items-center text-dim hover:text-text">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></svg>
                </a>
              </>
            ) : (
              <a href="/api/auth/line/login"
                className="h-[38px] px-4 flex items-center gap-2 rounded-[11px] font-bold text-[13.5px] text-white"
                style={{ background: "#06C755" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.5 2 2 5.7 2 10.2c0 4 3.6 7.4 8.5 8 .3.1.8.2.9.5.1.3.1.7 0 1l-.1.8c0 .2-.2.9.8.5s5.4-3.2 7.4-5.5c1.4-1.5 2-3.1 2-5.3C21.5 5.7 17 2 12 2z" /></svg>
                LINEでログイン
              </a>
            )}
          </div>
        </div>
      </header>

      {toast && <Toast title={toast.title} sub={toast.sub} kind={toast.kind} onClose={() => setToast(null)} />}
      <Confetti fire={fire} />
    </>
  );
}
