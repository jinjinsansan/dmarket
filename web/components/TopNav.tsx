"use client";
// 固定ヘッダー（D-market handoff §0）。ロゴ・検索・ナビ・テーマ・残高ピル・Claim。
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatPoints } from "@/lib/format";
import { Logo, Wordmark } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

const NAV = [
  { href: "/", label: "マーケット" },
  { href: "/leaderboard", label: "ランキング" },
  { href: "/mypage", label: "マイページ" },
  { href: "/admin", label: "管理" },
];

export function TopNav() {
  const pathname = usePathname();
  const [balance, setBalance] = useState<number | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { setLoggedIn(false); setBalance(null); return; }
    setLoggedIn(true);
    const { data } = await sb.from("wallets").select("balance").eq("user_id", user.id).maybeSingle();
    setBalance(data?.balance ?? 0);
  }, []);

  useEffect(() => {
    refresh();
    const h = () => refresh();
    window.addEventListener("wallet:refresh", h);
    return () => window.removeEventListener("wallet:refresh", h);
  }, [refresh]);

  async function claim() {
    const sb = createClient();
    const { data, error } = await sb.rpc("claim_daily_grant");
    if (error) return showToast("ログインが必要です（準備中）");
    if (data?.ok) { setBalance(data.balance); showToast(`デイリーボーナス +${data.granted}`); }
    else showToast("本日は受け取り済みです");
  }
  function showToast(m: string) { setToast(m); setTimeout(() => setToast(null), 2600); }

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
            {NAV.map((n) => (
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
                <div className="flex items-center gap-[7px] h-[38px] px-3 bg-surface2 border border-border rounded-[10px]">
                  <svg width="14" height="14" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#0891b2" /><circle cx="12" cy="12" r="4.4" fill="#e6faff" /></svg>
                  <span className="mono text-sm font-bold">{balance === null ? "—" : formatPoints(balance)}</span>
                  <span className="text-xs text-dim font-semibold">pt</span>
                </div>
                <button onClick={claim}
                  className="h-[38px] px-4 text-white border-none rounded-[11px] font-bold text-[13.5px]"
                  style={{ background: "var(--grad)", boxShadow: "var(--cta-glow)" }}>
                  受取 / Claim
                </button>
              </>
            ) : (
              <span className="text-sm text-dim" title="LINEログインは準備中">ログイン（準備中）</span>
            )}
          </div>
        </div>
      </header>

      {toast && (
        <div className="fixed left-1/2 bottom-7 z-50 bg-text text-bg text-sm font-semibold px-4 py-2.5 rounded-[12px] shadow-lg"
          style={{ animation: "dmToast .25s ease" }}>
          {toast}
        </div>
      )}
    </>
  );
}
