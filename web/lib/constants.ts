// 中核SPECと一致する定数（SPEC-02 §0）
export const POINTS_PER_SHARE = 100;
export const SIGNUP_GRANT = 1000;
export const DAILY_GRANT = 100;

// ポイント残高に増減が起きる台帳理由の日本語ラベル（SPEC-05 §6）
export const LEDGER_REASON_LABEL: Record<string, string> = {
  signup: "登録ボーナス",
  daily: "デイリーボーナス",
  buy: "購入",
  sell: "売却",
  redeem: "的中償還",
  refund: "返金",
  affiliate: "提携特典",
  admin_grant: "運営付与",
  admin_burn: "運営調整",
};

// 賞品ポイント台帳理由の日本語ラベル（二層ポイント制 Phase B）
export const PRIZE_REASON_LABEL: Record<string, string> = {
  win_reward: "的中報酬",
  rank_reward: "ランキング報酬",
  redeem: "景品交換",
  expire: "有効期限切れ",
  adjust: "調整",
};
