# SPEC: 価格エンジン・ポイント台帳・取引コア (Core)

予測市場プラットフォーム（ポイント制・換金不可・賭博非該当）の心臓部。
**LMSR価格エンジン / ポイント台帳 / 取引RPC / 解決RPC / RLS / 状態遷移** を定義する。

> このSPECが「最小で動く一式」の土台。`SPEC_MARKET_SUPPLY_LAYER.md`（供給レイヤー）は
> 本SPECの `resolve_market()` RPC とテーブル群に依存する。フロントSPECは本SPECのRPC名・戻り値形・
> Realtimeチャネルに依存する。**実装はすべて Supabase / Postgres（plpgsql SECURITY DEFINER関数）前提。**

---

## 0. 定数と前提

```
POINTS_PER_SHARE = 100          -- 勝ち株1株の償還ポイント。負け株は0。
SIGNUP_GRANT     = 1000         -- 新規登録時の初期付与（全員同額）
DAILY_GRANT      = 100          -- デイリー付与（全員同額）
B_MIN, B_DEFAULT, B_MAX = 50, 200, 5000   -- 流動性パラメータの範囲
ROUNDING: 買い=切り上げ(ceil) / 売り=切り捨て(floor)  -- 端数は必ずシステム有利側へ（ポイント流出防止）
TIMEZONE: デイリー付与の「日」は Asia/Tokyo (JST) 基準
```

**ポイントの不変条件（賭博非該当の生命線）**
1. ポイントは換金不可・現金購入不可・ユーザー間譲渡不可。
2. 入手経路は無償のみ（登録付与・デイリー付与・的中償還）。
3. すべてのポイント移動は `point_ledger` に不変レコードとして残る（更新・削除禁止）。
4. 残高は `wallets.balance` に保持し、台帳の総和と常に一致する（§10 検証）。

---

## 1. データモデル (DDL)

```sql
-- ウォレット（1ユーザー1行 = 1人1ウォレット）
create table wallets (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  balance    bigint not null default 0 check (balance >= 0),
  created_at timestamptz not null default now()
);

-- 不変の取引台帳（複式簿記的。INSERTのみ。UPDATE/DELETE禁止）
create table point_ledger (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id),
  delta       bigint not null,                 -- 正=入金 / 負=出金
  reason      text not null,                   -- 'signup'|'daily'|'buy'|'sell'|'redeem'|'refund'
  market_id   uuid references markets(id),
  outcome_id  uuid references outcomes(id),
  shares      numeric,                         -- 売買時の株数（符号付き）
  balance_after bigint not null,               -- この取引後の残高（監査用スナップショット）
  created_at  timestamptz not null default now()
);

-- 市場（供給レイヤーSPECと共有。本SPECで使う列を含む完全形）
create table markets (
  id                 uuid primary key default gen_random_uuid(),
  category_id        uuid references categories(id),
  question           text not null,
  description        text,
  image_url          text,
  market_kind        text not null default 'binary',  -- 'binary' | 'multi'
  b_param            numeric not null default 200 check (b_param > 0),
  source             text not null,                   -- 'admin'|'template'|'mirror'
  resolution_kind    text not null,                   -- 'manual'|'auto'
  resolution_binding jsonb,
  external_ref       text,
  status             text not null default 'open',    -- §5の状態
  close_time         timestamptz not null,            -- 取引停止時刻
  resolve_time       timestamptz not null,            -- 解決予定時刻
  created_by         uuid references auth.users(id),
  created_at         timestamptz not null default now()
);

-- アウトカム（市場の選択肢。q がLMSRの状態ベクトル本体）
create table outcomes (
  id          uuid primary key default gen_random_uuid(),
  market_id   uuid not null references markets(id) on delete cascade,
  label       text not null,                   -- 'YES'|'NO' or 多択ラベル
  display_order int not null default 0,
  q           numeric not null default 0,      -- 累積発行株数（LMSR状態）
  is_winner   boolean,                          -- 解決後にセット
  unique (market_id, display_order)
);

-- ポジション（ユーザーの保有株。cost_basis はP&Lとvoid返金用）
create table positions (
  user_id     uuid not null references auth.users(id),
  outcome_id  uuid not null references outcomes(id),
  shares      numeric not null default 0 check (shares >= 0),
  cost_basis  bigint not null default 0,        -- 取得に使った正味ポイント累計
  primary key (user_id, outcome_id)
);

-- 解決記録（透明性。全公開）
create table resolutions (
  market_id   uuid primary key references markets(id),
  winning_outcome_id uuid references outcomes(id),  -- voidならnull
  resolution_kind text not null,               -- 'manual'|'auto'|'void'
  source_url  text,                              -- 確定根拠
  resolved_by uuid references auth.users(id),    -- 手動時の管理者。autoはnull
  resolved_at timestamptz not null default now()
);

-- デイリー付与の冪等管理
create table daily_grants (
  user_id    uuid not null references auth.users(id),
  grant_date date not null,                     -- JST基準の日付
  primary key (user_id, grant_date)
);
```

