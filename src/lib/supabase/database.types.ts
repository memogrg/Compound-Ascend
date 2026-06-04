/**
 * Tipos de la base de datos (Supabase).
 *
 * Se mantiene por fases: F1 cubrió identidad/hogar; F2 añade el Módulo 1.
 * A medida que se añaden migraciones se amplían (o se regeneran con
 * `supabase gen types typescript` una vez provisionada la BD real).
 *
 * IMPORTANTE: las filas se declaran con `type` (no `interface`). Las interfaces
 * carecen de índice implícito y NO son asignables a `Record<string, unknown>`,
 * lo que rompe el contrato `GenericTable` de supabase-js (las tablas colapsan a
 * `never`). Con `type` el tipado del cliente funciona correctamente.
 */

export type Plan = "free" | "premium";
export type HouseholdType = "solo" | "pareja" | "familia" | "socios";
export type HouseholdRole = "owner" | "adult" | "member" | "viewer";
export type MemberStatus = "active" | "invited" | "removed";

type Timestamps = {
  created_at: string;
  updated_at: string;
};

type Json = Record<string, unknown>;

// ---------- Identidad / hogar ----------
export type ProfileRow = Timestamps & {
  id: string; // = auth.users.id
  display_name: string | null;
  locale: string;
  plan: Plan;
  avatar_url: string | null;
  onboarding_completed: boolean;
  profile_completion: number;
};

export type UserSettingsRow = Timestamps & {
  user_id: string;
  theme: "light" | "dark";
  primary_currency: string;
  coaching_tone: string | null;
  coaching_frequency: string | null;
  alert_intensity: string | null;
  notifications: Record<string, boolean>;
};

export type HouseholdRow = Timestamps & {
  id: string;
  owner_id: string;
  name: string;
  type: HouseholdType;
};

export type HouseholdMemberRow = Timestamps & {
  id: string;
  household_id: string;
  user_id: string;
  role: HouseholdRole;
  status: MemberStatus;
};

// ---------- Módulo 1 — Mi Perfil Financiero ----------
export type PersonalProfileRow = Timestamps & {
  id: string;
  user_id: string;
  household_id: string | null;
  age: number | null;
  country: string | null;
  marital_status: string | null;
  financial_nucleus: string | null;
  dependents_count: number;
  life_stage: string | null;
  perceived_control: number | null;
  satisfaction: number | null;
  urgency: string | null;
  main_concern: string | null;
  extra: Json;
};

export type RiskProfileRow = Timestamps & {
  id: string;
  user_id: string;
  household_id: string | null;
  loss_reaction: string | null;
  preference: string | null;
  horizon: string | null;
  has_invested: boolean | null;
  invested_in: unknown;
  volatility_comfort: number | null;
  risk_class: string | null;
};

export type BehaviorProfileRow = Timestamps & {
  id: string;
  user_id: string;
  household_id: string | null;
  discipline: number | null;
  impulsivity: number | null;
  consistency: number | null;
  anxiety: number | null;
  review_habit: string | null;
  hardest: unknown;
};

export type KnowledgeProfileRow = Timestamps & {
  id: string;
  user_id: string;
  household_id: string | null;
  level: string | null;
  topics_known: unknown;
  topics_to_learn: unknown;
  learning_format: unknown;
};

export type UserPriorityRow = Timestamps & {
  id: string;
  user_id: string;
  household_id: string | null;
  priority: string;
  kind: string;
  rank: number | null;
};

export type FinancialGoalProfileRow = Timestamps & {
  id: string;
  user_id: string;
  household_id: string | null;
  name: string;
  target_amount: number | null;
  currency: string | null;
  target_date: string | null;
  priority: string | null;
  horizon: string | null;
  scope: string | null;
  motive: string | null;
  importance: number | null;
};

export type DependentRow = Timestamps & {
  id: string;
  user_id: string;
  household_id: string | null;
  name: string | null;
  relation: string | null;
  age: number | null;
};

// ---------- Módulo 2 — Mi Base Financiera ----------
export type IncomeSourceRow = Timestamps & {
  id: string;
  user_id: string;
  household_id: string | null;
  name: string;
  income_type: string;
  category: string | null;
  amount: number;
  currency: string;
  frequency: string;
  is_fixed: boolean;
  certainty: string | null;
  owner_scope: string;
  include_in_budget: boolean;
  estimated_date: string | null;
  amount_monthly_base: number;
};

