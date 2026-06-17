"use client";
// 上部固定ナビ（SPEC-05 §3）。残高常時表示・デイリーボーナス受領。
// 認証は LINEログイン後回しのため、未ログイン時は「ログイン」を表示し残高は出さない。
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatPoints } from "@/lib/format";

export function TopNav() {
  const [balance, setBalance] = useState<number | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimedToday, setClaimedToday] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refreshBalance = useCallback(async () => {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      setLoggedIn(false);
      setBalance(null);
      return;
    }
    setLoggedIn(true);
    const { data } = await sb.from("wallets").select("balance").eq("user_id", user.id).maybeSingle();
    setBalance(data?.balance ?? 0);
  }, []);

  useEffect(() => {
    refreshBalance();
    const handler = () => refreshBalance();
    window.addEventListener("wallet:refresh", handler);
    return () => window.removeEventListener("wallet:refresh", handler);
  }, [refreshBalance]);

  async function claimDaily() {
    setClaiming(true);
    setMsg(null);
    const sb = createClient();
    const { data, error } = await sb.rpc("claim_daily_grant");
    setClaiming(false);
    if (error) {
      setMsg("受け取りに失敗しました");
      return;
    }
    if (data?.ok) {
      setBalance(data.balance);
      setMsg(`デイリーボーナス +${data.granted}`);
    } else {
      setClaimedToday(true);
      setMsg("本日は受け取り済み");
    }
  }

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-6">
        <Link href="/" className="font-semibold text-lg tracking-tight">
          dmarket
        </Link>
        <nav className="flex items-center gap-4 text-sm text-dim">
          <Link href="/" className="hover:text-text">マーケット</Link>
          <Link href="/leaderboard" className="hover:text-text">ランキング</Link>
          <Link href="/portfolio" className="hover:text-text">ポートフォリオ</Link>
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {loggedIn ? (
            <>
              {msg && <span className="text-xs text-dim">{msg}</span>}
              <button
                onClick={claimDaily}
                disabled={claiming || claimedToday}
                className="text-xs rounded-sm px-2 py-1 border border-border text-dim hover:text-text disabled:opacity-50"
              >
                {claimedToday ? "受取済み" : "デイリー受取"}
              </button>
              <span className="num text-sm rounded-sm bg-surface-2 px-3 py-1.5">
                {balance === null ? "—" : formatPoints(balance)} pt
              </span>
            </>
          ) : (
            <span className="text-sm text-dim" title="LINEログインは後日実装">
              ログイン（準備中）
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
