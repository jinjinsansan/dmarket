export default function Loading() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
      <div className="space-y-4">
        <div className="h-6 w-2/3 rounded bg-surface animate-pulse" />
        <div className="h-56 rounded-[var(--radius)] border border-border bg-surface animate-pulse" />
      </div>
      <div className="h-64 rounded-[var(--radius)] border border-border bg-surface animate-pulse" />
    </div>
  );
}
