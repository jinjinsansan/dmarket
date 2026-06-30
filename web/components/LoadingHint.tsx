// ローディング時のブランド表示：ゴリラ（マスコット）＋「読み込み中…」。スケルトンの上に大きく出す。
import { GorillaFace } from "./GorillaFace";

export function LoadingHint({ label = "読み込み中…", className = "" }: { label?: string; className?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 py-7 text-dim ${className}`}>
      <span className="inline-flex text-primary animate-bounce" style={{ animationDuration: "1.1s" }}>
        <GorillaFace size={56} color="currentColor" />
      </span>
      <span className="text-[12.5px] font-bold">{label}</span>
    </div>
  );
}
