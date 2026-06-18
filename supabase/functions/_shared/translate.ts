// 英語→日本語 翻訳。優先順位: DeepSeek → Claude(haiku) → 無料MyMemory → 原文。
// DEEPSEEK_API_KEY / ANTHROPIC_API_KEY のどちらかを Edge Functions のSecretに設定すれば高品質。
const SYS = "予測市場の質問文を、自然で簡潔な日本語に翻訳する。出力は訳文のみ。引用符・注釈・前置きは付けない。";

export async function toJapanese(text: string): Promise<string> {
  if (!text) return text;
  const deepseek = Deno.env.get("DEEPSEEK_API_KEY");
  const anthropic = Deno.env.get("ANTHROPIC_API_KEY");
  try {
    // 1) DeepSeek（OpenAI互換・安価）
    if (deepseek) {
      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${deepseek}` },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [{ role: "system", content: SYS }, { role: "user", content: text }],
          max_tokens: 300, temperature: 0,
        }),
      });
      if (res.ok) {
        const j = await res.json();
        const out = j?.choices?.[0]?.message?.content?.trim();
        if (out) return out;
      }
    }
    // 2) Claude(haiku)
    if (anthropic) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": anthropic, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001", max_tokens: 300,
          system: SYS, messages: [{ role: "user", content: text }],
        }),
      });
      if (res.ok) {
        const j = await res.json();
        const out = j?.content?.[0]?.text?.trim();
        if (out) return out;
      }
    }
    // 3) 無料フォールバック（キー不要・低レート向け）
    const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|ja`);
    if (r.ok) {
      const j = await r.json();
      const out = j?.responseData?.translatedText;
      if (out && typeof out === "string" && !/^PLEASE/i.test(out)) return out;
    }
  } catch (_e) { /* 翻訳失敗は原文 */ }
  return text;
}
