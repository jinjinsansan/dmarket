import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <p className="text-dim mb-3">市場が見つかりませんでした。</p>
      <Link href="/" className="text-primary underline">市場一覧へ戻る →</Link>
    </div>
  );
}
