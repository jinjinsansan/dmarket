"use client";
import { FeedSettings } from "@/components/admin/FeedSettings";
import { useAdminToast } from "@/components/admin/AdminToast";

export default function AdminSettingsPage() {
  const notify = useAdminToast();
  return (
    <section>
      <h2 className="text-[16px] font-bold mb-3">カテゴリ設定 / Feed settings</h2>
      <FeedSettings notify={notify} />
    </section>
  );
}
