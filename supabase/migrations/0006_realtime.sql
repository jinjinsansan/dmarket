-- ============================================================
-- 0006 Realtime（SPEC-02 §8）
-- outcomes の q 変更を market_id フィルタで購読 → フロントで lmsr_price 再計算。
-- 価格履歴も配信してチャート最新点を更新可能にする。
-- ============================================================

-- 変更の old/new を確実に配信するため REPLICA IDENTITY FULL
alter table outcomes              replica identity full;
alter table market_price_history  replica identity full;

-- supabase_realtime publication へ追加（存在しなければ作成）
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end;
$$;

alter publication supabase_realtime add table outcomes;
alter publication supabase_realtime add table market_price_history;
