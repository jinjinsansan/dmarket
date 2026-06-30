"use client";
// 市場を作る（クリエイター審査ゲート）。
// 未申請→審査案内＋申請フォーム / 審査中→審査中表示 / 承認→作成フォーム / 拒否・却下→結果＋再申請
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Category } from "@/lib/types";

type Sub = { id: string; question: string; status: string; close_time: string; created_at: string };
type CreatorStatus = "pending" | "approved" | "rejected" | "dismissed";
const STATUS_JA: Record<string, string> = { draft: "審査中", open: "公開中", closed: "締切", resolved: "解決済", void: "中止" };

export default function CreatePage() {
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [status, setStatus] = useState<CreatorStatus | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);

  const load = useCallback(async () => {
    const sb = createClient();
    const { data: { session } } = await sb.auth.getSession();
    setLoggedIn(Boolean(session?.user));
    const { data: c } = await sb.from("categories").select("*").eq("is_active", true).order("display_order");
    setCats((c as Category[]) ?? []);
    if (session?.user) {
      const { data: cs } = await sb.rpc("my_creator_status");
      const row = (cs as { status: CreatorStatus }[] | null)?.[0];
      setStatus(row?.status ?? null);
      if (row?.status === "approved") {
        const { data: s } = await sb.rpc("my_submitted_markets");
        setSubs((s as Sub[]) ?? []);
      }
    }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <Wrap><p className="text-dim text-sm py-20 text-center">読み込み中…</p></Wrap>;

  if (!loggedIn) return (
    <Wrap>
      <Header />
      <p className="text-sm text-dim border border-border bg-surface rounded-[16px] p-4 mt-5">
        市場を作るにはログインが必要です。<a href="/api/auth/line/login" className="text-primary underline">LINEでログイン →</a>
      </p>
    </Wrap>
  );

  if (status === "approved") return <Wrap><Header approved /><MarketForm cats={cats} subs={subs} reload={load} /></Wrap>;
  if (status === "pending") return <Wrap><Header /><PendingCard /></Wrap>;
  // 未申請 / 拒否 / 却下 → 案内＋（再）申請
  return <Wrap><Header /><ApplyFlow status={status} onApplied={load} /></Wrap>;
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div className="max-w-[680px] mx-auto px-4 md:px-[22px] py-6 pb-20 dm-in">{children}</div>;
}

function Header({ approved }: { approved?: boolean }) {
  return (
    <header>
      <h1 className="text-[24px] font-black">市場を作る</h1>
      <p className="text-[12px] text-dim mt-1">
        {approved
          ? <>あなたは<b className="text-primary">承認クリエイター</b>です。YES/NOで答えられる市場を作りましょう🦍</>
          : <>市場の作成は<b className="text-text">承認制</b>です。審査に通った方だけが市場を作れます。</>}
      </p>
    </header>
  );
}

// 審査中
function PendingCard() {
  return (
    <div className="border rounded-[18px] p-5 mt-5 text-center" style={{ background: "var(--primary-weak)", borderColor: "var(--primary)" }}>
      <div className="text-3xl mb-2">🦍⏳</div>
      <div className="font-bold text-[16px]">審査中です</div>
      <p className="text-[13px] text-dim mt-1.5">運営があなたの申請を確認しています。承認されると市場を作成できるようになります。結果はマイページでも確認できます。</p>
      <Link href="/mypage" className="inline-block mt-3 text-[13px] text-primary underline">マイページへ →</Link>
    </div>
  );
}

// 審査案内＋申請フォーム（未申請・拒否・却下）
function ApplyFlow({ status, onApplied }: { status: CreatorStatus | null; onApplied: () => void }) {
  const [sns, setSns] = useState("");
  const [genres, setGenres] = useState("");
  const [bio, setBio] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function apply() {
    if (!sns.trim()) { setMsg("SNS媒体のURLを入力してください"); return; }
    if (!genres.trim()) { setMsg("作りたい市場のジャンルを入力してください"); return; }
    setBusy(true); setMsg(null);
    const { data, error } = await createClient().rpc("apply_creator", {
      p_sns_url: sns.trim(), p_genres: genres.trim(), p_bio: bio.trim(),
    });
    setBusy(false);
    if (error) {
      const m = error.message;
      setMsg(m.includes("sns_required") ? "SNS媒体のURLを入力してください"
        : m.includes("genres_required") ? "ジャンルを入力してください"
        : "申請に失敗しました");
      return;
    }
    if (data?.ok) { onApplied(); }
    else setMsg(data?.reason === "already_pending" ? "すでに審査中です" : data?.reason === "already_approved" ? "すでに承認済みです" : "申請できませんでした");
  }

  return (
    <div className="mt-5 space-y-5">
      {(status === "rejected" || status === "dismissed") && (
        <div className="border border-neg/40 bg-neg/5 rounded-[14px] p-4 text-[13px]">
          <b className="text-neg">前回の審査は通過しませんでした。</b> 内容を見直して再申請できます。
        </div>
      )}

      {/* 審査・ルール案内 */}
      <div className="border border-border bg-surface rounded-[18px] p-5 space-y-3" style={{ boxShadow: "var(--shadow)" }}>
        <h2 className="font-bold text-[15px]">市場づくりのルール</h2>
        <Rule n="1" title="市場の作り方">
          「YES / NO」で答えられ、締切時点で<b className="text-text">客観的に結果が確定する</b>問いを作ります。例：「今週末、〇〇は開催される？」。結果の確定（解決）は公平のため運営が行います。
        </Rule>
        <Rule n="2" title="公平でない・インサイダー市場は不可">
          自分や関係者だけが結果を知り得る問い、結果を操作できる問い、特定個人のプライバシー・誹謗中傷にあたる問いは作れません。<b className="text-neg">不公平・インサイダー的な市場は却下されます。</b>
        </Rule>
        <Rule n="3" title="承認された人のみ作成可能">
          市場作成は承認制です。本フォームで審査を申請し、運営が承認した方だけが市場を作れます。
        </Rule>
        <Rule n="4" title="承認後にできること">
          承認されると、このページから何度でも市場を申請できます（各市場も個別に審査されます）。
        </Rule>
        <Rule n="5" title="作成者テラ銭 10%">
          あなたの市場で参加者が使った<b className="text-text">取引参加ポイントの10%</b>が、解決時にあなたへ入ります（<b className="text-text">参加ポイントのみ・ゴリラコインではありません</b>・換金不可）。
        </Rule>
      </div>

      {/* 申請フォーム */}
      <div className="border border-border bg-surface rounded-[18px] p-5 space-y-3" style={{ boxShadow: "var(--shadow)" }}>
        <h2 className="font-bold text-[15px]">⑥ 審査を申請する</h2>
        <Field label="あなたのSNS媒体のURL（必須）" hint="X / Instagram / YouTube / TikTok など、本人確認できるアカウント">
          <input value={sns} onChange={(e) => setSns(e.target.value)} placeholder="https://x.com/your_account"
            className="w-full rounded-[10px] border border-border bg-surface2 px-3 py-2 text-base md:text-[14px] outline-none focus:border-primary" />
        </Field>
        <Field label="どんなジャンルの市場を作りますか？（必須）" hint="例：スポーツ、エンタメ、地域イベント、時事・ニュース など">
          <input value={genres} onChange={(e) => setGenres(e.target.value)} placeholder="例：サッカー・お笑い・地元イベント"
            className="w-full rounded-[10px] border border-border bg-surface2 px-3 py-2 text-base md:text-[14px] outline-none focus:border-primary" />
        </Field>
        <Field label="自己紹介・作りたい市場の説明（任意）" hint="活動内容や、なぜ作りたいかなど">
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={500}
            placeholder="どんな市場で盛り上げたいか教えてください"
            className="w-full rounded-[10px] border border-border bg-surface2 px-3 py-2 text-base md:text-[14px] outline-none focus:border-primary" />
        </Field>
        <button onClick={apply} disabled={busy} className="btn-press w-full py-3 rounded-[12px] text-white font-extrabold disabled:opacity-50" style={{ background: "var(--grad)", boxShadow: "var(--cta-glow)" }}>
          {busy ? "送信中…" : status ? "再申請する" : "審査を申請する"}
        </button>
        {msg && <p className="text-[13px] text-center text-neg">{msg}</p>}
      </div>
    </div>
  );
}

// 承認済み：市場作成フォーム
function MarketForm({ cats, subs, reload }: { cats: Category[]; subs: Sub[]; reload: () => void }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [close, setClose] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    if (q.trim().length < 8) { setMsg("質問は8文字以上で入力してください"); return; }
    if (!close) { setMsg("締切日時を選んでください"); return; }
    setBusy(true); setMsg(null);
    const { error } = await createClient().rpc("submit_user_market", {
      p_question: q.trim(), p_category_id: cat || null, p_close_time: new Date(close).toISOString(),
    });
    setBusy(false);
    if (error) {
      const m = error.message;
      setMsg(m.includes("not_creator") ? "市場作成の承認が必要です" : m.includes("too_many_pending") ? "審査中の申請が多すぎます（5件まで）" : m.includes("question_too_short") ? "質問が短すぎます" : m.includes("invalid_close") ? "締切は未来の日時にしてください" : "申請に失敗しました");
      return;
    }
    setQ(""); setClose(""); setMsg("申請しました！審査通過後に公開されます🦍"); reload();
  }

  return (
    <>
      <div className="border border-border bg-surface rounded-[18px] p-4 mt-5 space-y-3" style={{ boxShadow: "var(--shadow)" }}>
        <div>
          <div className="text-[12px] font-bold text-dim mb-1.5">質問（YES/NO で答えられる形に）</div>
          <textarea value={q} onChange={(e) => setQ(e.target.value)} rows={2} maxLength={200}
            placeholder="例：今週末、東京スカイツリーは点灯イベントを行う？"
            className="w-full rounded-[10px] border border-border bg-surface2 px-3 py-2 text-base md:text-[14px] outline-none focus:border-primary" />
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="text-[12px] font-bold text-dim flex flex-col gap-1.5">カテゴリ
            <select value={cat} onChange={(e) => setCat(e.target.value)} className="rounded-[10px] border border-border bg-surface2 px-3 py-2 text-sm">
              <option value="">未分類</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="text-[12px] font-bold text-dim flex flex-col gap-1.5">締切（この日時で結果が決まる）
            <input type="datetime-local" value={close} onChange={(e) => setClose(e.target.value)} className="rounded-[10px] border border-border bg-surface2 px-3 py-2 text-sm" />
          </label>
        </div>
        <p className="text-[11px] text-faint">選択肢は「YES / NO」。結果の確定は運営が行います（公平のため）。客観的に結果が分かる問いにしてください。インサイダー的・不公平な市場は却下されます。</p>
        <button onClick={submit} disabled={busy} className="btn-press w-full py-3 rounded-[12px] text-white font-extrabold disabled:opacity-50" style={{ background: "var(--grad)", boxShadow: "var(--cta-glow)" }}>
          {busy ? "送信中…" : "審査に出す"}
        </button>
        {msg && <p className="text-[13px] text-center text-dim">{msg}</p>}
      </div>

      {subs.length > 0 && (
        <div className="mt-7">
          <h2 className="text-[13px] font-extrabold text-dim mb-2.5">あなたの申請</h2>
          <div className="space-y-2">
            {subs.map((s) => (
              <div key={s.id} className="border border-border bg-surface rounded-[14px] p-3.5 flex items-center gap-3" style={{ boxShadow: "var(--shadow)" }}>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-semibold truncate">{s.question}</div>
                  <div className="text-[11px] text-faint">締切 {new Date(s.close_time).toLocaleDateString("ja-JP")}</div>
                </div>
                {s.status === "open" || s.status === "resolved" || s.status === "closed"
                  ? <Link href={`/market/${s.id}`} className="text-[12px] font-bold text-primary bg-primary-weak px-3 py-1.5 rounded-full shrink-0">{STATUS_JA[s.status] ?? s.status}</Link>
                  : <span className="text-[12px] font-bold text-dim bg-surface2 px-3 py-1.5 rounded-full shrink-0">{STATUS_JA[s.status] ?? s.status}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function Rule({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="w-6 h-6 rounded-full grid place-items-center text-white text-[12px] font-extrabold shrink-0" style={{ background: "var(--grad)" }}>{n}</div>
      <div className="min-w-0">
        <div className="font-bold text-[13.5px]">{title}</div>
        <p className="text-[12.5px] text-dim leading-relaxed mt-0.5">{children}</p>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[12px] font-bold text-dim mb-1">{label}</div>
      {children}
      {hint && <p className="text-[11px] text-faint mt-1">{hint}</p>}
    </div>
  );
}
