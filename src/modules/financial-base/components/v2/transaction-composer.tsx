"use client";

/**
 * Composer premium de transacciones (módulo Transacciones rediseñado).
 *
 * Una sola pantalla cinematográfica que cubre el flujo Tipo → Categoría →
 * Subcategoría → Monto → Guardar en < 10 s. Incluye:
 *   · Selector jerárquico de 2 niveles (grupo → subcategoría) con chips.
 *   · Autocompletado inteligente determinista (comercio → categoría).
 *   · Favoritos/plantillas para registrar en 1 clic.
 *   · Tooltips y microinteracciones.
 *
 * No reemplaza la edición existente (QuickAddModal sigue para editar filas).
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import {
  addTransactionAction,
  addTransferAction,
  addRuleAction,
  runTemplateAction,
} from "@/modules/financial-base/api/v2-actions";
import type { Account, TxnKind } from "@/modules/financial-base/types";
import type { Category, CategoryNode } from "@/modules/financial-base/services/categories-service";
import type { SuggestionEntry } from "@/modules/financial-base/services/suggestion-service";
import type { TransactionTemplate } from "@/modules/financial-base/services/templates-service";

const INCOME_SOURCES = ["Salario", "Comisión", "Venta", "Reembolso", "Ingreso pasivo", "Extraordinario"] as const;
const SYM: Record<string, string> = { CRC: "₡", USD: "$", EUR: "€", MXN: "MX$", COP: "COL$", GBP: "£" };

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Match client-side de sugerencias (réplica de matchSuggestion del servidor). */
function matchSuggestion(text: string, index: SuggestionEntry[]): SuggestionEntry | null {
  const hay = text.trim().toLowerCase();
  if (!hay) return null;
  let best: SuggestionEntry | null = null;
  for (const e of index) {
    if (hay.includes(e.pattern)) {
      if (!best || e.weight + e.pattern.length > best.weight + best.pattern.length) best = e;
    }
  }
  return best;
}

