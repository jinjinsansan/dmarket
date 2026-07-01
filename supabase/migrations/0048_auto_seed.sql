-- ============================================================
-- 0048 賑わい自動シード（毎朝 pg_cron）
-- 新しく出た市場（コメント/取引が2件未満）に、運営ペルソナから
-- 人間っぽいコメント2〜3件＋少額の取引2〜3件を自動付与。
-- ・ペルソナ = seed_accounts（@seed.gorilla-yosou.local の8アカウント・is_flagged）
-- ・取引は _seed_buy（buy_shares 相当をペルソナで実行）。残高不足はスキップ
-- ・冪等：既に賑わっている市場（コメント/取引 >=2）はスキップ
-- ============================================================

-- ── ペルソナ台帳（既存の8シードアカウントを取り込む） ──
create table if not exists seed_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade
);
insert into seed_accounts(user_id)
  select u.id from auth.users u where u.email like '%@seed.gorilla-yosou.local'
  on conflict do nothing;

-- ── コメント素材（テーマ別＋generic） ──
create table if not exists seed_comment_pool (
  id   bigint generated always as identity primary key,
  theme text not null,
  body  text not null
);
insert into seed_comment_pool(theme, body)
select v.theme, v.body from (values
  ('weather','今日の空めっちゃ怪しい雲出てるけど…どうだろ☁️'),
  ('weather','予報だと降水確率高めだったよね'),
  ('weather','朝晴れてたから降らない気がするな〜'),
  ('weather','湿度すごいし夕方くるかも'),
  ('weather','洗濯物干しちゃったから降らないでほしい🙏'),
  ('weather','体感だと今日は普通に暑い、30度いきそう'),
  ('fx','ドル円ここから上は重そうに見えるけどな'),
  ('fx','介入警戒ゾーンだし一気には行かない気が'),
  ('fx','週足だと普通に上目線でしょこれ'),
  ('fx','指標次第で振れそうだから様子見〜'),
  ('fx','正直その水準は時間の問題な気がしてる'),
  ('crypto','最近もみ合いだから抜けるか微妙だな'),
  ('crypto','ETHの方が出遅れてる感あるよね'),
  ('crypto','流れ的にはまだ上だと思うけど'),
  ('crypto','ボラ高いから一晩で景色変わりそう'),
  ('crypto','握力試されるやつだこれ💎'),
  ('keiba','データ的にはここが本命でしょ'),
  ('keiba','組み合わせ次第だよね正直'),
  ('keiba','ダークホース来ると面白いんだけどな'),
  ('keiba','堅いとは思うけど欲張りすぎかも'),
  ('ent','SNSの盛り上がり的にはありそう'),
  ('ent','去年の傾向見ると堅そうだけどな'),
  ('ent','ノミネートと受賞はまた別だからなあ'),
  ('ent','話題性だけなら確実に入ると思う'),
  ('news','ニュースの流れ的にはありえそう'),
  ('news','発表まで読めないなこれ'),
  ('news','個人的にはYES寄りで見てる'),
  ('news','意外と接戦になりそうな予感'),
  ('generic','これは悩むなあ🤔'),
  ('generic','みんなどっち多いんだろ'),
  ('generic','とりあえず少額で乗ってみた'),
  ('generic','結果が楽しみすぎる'),
  ('generic','直感だけど当たる気がする'),
  ('generic','コメント1番乗りかと思った')
) as v(theme, body)
where not exists (select 1 from seed_comment_pool);

-- ── ペルソナ用の買い（buy_shares 相当・auth不要）。内部専用 ──
create or replace function _seed_buy(p_user uuid, p_outcome uuid, p_shares numeric)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_market markets%rowtype; v_b float8; v_ids uuid[]; v_q float8[]; v_q2 float8[]; v_k int;
  v_cost_u float8; v_cost_points bigint; v_balance bigint; v_new_balance bigint;
begin
  select m.* into v_market from markets m join outcomes o on o.market_id = m.id where o.id = p_outcome for update of m;
  if not found then return; end if;
  if v_market.status <> 'open' or now() >= v_market.close_time then return; end if;
  v_b := v_market.b_param::float8;
  select array_agg(o.id order by o.display_order), array_agg(o.q::float8 order by o.display_order)
    into v_ids, v_q from outcomes o where o.market_id = v_market.id;
  select i into v_k from generate_subscripts(v_ids, 1) as i where v_ids[i] = p_outcome;
  v_q2 := v_q; v_q2[v_k] := v_q2[v_k] + p_shares::float8;
  v_cost_u := lmsr_cost(v_q2, v_b) - lmsr_cost(v_q, v_b);
  v_cost_points := ceil(v_cost_u * 100)::bigint;
  if v_cost_points < 1 then return; end if;
  select balance into v_balance from wallets where user_id = p_user for update;
  if not found or v_balance < v_cost_points then return; end if;   -- 残高不足はスキップ
  v_new_balance := v_balance - v_cost_points;
  update wallets set balance = v_new_balance where user_id = p_user;
  insert into positions(user_id, outcome_id, shares, cost_basis)
    values (p_user, p_outcome, p_shares, v_cost_points)
    on conflict (user_id, outcome_id) do update
      set shares = positions.shares + p_shares, cost_basis = positions.cost_basis + v_cost_points;
  update outcomes set q = q + p_shares where id = p_outcome;
  insert into point_ledger(user_id, delta, reason, market_id, outcome_id, shares, balance_after)
    values (p_user, -v_cost_points, 'buy', v_market.id, p_outcome, p_shares, v_new_balance);
  perform record_market_prices(v_market.id);
