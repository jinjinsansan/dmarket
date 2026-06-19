"use client";
// アプリシェルでは window ではなく #app-scroll がスクロール領域なので、
// ページ遷移時にこのスクローラを先頭へ戻す（Next 既定の window スクロールは効かないため）。
import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function ScrollReset() {
  const pathname = usePathname();
  useEffect(() => {
    document.getElementById("app-scroll")?.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