export type ExpenseItemRow = Timestamps & {
  id: string;
  user_id: string;
  household_id: string | null;
  name: string;
  category_id: string | null;
  subcategory_id: string | null;
  nature: string | null;
  amount: number;
  currency: string;
  frequency: string;
  is_fixed: boolean;
  obligation: string | null;
  reducible: string | null;
  pay_day: number | null;
  owner_scope: string;
  payment_method: string | null;
  linked_goal_id: string | null;
  amount_monthly_base: number;
};

export type ExpenseCategoryRow = Timestamps & {
  id: string;
  user_id: string | null;
  parent_id: string | null;
  key: string | null;
  name: string;
  default_nature: string | null;
  is_system: boolean;
  sort_order: number;
};

export type MonthlySnapshotRow = Timestamps & {
  id: string;
  user_id: string;
  household_id: string | null;
  period: string;
  income_monthly: number;
  expense_monthly: number;
  free_cashflow: number;
  savings_rate: number | null;
  investment_rate: number | null;
  debt_weight: number | null;
  essentials_weight: number | null;
  lifestyle_weight: number | null;
  financial_pressure: string | null;
  breakdown: Json;
};

export type TransactionRow = Timestamps & {
  id: string;
  user_id: string;
  household_id: string | null;
  kind: string;
  description: string | null;
  amount: number;
  currency: string;
  occurred_on: string;
  category_id: string | null;
  account_label: string | null;
  source: string;
  confirmed_by_user: boolean;
};

// ---------- IA / tokens ----------
export type AiUsageLedgerRow = Timestamps & {
  id: string;
  user_id: string;
  period: string;
  tokens_used: number;
  requests: number;
  cost_est: number;
};

// ---------- Módulo 3 — Control Financiero ----------
export type SavingsGoalRow = Timestamps & {
  id: string;
  user_id: string;
  household_id: string | null;
  name: string;
  goal_type: string | null;
  target_amount: number;
  current_amount: number;
  monthly_contribution: number;
  currency: string;
  target_date: string | null;
  priority: string | null;
  scope: string | null;
  automated: boolean | null;
  stored_in: string | null;
  classification: string | null;
  status: string;
};

export type DebtRow = Timestamps & {
  id: string;
  user_id: string;
  household_id: string | null;
  name: string;
  debt_type: string | null;
  balance: number;
  min_payment: number | null;
  current_payment: number | null;
  apr: number | null;
  currency: string;
  pay_day: number | null;
  term_remaining_months: number | null;
  is_current: boolean | null;
  delinquency: string | null;
  secured_asset: string | null;
  stress: number | null;
  allows_extra_payment: string | null;
  classification: string | null;
};

// ---------- Módulo 4 — Patrimonio ----------
export type InvestmentRow = Timestamps & {
  id: string;
  user_id: string;
  household_id: string | null;
  asset_type: string;
  name: string;
  symbol: string | null;
  invested_amount: number;
  contribution: number | null;
  contribution_frequency: string | null;
  started_on: string | null;
  linked_goal: string | null;
  horizon: string | null;
  perceived_risk: string | null;
  liquidity: string | null;
  fees: number | null;
  understanding: number | null;
  dca_broker: string | null;
};

export type InvestmentHoldingRow = Timestamps & {
  id: string;
  user_id: string;
  household_id: string | null;
  investment_id: string | null;
  symbol: string;
  asset_type: string;
  quantity: number;
  cost_basis: number | null;
  average_cost: number;
  purchase_date: string | null;
  broker: string | null;
  currency: string;
  label: string | null;
};

export type InvestmentTransactionRow = Timestamps & {
  id: string;
  user_id: string;
  household_id: string | null;
  investment_id: string | null;
  tx_type: string | null;
  amount: number;
  quantity: number | null;
  currency: string;
  occurred_on: string;
};

export type MarketPriceCacheRow = {
  id: string;
  symbol: string;
  asset_type: string;
  price: number;
  currency: string;
  provider: string | null;
  fetched_at: string;
  ttl_seconds: number;
};

export type DividendRow = {
  id: string;
  holding_id: string;
  user_id: string;
  payment_date: string;
  amount: number;
  currency: string;
  created_at: string;
  yield_pct: number | null;
  frequency: string | null;
  income_id: string | null;
};

