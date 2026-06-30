"use client";
// 管理コンソール共通レイアウト: is_admin ゲート＋ヘッダー（戻る）＋トースト。
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AdminToastProvider } from "@/components/admin/AdminToast";
import { Logo } from "@/components/Logo";

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
      <div className="admin-scope max-w-[1180px] mx-auto px-4 md:px-[22px] py-6 pb-24 dm-in">
        <div className="flex items-center gap-3 mb-5">
          <Logo size={36} />
          <h1 className="text-[22px] font-extrabold">管理コンソール</h1>
          {!onDashboard && (
            <Link href="/admin" className="text-[13px] text-dim hover:text-text">← ダッシュボード</Link>
          )}
          <span className="ml-auto text-[12px] font-extrabold text-primary bg-primary-weak px-3.5 py-1.5 rounded-full">管理者</span>
        </div>
        {children}
      </div>
    </AdminToastProvider>
  );
}