---

## 2. LMSR価格エンジン

### 2.1 数式
アウトカム数 n、状態ベクトル `q = (q_1..q_n)`、流動性 `b`。

```
コスト関数:  C(q) = b · ln( Σ_i exp(q_i / b) )
価格(=確率): p_k  = exp(q_k / b) / Σ_i exp(q_i / b)     ∈ (0,1),  Σ_k p_k = 1
```

### 2.2 数値安定化（必須・log-sum-expトリック）
`exp(q_i/b)` のオーバーフロー防止のため、必ず最大値を引いてから計算する。

```
function lmsr_C(q[], b):
    m = max_i( q_i / b )
    return b * ( m + ln( Σ_i exp( q_i / b - m ) ) )

function lmsr_price(q[], b, k):
    m = max_i( q_i / b )
    num = exp( q_k / b - m )
    den = Σ_i exp( q_i / b - m )
    return num / den
```

### 2.3 売買コスト
```
outcome k を Δ株 買うコスト(unit): cost_u = lmsr_C(q + Δ·e_k, b) − lmsr_C(q, b)
outcome k を Δ株 売る受取(unit):   recv_u = lmsr_C(q, b) − lmsr_C(q − Δ·e_k, b)
ポイント換算: points = unit × POINTS_PER_SHARE
  買い: cost_points = ceil(cost_u × POINTS_PER_SHARE)   -- 切り上げ
  売り: recv_points = floor(recv_u × POINTS_PER_SHARE)  -- 切り捨て
```

`cost_u` は常に 0〜Δ の範囲（1株の最大コスト=1unit=POINTS_PER_SHARE点）。
償還も1勝ち株=POINTS_PER_SHARE点なので、単位系が完全に整合する。

---

## 3. 取引RPC

すべて `security definer` のplpgsql関数。**呼び出し時に `auth.uid()` を内部で検証**し、
対象 `market` 行を `select ... for update` で**行ロック**してから価格計算する（レース条件防止）。
クライアントはこれら以外の方法で残高・株・q を書き換えられない（§8 RLS）。

### 3.1 `buy_shares(p_outcome_id uuid, p_shares numeric) returns jsonb`
```
1. uid = auth.uid(); assert uid not null
2. assert p_shares > 0
3. m = SELECT market JOIN outcome WHERE outcome.id=p_outcome_id  FOR UPDATE of markets
4. assert m.status = 'open' AND now() < m.close_time         -- でなければ例外 'market_closed'
5. q[] = 全outcomesのq (market内); k = p_outcome_id のindex
6. cost_u = lmsr_C(q with q[k]+=p_shares, b) - lmsr_C(q, b)
   cost_points = ceil(cost_u * POINTS_PER_SHARE)
7. w = SELECT wallet FOR UPDATE; assert w.balance >= cost_points  -- でなければ 'insufficient_balance'
8. UPDATE wallets SET balance = balance - cost_points
9. UPSERT positions: shares += p_shares, cost_basis += cost_points
10. UPDATE outcomes SET q = q + p_shares WHERE id = p_outcome_id
11. INSERT point_ledger(uid, -cost_points, 'buy', market_id, outcome_id, +p_shares, new_balance)
12. RETURN jsonb {
      ok: true, cost_points, shares: p_shares,
      new_prices: [{outcome_id, price}...],   -- 全outcomeの更新後価格
      balance: new_balance
    }
-- 例外時は自動ロールバック（単一トランザクション）
```

### 3.2 `sell_shares(p_outcome_id uuid, p_shares numeric) returns jsonb`
buyの対称。手順4で `assert position.shares >= p_shares`（'insufficient_shares'）。
`recv_points = floor(recv_u * POINTS_PER_SHARE)`。
positions.shares -= p_shares、cost_basis は按分して減算（`cost_basis -= round(cost_basis * p_shares / shares_before)`）。
outcomes.q -= p_shares、wallet += recv_points、ledger 'sell' に +recv_points。

