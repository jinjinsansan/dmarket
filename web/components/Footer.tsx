// 共通フッター（handoff §6）。賭博非該当の注記を明示。
import Link from "next/link";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="border-t border-border mt-16">
      <div className="max-w-[1240px] mx-auto px-4 md:px-[22px] py-10 grid gap-8 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5 mb-3">
            <Logo size={28} />
            <span className="font-bold text-[17px]">ゴリラ<span className="text-primary">予想</span></span>
          </div>
          <p className="text-[12.5px] text-dim leading-7 max-w-xs">
            無償ポイント制の予測市場。換金不可・譲渡禁止。予想を当てて貯めたゴリラコインは景品と交換できます。
          </p>
        </div>
        <FooterCol title="プロダクト" links={[["使い方", "/guide"], ["マーケット", "/"], ["ランキング", "/leaderboard"], ["マイページ", "/mypage"]]} />
        <FooterCol title="法的情報" links={[["利用規約", "/legal/terms"], ["プライバシー", "/legal/privacy"], ["特定商取引法に基づく表記", "/legal/tokushoho"], ["賭博非該当について", "/legal/no-gambling"]]} />
        <FooterCol title="アカウント" links={[["ログイン", "/"], ["管理", "/admin"]]} />
      </div>
      <div className="border-t border-border">
        <div className="max-w-[1240px] mx-auto px-4 md:px-[22px] py-3.5 flex justify-between flex-wrap gap-2 text-[11.5px] text-faint">
          <span>© 2026 ゴリラ予想</span>
          <span>本サービスは賭博に該当しません（ポイントは無償発行・換金不可・譲渡禁止）。<a href="/legal/no-gambling" className="underline hover:text-text">詳細</a></span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <div className="text-[13px] font-bold mb-2.5">{title}</div>
      <ul className="space-y-1.5">
        {links.map(([label, href]) => (
          <li key={label}>
            <Link href={href} className="text-[12.5px] text-dim hover:text-text">{label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
