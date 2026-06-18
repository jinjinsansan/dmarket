"use client";
import { Templates } from "@/components/admin/Templates";
import { useAdminToast } from "@/components/admin/AdminToast";

export default function AdminTemplatesPage() {
  const notify = useAdminToast();
  return (
    <section>
      <h2 className="text-[16px] font-bold mb-3">テンプレート / Templates</h2>
      <Templates notify={notify} />
    </section>
  );
}
