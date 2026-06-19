// ランキングのローディング骨格（force-dynamic のサーバー取得待ちに即時フィードバック）。
export default function Loading() {
  return (
    <div className="max-w-[880px] mx-auto px-4 md:px-[22px] py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="h-7 w-48 rounded bg-surface/40" />
        <div className="h-9 w-full sm:w-44 rounded-[12px] bg-surface/40" />
      </div>
      <div className="grid grid-cols-3 gap-3 mb-6 items-end">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-[150px] rounded-[var(--radius)] border border-border/30 bg-surface/30" />
        ))}
      </div>
      <div className="rounded-[var(--radius)] border border-border/30 bg-surface/20 divide-y divide-border/20">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-[56px]" />)}
      </div>
    </div>
  );
}
