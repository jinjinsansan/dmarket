"use client";
// モバイル下部タブバー（Polymarket流）。md未満で表示。
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "マーケット", icon: (a: boolean) => <IconMarket active={a} /> },
  { href: "/leaderboard", label: "ランキング", icon: (a: boolean) => <IconRank active={a} /> },
  { href: "/mypage", label: "マイページ", icon: (a: boolean) => <IconUser active={a} /> },
  { href: "/admin", label: "管理", icon: (a: boolean) => <IconAdmin active={a} /> },
];

export function BottomNav() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-border"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="flex items-stretch">
        {TABS.map((t) => {
          const a = isActive(t.href);
          return (
            <Link key={t.href} href={t.href}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-bold ${a ? "text-primary" : "text-dim"}`}>
              {t.icon(a)}
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

const sw = { fill: "none", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
function IconMarket({ active }: { active: boolean }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" {...sw} fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.12 : 0}><path d="M3 13h4l2 5 4-12 2 7h6" /></svg>;
}
function IconRank({ active }: { active: boolean }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" {...sw} fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.12 : 0}><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 4H4v2a3 3 0 0 0 3 3M17 4h3v2a3 3 0 0 1-3 3" /></svg>;
}
function IconUser({ active }: { active: boolean }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" {...sw} fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.12 : 0}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>;
}
function IconAdmin({ active }: { active: boolean }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" {...sw} fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.12 : 0}><path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z" /></svg>;
}
