"use client";
// 管理ダッシュボード: 役割別メニュー（ゴリラ予想刷新）＋通報待ちバッジ＋KPI（Dashboard）。
import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Dashboard } from "@/components/admin/Dashboard";

type Item = { href: string; title: string; desc: string; icon: string };
const GROUPS: { title: string; items: Item[] }[] = [
  { title: "市場運営", items: [
    { href: "/admin/create", title: "市場作成", desc: "二択市場を手動で作成（初期YES確率でシード）", icon: "＋" },
    { href: "/admin/templates", title: "テンプレート", desc: "天気・デイリーなどの自動生成テンプレ", icon: "▥" },
    { href: "/admin/markets", title: "市場マネージャ", desc: "全市場一覧・b調整・締切編集・非表示/中止", icon: "▦" },
  ] },
  { title: "解決・モデレーション", items: [
    { href: "/admin/queue", title: "解決キュー", desc: "締切後の手動市場を確定／中止", icon: "✓" },
    { href: "/admin/review", title: "市場の審査", desc: "ユーザーが作成した市場の承認／却下", icon: "🦍" },
    { href: "/admin/comments", title: "通報・コメント管理", desc: "通報されたコメントの確認と非表示／復帰", icon: "💬" },
  ] },
  { title: "報酬・経済", items: [
    { href: "/admin/params", title: "パラメータ設定", desc: "付与額・b既定値・各種報酬レート（シェア/紹介/乗っかり/的中）", icon: "⚙" },
    { href: "/admin/economy", title: "経済モニタ", desc: "参加ポイント供給・LMSR補助金・台帳監査・手動ジョブ", icon: "￥" },
  ] },
  { title: "マネタイズ", items: [
    { href: "/admin/affiliate", title: "提携案件", desc: "アフィリエイト案件の登録・公開、成果の手動消し込み", icon: "🔗" },
    { href: "/admin/prizes", title: "景品マスタ", desc: "景品の登録・在庫・公開、交換申込の発送/取消", icon: "🎁" },
  ] },
  { title: "ユーザー", items: [
    { href: "/admin/users", title: "ユーザー", desc: "一覧・履歴・参加ポイント付与/消滅・フラグ", icon: "◍" },
  ] },
  { title: "上級（Poly連携）", items: [
    { href: "/admin/settings", title: "フィード設定", desc: "Polymarketミラーのカテゴリ別設定（現在は休眠・上級者向け）", icon: "▤" },
  ] },
];

export default function AdminDashboardPage() {
  const [reports, setReports] = useState(0);
  const [reviews, setReviews] = useState(0);
  useEffect(() => {
    const sb = createClient();
    sb.rpc("admin_list_reported_comments").then(({ data }) =>
      setReports(((data as { is_hidden: boolean }[]) ?? []).filter((r) => !r.is_hidden).length));
    sb.rpc("admin_list_pending_markets").then(({ data }) => setReviews(((data as unknown[]) ?? []).length));
  }, []);

  return (
    <div className="space-y-7">
      {GROUPS.map((g) => (
        <div key={g.title}>
          <h2 className="text-[13px] font-extrabold text-dim mb-2.5">{g.title}</h2>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))" }}>
            {g.items.map((m) => (
              <Link key={m.href} href={m.href}
                className="group border border-border bg-surface rounded-[var(--radius)] p-4 hover:border-primary/60 transition-colors flex items-start gap-3"
                style={{ boxShadow: "var(--shadow)" }}>
                <div className="w-10 h-10 rounded-[11px] grid place-items-center text-white text-lg font-bold shrink-0" style={{ background: "var(--grad)" }}>{m.icon}</div>
                <div className="min-w-0">
                  <div className="font-bold text-sm group-hover:text-primary flex items-center gap-2">
                    {m.title}
                    {m.href === "/admin/comments" && reports > 0 && (
                      <span className="text-[10px] font-extrabold text-white bg-neg px-1.5 py-px rounded-full">{reports}</span>
                    )}
                    {m.href === "/admin/review" && reviews > 0 && (
                      <span className="text-[10px] font-extrabold text-white bg-primary px-1.5 py-px rounded-full">{reviews}</span>
                    )}
                  </div>
                  <div className="text-xs text-dim mt-0.5 leading-relaxed">{m.desc}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}

      {/* KPI＋カテゴリ別フィード現況 */}
      <Dashboard />
    </div>
  );
}
