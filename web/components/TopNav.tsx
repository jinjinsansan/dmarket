"use client";
// 固定ヘッダー（ゴリラ予想）。ロゴ・検索・ナビ・テーマ・残高ピル・受取。
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
  { href: "/earn", label: "貯める" },
  { href: "/prizes", label: "景品" },
  { href: "/mypage", label: "マイページ" },
];
// 管理は is_admin のときのみ表示（BottomNav と同方針）
const ADMIN_NAV = { href: "/admin", label: "管理" };

export function TopNav() {
  const pathname = usePathname();
  const [balance, setBalance] = useState<number | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const sb = createClient();
    const { data: { session } } = await sb.auth.getSession();
    const user = session?.user;
    if (!user) { setLoggedIn(false); setBalance(null); setIsAdmin(false); return; }
    setLoggedIn(true);
    const [{ data: wallet }, { data: adm }] = await Promise.all([
      sb.from("wallets").select("balance").eq("user_id", user.id).maybeSingle(),
      sb.rpc("is_admin"),
    ]);
    setBalance(wallet?.balance ?? 0);
    setIsAdmin(Boolean(adm));
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
                <div title="参加ポイント残高（売買に使うポイント）" className="flex items-center gap-[7px] h-[38px] px-3 bg-surface2 border border-border rounded-[10px]">
                  <svg width="14" height="14" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#F4BE1F" /><circle cx="12" cy="12" r="4.4" fill="#fff" /></svg>
                  <span className="mono text-sm font-bold">{balance === null ? "—" : formatPoints(balance)}</span>
                  <span className="text-xs text-dim font-semibold">参加pt</span>
                </div>
                <button onClick={claim}
                  className="h-[38px] px-3 md:px-4 text-white border-none rounded-[11px] font-bold text-[13px] md:text-[13.5px]"
                  style={{ background: "var(--grad)", boxShadow: "var(--cta-glow)" }}>
                  受取
                </button>
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

      {toast && (
        <div className="fixed left-1/2 bottom-7 z-50 bg-text text-bg text-sm font-semibold px-4 py-2.5 rounded-[12px] shadow-lg"
          style={{ animation: "dmToast .25s ease" }}>
          {toast}
        </div>
      )}
    </>
  );
}
