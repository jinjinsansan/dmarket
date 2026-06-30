"use client";
// 画像アップロード（Supabase Storage）。ファイル選択→アップロード→公開URLを value に反映。手動URL入力も併用可。
// bucket / folder を指定可能。avatars バケットは本人フォルダ（uid/）配下のみ書き込み許可（RLS）。
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const MAX_BYTES = 5 * 1024 * 1024;
const OK_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"];

export function ImageUpload({ value, onChange, bucket = "prize-images", folder, shape = "rect" }:
  { value: string; onChange: (url: string) => void; bucket?: string; folder?: string; shape?: "rect" | "circle" }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleFile(file: File) {
    setErr(null);
    if (!OK_TYPES.includes(file.type)) { setErr("画像ファイル（png/jpg/webp/gif/svg）を選んでください。"); return; }
    if (file.size > MAX_BYTES) { setErr("ファイルサイズは5MBまでです。"); return; }
    setBusy(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${folder ? folder.replace(/\/$/, "") + "/" : ""}${crypto.randomUUID()}.${ext}`;
    const sb = createClient();
    const { error } = await sb.storage.from(bucket).upload(path, file, {
      cacheControl: "31536000", upsert: false, contentType: file.type,
    });
    if (error) {
      setBusy(false);
      setErr(error.message.includes("row-level security") || error.message.includes("Unauthorized")
        ? "アップロード権限がありません（管理者でログインしてください）。"
        : `アップロード失敗: ${error.message}`);
      return;
    }
    const { data } = sb.storage.from(bucket).getPublicUrl(path);
    onChange(data.publicUrl);
    setBusy(false);
  }

  const boxCls = shape === "circle" ? "w-[80px] h-[80px] rounded-full" : "w-[120px] h-[80px] rounded-[10px]";
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        <div
          onClick={() => inputRef.current?.click()}
          className={`${boxCls} shrink-0 border border-dashed border-border bg-surface2 grid place-items-center overflow-hidden cursor-pointer hover:border-primary`}
          title="クリックして画像を選択">
          {value
            ? <img src={value} alt="プレビュー" className="w-full h-full object-cover" />
            : <span className="text-[11px] text-faint text-center px-2">画像を<br />選択</span>}
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex gap-2">
            <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
              className="text-xs rounded-sm bg-primary text-white px-3 py-1.5 disabled:opacity-50">
              {busy ? "アップロード中…" : value ? "画像を差し替え" : "画像をアップロード"}
            </button>
            {value && (
              <button type="button" onClick={() => onChange("")} disabled={busy}
                className="text-xs rounded-sm border border-border px-3 py-1.5 text-dim hover:text-text">削除</button>
            )}
          </div>
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="または画像URLを直接貼り付け（/prizes/xxx.svg 等も可）"
            className="w-full rounded-sm bg-surface2 border border-border px-2 py-1.5 text-xs" />
          <p className="text-[10.5px] text-faint">png/jpg/webp/gif/svg・5MBまで。アップロードすると公開URLが自動入力されます。</p>
        </div>
      </div>
      {err && <p className="text-xs text-neg">{err}</p>}
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
    </div>
  );
}
