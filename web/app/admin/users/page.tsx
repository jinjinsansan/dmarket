"use client";
// 管理: ユーザー一覧＋運用（プレイ履歴・参加ポイント付与/消滅・フラグ）。
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAdminToast } from "@/components/admin/AdminToast";
import { formatPoints, pnlText } from "@/lib/format";
import { LEDGER_REASON_LABEL } from "@/lib/constants";

interface UserRow {
  user_id: string; display_name: string; email: string; line_user_id: string | null;
  balance: number; trades_count: number; net_worth: number; realized_pnl: number;
  resolved_count: number; win_count: number; is_flagged: boolean; is_admin: boolean;
  created_at: string; last_activity: string | null;
  login_count: number; last_sign_in: string | null; referral_count: number; referred_by: string | null;
}

// 直近アクティビティ or 最終ログインが5分以内ならオンライン扱い
function activeInfo(r: UserRow): { online: boolean; label: string } {
  const ts = [r.last_activity, r.last_sign_in].filter(Boolean).map((s) => new Date(s as string).getTime());
  if (ts.length === 0) return { online: false, label: "—" };
  const last = Math.max(...ts);
  const min = Math.floor((Date.now() - last) / 60000);
  if (min < 5) return { online: true, label: "オンライン" };
  if (min < 60) return { online: false, label: `${min}分前` };
  if (min < 1440) return { online: false, label: `${Math.floor(min / 60)}時間前` };
  return { online: false, label: `${Math.floor(min / 1440)}日前` };
}
interface Ledger { id: number; delta: number; reason: string; balance_after: number; created_at: string; question: string | null; }
interface Pos { question: string; label: string; shares: number; cost_basis: number; status: string; }

const REASON = { ...LEDGER_REASON_LABEL, admin_grant: "運営付与", admin_burn: "運営消滅" } as Record<string, string>;

export default function AdminUsersPage() {
  const notify = useAdminToast();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await createClient().rpc("admin_list_users");
    if (error) { notify(`取得失敗: ${error.message}`); return; }
    setRows((data as UserRow[]) ?? []);
  }, [notify]);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => rows.filter((r) =>
    !q || r.display_name.toLowerCase().includes(q.toLowerCase()) || (r.email ?? "").includes(q)), [rows, q]);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[16px] font-bold">ユーザー / Users <span className="text-dim font-medium text-sm">{rows.length}人</span></h2>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前・メールで検索"
          className="h-9 px-3 rounded-[10px] border border-border bg-surface2 text-sm outline-none focus:border-primary w-48" />
      </div>

      <div className="overflow-x-auto rounded-[var(--radius)] border border-border" style={{ boxShadow: "var(--shadow)" }}>
        <table className="w-full text-sm">
          <thead className="text-dim text-xs">
            <tr className="border-b border-border">
              <th className="text-left p-3">ユーザー</th>
              <th className="num p-3 text-right">残高</th>
              <th className="num p-3 text-right">取引</th>
              <th className="num p-3 text-right">総資産</th>
              <th className="num p-3 text-right">実現損益</th>
              <th className="num p-3 text-right">的中</th>
              <th className="num p-3 text-right">紹介</th>
              <th className="p-3 text-center">状態</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <UserRowView key={r.user_id} r={r} open={openId === r.user_id}
                onToggle={() => setOpenId(openId === r.user_id ? null : r.user_id)}
                onChanged={load} notify={notify} />
            ))}
            {filtered.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-dim">ユーザーがいません</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function UserRowView({ r, open, onToggle, onChanged, notify }: {
  r: UserRow; open: boolean; onToggle: () => void; onChanged: () => void; notify: (m: string) => void;
}) {
  const pnl = pnlText(r.realized_pnl);
  const hit = r.resolved_count > 0 ? `${Math.round((r.win_count / r.resolved_count) * 100)}%` : "—";
  const act = activeInfo(r);
  return (
    <>
      <tr className="border-b border-border last:border-0 hover:bg-surface2 cursor-pointer" onClick={onToggle}>
        <td className="p-3">
          <div className="flex items-center gap-2.5">
            <div className="relative shrink-0">
              <div className="w-8 h-8 rounded-full grid place-items-center text-white text-xs font-bold" style={{ background: "var(--grad)" }}>{r.display_name.slice(0, 1)}</div>
              {act.online && <span className="absolute -right-0.5 -bottom-0.5 w-2.5 h-2.5 rounded-full bg-pos border-2 border-surface" title="オンライン" />}
            </div>
            <div className="min-w-0">
              <div className="font-semibold truncate flex items-center gap-1.5">
                {r.display_name}
                {r.is_admin && <span className="text-[10px] bg-primary-weak text-primary px-1.5 rounded">admin</span>}
                {r.is_flagged && <span className="text-[10px] bg-neg-weak text-neg px-1.5 rounded">flag</span>}
              </div>
              <div className="text-[11px] text-dim truncate">{r.email || (r.line_user_id ? "LINE" : "—")}</div>
            </div>
          </div>
        </td>
        <td className="num p-3 text-right font-bold">{formatPoints(r.balance)}</td>
        <td className="num p-3 text-right text-dim">{formatPoints(r.trades_count)}</td>
        <td className="num p-3 text-right">{formatPoints(r.net_worth)}</td>
        <td className={`num p-3 text-right ${pnl.cls}`}>{pnl.text}</td>
        <td className="num p-3 text-right text-dim">{hit}</td>
        <td className="num p-3 text-right">{r.referral_count > 0 ? <span className="text-primary font-bold">{r.referral_count}</span> : <span className="text-faint">0</span>}</td>
        <td className="p-3 text-center text-xs">
          <span className={act.online ? "text-pos font-bold" : "text-dim"}>{act.label}</span>
        </td>
        <td className="p-3 text-dim text-xs">{open ? "▲" : "▼"}</td>
      </tr>
      {open && <tr><td colSpan={9} className="p-0"><UserDetail r={r} onChanged={onChanged} notify={notify} /></td></tr>}
    </>
  );
}

