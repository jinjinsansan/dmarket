// DB 行に対応する型（SPEC-02 / 04 / 05）
export type MarketStatus = "draft" | "open" | "closed" | "resolving" | "resolved" | "void";

export interface Category {
  id: string;
  slug: string;
  name: string;
  display_order: number;
  is_active: boolean;
}

export interface Outcome {
  id: string;
  market_id: string;
  label: string;
  display_order: number;
  q: number;
  is_winner: boolean | null;
}

export interface Market {
  id: string;
  category_id: string | null;
  question: string;
  description: string | null;
  image_url: string | null;
  market_kind: "binary" | "multi";
  b_param: number;
  source: "admin" | "template" | "mirror";
  resolution_kind: "manual" | "auto";
  status: MarketStatus;
  close_time: string;
  resolve_time: string;
  created_at: string;
}

export interface MarketWithOutcomes extends Market {
  outcomes: Outcome[];
  category?: Category | null;
}

export interface Resolution {
  market_id: string;
  winning_outcome_id: string | null;
  resolution_kind: string;
  source_url: string | null;
  resolved_at: string;
}

export interface PricePoint {
  outcome_id: string;
  price: number;
  recorded_at: string;
}

export interface LedgerRow {
  id: number;
  delta: number;
  reason: string;
  shares: number | null;
  balance_after: number;
  created_at: string;
}

export interface PositionRow {
  outcome_id: string;
  shares: number;
  cost_basis: number;
}

// 賞品ポイント台帳の1行（二層ポイント制 Phase B）
export interface PrizeLedgerRow {
  id: number;
  delta: number;
  reason: string;
  expires_at: string | null;
  balance_after: number;
  created_at: string;
}

// 景品マスタ（二層ポイント制 Phase C）
export interface Prize {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  cost_points: number;
  stock: number | null;       // null=無制限
  is_active: boolean;
  display_order: number;
  created_at: string;
}

// 配送先（個人情報・最小保持）
export interface ShippingInfo {
  name?: string;
  postal?: string;
  addr?: string;
  tel?: string;
  note?: string;
}

// 交換申込（管理一覧の行：景品名・申込者表示名を結合済み）
export interface AdminRedemption {
  id: string;
  user_id: string;
  display_name: string;
  prize_id: string;
  prize_name: string;
  cost_points: number;
  status: "requested" | "approved" | "shipped" | "cancelled";
  shipping: ShippingInfo | null;
  created_at: string;
}

// 提携案件（参加ポイント獲得・アフィリエイト Phase 1）
export interface AffiliateOffer {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  reward_points: number;
  asp: string | null;
  click_url: string;        // {TOKEN} を含む計測リンク雛形
  incentive_ok: boolean;
  is_active: boolean;
  display_order: number;
  created_at: string;
}

// 管理: 成果（承認履歴の行）
export interface AdminConversion {
  id: string;
  token: string;
  user_id: string;
  display_name: string;
  offer_id: string;
  offer_name: string;
  reward_points: number;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

// 管理: 消し込み待ちクリックの行
export interface AdminClick {
  token: string;
  user_id: string;
  display_name: string;
  offer_id: string;
  offer_name: string;
  clicked_at: string;
}

// RPC 戻り値（SPEC-02 §3）
export interface TradeResult {
  ok: boolean;
  cost_points?: number;
  recv_points?: number;
  shares: number;
  new_prices: { outcome_id: string; price: number }[];
  balance: number;
}
