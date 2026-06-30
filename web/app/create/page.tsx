"use client";
// ユーザーによる市場作成（申請）。審査通過で公開。作成者は解決時に出来高の一部をテラ銭で受け取る。
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Category } from "@/lib/types";

type Sub = { id: string; question: string; status: string; close_time: string; created_at: string };
const STATUS_JA: Record<string, string> = { draft: "審査中", open: "公開中", closed: "締切", resolved: "解決済", void: "中止" };

export default function CreatePage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [cats, setCats] = useState<Category[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [close, setClose] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = createClient();
    const { data: { session } } = await sb.auth.getSession();
    setLoggedIn(Boolean(session?.user));
    const { data: c } = await sb.from("categories").select("*").eq("is_active", true).order("display_order");
    setCats((c as Category[]) ?? []);
    if (session?.user) {
      const { data: s } = await sb.rpc("my_submitted_markets");
      setSubs((s as Sub[]) ?? []);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

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
      setMsg(m.includes("not_authenticated") ? "ログインが必要です" : m.includes("too_many_pending") ? "審査中の申請が多すぎます（5件まで）" : m.includes("question_too_short") ? "質問が短すぎます" : m.includes("invalid_close") ? "締切は未来の日時にしてください" : "申請に失敗しました");
      return;
    }
    setQ(""); setClose(""); setMsg("申請しました！審査通過後に公開されます🦍"); load();
  }

  return (
    <div className="max-w-[680px] mx-auto px-4 md:px-[22px] py-6 pb-20 dm-in">
      <header>
        <h1 className="text-[24px] font-black">市場を作る</h1>
        <p className="text-[12px] text-dim mt-1">あなたの「これ、起きる？」をみんなに予想してもらおう。<b className="text-text">審査通過で公開</b>、盛り上がれば<b className="text-primary">出来高の一部があなたに</b>（参加pt・換金不可）。</p>
      </header>

      {!loggedIn ? (
        <p className="text-sm text-dim border border-border bg-surface rounded-[16px] p-4 mt-5">
          作成にはログインが必要です。<a href="/api/auth/line/login" className="text-primary underline">LINEでログイン →</a>
        </p>
      ) : (
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
          <p className="text-[11px] text-faint">選択肢は「YES / NO」。結果の確定は運営が行います（公平のため）。客観的に結果が分かる問いにしてください。</p>
          <button onClick={submit} disabled={busy} className="btn-press w-full py-3 rounded-[12px] text-white font-extrabold disabled:opacity-50" style={{ background: "var(--grad)", boxShadow: "var(--cta-glow)" }}>
            {busy ? "送信中…" : "審査に出す"}
          </button>
          {msg && <p className="text-[13px] text-center text-dim">{msg}</p>}
        </div>
      )}

      {loggedIn && subs.length > 0 && (
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
    </div>
  );
}
