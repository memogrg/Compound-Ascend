"use client";

/**
 * Modal de un frasco normal: lista de sobres con barra gastado/presupuesto,
 * total del frasco, y bloque "Crear nueva subcategoría" con chips de
 * sugerencia (benchmark + hojas del grupo) e input con marca de agua. Crear
 * una subcategoría la añade como sobre del grupo con su presupuesto del mes.
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { formatMoney, CURRENCY_OPTIONS } from "@/lib/format";
import { useCaptureCurrency } from "@/components/layout/currency-context";
import { addCategoryAction, addBudgetItemAction } from "@/modules/financial-base/api/v2-actions";
import { EssentialCheck } from "@/components/shared/essential-check";
import { BudgetWarningModal } from "@/modules/financial-base/components/v2/expense-jars/budget-warning-modal";
import { PersonalizeKebab } from "@/modules/financial-base/components/v2/expense-jars/personalize-category";
import type { Jar, JarEnvelope } from "@/modules/financial-base/engine/expense-jars";
import type { Period } from "@/modules/financial-base/types";
import type {
  Category,
  CategoryPersonalization,
} from "@/modules/financial-base/services/categories-service";

function pct(spent: number, budget: number): number {
  if (budget <= 0) return spent > 0 ? 100 : 0;
  return Math.min(100, Math.round((spent / budget) * 100));
}

export function JarNormalModal({
  jar,
  currency,
  period,
  categories,
  canPersonalize,
  personalization,
  onClose,
}: {
  jar: Extract<Jar, { kind: "normal" }>;
  currency: string;
  period: Period;
  categories: Category[];
  canPersonalize: boolean;
  personalization: CategoryPersonalization;
  onClose: () => void;
}) {
  const catById = new Map(categories.map((c) => [c.id, c]));
  const router = useRouter();
  const toast = useToast();
  const captureCurrency = useCaptureCurrency();
  const [extra, setExtra] = useState<JarEnvelope[]>([]);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  // Moneda del presupuesto del nuevo sobre: default a la principal (estable),
  // no a la de visualización. Persiste la elegida (subCur) tal cual.
  const [subCur, setSubCur] = useState(captureCurrency);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEssential, setIsEssential] = useState(false);
  const [editEnv, setEditEnv] = useState<JarEnvelope | null>(null);

  const envelopes = [...jar.envelopes, ...extra];
  const totalSpent = envelopes.reduce((s, e) => s + e.spent, 0);
  const totalBudget = envelopes.reduce((s, e) => s + e.budget, 0);
  const usedPct = pct(totalSpent, totalBudget);
  const usedOver = totalBudget > 0 && totalSpent > totalBudget;

  // Marca de agua con ejemplos del grupo (se borra al escribir).
  const watermark =
    jar.suggestions.length > 0
      ? `Ej.: ${jar.suggestions.slice(0, 3).join(", ")}`
      : "Nombre de la subcategoría";

  // La moneda de visualización va primero aunque no esté en el set base.
  const subCurOptions = CURRENCY_OPTIONS.some((c) => c.code === currency)
    ? CURRENCY_OPTIONS
    : [{ code: currency, symbol: currency }, ...CURRENCY_OPTIONS];
  const subSym = subCurOptions.find((c) => c.code === subCur)?.symbol ?? subCur;

  async function addSubcategory() {
    const n = name.trim();
    if (!n) return setError("Escribe un nombre.");
    const amt = Number(amount) || 0;
    setPending(true);
    setError(null);
    // 1) crea la subcategoría como sobre del grupo (favorita → visible).
    const cat = await addCategoryAction({
      name: n,
      parentId: jar.group,
      categoryType: "expense",
      isFavorite: true,
      isEssential,
    });
    if (!cat.ok || !cat.id) {
      setPending(false);
      return setError(cat.message ?? "No pudimos crear la subcategoría.");
    }
    // 2) si hay monto, crea su presupuesto del mes.
    if (amt > 0) {
      await addBudgetItemAction({
        type: "expense",
        categoryId: cat.id,
        name: n,
        amount: amt,
        currency: subCur,
        frequency: "mensual",
        periodMonth: period.month,
        periodYear: period.year,
      });
    }
    setExtra((prev) => [
      ...prev,
      { id: cat.id!, name: n, spent: 0, budget: amt, nativeSpent: 0, nativeBudget: amt, currency: subCur },
    ]);
    setName("");
    setAmount("");
    setIsEssential(false);
    setPending(false);
    toast(`Sobre "${n}" creado`);
    router.refresh();
  }

  return (
    <Modal
      title={jar.name}
      sub={`${envelopes.length} ${envelopes.length === 1 ? "sobre" : "sobres"}`}
      onClose={onClose}
    >
      <div className="modal-body" style={{ maxWidth: "100%", overflowX: "hidden" }}>
        {/* Cabecera: gastado este mes + chip % usado (v2 .env-head) */}
        <div className="env-head">
          <div>
            <div className="lb">Gastado este mes</div>
            <div className="v">
              {formatMoney(totalSpent, currency)}
              <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>
                {" "}
                / {formatMoney(totalBudget, currency)}
              </span>
            </div>
          </div>
          <span className={usedOver ? "env-pill over" : "env-pill"}>{usedPct}% usado</span>
        </div>

        {/* Sobres */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {envelopes.length === 0 ? (
            <div className="muted" style={{ fontSize: 12.5 }}>
              Este frasco aún no tiene sobres. Crea el primero abajo.
            </div>
          ) : (
            envelopes.map((e) => {
              // Cada sobre se muestra en SU moneda nativa (independiente del selector
              // de arriba). El total del frasco sigue en display sumando e.budget.
              const eBudget = e.nativeBudget;
              const eSpent = e.nativeSpent;
              const eCur = e.currency;
              const over = eBudget > 0 && eSpent > eBudget;
              const color = over ? "var(--neg)" : jar.color;
              const remaining = eBudget - eSpent;
              const ePct =
                eBudget > 0 ? Math.round((eSpent / eBudget) * 100) : eSpent > 0 ? 100 : 0;
              // Personalización del sobre: el "(general)" del grupo no se personaliza
              // (es el frasco). TODO sobre real (base de sistema, fork o del usuario) lo
              // tiene para editores del hogar.
              const cat = catById.get(e.id);
              const sobreBaseId = personalization.forkToBase[e.id] ?? null;
              const sobreIsFork = sobreBaseId != null;
              const showSobreMenu = canPersonalize && e.id !== jar.group && !!cat;
              return (
                <div
                  key={e.id}
                  className="subenv"
                  style={{ padding: "11px 0", borderTop: "1px solid var(--line)" }}
                >
                  {/* Nombre · presupuesto del sobre · candado · personalizar */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 13.5,
                        fontWeight: 600,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {e.name}
                      {sobreIsFork ? (
                        <span className="chip-linked" style={{ marginLeft: 6 }}>
                          personalizado
                        </span>
                      ) : null}
                    </span>
                    <span style={{ fontSize: 13.5, fontWeight: 700 }}>
                      {formatMoney(eBudget, eCur)}
                    </span>
                    <button
                      type="button"
                      className="se-lock icon-btn tip"
                      data-tip="Editar el presupuesto de este sobre (requiere confirmación)"
                      aria-label={`Editar presupuesto de ${e.name}`}
                      style={{ width: 28, height: 28, flex: "none", color: "var(--muted)" }}
                      onClick={() => setEditEnv(e)}
                    >
                      <Icon name="lock" />
                    </button>
                    {showSobreMenu ? (
                      <PersonalizeKebab
                        target={{
                          id: e.id,
                          name: e.name,
                          isSystem: cat?.isSystem ?? false,
                          icon: cat?.icon ?? null,
                          color: cat?.color ?? null,
                          isFavorite: cat?.isFavorite ?? false,
                          isEssential: cat?.isEssential ?? false,
                        }}
                        isFork={sobreIsFork}
                        baseIdIfFork={sobreBaseId}
                        reassignOptions={categories
                          .filter((c) => c.id !== e.id)
                          .map((c) => ({ id: c.id, label: c.name }))}
                      />
                    ) : null}
                  </div>
                  {/* gastado de presupuesto · ver movimientos */}
                  <div style={{ fontSize: 12, marginTop: 3 }}>
                    <span className="muted">
                      {formatMoney(eSpent, eCur)} de {formatMoney(eBudget, eCur)}
                    </span>
                    {" · "}
                    <Link
                      href={`/transacciones?cat=${e.id}`}
                      className="se-link"
                      style={{ color: "var(--info)", fontWeight: 600, textDecoration: "none" }}
                    >
                      ver movimientos ›
                    </Link>
                  </div>
                  <div className="bar-track" style={{ marginTop: 6 }}>
                    <div
                      className="bar-fill"
                      style={{ width: `${pct(eSpent, eBudget)}%`, background: color }}
                    />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginTop: 4,
                      fontSize: 11.5,
                    }}
                  >
                    <span
                      className={over ? undefined : "muted"}
                      style={over ? { color: "var(--neg)" } : undefined}
                    >
                      {ePct}% gastado
                    </span>
                    <span style={over ? { color: "var(--neg)", fontWeight: 600 } : undefined}>
                      {over
                        ? `−${formatMoney(Math.abs(remaining), eCur)} excedido`
                        : `${formatMoney(remaining, eCur)} restante`}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
        {editEnv ? (
          <BudgetWarningModal
            envelope={editEnv}
            period={period}
            currency={currency}
            onClose={() => setEditEnv(null)}
          />
        ) : null}

        {/* Crear nueva subcategoría */}
        <div
          className="fld"
          style={{ marginTop: 16, borderTop: "1px solid var(--line)", paddingTop: 14 }}
        >
          <label className="fld-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            Crear nueva subcategoría
            <span
              className="tip"
              data-tip="Un sobre es una subcategoría con su propio presupuesto dentro del frasco. Usa una sugerencia o escribe la tuya."
              style={{
                width: 15,
                height: 15,
                borderRadius: "50%",
                border: "1px solid var(--line)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                color: "var(--muted)",
              }}
            >
              ?
            </span>
          </label>
          {jar.suggestions.length > 0 ? (
            <div className="chip-grid" style={{ marginBottom: 8 }}>
              {jar.suggestions.slice(0, 10).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`chip-sel ${name === s ? "on" : ""}`}
                  style={{ fontSize: 11.5, padding: "3px 10px" }}
                  onClick={() => setName(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}
          {error ? (
            <div className="auth-msg warn" role="alert" style={{ marginBottom: 8 }}>
              {error}
            </div>
          ) : null}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "stretch" }}>
            <input
              className="inp"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={watermark}
              maxLength={60}
              style={{ flex: "1 1 160px", minWidth: 0, maxWidth: "100%", boxSizing: "border-box" }}
            />
            <div
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                flex: "1 1 170px",
                minWidth: 0,
              }}
            >
              <select
                className="sel"
                value={subCur}
                onChange={(e) => setSubCur(e.target.value)}
                aria-label="Moneda del presupuesto del sobre"
                style={{ width: "auto", flex: "none", minWidth: 0, padding: "10px 8px" }}
              >
                {subCurOptions.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code}
                  </option>
                ))}
              </select>
              <div className="inp-money" style={{ flex: 1, minWidth: 0, boxSizing: "border-box" }}>
                <span className="pre">{subSym}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  style={{ minWidth: 0 }}
                />
              </div>
              <span
                className="tip"
                data-tip="Moneda en que defines el presupuesto de este sobre. Por defecto, tu moneda de visualización."
                style={{
                  width: 16,
                  height: 16,
                  flex: "none",
                  borderRadius: "50%",
                  border: "1px solid var(--line)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  color: "var(--muted)",
                }}
              >
                ?
              </span>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              style={{ flex: "0 1 auto" }}
              onClick={() => void addSubcategory()}
              disabled={pending || !name.trim()}
            >
              {pending ? (
                "…"
              ) : (
                <>
                  <Icon name="plus" width={2} /> Añadir
                </>
              )}
            </button>
          </div>
          <div style={{ marginTop: 10 }}>
            <EssentialCheck checked={isEssential} onChange={setIsEssential} />
          </div>
        </div>
      </div>

      <div className="modal-foot">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </Modal>
  );
}