### 3.3 端数・整合
- 買い切り上げ/売り切り捨ての差分（端数）はシステムに残留し、ユーザー総残高が膨張しない方向に倒れる。
- `cost_points` が 0 になる極小取引は許可しない（'trade_too_small'、最小1点）。

---

## 4. 市場ライフサイクルと状態遷移

```
draft ──(公開)──▶ open ──(close_time到来 or 管理者)──▶ closed
                    │                                      │
                    └──────────────────────────────────────┴──(解決開始)──▶ resolving
                                                                                │
                            ┌───────────────────────────────────────────────────┤
                            ▼                                                     ▼
                        resolved (勝敗確定・償還済)                            void (中止・返金済)
```

- `open`: 唯一トレード可能な状態。buy/sell はこの状態かつ `now() < close_time` のみ受理。
- `closed`: トレード停止、解決待ち。`close_time` 到来で自動、または管理者が手動で。
- `resolving`: 解決処理中の排他フラグ（供給レイヤーの自動解決ジョブがセット）。二重解決防止。
- `resolved` / `void`: 終端。以後の状態変更不可。

状態遷移はRPC内で `FOR UPDATE` ロック下で行い、許可されない遷移は例外を投げる。

---

## 5. 解決と償還RPC

### 5.1 `resolve_market(p_market_id uuid, p_winning_outcome_id uuid, p_source_url text) returns jsonb`
供給レイヤーの自動解決ジョブ、または管理者の解決キューから呼ばれる。
```
1. m = SELECT market FOR UPDATE
2. assert m.status in ('open','closed','resolving')   -- 終端なら 'already_resolved'
3. assert p_winning_outcome_id は m に属する
4. UPDATE markets SET status='resolved'
5. UPDATE outcomes SET is_winner = (id = p_winning_outcome_id) WHERE market_id=m.id
6. -- 勝者一括償還（set-based。大量ポジションでもO(1)往復）
   WITH winners AS (
     SELECT pos.user_id, pos.shares * POINTS_PER_SHARE AS payout
     FROM positions pos WHERE pos.outcome_id = p_winning_outcome_id AND pos.shares > 0
   )
   UPDATE wallets w SET balance = balance + winners.payout FROM winners WHERE w.user_id=winners.user_id;
   INSERT point_ledger(...,'redeem', +payout,...) SELECT ... FROM winners;
7. INSERT resolutions(market_id, p_winning_outcome_id, m.resolution_kind, p_source_url,
                      resolved_by = auth.uid()  -- autoジョブはサービスロールでnull扱い, now())
8. RETURN jsonb { ok:true, winners_count, total_paid }
```
**冪等性**: 終端状態なら例外で弾く。`resolving` への遷移とロックで多重呼び出しを防ぐ。

### 5.2 `void_market(p_market_id uuid, p_reason text) returns jsonb`
中止時の返金。各ポジションの `cost_basis` を所有者へ返金（買値ベースで公平）。
```
UPDATE wallets += positions.cost_basis（outcome∈market の全保有者）
INSERT ledger 'refund' (+cost_basis)
UPDATE markets status='void'; INSERT resolutions(..., winning=null, kind='void', source=p_reason)
```

---

## 6. ポイント発行RPC

### 6.1 `grant_signup_bonus()` — 新規登録時1回
`auth.users` への登録トリガ、または初回ログイン時に呼ぶ。wallet作成＋`SIGNUP_GRANT`付与、ledger 'signup'。
冪等: walletが既存なら何もしない。

### 6.2 `claim_daily_grant() returns jsonb`
```
1. uid=auth.uid(); today = (now() AT TIME ZONE 'Asia/Tokyo')::date
2. INSERT daily_grants(uid, today) ON CONFLICT DO NOTHING; -- 既に受領なら0行
3. IF 0行: RETURN {ok:false, reason:'already_claimed'}
4. ELSE: wallet += DAILY_GRANT; ledger 'daily'; RETURN {ok:true, granted:DAILY_GRANT, balance}
```
全員同額・1日1回。スタートラインの平等を仕組みで固定（少人数フェーズの公平性の核）。

---

## 7. RLS ポリシー（防御の要）

**全テーブルで RLS を有効化。クライアントの直接 INSERT/UPDATE/DELETE はすべて拒否。**
書き込みは §3〜6 の `security definer` RPC 経由のみ（これらは所有ロールでRLSをバイパス）。

