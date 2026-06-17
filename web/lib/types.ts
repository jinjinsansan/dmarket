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

// RPC 戻り値（SPEC-02 §3）
export interface TradeResult {
  ok: boolean;
  cost_points?: number;
  recv_points?: number;
  shares: number;
  new_prices: { outcome_id: string; price: number }[];
  balance: number;
}
