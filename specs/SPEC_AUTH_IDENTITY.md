# SPEC-01: 認証・オンボーディング・本人性

ユーザーの認証と「**1人1ウォレット**」の担保。スタートラインの平等（全員同額の初期付与）と、
不正対策（マルチアカウント抑止、SPEC-08）の土台を作る。

> 依存: Supabase Auth。中核(SPEC-02)の `wallets` / `grant_signup_bonus()` と接続する。

---

## 1. 認証方式

- Supabase Auth を使用。v1の方式:
  - **メール＋OTP（マジックリンク or 6桁コード）** を既定。
  - 任意で **電話番号OTP**（SMS）を追加可能（本人性を強めたい場合）。
  - ソーシャルログイン（Google等）は任意。1メール=1アカウントを崩さない範囲で。
- パスワード方式は任意。OTP中心にすると使い捨てメール対策（SPEC-08）と相性が良い。

---

## 2. 本人性ポリシー（1人1ウォレット）

- `auth.users` 1行 = `wallets` 1行 = 1ユーザー（中核のPKが `user_id`）。
- **検証済み連絡先を必須**にしてから初期付与する（未検証アカウントに初期ポイントを与えない）。
- 同一連絡先の重複登録は Supabase Auth が一意性で弾く。
- 端末/IPの相関や使い捨てメール判定など追加の抑止は SPEC-08 に委譲（本SPECは「検証済みで1人1ウォレット」までを保証）。

```sql
-- プロフィール（表示名・アバター等。本人性メタも保持）
create table profiles (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  display_name   text not null,
  avatar_id      text,                         -- コスメ(SPEC-08)の選択
  contact_verified boolean not null default false,
  signup_completed boolean not null default false,
  created_at     timestamptz not null default now()
);
alter table profiles enable row level security;
create policy "read profiles public" on profiles for select using (true);
-- 書き込みはRPC経由のみ（直書き禁止）
```

---

## 3. オンボーディング・フロー

```
1. メール/電話を入力 → OTP送信
2. OTP検証成功 → auth.users 作成、profiles 作成(contact_verified=true)
3. 表示名を設定（必須・ユニーク制約は任意。重複可なら内部IDで識別）
4. complete_signup() RPC を呼ぶ:
     - profiles.signup_completed=true
     - grant_signup_bonus() を内部で呼び、wallet作成＋SIGNUP_GRANT付与（冪等）
5. 以後ログインのたびにデイリーボーナス受領可能（claim_daily_grant, SPEC-02 §6.2）
```

### `complete_signup(p_display_name text) returns jsonb`（security definer）
```
1. uid=auth.uid(); assert uid not null
2. assert profiles.contact_verified = true            -- 未検証は付与しない
3. if profiles.signup_completed already true: return {ok:false, reason:'already_completed'}
4. update profiles set display_name=p_display_name, signup_completed=true
5. perform grant_signup_bonus()                       -- 冪等。walletとSIGNUP_GRANT
6. return {ok:true, balance: SIGNUP_GRANT}
```

---

## 4. セッションとアクセス制御

- フロントは `@supabase/ssr` でセッション管理。Server Components から `auth.uid()` を利用。
- 取引・受領などの状態変更はすべて RPC 経由（RLSで直書き不可）。RPC内で `auth.uid()` を検証。
- 管理者判定: `profiles` または別途 `admin_users` テーブルで管理（SPEC-07）。
  管理RPCは内部で「呼び出し元が管理者か」を必ず検証する。

```sql
create table admin_users (
  user_id uuid primary key references auth.users(id),
  role    text not null default 'admin'        -- 'admin' | 'moderator'
);
-- 管理RPC内で: exists(select 1 from admin_users where user_id=auth.uid()) を必須チェック
```

---

## 5. アカウント削除・データ

- 退会時: `auth.users` 削除で `wallets`/`positions`/`profiles` はカスケード削除。
  ただし `point_ledger`・`resolutions` の監査整合のため、台帳は user_id を匿名化して保持する選択肢を用意（運用方針として記録）。
- 退会後の同一連絡先での再登録時、過去残高は復元しない（無償経済なので問題ない）。

---

## 6. 受け入れ条件

- [ ] 連絡先未検証のユーザーには初期ポイントが付与されない。
- [ ] `complete_signup` は2回目以降 'already_completed' を返し二重付与しない。
- [ ] 同一メール/電話で2つの稼働アカウントを作れない。
- [ ] 1ユーザーに `wallets` が必ず1行・初期残高 `SIGNUP_GRANT`。
- [ ] 管理RPCを非管理者が呼ぶと拒否される。
- [ ] ログイン状態でのみ取引・受領RPCが成功する。

---

## 7. 実装順序

1. Supabase Auth（メールOTP）設定 ＋ `profiles` テーブル/RLS。
2. オンボーディングUI（OTP→表示名→`complete_signup`）。
3. `complete_signup` RPC（中核 `grant_signup_bonus` 接続）。
4. `admin_users` ＋ 管理者判定ヘルパ（SPEC-07が依存）。
5. 受け入れ条件の検証。
