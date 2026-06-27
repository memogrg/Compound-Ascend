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

export type WhatsAppLinkStatus = "pending" | "active" | "revoked";

export type WhatsAppLinkRow = Timestamps & {
  id: string;
  user_id: string;
  household_id: string | null;
  phone_e164: string | null;
  status: WhatsAppLinkStatus;
  otp_code: string | null;
  otp_expires_at: string | null;
  pending_action: Json | null;
  verified_at: string | null;
  last_seen_at: string | null;
};

export type InvitationStatus = "pending" | "accepted" | "revoked";

export type HouseholdInvitationRow = Timestamps & {
  id: string;
  household_id: string;
  email: string;
  token: string;
  invited_by: string;
  role: HouseholdRole;
  status: InvitationStatus;
  expires_at: string;
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
  archetype_primary: string | null;
  archetype_secondary: string | null;
  dominant_emotion: string | null;
  ai_tone_recommended: string | null;
  money_script: string | null;
  ai_reading: string | null;
  ai_reading_key: string | null;
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

export type RecurringItemRow = Timestamps & {
  id: string;
  user_id: string;
  household_id: string | null;
  kind: string; // 'ingreso' | 'gasto'
  name: string;
  amount: number;
  currency: string;
  frequency: string;
  next_date: string | null;
  active: boolean;
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
  // Reestructuración de Transacciones (migración 0018 · columnas aditivas)
  category_type: string; // 'expense' | 'income' | 'transfer' | 'both'
  icon: string | null;
  color: string | null;
  is_active: boolean;
  is_favorite: boolean;
  merged_into_id: string | null;
  // Vínculo transacción↔entidad (migración 0020 · Fase 0)
  linked_kind: string | null; // 'debt' | 'goal' | 'holding' | 'policy' | 'rental'
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
  // Base Financiera V2 (migración 0015 · columnas aditivas, opcionales)
  account_id: string | null;
  merchant_or_source: string | null;
  status: string;
  origin: string;
  receipt_url: string | null;
  confidence_score_internal: number | null;
  // Reestructuración de Transacciones (migración 0018 · hook de IA)
  ai_meta: Json | null;
  // Vínculo transacción↔entidad (migración 0020 · Fase 0)
  linked_kind: string; // 'none' | 'debt' | 'goal' | 'holding' | 'policy' | 'rental'
  linked_id: string | null;
  recurring_item_id: string | null;
  // Ingresos (migración 20260615000002 · Fase 2): vínculo a la fuente de ingreso.
  income_source_id: string | null;
};

// ---------- Base Financiera V2 (presupuesto, cuentas, reglas) ----------
export type BudgetItemRow = Timestamps & {
  id: string;
  user_id: string;
  household_id: string | null;
  type: string; // 'income' | 'expense'
  category_id: string | null;
  name: string;
  amount: number;
  currency: string;
  frequency: string;
  period_month: number;
  period_year: number;
  // Plan derivado (migración 0020 · Fase 0)
  source_kind: string; // 'manual' | 'debt' | 'goal' | 'policy' | 'recurring' | 'dividend'
  source_id: string | null;
  // Ingresos (migración 20260615 · Fase 1)
  income_type: string | null; // 'activo' | 'pasivo' | 'extraordinario' (solo ingresos)
  recurring_item_id: string | null; // plantilla recurrente copy-on-demand
  // Ingresos (migración 20260615000003 · Fase 3): inversión vinculada (stub).
  holding_id: string | null;
};

export type AccountRow = Timestamps & {
  id: string;
  user_id: string;
  household_id: string | null;
  name: string;
  kind: string; // 'banco' | 'efectivo' | 'tarjeta' | 'otro'
  currency: string;
  is_default: boolean;
};

export type TransactionRuleRow = Timestamps & {
  id: string;
  user_id: string;
  household_id: string | null;
  merchant_pattern: string;
  suggested_category_id: string | null;
  suggested_account_id: string | null;
  type: string; // 'income' | 'expense'
  active: boolean;
  priority: number; // Fase 2 (0019): mayor = se evalúa primero
  // Auto-vínculo (migración 0022 · Fase 2 interconexión)
  linked_kind: string | null; // 'debt' | 'goal' | 'holding' | 'policy' | 'rental'
  linked_id: string | null;
};

// Plantillas / favoritos de transacción (migración 0018 · registro en 1 clic)
export type TransactionTemplateRow = Timestamps & {
  id: string;
  user_id: string;
  household_id: string | null;
  name: string;
  kind: string; // 'ingreso' | 'gasto' | 'transferencia'
  amount: number | null;
  currency: string;
  category_id: string | null;
  account_id: string | null;
  merchant_or_source: string | null;
  note: string | null;
  is_favorite: boolean;
  sort_order: number;
  last_used_at: string | null;
  use_count: number;
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
  // Calculadora de deudas (migración 0016).
  original_amount: number | null;
  rate_type: string | null;
  rate_index: string | null;
  rate_spread: number | null;
  term_months: number | null;
  start_date: string | null;
  extra_monthly: number | null;
  insurance: number | null;
  notes: string | null;
  // Banco, tasa introductoria y recordatorios (migración 0017).
  bank: string | null;
  intro_fixed_months: number | null;
  intro_apr: number | null;
  last_reminded_on: string | null;
};

export type DebtPaymentRow = Timestamps & {
  id: string;
  user_id: string;
  household_id: string | null;
  debt_id: string;
  amount: number;
  principal: number | null;
  interest: number | null;
  occurred_on: string;
  extra_amount: number;
  extra_mode: string | null;
  // Puente ledger↔transacción (migración 0021 · Fase 1)
  transaction_id: string | null;
  // Tipo de pago (migración 20260617000003 · Fase B): 'ordinario' | 'extraordinario'.
  kind: string;
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
  // Activos de renta (migración 0018).
  current_value_manual: number | null;
  rental_income: number | null;
  rental_frequency: string | null;
  rental_subtype: string | null;
  // Ingresos (migración 20260615000003 · Fase 3): stub por completar.
  needs_detail: boolean;
  // Taxonomía de inversiones (migración 20260617000001).
  nature: string | null;
  category: string | null;
  income_month: number | null;
  region: string | null;
  is_recurring: boolean;
  // Aporte mensual separado del total invertido (migración 20260623000001).
  monthly_contribution: number | null;
};

export type RentalPaymentRow = Timestamps & {
  id: string;
  user_id: string;
  household_id: string | null;
  holding_id: string;
  received_on: string;
  amount: number;
  currency: string;
  frequency: string | null;
  income_id: string | null;
  // Puente ledger↔transacción (migración 0021 · Fase 1)
  transaction_id: string | null;
};

// Watchlist del Monitor de Fondos (migración 20260617000002).
export type WatchlistSymbolRow = Timestamps & {
  id: string;
  user_id: string;
  household_id: string | null;
  symbol: string;
  asset_type: string;
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

// Indicadores económicos globales (BCCR + FRED). Tabla compartida, sin user_id;
// escritura solo service-role (migración 0015).
export type EconomicIndicatorRow = {
  id: string;
  indicator_code: string;
  source: string;
  value: number;
  unit: string;
  observed_date: string;
  fetched_at: string;
};

export type DividendRow = {
  id: string;
  holding_id: string;
  user_id: string;
  household_id: string | null;
  payment_date: string;
  amount: number;
  currency: string;
  created_at: string;
  yield_pct: number | null;
  frequency: string | null;
  income_id: string | null;
  // Puente ledger↔transacción (migración 0021 · Fase 1)
  transaction_id: string | null;
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

export type ProfileSnapshotRow = Timestamps & {
  id: string;
  user_id: string;
  household_id: string | null;
  captured_on: string;
  metrics: Json;
};

export type LiquidityLedgerRow = Timestamps & {
  id: string;
  user_id: string;
  household_id: string | null;
  delta: number;
  currency: string;
  reason: string;
  transaction_id: string | null;
  occurred_on: string;
};

export type UserInsightRow = Timestamps & {
  id: string;
  user_id: string;
  household_id: string | null;
  kind: string;
  severity: string;
  title: string;
  body: string;
  metric: number | null;
  related_kind: string | null;
  related_id: string | null;
  status: string;
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

/** Idempotencia de webhooks: evento procesado por (provider, event_id). */
export type ProcessedEventRow = {
  provider: string;
  event_id: string;
  processed_at: string;
};

/** Ingesta por correo: allowlist alias de destinatario -> usuario (migración 0027). */
export type EmailIngestLinkRow = {
  id: string;
  user_id: string;
  household_id: string | null;
  ingest_alias: string; // communications+<token>@dominio (plus-addressing)
  forwarder_email: string | null; // informativo: correo personal del usuario
  created_at: string;
};

export type IngestProposalStatus = "pending" | "confirmed" | "discarded";

/** Cola de propuestas de ingesta por confirmar (migración 0027). */
export type IngestProposalRow = {
  id: string;
  user_id: string;
  household_id: string | null;
  kind: "gasto" | "ingreso";
  amount: number;
  currency: string;
  occurred_on: string;
  merchant: string | null;
  description: string;
  bank_code: string | null;
  external_ref: string | null;
  source_kind: string;
  confidence: number;
  status: IngestProposalStatus;
  raw_text: string | null;
  created_at: string;
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
      household_invitations: TableShape<
        HouseholdInvitationRow,
        Partial<HouseholdInvitationRow> & {
          household_id: string;
          email: string;
          invited_by: string;
        },
        Partial<HouseholdInvitationRow>
      >;
      whatsapp_links: UserTable<WhatsAppLinkRow>;
      personal_profiles: UserTable<PersonalProfileRow>;
      risk_profiles: UserTable<RiskProfileRow>;
      behavior_profiles: UserTable<BehaviorProfileRow>;
      knowledge_profiles: UserTable<KnowledgeProfileRow>;
      user_priorities: UserTable<UserPriorityRow>;
      financial_goals_profile: UserTable<FinancialGoalProfileRow>;
      dependents: UserTable<DependentRow>;
      income_sources: UserTable<IncomeSourceRow>;
      recurring_items: UserTable<RecurringItemRow>;
      expense_items: UserTable<ExpenseItemRow>;
      monthly_snapshots: UserTable<MonthlySnapshotRow>;
      savings_goals: UserTable<SavingsGoalRow>;
      debts: UserTable<DebtRow>;
      debt_payments: UserTable<DebtPaymentRow>;
      investments: UserTable<InvestmentRow>;
      investment_holdings: UserTable<InvestmentHoldingRow>;
      watchlist_symbols: UserTable<WatchlistSymbolRow>;
      investment_transactions: UserTable<InvestmentTransactionRow>;
      insurance_policies: UserTable<InsurancePolicyRow>;
      user_insights: UserTable<UserInsightRow>;
      liquidity_ledger: UserTable<LiquidityLedgerRow>;
      profile_snapshots: UserTable<ProfileSnapshotRow>;
      market_price_cache: TableShape<
        MarketPriceCacheRow,
        Partial<MarketPriceCacheRow> & {
          symbol: string;
          asset_type: string;
          price: number;
          currency: string;
          fetched_at: string;
          ttl_seconds: number;
        },
        Partial<MarketPriceCacheRow>
      >;
      economic_indicators: TableShape<
        EconomicIndicatorRow,
        Partial<EconomicIndicatorRow> & {
          indicator_code: string;
          source: string;
          value: number;
          unit: string;
          observed_date: string;
        },
        Partial<EconomicIndicatorRow>
      >;
      dividends: UserTable<DividendRow>;
      rental_payments: UserTable<RentalPaymentRow>;
      portfolio_snapshots: UserTable<PortfolioSnapshotRow>;
      assets: UserTable<AssetRow>;
      liabilities: UserTable<LiabilityRow>;
      net_worth_snapshots: UserTable<NetWorthSnapshotRow>;
      transactions: UserTable<TransactionRow>;
      budget_items: UserTable<BudgetItemRow>;
      accounts: UserTable<AccountRow>;
      transaction_rules: UserTable<TransactionRuleRow>;
      transaction_templates: UserTable<TransactionTemplateRow>;
      ai_usage_ledger: UserTable<AiUsageLedgerRow>;
      expense_categories: TableShape<
        ExpenseCategoryRow,
        Partial<ExpenseCategoryRow> & { name: string },
        Partial<ExpenseCategoryRow>
      >;
      // Idempotencia de webhooks (migración 0026). Solo service-role escribe.
      processed_events: TableShape<
        ProcessedEventRow,
        { provider: string; event_id: string; processed_at?: string },
        Partial<ProcessedEventRow>
      >;
      // Ingesta por correo (migración 0027). El poller usa service-role.
      email_ingest_links: UserTable<EmailIngestLinkRow>;
      ingest_proposals: UserTable<IngestProposalRow>;
    };
    // OJO: usar `{ [_ in never]: never }` (sin índice de cadena). `Record<string,
    // never>` tiene índice `[k]: never` y, vía `Tables & Views`, intersecta cada
    // tabla con `never`, colapsándolas. Así lo generan los tipos oficiales.
    Views: { [_ in never]: never };
    Functions: {
      ensure_household: {
        Args: { p_name?: string | null };
        Returns: string;
      };
      get_invitation_by_token: {
        Args: { p_token: string };
        Returns: {
          household_id: string;
          email: string;
          role: HouseholdRole;
          status: InvitationStatus;
          expired: boolean;
          inviter_name: string;
          household_name: string;
        }[];
      };
      accept_household_invitation: {
        Args: { p_token: string };
        Returns: string;
      };
      get_household_profile: {
        Args: Record<string, never>;
        Returns: Record<string, unknown> | null;
      };
      // Pago de deuda atómico (migración 0025): transacción + debt_payment en
      // una sola transacción de BD.
      record_debt_payment: {
        Args: { p_txn: Record<string, unknown>; p_payment: Record<string, unknown> };
        Returns: { transaction_id: string; payment_id: string };
      };
      update_debt_payment: {
        Args: {
          p_payment_id: string;
          p_occurred_on: string;
          p_amount: number;
          p_extra_amount: number;
          p_extra_mode: string | null;
        };
        Returns: undefined;
      };
      delete_debt_payment: {
        Args: { p_payment_id: string };
        Returns: undefined;
      };
    };
    Enums: {
      plan: Plan;
      household_type: HouseholdType;
      household_role: HouseholdRole;
    };
    CompositeTypes: { [_ in never]: never };
  };
}
