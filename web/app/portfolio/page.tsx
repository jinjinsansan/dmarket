import { redirect } from "next/navigation";

// 旧ポートフォリオは マイページ へ統合
export default function PortfolioRedirect() {
  redirect("/mypage");
}