function UserDetail({ r, onChanged, notify }: { r: UserRow; onChanged: () => void; notify: (m: string) => void }) {
  const [ledger, setLedger] = useState<Ledger[]>([]);
  const [positions, setPositions] = useState<Pos[]>([]);
  const [amount, setAmount] = useState(100);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sb = createClient();
    sb.rpc("admin_user_ledger", { p_user_id: r.user_id }).then(({ data }) => setLedger(data ?? []));
    sb.rpc("admin_user_positions", { p_user_id: r.user_id }).then(({ data }) => setPositions(data ?? []));
  }, [r.user_id]);

  async function adjust(sign: 1 | -1) {
    if (!amount || amount <= 0) return;
    if (!confirm(`${r.display_name} に ${sign > 0 ? "+" : "−"}${formatPoints(amount)} pt を${sign > 0 ? "付与" : "消滅"}します。よろしいですか？`)) return;
    setBusy(true);
    const { data, error } = await createClient().rpc("admin_adjust_points", { p_user_id: r.user_id, p_delta: sign * amount, p_note: note });
    setBusy(false);
    if (error) { notify(`失敗: ${error.message}`); return; }
    notify(`${sign > 0 ? "付与" : "消滅"} ${formatPoints(Math.abs(data.applied))}pt（残高 ${formatPoints(data.balance)}）`);
    setNote(""); onChanged();
    createClient().rpc("admin_user_ledger", { p_user_id: r.user_id }).then(({ data }) => setLedger(data ?? []));
  }
  async function toggleFlag() {
    setBusy(true);
    const fn = r.is_flagged ? "unflag_user" : "flag_user";
    const params = r.is_flagged ? { p_user_id: r.user_id } : { p_user_id: r.user_id, p_reason: "管理者操作" };
    const { error } = await createClient().rpc(fn, params);
    setBusy(false);
    if (error) { notify(`失敗: ${error.message}`); return; }
    notify(r.is_flagged ? "フラグ解除しました" : "フラグしました（ランキング除外）");
    onChanged();
  }

  const act = activeInfo(r);
  const fdt = (s: string | null) => (s ? new Date(s).toLocaleString("ja-JP") : "—");
  return (
    <div className="bg-surface2 p-4 space-y-4">
      {/* アカウント情報 */}
      <div className="rounded-[10px] border border-border bg-surface p-3">
        <div className="text-xs font-bold text-dim mb-2">アカウント情報</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2 text-xs">
          <Info label="状態" value={act.online ? "🟢 オンライン" : act.label} />
          <Info label="ログイン回数" value={`${formatPoints(r.login_count ?? 0)} 回`} />
          <Info label="最終ログイン" value={fdt(r.last_sign_in)} />
          <Info label="最終アクティビティ" value={fdt(r.last_activity)} />
          <Info label="登録日" value={fdt(r.created_at)} />
          <Info label="紹介した人数" value={`${r.referral_count} 人`} accent={r.referral_count > 0} />
          <Info label="紹介元（どこから来たか）" value={r.referred_by ?? "—（直接登録）"} accent={!!r.referred_by} />
          <Info label="メール / LINE" value={r.email || (r.line_user_id ? "LINE連携" : "—")} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_320px]">
      {/* 取引/参加ポイント履歴 */}
      <div>
        <div className="text-xs font-bold text-dim mb-2">取引・参加ポイント履歴</div>
        <div className="max-h-64 overflow-y-auto rounded-[10px] border border-border bg-surface divide-y divide-border">
          {ledger.length === 0 ? <p className="p-3 text-xs text-dim">履歴なし</p> : ledger.map((l) => (
            <div key={l.id} className="flex items-center gap-2 px-3 py-2 text-xs">
              <span className="text-dim w-24 shrink-0">{new Date(l.created_at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
              <span className="flex-1 min-w-0 truncate">{REASON[l.reason] ?? l.reason}{l.question ? ` · ${l.question}` : ""}</span>
              <span className={`num ${l.delta >= 0 ? "text-pos" : "text-neg"}`}>{l.delta >= 0 ? "+" : ""}{formatPoints(l.delta)}</span>
              <span className="num text-dim w-16 text-right">{formatPoints(l.balance_after)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 保有ポジション */}
      <div>
        <div className="text-xs font-bold text-dim mb-2">保有ポジション</div>
        <div className="max-h-64 overflow-y-auto rounded-[10px] border border-border bg-surface divide-y divide-border">
          {positions.length === 0 ? <p className="p-3 text-xs text-dim">保有なし</p> : positions.map((p, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 text-xs">
              <span className="flex-1 min-w-0 truncate">{p.question}</span>
              <span className="text-dim">{p.label}</span>
              <span className="num">{formatPoints(p.shares)}株</span>
              <span className="num text-dim">取得{formatPoints(p.cost_basis)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 運用アクション */}
      <div className="space-y-3">
        <div className="text-xs font-bold text-dim">運用アクション</div>
        <div className="rounded-[10px] border border-border bg-surface p-3 space-y-2">
          <div className="text-[11px] text-dim">参加ポイント付与 / 消滅</div>
          <div className="flex gap-2">
            <input type="number" min={1} value={amount} onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value))))}
              className="num w-24 rounded-sm border border-border bg-surface2 px-2 py-1.5 text-sm" />
            <span className="text-dim text-sm self-center">pt</span>
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="メモ（任意）"
            className="w-full rounded-sm border border-border bg-surface2 px-2 py-1.5 text-xs" />
          <div className="flex gap-2">
            <button onClick={() => adjust(1)} disabled={busy} className="flex-1 rounded-sm py-1.5 text-sm font-bold text-white" style={{ background: "var(--pos)" }}>付与</button>
            <button onClick={() => adjust(-1)} disabled={busy} className="flex-1 rounded-sm py-1.5 text-sm font-bold text-white" style={{ background: "var(--neg)" }}>消滅</button>
          </div>
          <p className="text-[10px] text-faint">残高は0未満になりません（消滅は全額まで）。台帳に記録されます。</p>
        </div>
        <button onClick={toggleFlag} disabled={busy}
          className="w-full rounded-[10px] border border-border py-2 text-sm font-bold text-dim hover:text-text">
          {r.is_flagged ? "フラグ解除（ランキング復帰）" : "フラグする（ランキング除外）"}
        </button>
      </div>
      </div>
    </div>
  );
}

function Info({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10.5px] text-faint">{label}</div>
      <div className={`truncate font-semibold ${accent ? "text-primary" : "text-text"}`} title={value}>{value}</div>
    </div>
  );
}
