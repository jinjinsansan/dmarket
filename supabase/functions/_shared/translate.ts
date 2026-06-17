// 英語→日本語 翻訳。ANTHROPIC_API_KEY があれば Claude(haiku) で高品質、
// 無ければ無料の MyMemory（キー不要）にフォールバック。両方失敗時は原文を返す。
export async function toJapanese(text: string): Promise<string> {
  if (!text) return text;
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  try {
    if (key) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 300,
          system:
            "予測市場の質問文を、自然で簡潔な日本語に翻訳する。出力は訳文のみ。引用符・注釈・前置きは付けない。",
          messages: [{ role: "user", content: text }],
        }),
      });
      if (res.ok) {
        const j = await res.json();
        const out = j?.content?.[0]?.text?.trim();
        if (out) return out;
      }
    }
    // 無料フォールバック（低レート向け・キー不要）
    const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|ja`);
    if (r.ok) {
      const j = await r.json();
      const out = j?.responseData?.translatedText;
      if (out && typeof out === "string" && !/^PLEASE/i.test(out)) return out;
    }
  } catch (_e) { /* 翻訳失敗は原文 */ }
  return text;
}