```sql
alter table wallets       enable row level security;
alter table point_ledger  enable row level security;
alter table positions     enable row level security;
alter table markets       enable row level security;
alter table outcomes      enable row level security;
alter table resolutions   enable row level security;
alter table daily_grants  enable row level security;

-- SELECT: 自分のものだけ見える（市場・アウトカム・解決は全公開）
create policy "own wallet"      on wallets      for select using (user_id = auth.uid());
create policy "own ledger"      on point_ledger for select using (user_id = auth.uid());
create policy "own positions"   on positions    for select using (user_id = auth.uid());
create policy "public markets"     on markets     for select using (true);
create policy "public outcomes"    on outcomes    for select using (true);
create policy "public resolutions" on resolutions for select using (true);

-- INSERT/UPDATE/DELETE ポリシーは「作らない」= 全拒否。書き込みはRPCのみ。
```

管理者操作（市場作成・手動解決）も専用の `security definer` RPC 経由とし、
関数内で「呼び出しユーザーが管理者ロールか」を `auth.uid()` で検証する。

---

## 8. Realtime（価格のリアルタイム配信）

- `outcomes` テーブルを Supabase Realtime の publication に追加。
- クライアントは表示中の市場について `outcomes` の `q` 変更を `market_id` でフィルタ購読。
- `q` が変わるたびにフロントで `lmsr_price()` を再計算して確率バーを更新
  （価格そのものを配信してもよいが、qだけ配ればフロントで導出でき軽い）。
- これにより Polymarket のように「誰かのトレードで確率が動く」体験が出る。

---

## 9. 不変条件（実装が必ず守る）

1. **残高=台帳総和**: 任意ユーザーで `wallets.balance == Σ point_ledger.delta`。
2. **台帳は不変**: `point_ledger` への UPDATE/DELETE は発生しない（INSERTのみ）。
3. **残高は非負**: `wallets.balance >= 0`（CHECK制約＋RPC内assert）。
4. **株は非負**: `positions.shares >= 0`。
5. **価格計算とロック**: q を読む取引RPCは必ず対象marketを `FOR UPDATE` してから計算・更新する。
6. **トレードは open のみ**: `status='open' AND now()<close_time` 以外で buy/sell は例外。
7. **終端の不可逆**: `resolved`/`void` 後は状態変更・トレード・再償還が起きない。
8. **端数はシステム有利**: 買い切り上げ・売り切り捨て。ユーザー総残高は供給量を超えない。
9. **デイリー付与は1日1回・全員同額**: `daily_grants` の複合PKで保証。
10. **ポイントは閉じた経済**: 換金・購入・譲渡のRPCは存在しない（作らない）。

---

## 10. 受け入れ条件 (Acceptance Criteria)

- [ ] 二択市場で q=(0,0) のとき YES価格 = 0.5、NO価格 = 0.5。
- [ ] YESを大量に買うと YES価格が上昇し NO価格が下降、合計は常に1.0。
- [ ] buy → 直後に同量 sell すると、端数（切り上げ/切り捨て分）だけ損して概ね戻る。
- [ ] 残高不足のbuyは 'insufficient_balance' で全ロールバック（部分適用が起きない）。
- [ ] close_time 経過後の buy/sell は 'market_closed'。
- [ ] resolve_market 後、勝ち株保有者の残高が `shares × 100` 増え、負け株は0。
- [ ] resolve_market を同一市場に2回呼ぶと2回目は 'already_resolved' で弾かれ、二重償還しない。
- [ ] 並行する2つのbuyを同時実行しても、行ロックにより価格・残高が破綻しない。
- [ ] claim_daily_grant は同日2回目が 'already_claimed'。
- [ ] 任意時点で全ユーザーの `balance == Σ ledger.delta`（監査クエリが常に一致）。
- [ ] クライアントから wallets/positions/outcomes へ直接 UPDATE を試みると RLS で拒否される。

---

## 11. 実装順序の推奨

1. テーブルDDL（§1）＋制約＋RLS有効化（§7）。
2. LMSRヘルパ関数 `lmsr_C` / `lmsr_price`（§2、数値安定版）。単体テストで §10 の価格不変を確認。
3. 発行RPC `grant_signup_bonus` / `claim_daily_grant`（§6）。ウォレットに残高が入る。
4. 取引RPC `buy_shares` / `sell_shares`（§3）。**ここで市場が動く。**
5. 解決RPC `resolve_market` / `void_market`（§5）。**ここで償還が回る → 供給レイヤーが接続可能に。**
6. Realtime publication（§8）。
7. 監査クエリ（残高=台帳総和）と受け入れ条件（§10）の自動テスト。
```
```
