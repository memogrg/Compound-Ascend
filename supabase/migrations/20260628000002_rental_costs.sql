-- ============================================================
-- Inmueble de renta — costos operativos para ROI real
-- ============================================================
-- Aditiva e idempotente. rental_subtype ya existe (migración 0018).
-- Porcentajes (vacancy_pct, mgmt_pct) se guardan como ratio 0-1.

alter table public.investment_holdings
  add column if not exists purchase_price       numeric,  -- precio de compra
  add column if not exists closing_costs        numeric,  -- costos de cierre (traspaso, legal)
  add column if not exists vacancy_pct          numeric,  -- 0-1: % de meses sin alquilar
  add column if not exists mgmt_pct             numeric,  -- 0-1: administración sobre renta cobrada
  add column if not exists maintenance_monthly  numeric,  -- mantenimiento mensual
  add column if not exists hoa_monthly          numeric,  -- condominio/HOA mensual
  add column if not exists property_tax_annual  numeric,  -- IBI/impuestos anuales
  add column if not exists insurance_annual     numeric,  -- seguro anual
  add column if not exists services_monthly     numeric;  -- servicios + limpieza mensual
