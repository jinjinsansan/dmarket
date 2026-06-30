// 特定商取引法に基づく表記
import type { Metadata } from "next";
import { LegalHeader } from "@/components/LegalHeader";

export const metadata: Metadata = {
  title: "特定商取引法に基づく表記 | ゴリラ予想",
  description: "ゴリラ予想の特定商取引法に基づく表記。運営者・連絡先・景品提供に関する事項を記載します。",
};

const UPDATED = "2026年6月19日";

// ⚠️ 仮情報（リリース前）。リリース時に正式な情報へ差し替えること。
const OPERATOR = {
  company: "ゴリラ予想運営",
  manager: "木村 綾香",
  address: "東京都港区銀座",
  lineUrl: "https://lin.ee/Zts2DeT", // 公式LINE
};

export default function TokushohoPage() {
  return (
    <main className="max-w-[1240px] mx-auto px-4 md:px-[22px] py-10">
      <div className="legal">
        <LegalHeader title="特定商取引法に基づく表記" updated={UPDATED} />

        <p className="lead">
          本サービス（ゴリラ予想）は、ポイント（参加ポイント・ゴリラコイン）を金銭で販売しておらず、利用者から金銭の支払いを受けるものではありません。本表記は、景品の提供に関する事項の透明性のために掲載するものです。
        </p>

        <h2>運営者</h2>
        <table className="w-full text-[13.5px] border-collapse my-4">
          <tbody>
            <Row label="販売事業者（運営者）" value={OPERATOR.company} />
            <Row label="運営統括責任者" value={OPERATOR.manager} />
            <Row label="所在地" value={OPERATOR.address} />
            <Row label="お問い合わせ" value="公式LINEからお問い合わせください" href={OPERATOR.lineUrl} />
          </tbody>
        </table>

        <h2>料金・支払いについて</h2>
        <ul>
          <li><strong>ポイントの販売価格</strong>：参加ポイント・ゴリラコインはいずれも無償で発行・付与され、販売していません（購入できません）。</li>
          <li><strong>景品交換に要する金銭</strong>：景品は、利用者が無償で取得したゴリラコインとの交換で提供され、金銭のお支払いは不要です。</li>
          <li><strong>商品代金以外の必要料金</strong>：原則ありません。特別な配送方法等で送料等が必要な場合は、申込画面に表示します。</li>
          <li><strong>支払方法</strong>：金銭のお支払いはありません（該当なし）。</li>
        </ul>

        <h2>景品の引渡し</h2>
        <ul>
          <li><strong>引渡し時期</strong>：景品交換の申込確定後、当社が定める期間内に発送します（具体的な時期は景品ごとに申込画面へ表示）。</li>
          <li><strong>引渡し方法</strong>：物品はご指定の配送先へ発送、デジタル景品は所定の方法で提供します。</li>
        </ul>

        <h2>交換のキャンセル・返品</h2>
        <p>景品交換は確定交換のため、申込確定後の利用者都合によるキャンセル・返品・ゴリラコインの返還はできません。景品に当社の責に帰すべき不良があった場合は、個別に対応します。</p>

        <h2>動作環境</h2>
        <p>最新のモバイル・PCブラウザでの利用を推奨します。</p>

        <div className="callout">
          <p>関連: <a href="/legal/terms">利用規約</a> / <a href="/legal/privacy">プライバシーポリシー</a> / <a href="/legal/no-gambling">賭博非該当について</a></p>
        </div>

        <p className="text-[12px] text-faint mt-6">
          ※ 本ページの運営者情報・お問い合わせ先は<strong>仮の情報</strong>です。リリース時に正式な情報へ差し替えます。景品の提供形態によっては特定商取引法の適用関係が変わるため、最終的な記載内容は専門家にご確認ください。
        </p>
      </div>
    </main>
  );
}

function Row({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <tr className="border-b border-border align-top">
      <th className="text-left font-bold text-text py-2.5 pr-4 w-[40%] whitespace-nowrap">{label}</th>
      <td className="py-2.5 text-dim">
        {href
          ? <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline break-all">{value}</a>
          : value}
      </td>
    </tr>
  );
}
