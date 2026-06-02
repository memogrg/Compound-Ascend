# Base de datos — Compound Ascend

Postgres gestionado por Supabase. Migraciones **versionadas y ordenadas**; se
aplican en orden ascendente.

## Estructura

```
database/
  migrations/   0001 … 0009  (extensiones, identidad y los 5 módulos + IA + seguridad)
  seed/         seed.sql      (monedas + categorías de gasto del sistema)
```

## Aplicar (Supabase CLI)

```bash
# 1. Vincula tu proyecto
supabase link --project-ref <ref>

# 2. Aplica migraciones en orden
for f in database/migrations/*.sql; do
  psql "$DATABASE_URL" -f "$f"
done

# 3. Carga el seed
psql "$DATABASE_URL" -f database/seed/seed.sql
```

> Alternativa: copiar cada archivo al directorio `supabase/migrations` con el
> formato de timestamp de la CLI y usar `supabase db push`.

## Orden de migraciones

| Archivo | Contenido |
|---|---|
| `0001_extensions_helpers.sql` | Extensiones, `set_updated_at`, `is_household_member/editor`, `handle_new_user`, `apply_user_data_policies` |
| `0002_identity.sql` | profiles, user_settings, households, household_members + RLS + trigger de alta + protección de `plan` |
| `0003_personal_profile.sql` | Módulo 1 (perfil, prioridades, objetivos, riesgo, comportamiento, conocimiento, dependientes) |
| `0004_financial_base.sql` | Módulo 2 (monedas, fx, categorías, ingresos, gastos, transacciones, recurrencias, snapshots) |
| `0005_control.sql` | Módulo 3 (objetivos, contribuciones, deudas, pagos, recomendaciones, escenarios) |
| `0006_wealth.sql` | Módulo 4 (inversiones, holdings, transacciones, cache de precios, pólizas, brechas) |
| `0007_rich_life.sql` | Módulo 5 (activos, pasivos, snapshots de patrimonio, scores) |
| `0008_ai.sql` | IA, acciones, recibos, **consumo de tokens y rate limits (solo lectura para el usuario)** |
| `0009_security_audit.sql` | Auditoría y eventos de seguridad (solo backend) |

## RLS — resumen

- Toda tabla de datos de usuario: `enable` + `force row level security`.
- Patrón estándar (helper `apply_user_data_policies`): el usuario ve/edita lo
  suyo, y datos de hogar según `household_members` (`is_household_member` para
  leer, `is_household_editor` para escribir).
- `ai_usage_ledger` y `ai_rate_limits`: **solo SELECT** del propio registro; la
  escritura es exclusiva de service-role/RPC. El usuario no puede inflar límites
  ni borrar su consumo.
- `profiles.plan`: protegido por trigger; no se puede cambiar desde el cliente.
- `audit_logs`, `security_events`: sin acceso de lectura/escritura para usuarios.

Los tests de aislamiento están en `tests/rls/` (se ejecutan si hay credenciales
de un proyecto Supabase de pruebas).
