"use client";
// 管理: 運営ガイド（立ち上げ期の考え方／LMSR・AMM／手順）。非エンジニアの管理者向けの読み物。
import Link from "next/link";

export default function AdminGuidePage() {
  return (
    <div className="admin-guide max-w-[820px] space-y-6 leading-relaxed">
      <header>
        <h2 className="text-[20px] font-black">運営ガイド｜立ち上げ期の考え方</h2>
        <p className="text-[13px] text-dim mt-1">
          ユーザーがまだ少ないうちに「どうやって市場を作り、成立させるか」をまとめたページです。
          専門知識がなくても運用できるように書いています。困ったらまずここを読んでください。
        </p>
      </header>

      {/* 結論 */}
      <Box tone="primary">
        <H>いちばん大事な結論</H>
        <p>
          このアプリは <B>対戦相手がいなくても市場が成立する仕組み</B> です。
          ユーザーが <B>1人でも</B> 市場は動きます。
          だから立ち上げ期に心配すべきは「成立するか」ではなく、
          <B>「賑わって見えるか」と「人をどう集めるか」</B> です。
        </p>
      </Box>

      {/* LMSRとは */}
      <Box>
        <H>1. なぜ相手がいなくても成立するの？（LMSR / AMM）</H>
        <p>
          ふつうの取引所は「買いたい人」と「売りたい人」をマッチングします。だから人が少ないと相手が見つからず取引が成立しません。
        </p>
        <p className="mt-2">
          このアプリは <B>LMSR（自動マーケットメイカー＝AMM）</B> という方式です。
          かんたんに言うと <B>「運営（システム）が常に取引相手になってくれる自動販売機」</B> のようなものです。
        </p>
        <ul>
          <li>ユーザーがYESを買うと、その場で<B>システムが売り手になって即約定</B>します。</li>
          <li>同時にYESの<B>価格（＝みんなの予想確率）が自動で上がります</B>。</li>
          <li>売り手・買い手の相手を探す必要がありません。だから<B>「相手がいなくて成立しない」が原理的に起きません</B>。</li>
        </ul>
        <p className="mt-2 text-dim text-[13px]">
          ※ 価格はそのまま「YESが起きる確率の予想」を表します（例：68円 ≒ 68%）。取引が増えるほど価格が動き、予想が更新されていきます。
        </p>
      </Box>

      {/* 損はしない */}
      <Box>
        <H>2. システムが相手になって、運営は損しないの？</H>
        <p>
          AMMは取引相手になるぶん、理論上いくらかの「補助金」を負担します。その<B>最大額は決まっていて</B>、
          1つの市場あたり <B>およそ「b × 0.69」ポイント</B> です（bは下の項目で説明）。
        </p>
        <p className="mt-2">
          ここで配るのは <B>換金できない無償の参加ポイント</B> です。現金ではありません。
          つまり <B>運営の金銭的な持ち出しはゼロ</B>。安心して市場をたくさん動かして大丈夫です。
        </p>
      </Box>

      {/* b の説明 */}
      <Box>
        <H>3. 「b（板の厚み）」の意味と、立ち上げ期の設定</H>
        <p>
          <B>b</B> は「価格の動きにくさ」を決める数字です。市場の作成時・編集時に設定できます。
        </p>
        <ul>
          <li><B>bが大きい</B> … たくさん取引しないと価格が動かない（安定するが、少人数だと「動かなくてつまらない」）。</li>
          <li><B>bが小さい</B> … 少しの取引でも価格がよく動く（少人数でも「自分の予想で確率が変わった！」という手応えが出る）。</li>
        </ul>
        <Box tone="warn" inner>
          <p>
            <B>立ち上げ期のおすすめ：b は 40 前後に小さくする。</B><br />
            人が増えてきたら、徐々に大きく（例：100〜200）して価格を安定させます。
          </p>
        </Box>
        <p className="mt-2 text-[13px] text-dim">
          変更場所：全体の既定値は <GLink href="/admin/params">パラメータ設定</GLink> の「b既定値」。
          個別の市場は <GLink href="/admin/markets">市場マネージャ</GLink> で調整できます。
        </p>
      </Box>

      {/* 手順 */}
      <Box>
        <H>4. 立ち上げ期の運営手順（この順でOK）</H>

        <Step n="1" title="まずは運営が市場を作る">
          ユーザー作成（審査制）は後回しでOK。最初は運営が市場を撒きます。
          <GLink href="/admin/create">市場作成</GLink> から、<B>誰でも結果が分かるテーマ</B>を選びます。
          （例：FX・BTCの上下、有名人・スポーツ・エンタメ、地域の話題など）
          <br />数は <B>常時5〜10個</B>で十分。多すぎると1個あたりが過疎って見えます。
          <B>少数を賑わせる</B>方が効果的です。
        </Step>

        <Step n="2" title="天気の自動市場を動かす（手間ゼロの主力）">
          天気は気象庁データで<B>自動的に作られ・自動的に解決</B>されます。放置で毎日コンテンツが増えます。
          設定は <GLink href="/admin/templates">テンプレート</GLink> から。立ち上げ期はこれが主力になります。
        </Step>

        <Step n="3" title="人を集める（初速づくり）">
          以下はすべて用意済みの集客機能です。
          <ul>
            <li><B>合言葉キャンペーン</B>（即効性◎）：SNSで「合言葉◯◯でポイント」と告知。作成は <GLink href="/admin/promos">合言葉キャンペーン</GLink>。</li>
            <li><B>友達紹介・シェアボーナス・デイリーボーナス</B>：ユーザー側に自動で用意されています。付与額は <GLink href="/admin/params">パラメータ設定</GLink> で調整可。</li>
          </ul>
        </Step>

        <Step n="4" title="賑わいを演出する（少人数のうちだけ）">
          市場が空っぽだと新規が入りにくいです。運営アカウントで各市場に
          <B>少額の取引を1〜2回</B>＋<B>最初のコメントを1件</B>入れておくと、
          「保有者」「取引履歴」「コメント」タブが埋まり、入りやすくなります。
          （換金不可ポイントなので問題ありません）
        </Step>

        <Step n="5" title="結果を確定する（解決）">
          <ul>
            <li><B>天気市場</B>：自動で解決。何もしなくてOK。</li>
            <li><B>手動市場</B>：締切後に <GLink href="/admin/queue">解決キュー</GLink> から、客観的な結果で確定します。</li>
          </ul>
          解決すると、的中者に参加ポイントが払い戻され、ゴリラコイン（景品用）も付与されます。
        </Step>
      </Box>

      {/* やってはいけない */}
      <Box tone="warn">
        <H>5. やってはいけないこと</H>
        <ul>
          <li><B>曖昧な問いを作らない</B>。「誰が見ても結果が一つに決まる」テーマだけにします。主観・もめる問いは荒れます。</li>
          <li><B>立ち上げ期に b を大きくしすぎない</B>。動かない市場はつまらなく見えます。</li>
          <li><B>市場を作りすぎない</B>。少数を賑わせる方が、たくさん撒いて過疎るより良いです。</li>
          <li><B>インサイダー・不公平な市場は公開しない</B>（ユーザー申請も同基準で審査）。</li>
        </ul>
      </Box>

      {/* 早見表 */}
      <Box>
        <H>6. どのページで何ができる？（早見表）</H>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse mt-1">
            <tbody>
              <Row page="/admin/create" what="市場を手動で作る" />
              <Row page="/admin/templates" what="天気・デイリー市場の自動生成設定" />
              <Row page="/admin/markets" what="全市場の一覧・b調整・締切編集・非表示/中止" />
              <Row page="/admin/queue" what="締切後の市場を解決（結果確定）" />
              <Row page="/admin/creators" what="市場を作る人の審査（承認/拒否/却下）" />
              <Row page="/admin/review" what="ユーザーが申請した市場の審査" />
              <Row page="/admin/promos" what="合言葉キャンペーンの作成（集客）" />
              <Row page="/admin/params" what="付与額・b既定値・各種報酬レートの調整" />
              <Row page="/admin/prizes" what="景品の登録・在庫・発送/追跡番号" />
              <Row page="/admin/economy" what="ポイント供給・台帳の健全性チェック" />
              <Row page="/admin/users" what="ユーザー一覧・ポイント付与/フラグ" />
            </tbody>
          </table>
        </div>
      </Box>

      <Box tone="primary">
        <H>まとめ：最初の一手</H>
        <ol>
          <li>b の既定値を <B>40前後</B>に下げる（<GLink href="/admin/params">パラメータ設定</GLink>）</li>
          <li>天気の自動市場を動かす（<GLink href="/admin/templates">テンプレート</GLink>）</li>
          <li>話題の市場を <B>5〜8個</B>、運営で作る（<GLink href="/admin/create">市場作成</GLink>）</li>
          <li>合言葉キャンペーンを1本立てて SNS告知（<GLink href="/admin/promos">合言葉</GLink>）</li>
          <li>各市場に運営で<B>少額の取引＋初コメント</B>を入れる</li>
        </ol>
        <p className="mt-2 text-[13px] text-dim">
          この5つをやれば、少人数でも「動いていて、賑わって見える」状態を作れます。
        </p>
      </Box>

      <p className="text-[12px] text-faint">
        このページは管理者だけが見られます（一般ユーザーには表示されません）。
        <Link href="/admin" className="text-primary underline ml-1">← ダッシュボードへ</Link>
      </p>

      <style jsx global>{`
        .admin-guide p { font-size: 14px; }
        .admin-guide ul { list-style: disc; padding-left: 1.25rem; margin-top: .4rem; }
        .admin-guide ol { list-style: decimal; padding-left: 1.25rem; margin-top: .4rem; }
        .admin-guide li { font-size: 14px; margin-top: .35rem; }
      `}</style>
    </div>
  );
}

