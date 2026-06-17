-- ============================================================
-- 0011 リーダーボード・ゲーミフィケーション（SPEC-06）
-- 賞品ゼロ。ランキング・称号・実績は換金不可ポイント実績からの表示指標のみ。
-- 集計は純SQL（refresh_user_stats）。pg_cron が10分ごとに呼ぶ（リモート）。
-- ============================================================

-- ユーザー集計（バッチ更新・表示高速化）
create table if not exists user_stats (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  net_worth      bigint not null default 0,
  realized_pnl   bigint not null default 0,
  resolved_count int not null default 0,
  win_count      int not null default 0,
  current_streak int not null default 0,
  best_streak    int not null default 0,
  trades_count   int not null default 0,
  updated_at     timestamptz not null default now()
);

-- シーズン
create table if not exists seasons (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  starts_at timestamptz not null,
  ends_at   timestamptz not null,
  is_active boolean not null default false
);

-- シーズン別スコア
create table if not exists season_scores (
  season_id uuid references seasons(id),
  user_id   uuid references auth.users(id) on delete cascade,
  score     bigint not null default 0,
  accuracy  numeric,
  primary key (season_id, user_id)
);

-- 称号・バッジ定義と付与
create table if not exists badges (
  id          text primary key,
  name        text not null,
  description text,
  icon        text,
  criteria    jsonb not null
);
create table if not exists user_badges (
  user_id   uuid references auth.users(id) on delete cascade,
  badge_id  text references badges(id),
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

-- RLS: すべて公開SELECT（ランキング表示）。書き込みはバッチ関数(security definer)のみ。
alter table user_stats     enable row level security;
alter table seasons        enable row level security;
alter table season_scores  enable row level security;
alter table badges         enable row level security;
alter table user_badges    enable row level security;
create policy "public user_stats"    on user_stats    for select using (true);
create policy "public seasons"       on seasons       for select using (true);
create policy "public season_scores" on season_scores for select using (true);
create policy "public badges"        on badges        for select using (true);
create policy "public user_badges"   on user_badges   for select using (true);

-- バッジ定義シード（criteria は最低試行数を必ず含め、少回数の運を除外）
insert into badges(id, name, description, criteria) values
  ('first_win',   '初的中',       '初めて的中した',                 '{"type":"win_count","min":1}'),
  ('streak_5',    '5連勝',         '5連続で的中',                    '{"type":"best_streak","min":5}'),
  ('streak_10',   '10連勝',        '10連続で的中',                   '{"type":"best_streak","min":10}'),
  ('sharpshooter','シャープシューター','的中率60%以上（10件以上）',  '{"type":"accuracy","min":0.6,"min_resolved":10}')
on conflict (id) do nothing;

-- 開いている全市場の現在価格（outcome単位）
create or replace function all_open_prices()
returns table(outcome_id uuid, price float8)
language sql stable
as $$
  select mp.outcome_id, mp.price
  from markets m, lateral lmsr_market_prices(m.id) mp
  where m.status = 'open';
$$;

-- ============================================================
-- 集計バッチ（SPEC-06 §4）。全ユーザーの user_stats を再計算し、バッジを付与。
-- ============================================================
create or replace function refresh_user_stats()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_streak int;
  v_best   int;
  v_cur    int;
  srec record;   -- 連勝ループ用（table alias 'p' と衝突させない）
begin
  -- 1) net_worth / realized_pnl / counts / trades を set-based で更新（全walletユーザー対象）
  insert into user_stats(user_id, net_worth, realized_pnl, resolved_count, win_count, trades_count, updated_at)
  select
    w.user_id,
    w.balance + coalesce(hv.val, 0)                              as net_worth,
    coalesce(rp.redeemed, 0) - coalesce(rp.cost_resolved, 0)     as realized_pnl,
    coalesce(pa.resolved_count, 0)                               as resolved_count,
    coalesce(pa.win_count, 0)                                    as win_count,
    coalesce(tc.trades, 0)                                       as trades_count,
    now()
  from wallets w
  left join (
    -- 開いている保有の評価額
    select p.user_id, floor(sum(p.shares * op.price * 100))::bigint as val
    from positions p
    join all_open_prices() op on op.outcome_id = p.outcome_id
    where p.shares > 0
    group by p.user_id
  ) hv on hv.user_id = w.user_id
  left join (
    -- 確定参加と的中（勝ちoutcomeを保有していたか）
    select user_id,
           count(*)                          as resolved_count,
           count(*) filter (where won)       as win_count
    from (
      select p.user_id, o.market_id, bool_or(coalesce(o.is_winner, false)) as won
      from positions p
      join outcomes o on o.id = p.outcome_id
      join markets  m on m.id = o.market_id and m.status = 'resolved'
      where p.shares > 0
      group by p.user_id, o.market_id
    ) per_market
    group by user_id
  ) pa on pa.user_id = w.user_id
  left join (
    -- 実現損益 = 償還+返金 − 確定/中止市場に投じた取得原価
    select uid as user_id, sum(redeemed) as redeemed, sum(cost_resolved) as cost_resolved
    from (
      select pl.user_id as uid,
             sum(pl.delta) filter (where pl.reason in ('redeem','refund')) as redeemed,
             0::bigint as cost_resolved
      from point_ledger pl group by pl.user_id
      union all
      select p.user_id as uid, 0::bigint as redeemed,
             sum(p.cost_basis) as cost_resolved
      from positions p
      join outcomes o on o.id = p.outcome_id
      join markets  m on m.id = o.market_id and m.status in ('resolved','void')
      group by p.user_id
    ) z group by uid
  ) rp on rp.user_id = w.user_id
  left join (
    select user_id, count(*) as trades
    from point_ledger where reason in ('buy','sell') group by user_id
  ) tc on tc.user_id = w.user_id
  on conflict (user_id) do update set
    net_worth      = excluded.net_worth,
    realized_pnl   = excluded.realized_pnl,
    resolved_count = excluded.resolved_count,
    win_count      = excluded.win_count,
    trades_count   = excluded.trades_count,
    updated_at     = now();

  -- 2) 連勝（current/best）はユーザーごとに時系列で算出
  for r in select distinct user_id from user_stats loop
    v_cur := 0; v_best := 0; v_streak := 0;
    for srec in
      select bool_or(coalesce(o.is_winner, false)) as won, max(res.resolved_at) as ra
      from positions ps
      join outcomes o on o.id = ps.outcome_id
      join markets  m on m.id = o.market_id and m.status = 'resolved'
      join resolutions res on res.market_id = m.id
      where ps.user_id = r.user_id and ps.shares > 0
      group by o.market_id
      order by ra
    loop
      if srec.won then
        v_streak := v_streak + 1;
        if v_streak > v_best then v_best := v_streak; end if;
      else
        v_streak := 0;
      end if;
    end loop;
    v_cur := v_streak;  -- 末尾の連勝
    update user_stats set current_streak = v_cur, best_streak = v_best where user_id = r.user_id;
  end loop;

  -- 3) バッジ付与（criteria 充足・未付与のみ）
  insert into user_badges(user_id, badge_id)
  select s.user_id, 'first_win' from user_stats s where s.win_count >= 1
  on conflict do nothing;
  insert into user_badges(user_id, badge_id)
  select s.user_id, 'streak_5' from user_stats s where s.best_streak >= 5
  on conflict do nothing;
  insert into user_badges(user_id, badge_id)
  select s.user_id, 'streak_10' from user_stats s where s.best_streak >= 10
  on conflict do nothing;
  insert into user_badges(user_id, badge_id)
  select s.user_id, 'sharpshooter' from user_stats s
  where s.resolved_count >= 10 and s.win_count::numeric / s.resolved_count >= 0.6
  on conflict do nothing;

  -- 4) アクティブシーズンのスコア（実現損益）を更新
  insert into season_scores(season_id, user_id, score, accuracy)
  select se.id, s.user_id, s.realized_pnl,
         case when s.resolved_count > 0 then s.win_count::numeric / s.resolved_count else null end
  from seasons se cross join user_stats s
  where se.is_active
  on conflict (season_id, user_id) do update set
    score = excluded.score, accuracy = excluded.accuracy;
end;
$$;

-- ランキング用インデックス
create index if not exists user_stats_networth_idx on user_stats(net_worth desc);

-- cron（リモート専用。pg_cron が無いローカルでは run_local.sh では実行しない）
-- 0009 と同様に Supabase で有効化。10分ごとに集計。
-- select cron.schedule('refresh-stats','*/10 * * * *', $$ select refresh_user_stats(); $$);
