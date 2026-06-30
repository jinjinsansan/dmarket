"use client";
// 全画面共通のエラー境界（ゴリラ付き）。
import { ErrorState } from "@/components/States";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="max-w-[680px] mx-auto px-4 md:px-[22px] py-16">
      <ErrorState onRetry={reset} />
    </div>
  );
}
