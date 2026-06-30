// ローディング時のブランド表示：小さなゴリラ＋「読み込み中…」（スケルトンの上に添える）。
import { GorillaFace } from "./GorillaFace";

export function LoadingHint({ label = "読み込み中…", className = "" }: { label?: string; className?: string }) {
  return (
    <div className={`flex items-center gap-2 text-dim text-[12px] font-bold mb-4 ${className}`}>
      <span className="inline-flex animate-pulse"><GorillaFace size={22} color="var(--faint)" /></span>
      {label}
    </div>
  );
}
