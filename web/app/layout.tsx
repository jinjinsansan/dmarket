import type { Metadata, Viewport } from "next";
import { Roboto, Noto_Sans_JP, Roboto_Mono } from "next/font/google";
import "./globals.css";
import { TopNav } from "@/components/TopNav";
import { Footer } from "@/components/Footer";
import { BottomNav } from "@/components/BottomNav";
import { ScrollReset } from "@/components/ScrollReset";

const roboto = Roboto({ variable: "--font-roboto", subsets: ["latin"], weight: ["400", "500", "700"] });
const noto = Noto_Sans_JP({ variable: "--font-noto", subsets: ["latin"], weight: ["400", "500", "700"] });
const robotoMono = Roboto_Mono({ variable: "--font-roboto-mono", subsets: ["latin"], weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  // OGP/Twitterカード/canonical の絶対URL基点。redirect URI と同じ env を参照（末尾スラッシュ・空白除去）。
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "") || "https://d-market.io"),
  title: "ゴリラ予想 — 予想して、当てて、楽しむ。",
  description: "無償ポイントで楽しむ予測市場。換金不可・譲渡禁止。予想を当てて貯めた賞品ポイントは景品と交換できます。",
};

// ピンチズームは禁止しない（アクセシビリティ）。入力欄は16pxで自動ズームを防止済み。
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

// テーマ初期化（描画前に適用してフラッシュ防止）。既定はライト（白基調方針）。明示的に dark を選んだ時のみダーク。
const themeScript = `(function(){try{var t=localStorage.getItem('dm-theme');if(t==='dark'){document.documentElement.classList.add('dark')}}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja" className={`${roboto.variable} ${noto.variable} ${robotoMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      {/* アプリシェル: body を可視ビューポート高に固定し、中身(main)だけをスクロールさせる。
          TopNav/BottomNav はスクロール領域の外なので position:fixed を使わず常に固定表示でき、
          モバイルでフッターが浮く問題が起きない。dvh 非対応ブラウザは h-screen にフォールバック。 */}
      <body className="h-screen flex flex-col overflow-hidden bg-bg text-text" style={{ height: "100dvh" }}>
        <TopNav />
        <main id="app-scroll" className="flex-1 w-full overflow-y-auto">
          <ScrollReset />
          {children}
          <Footer />
        </main>
        <BottomNav />
      </body>
    </html>
  );
}
