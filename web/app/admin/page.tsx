"use client";
// 管理ダッシュボード: KPI＋カテゴリ現況（Dashboard）＋各機能へのメニューカード。
import Link from "next/link";
import { Dashboard } from "@/components/admin/Dashboard";
import { Logo } from "@/components/Logo";

const MENU = [
  { href: "/admin/economy", title: "経済モニタ", desc: "参加ポイント供給・LMSR補助金・インフレ監視・手動ジョブ", icon: "￥" },
  { href: "/admin/markets", title: "市場マネージャ", desc: "全市場一覧・b調整・締切編集・非表示/中止（ゴミ掃除）", icon: "▦" },
  { href: "/admin/users", title: "ユーザー", desc: "一覧・プレイ履歴・参加ポイント付与/消滅・フラグ", icon: "◍" },
  { href: "/admin/prizes", title: "景品マスタ", desc: "景品の登録・在庫・公開、交換申込の発送/取消管理", icon: "🎁" },
  { href: "/admin/affiliate", title: "提携案件", desc: "アフィリエイト案件の登録・公開、成果の手動消し込み（参加pt付与）", icon: "🔗" },
  { href: "/admin/params", title: "パラメータ設定", desc: "付与額・b既定値・的中報酬レート（コールドスタート調整）", icon: "⚙" },
  { href: "/admin/create", title: "市場作成", desc: "二択市場を手動で作成（初期YES確率でシード）", icon: "＋" },
  { href: "/admin/queue", title: "解決キュー", desc: "締切後の手動市場を確定／中止", icon: "✓" },
  { href: "/admin/comments", title: "通報・コメント管理", desc: "通報されたコメントの確認と非表示／復帰（盛り上げの安全運用）", icon: "💬" },
  { href: "/admin/settings", title: "カテゴリ設定", desc: "目標数・Poly上限・プリセット・カテゴリ追加", icon: "▤" },
  { href: "/admin/templates", title: "テンプレート", desc: "自動生成テンプレの作成・削除", icon: "▥" },
];

export default function AdminDashboardPage() {
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3.5">
        <Logo size={38} />
        <h1 className="text-[22px] font-extrabold">管理コンソール</h1>
        <span className="ml-auto text-[12px] font-extrabold text-primary bg-primary-weak px-3.5 py-1.5 rounded-full">管理者</span>
      </div>

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
