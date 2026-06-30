"use client";
// 管理: プラットフォーム設定（登録/デイリー付与額・b既定値）。コールドスタート調整の中枢。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAdminToast } from "@/components/admin/AdminToast";
import { formatPoints } from "@/lib/format";

const FIELDS: { key: string; label: string; hint: string; step?: number }[] = [
  { key: "signup_grant", label: "登録ボーナス", hint: "新規登録時に付与（インフレ源）" },
  { key: "daily_grant", label: "デイリーボーナス", hint: "1日1回付与" },
  { key: "b_default", label: "流動性 b（既定値）", hint: "管理者の市場作成フォームの初期値。小さいほど価格が動きやすく補助金が小さい" },
  { key: "prize_win_rate", label: "的中報酬レート（ゴリラコイン/勝ち株）", hint: "予想的中時に付与するゴリラコイン = 勝ち株数 × このレート。既定1。景品コスト割れ防止のため低めから", step: 0.1 },
  { key: "share_bonus", label: "シェアボーナス（pt/日）", hint: "Xシェアで1日1回もらえる参加pt。既定20" },
  { key: "referral_referrer", label: "友達紹介：紹介した人へ（pt）", hint: "友達がコードを使うと紹介者に付与。既定200" },
  { key: "referral_referee", label: "友達紹介：使った人へ（pt）", hint: "コードを入力した本人に付与。既定100" },
  { key: "ride_rate", label: "乗っかり率（的中時のシェア元へ）", hint: "シェア経由で乗った友達が的中したら、その払戻し×この率をシェア元へ。既定0.01（=1%）", step: 0.01 },
];

export default function AdminParamsPage() {
  const notify = useAdminToast();
  const [vals, setVals] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    const { data, error } = await createClient().rpc("admin_get_settings");
    if (error) { notify(`取得失敗: ${error.message}`); return; }
    setVals((data as Record<string, number>) ?? {});
  }, [notify]);
  useEffect(() => { load(); }, [load]);

  async function save(key: string) {
    const { error } = await createClient().rpc("admin_set_setting", { p_key: key, p_value: vals[key] ?? 0 });
    notify(error ? `保存失敗: ${error.message}` : "保存しました");
  }

  const b = vals.b_default ?? 200;
  const maxSubsidy = Math.round(b * Math.log(2) * 100);

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="rounded-[var(--radius)] border border-border bg-surface p-4 text-[13px] text-dim leading-relaxed" style={{ boxShadow: "var(--shadow)" }}>
        <b className="text-text">コールドスタートの調整</b><br />
        ユーザーが少ない初期は、補助金（インフレ）と単独ファーミングを抑えるため <b className="text-text">b を低め（50〜100）</b>、付与額も控えめが安全です。volume が増えたら緩めます。
      </div>

      {FIELDS.map((f) => (
        <div key={f.key} className="rounded-[var(--radius)] border border-border bg-surface p-4 flex items-end gap-3" style={{ boxShadow: "var(--shadow)" }}>
          <label className="flex-1">
            <div className="text-sm font-bold">{f.label}</div>
            <div className="text-xs text-dim mb-2">{f.hint}</div>
            <input type="number" min={0} step={f.step ?? 1} value={vals[f.key] ?? 0}
              onChange={(e) => setVals({ ...vals, [f.key]: Math.max(0, Number(e.target.value)) })}
              className="num w-40 rounded-sm border border-border bg-surface2 px-3 py-2" />
          </label>
          <button onClick={() => save(f.key)} className="rounded-sm bg-primary text-white px-4 py-2 text-sm font-bold">保存</button>
        </div>
      ))}

      <p className="text-xs text-faint">
        現在の b 既定値での最大補助金 = b×ln(2)×100 ≈ <b className="num">{formatPoints(maxSubsidy)}</b> pt / 市場。<br />
        ※ 既存の市場の b は「市場マネージャ」で個別に調整できます。Polyミラーの b は Edge Function 側の既定（200）です。
      </p>
    </div>
  );
}
