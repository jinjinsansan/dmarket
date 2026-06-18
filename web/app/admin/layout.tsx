"use client";
// 管理コンソール共通レイアウト: is_admin ゲート＋ヘッダー（戻る）＋トースト。
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AdminToastProvider } from "@/components/admin/AdminToast";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    createClient().rpc("is_admin").then(({ data }) => { setIsAdmin(Boolean(data)); setChecked(true); });
  }, []);

  if (!checked) return <p className="text-dim text-sm py-20 text-center">確認中…</p>;
  if (!isAdmin) {
    return (
      <div className="py-20 text-center text-dim">
        <p>管理者専用ページです。</p>
        <p className="text-xs mt-2">管理者ログイン後にアクセスできます。</p>
      </div>
    );
  }

  const onDashboard = pathname === "/admin";
  return (
    <AdminToastProvider>
      <div className="max-w-[1180px] mx-auto px-4 md:px-[22px] py-6 pb-24 dm-in">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            {!onDashboard && (
              <Link href="/admin" className="text-sm text-dim hover:text-text flex items-center gap-1">← ダッシュボード</Link>
            )}
            <h1 className="text-[23px] font-extrabold">管理コンソール / Admin</h1>
          </div>
        </div>
        {children}
      </div>
    </AdminToastProvider>
  );
}
