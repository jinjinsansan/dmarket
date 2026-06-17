export default function Loading() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-40 rounded-[var(--radius)] border border-border bg-surface animate-pulse" />
      ))}
    </div>
  );
}
