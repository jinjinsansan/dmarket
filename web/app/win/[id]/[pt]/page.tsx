// 的中シェアのランディング。共有リンクを開いた人に「的中！」を見せ、市場/参加へ誘導。
import type { Metadata } from "next";
import Link from "next/link";
import { GorillaFace } from "@/components/GorillaFace";

async function fetchQuestion(id: string): Promise<string> {
  const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  try {
    if (SB && KEY) {
      const res = await fetch(`${SB}/rest/v1/markets?id=eq.${id}&select=question`,
        { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }, cache: "no-store" });
      const rows = (await res.json()) as Array<{ question: string }>;
      if (rows?.[0]?.question) return rows[0].question;
    }
  } catch { /* noop */ }
  return "ゴリラ予想";
}

export async function generateMetadata({ params }: { params: Promise<{ id: string; pt: string }> }): Promise<Metadata> {
  const { id, pt } = await params;
  const q = await fetchQuestion(id);
  const title = `的中！ +${pt}pt｜${q} | ゴリラ予想`;
  const desc = `「${q}」を的中！ ゴリラ予想は無料で予想して当てる予測市場。あなたも予想に乗ろう🦍`;
  return { title, description: desc, openGraph: { title, description: desc }, twitter: { card: "summary_large_image", title, description: desc } };
}

export default async function WinPage({ params }: { params: Promise<{ id: string; pt: string }> }) {
  const { id, pt } = await params;
  const q = await fetchQuestion(id);
  const payout = Math.max(0, parseInt(pt, 10) || 0);

  return (
    <div className="max-w-[560px] mx-auto px-4 py-10 dm-in">
      <div className="rounded-[var(--radius)] p-7 text-center relative overflow-hidden" style={{ background: "linear-gradient(135deg,#2FD18C,#0E8E58)", boxShadow: "var(--shadow)" }}>
        <div className="flex justify-center"><GorillaFace size={92} expr="win" color="#fff" /></div>
        <div className="text-[44px] font-black text-white mt-2 leading-none">的中！</div>
        <div className="text-[15px] font-bold text-white/95 mt-3 leading-relaxed">{q}</div>
        <div className="inline-flex items-center text-[20px] font-extrabold text-white bg-white/20 px-5 py-2.5 rounded-[14px] mt-4">受取 +{payout.toLocaleString()} pt</div>
      </div>

      <div className="text-center mt-6 space-y-3">
        <p className="text-[14px] text-dim">ゴリラ予想は<b className="text-text">無料</b>で予想して当てる予測市場。<b className="text-text">賭けではありません</b>。</p>
        <div className="flex flex-col sm:flex-row gap-2.5 justify-center">
          <Link href={`/market/${id}`} className="btn-press px-6 py-3 rounded-[13px] text-white font-extrabold" style={{ background: "var(--grad)", boxShadow: "var(--cta-glow)" }}>この市場を見る</Link>
          <Link href="/" className="btn-press px-6 py-3 rounded-[13px] border border-border font-bold text-dim hover:text-text">ゴリラ予想を始める 🦍</Link>
        </div>
        <p className="text-[11.5px] text-faint"><Link href="/guide" className="underline">遊び方を見る</Link></p>
      </div>
    </div>
  );
}