function Box({ children, tone, inner }: { children: React.ReactNode; tone?: "primary" | "warn"; inner?: boolean }) {
  const style: React.CSSProperties =
    tone === "primary" ? { background: "var(--primary-weak)", borderColor: "var(--primary)" }
      : tone === "warn" ? { background: "var(--neg-weak, rgba(220,80,80,.08))", borderColor: "var(--neg)" }
      : { background: "var(--surface)", borderColor: "var(--border)" };
  return (
    <div className={`border rounded-[var(--radius)] ${inner ? "p-3 mt-3" : "p-5"}`} style={{ ...style, boxShadow: inner ? "none" : "var(--shadow)" }}>
      {children}
    </div>
  );
}
function H({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[15.5px] font-bold mb-2">{children}</h3>;
}
function B({ children }: { children: React.ReactNode }) {
  return <b className="text-text font-bold">{children}</b>;
}
function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 mt-3 first:mt-2">
      <div className="w-6 h-6 rounded-full grid place-items-center text-white text-[12px] font-extrabold shrink-0" style={{ background: "var(--grad)" }}>{n}</div>
      <div className="min-w-0">
        <div className="font-bold text-[14px]">{title}</div>
        <div className="text-[13.5px] text-dim mt-0.5">{children}</div>
      </div>
    </div>
  );
}
function GLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="text-primary underline font-semibold">{children}</Link>;
}
function Row({ page, what }: { page: string; what: string }) {
  return (
    <tr className="border-b border-border align-top">
      <td className="py-2 pr-3 whitespace-nowrap">
        <Link href={page} className="text-primary underline font-mono text-[12.5px]">{page}</Link>
      </td>
      <td className="py-2 text-dim">{what}</td>
    </tr>
  );
}