end; $$;
revoke execute on function _seed_buy(uuid, uuid, numeric) from anon, authenticated;

-- ── 賑わいシード本体（毎朝cronで実行） ──
create or replace function seed_markets()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_personas uuid[]; v_np int; v_mkt record; v_theme text;
  v_nc int; v_no int; v_body text; v_uid uuid; v_out uuid; v_side int; v_shares numeric;
  v_comments int := 0; v_trades int := 0; i int; n int;
begin
  select array_agg(user_id) into v_personas from seed_accounts;
  v_np := coalesce(array_length(v_personas, 1), 0);
  if v_np = 0 then return jsonb_build_object('ok', false, 'reason', 'no_personas'); end if;

  -- 残高が少ないペルソナを5000へ補填（取引を続けられるように・台帳記録）
  with low as (select user_id, balance from wallets where user_id = any(v_personas) and balance < 1000),
  upd as (
    update wallets w set balance = 5000 from low where w.user_id = low.user_id
      returning w.user_id, (5000 - low.balance) as added, w.balance as bal
  )
  insert into point_ledger(user_id, delta, reason, balance_after)
    select user_id, added, 'admin_grant', bal from upd;

  for v_mkt in
    select m.id, m.question, m.created_at, c.slug
    from markets m left join categories c on c.id = m.category_id
    where m.status = 'open' and m.close_time > now()
  loop
    v_theme := case
      when v_mkt.slug in ('weather','fx','crypto','keiba','ent','news') then v_mkt.slug
      when v_mkt.question ~ '雨|気温|天気|度' then 'weather'
      when v_mkt.question ~ 'ドル|円|USD|JPY|FX' then 'fx'
      when v_mkt.question ~ 'BTC|ETH|ビット|クリプ|暗号|イーサ' then 'crypto'
      when v_mkt.question ~ 'ワールドカップ|FIFA|優勝|競馬|杯|G1' then 'keiba'
      when v_mkt.question ~ '流行語|紅白|出場|映画|アニメ|アカデミー' then 'ent'
      else 'news'
    end;
    select count(*) into v_nc from comments where market_id = v_mkt.id;
    select count(*) into v_no from orders   where market_id = v_mkt.id;

    -- コメント（2件未満なら2〜3件）
    if v_nc < 2 then
      n := 2 + floor(random() * 2)::int;
      for i in 1..n loop
        v_uid := v_personas[1 + floor(random() * v_np)::int];
        select body into v_body from seed_comment_pool where theme in (v_theme, 'generic') order by random() limit 1;
        if v_body is not null then
          insert into comments(market_id, user_id, body, created_at)
            values (v_mkt.id, v_uid, v_body, v_mkt.created_at + (now() - v_mkt.created_at) * random());
          v_comments := v_comments + 1;
        end if;
      end loop;
    end if;

    -- 取引（2件未満なら2〜3人が少額購入）
    if v_no < 2 then
      n := 2 + floor(random() * 2)::int;
      for i in 1..n loop
        v_uid := v_personas[1 + floor(random() * v_np)::int];
        v_side := case when random() < 0.6 then 0 else 1 end;  -- YESにやや偏らせる
        select id into v_out from outcomes where market_id = v_mkt.id and display_order = v_side limit 1;
        if v_out is null then select id into v_out from outcomes where market_id = v_mkt.id order by display_order limit 1; end if;
        if v_out is not null then
          v_shares := 5 + floor(random() * 11);  -- 5〜15株
          perform _seed_buy(v_uid, v_out, v_shares);
          v_trades := v_trades + 1;
        end if;
      end loop;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'comments', v_comments, 'trades', v_trades);
end; $$;
revoke execute on function seed_markets() from anon, authenticated;

-- ── 毎朝 8:00 JST（= 23:00 UTC）に実行。時刻は運営で変更可 ──
do $$ begin perform cron.unschedule('seed-markets'); exception when others then null; end $$;
do $$
begin
  perform cron.schedule('seed-markets', '0 23 * * *', $c$ select seed_markets(); $c$);
exception when others then
  raise notice 'pg_cron 未有効のためスケジュール未登録（関数は適用済み・手動 select seed_markets(); で実行可）';
end $$;
