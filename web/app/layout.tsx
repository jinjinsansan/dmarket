import type { Metadata } from "next";
import { Roboto, Noto_Sans_JP, Roboto_Mono } from "next/font/google";
import "./globals.css";
import { TopNav } from "@/components/TopNav";
import { Footer } from "@/components/Footer";
import { BottomNav } from "@/components/BottomNav";

const roboto = Roboto({ variable: "--font-roboto", subsets: ["latin"], weight: ["400", "500", "700"] });
const noto = Noto_Sans_JP({ variable: "--font-noto", subsets: ["latin"], weight: ["400", "500", "700"] });
const robotoMono = Roboto_Mono({ variable: "--font-roboto-mono", subsets: ["latin"], weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  title: "D-market — ポイントで読む、世界の確率。",
  description: "換金不可ポイントで楽しむ予測市場。換金なし、勝つのは称号とランキングだけ。",
  viewport: "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no",
};

// テーマ初期化（描画前に適用してフラッシュ防止）。既定はダーク。明示的に light を選んだ時のみライト。
const themeScript = `(function(){try{var t=localStorage.getItem('dm-theme');if(t!=='light'){document.documentElement.classList.add('dark')}}catch(e){document.documentElement.classList.add('dark')}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja" className={`${roboto.variable} ${noto.variable} ${robotoMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen flex flex-col bg-bg text-text">
        <TopNav />
        {/* モバイルは下部タブバー分の余白を確保 */}
        <main className="flex-1 w-full pb-16 md:pb-0">{children}</main>
        <Footer />
        <BottomNav />
      </body>
    </html>
  );
}
