// マイページのローディング骨格（タップ即時フィードバック）。
import { LoadingHint } from "@/components/LoadingHint";
export default function Loading() {
  return (
    <div className="max-w-[1100px] mx-auto px-4 md:px-[22px] py-6 space-y-5">
      <LoadingHint />
      <div className="h-[104px] rounded-[var(--radius)] border border-border/30 bg-surface/30" />
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))" }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-[88px] rounded-[16px] border border-border/30 bg-surface/30" />
        ))}
      </div>
      <div className="h-[160px] rounded-[var(--radius)] border border-border/30 bg-surface/20" />
    </div>
  );
}
