"use client";
// 管理コンソール（SPEC-07）。is_admin で保護し、タブで各機能へ。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Dashboard } from "@/components/admin/Dashboard";
import { ResolveQueue } from "@/components/admin/ResolveQueue";
import { CreateMarket } from "@/components/admin/CreateMarket";
import { FeedSettings } from "@/components/admin/FeedSettings";
import { Templates } from "@/components/admin/Templates";

const TABS = ["ダッシュボード", "解決キュー", "市場作成", "カテゴリ設定", "テンプレ"] as const;
type Tab = (typeof TABS)[number];

export default function AdminPage() {
  const [checked, setChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tab, setTab] = useState<Tab>("ダッシュボード");
  const [toast, setToast] = useState<string | null>(null);

  const check = useCallback(async () => {
    const { data } = await createClient().rpc("is_admin");
    setIsAdmin(Boolean(data));
    setChecked(true);
  }, []);
  useEffect(() => { check(); }, [check]);

  function notify(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 4000);
  }

  if (!checked) return <p className="text-dim text-sm py-16 text-center">確認中…</p>;
  if (!isAdmin) {
    return (
      <div className="py-16 text-center text-dim">
        <p>管理者専用ページです。</p>
        <p className="text-xs mt-2">管理者ログイン（LINEログイン実装後）が必要です。</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">管理コンソール</h1>
        {toast && <span className="text-sm text-primary">{toast}</span>}
      </div>

      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`whitespace-nowrap px-3 py-2 text-sm -mb-px border-b-2 ${
              tab === t ? "border-primary text-text" : "border-transparent text-dim hover:text-text"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "ダッシュボード" && <Dashboard />}
      {tab === "解決キュー" && <ResolveQueue notify={notify} />}
      {tab === "市場作成" && <CreateMarket notify={notify} />}
      {tab === "カテゴリ設定" && <FeedSettings notify={notify} />}
      {tab === "テンプレ" && <Templates notify={notify} />}
    </div>
  );
}
