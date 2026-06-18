"use client";
import { CreateMarket } from "@/components/admin/CreateMarket";
import { useAdminToast } from "@/components/admin/AdminToast";

export default function AdminCreatePage() {
  const notify = useAdminToast();
  return (
    <section>
      <h2 className="text-[16px] font-bold mb-3">市場作成 / Create market</h2>
      <CreateMarket notify={notify} />
    </section>
  );
}
