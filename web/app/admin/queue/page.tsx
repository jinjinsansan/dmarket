"use client";
import { ResolveQueue } from "@/components/admin/ResolveQueue";
import { useAdminToast } from "@/components/admin/AdminToast";

export default function AdminQueuePage() {
  const notify = useAdminToast();
  return (
    <section>
      <h2 className="text-[16px] font-bold mb-3">解決キュー / Resolution queue</h2>
      <ResolveQueue notify={notify} />
    </section>
  );
}
