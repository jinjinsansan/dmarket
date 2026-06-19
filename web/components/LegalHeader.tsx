// 法的情報ページ共通ヘッダー（戻る導線＋タイトル＋改定日）。
import Link from "next/link";

export function LegalHeader({ title, updated }: { title: string; updated: string }) {
  return (
    <div className="mb-7">
      <Link href="/" className="text-[12.5px] text-faint hover:text-text">← マーケットへ戻る</Link>
      <h1 className="text-[26px] font-extrabold mt-3">{title}</h1>
      <p className="text-[12px] text-faint mt-1.5">最終改定: {updated}</p>
    </div>
  );
}
