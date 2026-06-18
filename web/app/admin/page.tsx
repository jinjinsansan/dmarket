"use client";
// 管理ダッシュボード: KPI＋カテゴリ現況（Dashboard）＋各機能へのメニューカード。
import Link from "next/link";
import { Dashboard } from "@/components/admin/Dashboard";

const MENU = [
  { href: "/admin/users", title: "ユーザー", desc: "一覧・プレイ履歴・ポイント付与/消滅・フラグ", icon: "◍" },
  { href: "/admin/create", title: "市場作成", desc: "二択市場を手動で作成（初期YES確率でシード）", icon: "＋" },
  { href: "/admin/queue", title: "解決キュー", desc: "締切後の手動市場を確定／中止", icon: "✓" },
  { href: "/admin/settings", title: "カテゴリ設定", desc: "目標数・Poly上限・プリセット・カテゴリ追加", icon: "⚙" },
  { href: "/admin/templates", title: "テンプレート", desc: "自動生成テンプレの作成・削除", icon: "▤" },
];

export default function AdminDashboardPage() {
  return (
    <div className="space-y-8">
      {/* メニュー */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))" }}>
        {MENU.map((m) => (
          <Link key={m.href} href={m.href}
            className="group border border-border bg-surface rounded-[var(--radius)] p-4 hover:border-primary/60 transition-colors flex items-start gap-3"
            style={{ boxShadow: "var(--shadow)" }}>
            <div className="w-10 h-10 rounded-[11px] grid place-items-center text-white text-lg font-bold shrink-0" style={{ background: "var(--grad)" }}>{m.icon}</div>
            <div className="min-w-0">
              <div className="font-bold text-sm group-hover:text-primary">{m.title}</div>
              <div className="text-xs text-dim mt-0.5 leading-relaxed">{m.desc}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* KPI＋カテゴリ別フィード現況 */}
      <Dashboard />
    </div>
  );
}
