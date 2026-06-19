// ホームのローディング骨格（密集レイアウトに一致）。
export default function Loading() {
  return (
    <div className="max-w-[1240px] mx-auto px-4 md:px-[22px] py-6">
      <div className="h-7 w-40 rounded bg-surface/40 mb-5" />
      <div className="grid gap-3 sm:gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,278px),1fr))" }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-[168px] rounded-[14px] border border-border/30 bg-surface/30" />
        ))}
      </div>
    </div>
  );
}
