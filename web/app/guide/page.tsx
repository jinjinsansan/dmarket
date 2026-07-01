// 使い方（初心者向けガイド）。公開ページ。
import type { Metadata } from "next";
import Link from "next/link";
import { GorillaFace } from "@/components/GorillaFace";

export const metadata: Metadata = {
  title: "使い方 | ゴリラ予想",
  description: "ゴリラ予想の遊び方。無料の参加ポイントで予想して、当てて、貯めたゴリラコインを景品と交換。換金不可・賭けではありません。",
};

export default function GuidePage() {
  return (
    <div className="guide max-w-[820px] mx-auto px-4 md:px-[22px] py-6 pb-24 dm-in space-y-6">
      {/* ヒーロー */}
      <header className="rounded-[var(--radius)] p-6 sm:p-8 relative overflow-hidden" style={{ background: "linear-gradient(135deg,#2A1B4D,#5a37a8)", boxShadow: "var(--shadow)" }}>
        <GorillaFace size={220} color="#fff" style={{ position: "absolute", right: -36, top: -30, opacity: 0.08 }} />
        <div className="relative">
          <div className="text-[13px] font-bold text-white/70">はじめての方へ</div>
          <h1 className="text-[26px] sm:text-[30px] font-black text-white mt-1 leading-tight">ゴリラ予想の遊び方 🦍</h1>
          <p className="text-[13px] text-white/85 mt-2 leading-relaxed">
            無料でもらえる<b className="text-white">参加ポイント</b>で「起きる？起きない？」を予想。<br className="hidden sm:block" />
            当てて貯めた<b style={{ color: "var(--accent2)" }}>ゴリラコイン</b>は景品と交換できます。<b className="text-white">お金は一切かかりません。</b>
          </p>
        </div>
      </header>

      <Step n="1" title="ゴリラ予想ってなに？">
        将来の出来事（天気・スポーツ・話題のニュースなど）の結果を <b>YES / NO</b> で予想して楽しむサービスです。
        使うのは<b>無料の参加ポイント</b>だけ。<b className="text-primary">賭けではありません</b>し、自分のお金は使いません。
      </Step>

      <Step n="2" title="まずは参加ポイントをためる">
        参加ポイントは<b>予想に使うポイント</b>（換金・譲渡はできません）。無料でどんどん増やせます。
        <ul className="mt-2">
          <li><b>ログインボーナス</b>（毎日）</li>
          <li><b>Xでシェア</b>／<b>友達紹介</b>／<b>合言葉</b></li>
          <li><b>案件</b>（提携サービスの利用で無料付与）</li>
        </ul>
        <Link href="/earn" className="inline-block mt-2 text-primary font-bold underline text-[13px]">→ 貯めるページへ</Link>
      </Step>

      <Step n="3" title="予想する（いちばん大事）">
        気になる市場を開いて、<b className="text-pos">YES</b>（起きる）か <b className="text-neg">NO</b>（起きない）に「乗る」だけ。
        ポイントを入れると<b>株（かぶ）</b>を買います。
        <div className="mt-3 rounded-[14px] border border-border bg-surface2 p-3.5 text-[13px] leading-relaxed">
          <div className="font-bold mb-1.5">📊 値段と儲けの仕組み</div>
          <ul className="!mt-0">
            <li><b>1株の値段 ＝ その選択肢の確率 × 100pt</b>（例：確率50%なら約50pt）</li>
            <li><b>当たると 1株 = 100pt もらえる</b>（外れると0）</li>
            <li>だから <b className="text-primary">安い（低い確率）で買って当てるほど儲け大</b></li>
          </ul>
          <div className="mt-2.5 overflow-x-auto">
            <table className="w-full text-[12.5px] border-collapse">
              <thead className="text-dim">
                <tr className="border-b border-border"><th className="text-left py-1.5">確率</th><th className="text-right">1株の値段</th><th className="text-right">100ptで</th><th className="text-right">当たり</th></tr>
              </thead>
              <tbody className="mono">
                <tr className="border-b border-border/60"><td className="py-1.5">20%</td><td className="text-right">約20pt</td><td className="text-right">約5株</td><td className="text-right text-pos">+500pt</td></tr>
                <tr className="border-b border-border/60"><td className="py-1.5">50%</td><td className="text-right">約50pt</td><td className="text-right">約2株</td><td className="text-right text-pos">+200pt</td></tr>
                <tr><td className="py-1.5">80%</td><td className="text-right">約80pt</td><td className="text-right">約1.25株</td><td className="text-right text-pos">+125pt</td></tr>
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-faint mt-1.5">※ 当たりは「当たった株数 × 100pt」。たくさん買うと値段（確率）は少し上がります。</p>
        </div>
      </Step>

      <Step n="4" title="当たるとゴリラコインが貯まる">
        予想が的中すると、参加ポイントの払い戻しに加えて <b style={{ color: "var(--accent2)" }}>ゴリラコイン</b> が貯まります。
        ゴリラコインは <b>1コイン = 1円相当</b>で、<b>景品と交換</b>できます（確定交換・抽選なし）。
        <ul className="mt-2">
          <li>Amazonギフト 3,000 / 5,000 / 10,000円分</li>
          <li>Nintendo Switch・PlayStation 5・ルンバ など</li>
        </ul>
        <Link href="/prizes" className="inline-block mt-2 text-primary font-bold underline text-[13px]">→ 景品一覧へ</Link>
      </Step>

      <Step n="5" title="乗っかりで応援ボーナス">
        市場の<b>シェア</b>ボタンで広めたリンクから、友達が予想して的中すると、その獲得分の <b className="text-primary">1%</b> が<b>あなた</b>にボーナスで入ります（参加pt・<b>友達の取り分は減りません</b>）。みんなで当てるほどお得🦍
      </Step>

      <Step n="6" title="ランキング・称号で腕試し">
        的中を重ねると<b>ランキング</b>上位や<b>称号</b>がもらえます。連勝を狙って予言者を目指しましょう。
        <Link href="/leaderboard" className="inline-block mt-2 text-primary font-bold underline text-[13px]">→ ランキングへ</Link>
      </Step>

      {/* 安心 */}
      <div className="rounded-[var(--radius)] border p-5" style={{ background: "var(--primary-weak)", borderColor: "var(--primary)" }}>
        <div className="flex items-center gap-2 mb-1.5"><GorillaFace size={26} color="var(--primary)" /><h2 className="text-[15px] font-bold">安心して遊べます</h2></div>
        <ul className="text-[13px] leading-relaxed">
          <li>参加ポイントは<b>無料でもらえる遊び用</b>のポイント（<b>換金・譲渡はできません</b>）。自分のお金は使いません。</li>
          <li>だから<b className="text-primary">賭けではありません</b>。外れてもお金は減りません。</li>
          <li>ゴリラコインは景品交換専用で、こちらも<b>換金できません</b>。</li>
        </ul>
        <p className="text-[11.5px] text-dim mt-2">くわしくは <Link href="/legal/no-gambling" className="underline text-primary">賭博非該当について</Link> / <Link href="/legal/terms" className="underline text-primary">利用規約</Link></p>
      </div>

      {/* CTA */}
      <div className="text-center pt-2">
        <Link href="/" className="btn-press inline-block px-8 py-3.5 rounded-[14px] text-white font-extrabold" style={{ background: "var(--grad)", boxShadow: "var(--cta-glow)" }}>
          さっそく予想する 🦍
        </Link>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="border border-border bg-surface rounded-[var(--radius)] p-5" style={{ boxShadow: "var(--shadow)" }}>
      <div className="flex items-center gap-2.5 mb-2">
        <span className="w-7 h-7 rounded-full grid place-items-center text-white text-[13px] font-extrabold shrink-0" style={{ background: "var(--grad)" }}>{n}</span>
        <h2 className="text-[16px] font-bold">{title}</h2>
      </div>
      <div className="text-[13.5px] text-dim leading-relaxed">{children}</div>
    </section>
  );
}
