// ホームのローディング骨格（密集レイアウトに一致）。
export default function Loading() {
  return (
    <div className="max-w-[1240px] mx-auto px-4 md:px-[22px] py-6">
      <div className="h-7 w-40 rounded bg-surface/40 mb-5" />
      <div className="grid gap-2.5 sm:gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,210px),1fr))" }}>
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-[150px] rounded-[13px] border border-border/30 bg-surface/30" />
        ))}
      </div>
    </div>
  );
}
