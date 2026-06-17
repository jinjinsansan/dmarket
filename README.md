# dmarket

ポイント制予測市場プラットフォーム（**換金不可・賭博非該当**）。
Polymarket型の「価格＝確率がトレードで動く」体験を、換金不可ポイントで再現する遊び場。
報酬は称号・ランキングのみ（賞品ゼロ）。マネタイズはBETの外側（コスメ・広告・有料情報）。

## ドキュメント
- 仕様書: [`specs/`](./specs/)（SPEC-00〜08）
- 実装計画: [`計画書.md`](./計画書.md)

## 技術スタック
- フロント: Next.js (App Router) / TypeScript / Tailwind CSS / Recharts
- バックエンド: Supabase（Postgres + Auth + Realtime + Edge Functions）
- DBロジック: plpgsql `SECURITY DEFINER` RPC（LMSR価格・台帳・取引・解決）
- 定期処理: pg_cron + Edge Functions（供給15分 / 解決5分 / 集計10分）

## 構成
```
web/        Next.js アプリ
supabase/   migrations（DDL/RPC/RLS） / functions（ジョブ・Webhook） / tests
specs/      仕様書
```

## 設計の絶対条件（賭博非該当の生命線）
換金不可 / 有償発行禁止 / 譲渡禁止 / 賞品ゼロ。
これらは「コードに存在してはならない機能」であり、**不在を自動テストで担保**する。

> 免責: 公開前に賭博罪・景品表示法・資金決済法の専門家レビューを必ず受けること。

## セットアップ
```bash
cp .env.example .env.local   # キーを記入（.env.local はコミットしない）
cd web && npm install && npm run dev
```
Supabase の運用は [`supabase/README.md`](./supabase/README.md) を参照。
