"use client";
// 管理: ピックアップ枠スケジュール（/admin/pickup）。JSTの今日の24hスロットに市場を割当。
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PickupSchedule, type Slot, type Candidate } from "@/components/PickupSchedule";

function jstToday(): string {
  const jst = new Date(Date.now() + 9 * 3.6e6);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, "0")}-${String(jst.getUTCDate()).padStart(2, "0")}`;
}
function jstHour(): number {
  return new Date(Date.now() + 9 * 3.6e6).getUTCHours();
}

export default function AdminPickupPage() {
  const date = useMemo(() => jstToday(), []);
  const [slotMap, setSlotMap] = useState<Record<number, { market_id: string; question: string }>>({});
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [autoAssign, setAutoAssign] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = createClient();
    const rpc = sb.rpc as unknown as (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown }>;
    const [{ data: slots }, { data: cands }] = await Promise.all([
      rpc("list_pickup_slots", { p_date: date }),
      rpc("pickup_candidates"),
    ]);
    const map: Record<number, { market_id: string; question: string }> = {};
    for (const s of (slots as { hour: number; market_id: string; question: string }[]) ?? []) {
      map[s.hour] = { market_id: s.market_id, question: s.question };
    }
    setSlotMap(map);
    setCandidates(((cands as { market_id: string; question: string; category: string; volume: number }[]) ?? []).map((c) => ({
      id: c.market_id,
      emoji: "📊",
      title: c.question.length > 26 ? c.question.slice(0, 26) + "…" : c.question,
      badge: `${c.volume.toLocaleString()}`,
      badgeTone: c.volume > 0 ? "pos" : "dim",
    })));
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const currentHour = jstHour();
  const nextFilledHour = useMemo(() => {
    const hrs = Object.keys(slotMap).map(Number).filter((h) => h > currentHour).sort((a, b) => a - b);
    return hrs[0];
  }, [slotMap, currentHour]);

  const slots: Slot[] = useMemo(() => Array.from({ length: 24 }, (_, h) => {
    const m = slotMap[h];
    if (!m) return { hour: h };
    const status: "live" | "public" | "next" = h === nextFilledHour ? "next" : "public";
    return { hour: h, market: { title: m.question.length > 30 ? m.question.slice(0, 30) + "…" : m.question, meta: h === currentHour ? "公開中（現在）" : `${String(h).padStart(2, "0")}:00〜`, status } };
  }), [slotMap, nextFilledHour, currentHour]);

  async function assign(hour: number, candidateId: string) {
    const sb = createClient();
    const { error } = await (sb.rpc as unknown as (fn: string, args?: Record<string, unknown>) => Promise<{ error: unknown }>)("set_pickup_slot", { p_date: date, p_hour: hour, p_market_id: candidateId });
    if (error) { setMsg("割り当てに失敗しました: " + ((error as { message?: string })?.message ?? "")); return; }
    setMsg(`${String(hour).padStart(2, "0")}:00 に割り当てました`);
    await load();
  }

  async function toggleAuto(v: boolean) {
    setAutoAssign(v);
    if (!v) return;
    // 空きの未来スロットを候補上位で自動補完
    const sb = createClient();
    const rpc = sb.rpc as unknown as (fn: string, args?: Record<string, unknown>) => Promise<{ error: unknown }>;
    const empties = Array.from({ length: 24 }, (_, h) => h).filter((h) => h >= currentHour && !slotMap[h]);
    let ci = 0;
    for (const h of empties) {
      const c = candidates[ci % Math.max(1, candidates.length)];
      if (!c) break;
      await rpc("set_pickup_slot", { p_date: date, p_hour: h, p_market_id: c.id });
      ci++;
    }
    setMsg("空きスロットを自動補完しました");
    await load();
  }

  return (
    <div>
      {msg && <div className="admin-scope" style={{ padding: "10px 22px 0", fontSize: 13, color: "var(--primary)" }}>{msg}</div>}
      <PickupSchedule
        dateLabel={date}
        slots={slots}
        candidates={candidates}
        autoAssign={autoAssign}
        onToggleAuto={toggleAuto}
        onAssign={assign}
      />
    </div>
  );
}
