-- ============================================================
-- 0039 価格スナップショット（チャートの時系列を取引ゼロでも育てる）
--
-- 背景: market_price_history は「市場作成時」と「取引時」しか記録されない。
-- 取引が無い市場は YES の履歴点が1個だけ＝チャートに線が引けず空に見える。
-- 対策: 開催中の全市場の現在価格を定期的に記録するスナップショット関数＋cron。
--       併せて即時に1回実行し、各市場へ「現在」点を1つ補充する（バックフィル）。
-- ============================================================

-- 開催中の全市場の現在価格を履歴へ記録。記録した市場数を返す。
create or replace function snapshot_open_market_prices()
returns int language plpgsql security definer set search_path = public
as $$
declare v_n int := 0; r record;
begin
  for r in select id from markets where status = 'open' loop
    perform record_market_prices(r.id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke execute on function snapshot_open_market_prices() from anon, authenticated;

-- 即時バックフィル（各開催中市場に「現在」点を1つ追加 → 最低2点になり線が描ける）
select snapshot_open_market_prices();

-- 定期実行（pg_cron）。30分ごと。既存ジョブがあれば貼り替え。
-- ※ pg_cron 未有効の環境ではこのブロックはスキップされる（関数とバックフィルは適用済み）。
do $$
begin
  perform cron.unschedule('snapshot-prices');
exception when others then null;
end $$;

do $$
begin
  perform cron.schedule('snapshot-prices', '*/30 * * * *', $cron$ select snapshot_open_market_prices(); $cron$);
exception when others then
  raise notice 'pg_cron 未有効のためスケジュール未登録（関数とバックフィルは適用済み）';
end $$;