export function TransactionComposer({
  initialKind = "gasto",
  tree,
  accounts,
  currency,
  suggestions,
  templates,
  lockKind,
  onClose,
}: {
  initialKind?: TxnKind;
  tree: CategoryNode[];
  accounts: Account[];
  currency: string;
  suggestions: SuggestionEntry[];
  templates: TransactionTemplate[];
  lockKind?: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();

  const [kind, setKind] = useState<TxnKind>(initialKind);
  const [amount, setAmount] = useState("");
  const [groupId, setGroupId] = useState<string>(tree[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [touchedCat, setTouchedCat] = useState(false);
  const [merchant, setMerchant] = useState("");
  const [source, setSource] = useState<string>(INCOME_SOURCES[0]);
  const [accountId, setAccountId] = useState(accounts.find((a) => a.isDefault)?.id ?? accounts[0]?.id ?? "");
  const [toAccountId, setToAccountId] = useState(accounts[1]?.id ?? "");
  const [more, setMore] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isGasto = kind === "gasto";
  const isIngreso = kind === "ingreso";
  const isTransfer = kind === "transferencia";
  const sym = SYM[currency] ?? "";

  // Mapa id → categoría para resolver etiquetas/ruta.
  const flatById = useMemo(() => {
    const m = new Map<string, Category>();
    for (const g of tree) {
      m.set(g.id, g);
      for (const c of g.children) m.set(c.id, c);
    }
    return m;
  }, [tree]);

  const activeGroup = tree.find((g) => g.id === groupId) ?? tree[0];
  const selectedCat = categoryId ? flatById.get(categoryId) ?? null : null;

  // Sugerencia viva por comercio.
  const suggestion = useMemo(
    () => (isGasto ? matchSuggestion(merchant, suggestions) : null),
    [isGasto, merchant, suggestions],
  );

  // Auto-aplica la sugerencia si el usuario aún no eligió categoría a mano.
  const effectiveSuggestionApplies = suggestion && !touchedCat && suggestion.categoryId !== categoryId;

  function applySuggestion(s: SuggestionEntry) {
    const cat = flatById.get(s.categoryId);
    setCategoryId(s.categoryId);
    setTouchedCat(true);
    // Lleva el grupo correcto al frente.
    const parentGroup = tree.find((g) => g.id === s.categoryId || g.children.some((c) => c.id === s.categoryId));
    if (parentGroup) setGroupId(parentGroup.id);
    if (cat) toast(`Sugerido: ${cat.name}`, "info");
  }

  function selectCategory(id: string) {
    setCategoryId(id);
    setTouchedCat(true);
  }

  function fillFromTemplate(t: TransactionTemplate) {
    setKind(t.kind);
    if (t.amount) setAmount(String(t.amount));
    if (t.categoryId) {
      setCategoryId(t.categoryId);
      setTouchedCat(true);
      const g = tree.find((x) => x.id === t.categoryId || x.children.some((c) => c.id === t.categoryId));
      if (g) setGroupId(g.id);
    }
    if (t.merchantOrSource) {
      if (t.kind === "ingreso") setSource(t.merchantOrSource);
      else setMerchant(t.merchantOrSource);
    }
    if (t.accountId) setAccountId(t.accountId);
    if (t.note) setNote(t.note);
  }

  async function oneClickTemplate(t: TransactionTemplate) {
    if (!t.amount) {
      fillFromTemplate(t);
      return;
    }
    setPending(true);
    const res = await runTemplateAction(t.id);
    setPending(false);
    if (res.ok) {
      toast(`Registrado: ${t.name}`);
      onClose();
      router.refresh();
    } else {
      setError(res.message ?? "No pudimos registrar la plantilla.");
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return setError("Ingresa un monto válido.");
    setPending(true);
    setError(null);

    let res: { ok: boolean; message?: string };
    if (isTransfer) {
      if (!accountId || !toAccountId || accountId === toAccountId) {
        setPending(false);
        return setError("Elige dos cuentas distintas para la transferencia.");
      }
      res = await addTransferAction({
        fromAccountId: accountId,
        toAccountId,
        amount: amt,
        currency,
        occurredOn: date,
        note: note || undefined,
      });
    } else {
      const catId = effectiveSuggestionApplies && suggestion ? suggestion.categoryId : categoryId;
      res = await addTransactionAction({
        kind,
        amount: amt,
        currency,
        occurredOn: date,
        categoryId: isGasto ? catId || null : null,
        accountId: accountId || null,
        merchantOrSource: isGasto ? merchant || undefined : source,
        description: note || undefined,
        status: "confirmed",
        origin: "manual",
      });
    }

    setPending(false);
    if (res.ok) {
      toast(isTransfer ? "Transferencia registrada" : isGasto ? "Gasto registrado" : "Ingreso registrado");
      // Aprendizaje: si categorizaste un comercio y no había sugerencia exacta, ofrece regla.
      const m = merchant.trim();
      if (isGasto && m && categoryId && (!suggestion || suggestion.categoryId !== categoryId)) {
        const catName = flatById.get(categoryId)?.name ?? "esa categoría";
        toast(`Aprender "${m}" → ${catName}`, "info", {
          label: "Crear regla",
          onClick: () => {
            void addRuleAction({ merchantPattern: m, type: "expense", suggestedCategoryId: categoryId, suggestedAccountId: accountId || null, active: true });
          },
        });
      }
      onClose();
      router.refresh();
    } else {
      setError(res.message ?? "No pudimos guardar.");
    }
  }

  const favorites = templates.filter((t) => t.isFavorite).slice(0, 6);

  return (
    <Modal title="Registrar transacción" sub="Tipo · categoría · monto. En segundos." onClose={onClose}>
      <form onSubmit={onSubmit}>
        <div className="modal-body">
          {error ? <div className="auth-msg warn" role="alert">{error}</div> : null}

          {/* Paso 1 · Tipo */}
          <div className="seg cmp-seg" role="tablist" aria-label="Tipo de transacción">
            <button type="button" className={`seg-btn ${isGasto ? "on" : ""}`} onClick={() => setKind("gasto")} disabled={lockKind}>
              <Icon name="expense" width={2} /> Gasto
            </button>
            <button type="button" className={`seg-btn ${isIngreso ? "on" : ""}`} onClick={() => setKind("ingreso")} disabled={lockKind}>
              <Icon name="income" width={2} /> Ingreso
            </button>
            <button type="button" className={`seg-btn ${isTransfer ? "on" : ""}`} onClick={() => setKind("transferencia")} disabled={lockKind}>
              <Icon name="repeat" width={2} /> Transferencia
            </button>
          </div>

          {/* Favoritos · 1 clic */}
          {favorites.length > 0 ? (
            <div className="cmp-fav">
              <span className="cmp-fav-label">Favoritos</span>
              <div className="cmp-fav-row">
                {favorites.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="cmp-fav-chip tip"
                    data-tip={t.amount ? `${SYM[t.currency] ?? ""}${t.amount.toLocaleString("es-CR")} · 1 clic` : "Rellenar formulario"}
                    onClick={() => void oneClickTemplate(t)}
                    disabled={pending}
                  >
                    <Icon name="spark" width={2} /> {t.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {/* Monto */}
          <div className="fld">
            <label className="fld-label">Monto</label>
            <div className="inp-money" style={{ fontSize: 24 }}>
              <span className="pre" style={{ fontSize: 21 }}>{sym}</span>
              <input
                autoFocus
                inputMode="decimal"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                style={{ fontSize: 24, fontWeight: 650 }}
                required
              />
            </div>
          </div>

          {/* Gasto: comercio + categoría jerárquica */}
          {isGasto ? (
            <>
              <div className="fld">
                <label className="fld-label">Comercio</label>
                <input className="inp" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Automercado, Uber, Netflix…" />
                {suggestion ? (
                  <button type="button" className="cmp-sugg" onClick={() => applySuggestion(suggestion)}>
                    <Icon name="spark" width={2} /> Sugerencia: <strong>{suggestion.categoryName}</strong> · tocar para aplicar
                  </button>
                ) : null}
              </div>

              <div className="fld">
                <label className="fld-label">
                  Categoría {selectedCat ? <span className="cmp-picked">· {selectedCat.name}</span> : null}
                </label>
                <div className="cmp-groups">
                  {tree.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      className={`cmp-group ${activeGroup?.id === g.id ? "on" : ""} tip`}
                      data-tip={`${g.children.length} subcategorías`}
                      onClick={() => setGroupId(g.id)}
                    >
                      <span className="cmp-dot" style={{ background: g.color ?? "var(--muted-2)" }} />
                      {g.name}
                    </button>
                  ))}
                </div>

                {activeGroup ? (
                  <div className="chip-grid cmp-subs">
                    <button
                      type="button"
                      className={`chip-sel ${categoryId === activeGroup.id ? "on" : ""}`}
                      onClick={() => selectCategory(activeGroup.id)}
                    >
                      {activeGroup.name} (general)
                    </button>
                    {activeGroup.children.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={`chip-sel ${categoryId === c.id ? "on" : ""}`}
                        onClick={() => selectCategory(c.id)}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </>
          ) : null}

          {/* Ingreso: fuente */}
          {isIngreso ? (
            <div className="fld">
              <label className="fld-label">Fuente</label>
              <div className="chip-grid">
                {INCOME_SOURCES.map((s) => (
                  <button key={s} type="button" className={`chip-sel ${source === s ? "on" : ""}`} onClick={() => setSource(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {/* Cuenta(s) */}
          {isTransfer ? (
            <div className="fld-2">
              <div className="fld">
                <label className="fld-label">Desde</label>
                <select className="sel" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="fld">
                <label className="fld-label">Hacia</label>
                <select className="sel" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            </div>
          ) : (
            <div className="fld">
              <label className="fld-label">{isGasto ? "Cuenta / método" : "Cuenta destino"}</label>
              {accounts.length > 0 ? (
                <select className="sel" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}{a.isDefault ? " (predeterminada)" : ""}</option>
                  ))}
                </select>
              ) : (
                <div className="muted" style={{ fontSize: 12.5 }}>Aún no tienes cuentas; puedes guardar sin cuenta.</div>
              )}
            </div>
          )}

          {/* Más detalles */}
          {!more ? (
            <button type="button" className="btn btn-ghost" style={{ alignSelf: "flex-start", padding: "4px 0", color: "var(--info)" }} onClick={() => setMore(true)}>
              + Más detalles (fecha, nota…)
            </button>
          ) : (
            <div className="fld-2">
              <div className="fld">
                <label className="fld-label">Fecha</label>
                <input className="inp" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="fld">
                <label className="fld-label">Nota</label>
                <input className="inp" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcional" />
              </div>
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className={`btn ${isIngreso ? "btn-secondary" : "btn-primary"}`} disabled={pending}>
            {pending ? "Guardando…" : <><Icon name="check" width={2} /> Guardar</>}
          </button>
        </div>
      </form>
    </Modal>
  );
}
