// 景品一覧のローディング骨格（タップ即時フィードバック）。
export default function Loading() {
  return (
    <div className="max-w-[1100px] mx-auto px-4 md:px-[22px] py-6 space-y-5">
      <div className="h-8 w-40 rounded bg-surface/40" />
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))" }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[260px] rounded-[var(--radius)] border border-border/30 bg-surface/30" />
        ))}
      </div>
    </div>
  );
}
