// 市場詳細のローディング骨格（実レイアウトに一致 → 体感速度向上）。
import { LoadingHint } from "@/components/LoadingHint";
export default function Loading() {
  return (
    <div className="max-w-[1240px] mx-auto px-4 md:px-[22px] py-6 pb-20">
      <LoadingHint />
      <div className="sk h-4 w-40 mb-4" />
      <div className="flex flex-wrap gap-6 items-start">
        {/* 左カラム */}
        <div className="flex-[1_1_460px] min-w-0 flex flex-col gap-[18px]">
          <div className="flex items-center gap-2">
            <div className="sk h-4 w-16" />
            <div className="sk h-3 w-24" />
          </div>
          <div className="sk h-7 w-3/4" />

          {/* 確率＋チャート */}
          <div className="border border-border bg-surface rounded-[var(--radius)] p-5" style={{ boxShadow: "var(--shadow)" }}>
            <div className="flex items-end gap-3 mb-4">
              <div className="sk h-11 w-28" />
              <div className="sk h-4 w-20 mb-1.5" />
            </div>
            <div className="sk h-72 md:h-80 w-full rounded-[12px]" />
          </div>

          {/* アウトカム */}
          <div className="border border-border bg-surface rounded-[var(--radius)] p-2 flex flex-col gap-2" style={{ boxShadow: "var(--shadow)" }}>
            <div className="sk h-12 w-full rounded-[12px]" />
            <div className="sk h-12 w-full rounded-[12px]" />
          </div>
        </div>

        {/* 右カラム（トレードパネル） */}
        <div className="flex-[1_1_320px] min-w-0">
          <div className="border border-border bg-surface rounded-[var(--radius)] p-5 flex flex-col gap-3" style={{ boxShadow: "var(--shadow)" }}>
            <div className="sk h-5 w-24" />
            <div className="sk h-10 w-full rounded-[12px]" />
            <div className="sk h-10 w-full rounded-[12px]" />
            <div className="sk h-14 w-full rounded-[12px] mt-2" />
          </div>
        </div>
      </div>
    </div>
  );
}