export type PortfolioSnapshotRow = {
  id: string;
  user_id: string;
  date: string;
  portfolio_value: number;
  investment_value: number;
  net_worth: number;
  currency: string;
  created_at: string;
};

export type InsurancePolicyRow = Timestamps & {
  id: string;
  user_id: string;
  household_id: string | null;
  policy_type: string | null;
  provider: string | null;
  coverage: number | null;
  premium: number | null;
  premium_frequency: string | null;
  renewal_date: string | null;
  beneficiaries: string | null;
  currency: string;
  scope: string | null;
};

// ---------- Módulo 5 — Mi Rich Life ----------
export type AssetRow = Timestamps & {
  id: string;
  user_id: string;
  household_id: string | null;
  name: string;
  asset_class: string | null;
  value: number;
  currency: string;
  generates_income: boolean | null;
  liquidity: string | null;
  linked_debt_id: string | null;
  last_valued_on: string | null;
};

export type LiabilityRow = Timestamps & {
  id: string;
  user_id: string;
  household_id: string | null;
  name: string;
  liability_class: string | null;
  balance: number;
  currency: string;
  linked_debt_id: string | null;
};

export type NetWorthSnapshotRow = Timestamps & {
  id: string;
  user_id: string;
  household_id: string | null;
  period: string;
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
  breakdown: Json;
};

type TableShape<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

/** Atajo para tablas de datos de usuario: Insert/Update parciales con user_id. */
type UserTable<Row extends { user_id: string }> = TableShape<
  Row,
  Partial<Row> & { user_id: string },
  Partial<Row>
>;

export interface Database {
  public: {
    Tables: {
      profiles: TableShape<ProfileRow, Partial<ProfileRow> & { id: string }, Partial<ProfileRow>>;
      user_settings: UserTable<UserSettingsRow>;
      households: TableShape<
        HouseholdRow,
        Partial<HouseholdRow> & { owner_id: string; name: string },
        Partial<HouseholdRow>
      >;
      household_members: TableShape<
        HouseholdMemberRow,
        Partial<HouseholdMemberRow> & { household_id: string; user_id: string },
        Partial<HouseholdMemberRow>
      >;
      personal_profiles: UserTable<PersonalProfileRow>;
      risk_profiles: UserTable<RiskProfileRow>;
      behavior_profiles: UserTable<BehaviorProfileRow>;
      knowledge_profiles: UserTable<KnowledgeProfileRow>;
      user_priorities: UserTable<UserPriorityRow>;
      financial_goals_profile: UserTable<FinancialGoalProfileRow>;
      dependents: UserTable<DependentRow>;
      income_sources: UserTable<IncomeSourceRow>;
      expense_items: UserTable<ExpenseItemRow>;
      monthly_snapshots: UserTable<MonthlySnapshotRow>;
      savings_goals: UserTable<SavingsGoalRow>;
      debts: UserTable<DebtRow>;
      investments: UserTable<InvestmentRow>;
      investment_holdings: UserTable<InvestmentHoldingRow>;
      investment_transactions: UserTable<InvestmentTransactionRow>;
      insurance_policies: UserTable<InsurancePolicyRow>;
      market_price_cache: TableShape<
        MarketPriceCacheRow,
        Partial<MarketPriceCacheRow> & { symbol: string; asset_type: string; price: number; currency: string; fetched_at: string; ttl_seconds: number },
        Partial<MarketPriceCacheRow>
      >;
      dividends: UserTable<DividendRow>;
      portfolio_snapshots: UserTable<PortfolioSnapshotRow>;
      assets: UserTable<AssetRow>;
      liabilities: UserTable<LiabilityRow>;
      net_worth_snapshots: UserTable<NetWorthSnapshotRow>;
      transactions: UserTable<TransactionRow>;
      ai_usage_ledger: UserTable<AiUsageLedgerRow>;
      expense_categories: TableShape<
        ExpenseCategoryRow,
        Partial<ExpenseCategoryRow> & { name: string },
        Partial<ExpenseCategoryRow>
      >;
    };
    // OJO: usar `{ [_ in never]: never }` (sin índice de cadena). `Record<string,
    // never>` tiene índice `[k]: never` y, vía `Tables & Views`, intersecta cada
    // tabla con `never`, colapsándolas. Así lo generan los tipos oficiales.
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: {
      plan: Plan;
      household_type: HouseholdType;
      household_role: HouseholdRole;
    };
    CompositeTypes: { [_ in never]: never };
  };
}
