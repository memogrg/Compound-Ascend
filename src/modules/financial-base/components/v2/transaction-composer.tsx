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
import { CURRENCY_SYMBOL, formatMoney } from "@/lib/format";
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
  addCategoryAction,
} from "@/modules/financial-base/api/v2-actions";
import { CURRENCIES } from "@/modules/personal-profile/constants";
import type { Account, TxnKind, LinkedKind } from "@/modules/financial-base/types";
import type { Category, CategoryNode } from "@/modules/financial-base/services/categories-service";
import type { SuggestionEntry } from "@/modules/financial-base/services/suggestion-service";
import type { TransactionTemplate } from "@/modules/financial-base/services/templates-service";
import type { LinkableEntities } from "@/modules/financial-base/services/linkable-entities-service";

const LINK_LABEL: Record<string, string> = {
  debt: "deuda",
  goal: "meta",
  holding: "inversión",
  policy: "póliza",
  rental: "activo de renta",
};

const INCOME_SOURCES = [
  "Salario",
  "Comisión",
  "Venta",
  "Reembolso",
  "Ingreso pasivo",
  "Extraordinario",
] as const;

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
  incomeTree = [],
  accounts,
  currency,
  suggestions,
  templates,
  linkables,
  lockKind,
  onClose,
}: {
  initialKind?: TxnKind;
  tree: CategoryNode[];
  incomeTree?: CategoryNode[];
  accounts: Account[];
  currency: string;
  suggestions: SuggestionEntry[];
  templates: TransactionTemplate[];
  linkables?: LinkableEntities;
  lockKind?: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();

  const [kind, setKind] = useState<TxnKind>(initialKind);
  const [amount, setAmount] = useState("");
  // Moneda de la transacción: default = moneda de visualización; recuerda la
  // última usada en la sesión (solo UI: el schema ya guarda currency).
  const [txnCurrency, setTxnCurrency] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const last = window.sessionStorage.getItem("cmp-last-currency");
      if (last && CURRENCIES.some((c) => c.value === last)) return last;
    }
    return currency;
  });
  const [groupId, setGroupId] = useState<string>(tree[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [touchedCat, setTouchedCat] = useState(false);
  const [merchant, setMerchant] = useState("");
  const [source, setSource] = useState<string>(INCOME_SOURCES[0]);
  const [incomeCatId, setIncomeCatId] = useState<string | null>(null);
  // Cuentas: solo las transferencias eligen cuenta en la UI; en el resto el
  // servidor asigna la predeterminada en silencio (Fase 7 · composer simple).
  const [accountId, setAccountId] = useState(
    accounts.find((a) => a.isDefault)?.id ?? accounts[0]?.id ?? "",
  );
  const [toAccountId, setToAccountId] = useState(accounts[1]?.id ?? "");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Crear subcategoría inline ("+ Nueva") sin salir del modal.
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatPending, setNewCatPending] = useState(false);

  const isGasto = kind === "gasto";
  const isIngreso = kind === "ingreso";
  const isTransfer = kind === "transferencia";
  const isAdjust = kind === "ajuste";
  const sym = CURRENCY_SYMBOL[txnCurrency] ?? "";

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
  const selectedCat = categoryId ? (flatById.get(categoryId) ?? null) : null;

  // Categorías de ingreso (opcionales): hojas del árbol de ingresos.
  const incomeCats = useMemo(() => incomeTree.flatMap((g) => g.children), [incomeTree]);

  // Vínculo entidad (Fase 2): la categoría sugiere el tipo; 1 tap elige cuál.
  const [linkedId, setLinkedId] = useState<string | null>(null);
  const [touchedLink, setTouchedLink] = useState(false);
  const linkKind = (isGasto ? (selectedCat?.linkedKind ?? null) : null) as Exclude<
    LinkedKind,
    "none"
  > | null;
  const linkOptions = useMemo(
    () => (linkKind && linkables ? linkables[linkKind] : []),
    [linkKind, linkables],
  );
  // Solo cuenta si la entidad elegida es del tipo que sugiere la categoría
  // actual (cambiar de categoría invalida el vínculo viejo). Si hay una sola
  // entidad de ese tipo y el usuario no ha tocado el selector, se preselecciona.
  const validLinkedId = linkedId && linkOptions.some((o) => o.id === linkedId) ? linkedId : null;
  const effectiveLinkedId =
    validLinkedId ?? (!touchedLink && linkOptions.length === 1 ? linkOptions[0]!.id : null);

  // Sugerencia viva por comercio.
  const suggestion = useMemo(
    () => (isGasto ? matchSuggestion(merchant, suggestions) : null),
    [isGasto, merchant, suggestions],
  );

  // Auto-aplica la sugerencia si el usuario aún no eligió categoría a mano.
  const effectiveSuggestionApplies =
    suggestion && !touchedCat && suggestion.categoryId !== categoryId;

  function applySuggestion(s: SuggestionEntry) {
    const cat = flatById.get(s.categoryId);
    setCategoryId(s.categoryId);
    setTouchedCat(true);
    // Lleva el grupo correcto al frente.
    const parentGroup = tree.find(
      (g) => g.id === s.categoryId || g.children.some((c) => c.id === s.categoryId),
    );
    if (parentGroup) setGroupId(parentGroup.id);
    if (cat) toast(`Sugerido: ${cat.name}`, "info");
  }

  function selectCategory(id: string) {
    setCategoryId(id);
    setTouchedCat(true);
  }

  // Chips optimistas de subcategorías recién creadas (hasta que llegue el
  // árbol fresco vía router.refresh).
  const [extraCats, setExtraCats] = useState<{ id: string; name: string; groupId: string }[]>([]);

  async function createInlineCategory() {
    const name = newCatName.trim();
    if (!name || !activeGroup) return;
    setNewCatPending(true);
    const res = await addCategoryAction({
      name,
      parentId: activeGroup.id,
      categoryType: "expense",
    });
    setNewCatPending(false);
    if (res.ok && res.id) {
      setExtraCats((prev) => [...prev, { id: res.id!, name, groupId: activeGroup.id }]);
      selectCategory(res.id);
      setNewCatOpen(false);
      setNewCatName("");
      toast(`Subcategoría "${name}" creada`);
      router.refresh();
    } else {
      toast(res.message ?? "No pudimos crear la subcategoría", "error");
    }
  }

  function fillFromTemplate(t: TransactionTemplate) {
    setKind(t.kind);
    if (t.amount) setAmount(String(t.amount));
    if (t.categoryId) {
      setCategoryId(t.categoryId);
      setTouchedCat(true);
      const g = tree.find(
        (x) => x.id === t.categoryId || x.children.some((c) => c.id === t.categoryId),
      );
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
        currency: txnCurrency,
        occurredOn: date,
        note: note || undefined,
      });
    } else {
      const catId = effectiveSuggestionApplies && suggestion ? suggestion.categoryId : categoryId;
      res = await addTransactionAction({
        kind,
        amount: amt,
        currency: txnCurrency,
        occurredOn: date,
        categoryId: isGasto ? catId || null : isIngreso ? incomeCatId : null,
        // Sin selector de cuenta: el servidor asigna la predeterminada.
        accountId: null,
        merchantOrSource: isGasto
          ? merchant || undefined
          : isIngreso
            ? source
            : note || "Ajuste de saldo",
        description: note || undefined,
        status: "confirmed",
        origin: "manual",
        linkedKind: linkKind && effectiveLinkedId ? linkKind : "none",
        linkedId: linkKind && effectiveLinkedId ? effectiveLinkedId : null,
      });
    }
    if (res.ok && typeof window !== "undefined") {
      window.sessionStorage.setItem("cmp-last-currency", txnCurrency);
    }

    setPending(false);
    if (res.ok) {
      toast(
        isTransfer
          ? "Transferencia registrada"
          : isAdjust
            ? "Ajuste registrado"
            : isGasto
              ? "Gasto registrado"
              : "Ingreso registrado",
      );
      // Aprendizaje: si categorizaste un comercio y no había sugerencia exacta,
      // ofrece regla (con vínculo incluido: la próxima vez se auto-vincula).
      const m = merchant.trim();
      if (isGasto && m && categoryId && (!suggestion || suggestion.categoryId !== categoryId)) {
        const catName = flatById.get(categoryId)?.name ?? "esa categoría";
        const ruleLinkKind = linkKind && effectiveLinkedId ? linkKind : null;
        const ruleLinkId = linkKind && effectiveLinkedId ? effectiveLinkedId : null;
        toast(`Aprender "${m}" → ${catName}`, "info", {
          label: "Crear regla",
          onClick: () => {
            void addRuleAction({
              merchantPattern: m,
              type: "expense",
              suggestedCategoryId: categoryId,
              suggestedAccountId: accountId || null,
              active: true,
              linkedKind: ruleLinkKind,
              linkedId: ruleLinkId,
            });
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
    <Modal
      title={
        lockKind ? (isIngreso ? "Registrar ingreso" : "Registrar gasto") : "Registrar transacción"
      }
      sub={lockKind ? "Categoría · monto. En segundos." : "Tipo · categoría · monto. En segundos."}
      onClose={onClose}
    >
      <form onSubmit={onSubmit}>
        <div className="modal-body">
          {error ? (
            <div className="auth-msg warn" role="alert">
              {error}
            </div>
          ) : null}

          {/* Paso 1 · Tipo — oculto cuando el contexto ya lo fija (tab Gastos/Ingresos). */}
          {!lockKind ? (
            <div className="seg cmp-seg" role="tablist" aria-label="Tipo de transacción">
              <button
                type="button"
                className={`seg-btn ${isGasto ? "on" : ""}`}
                onClick={() => setKind("gasto")}
              >
                <Icon name="expense" width={2} /> Gasto
              </button>
              <button
                type="button"
                className={`seg-btn ${isIngreso ? "on" : ""}`}
                onClick={() => setKind("ingreso")}
              >
                <Icon name="income" width={2} /> Ingreso
              </button>
              <button
                type="button"
                className={`seg-btn ${isTransfer ? "on" : ""}`}
                onClick={() => setKind("transferencia")}
              >
                <Icon name="repeat" width={2} /> Transferencia
              </button>
              <button
                type="button"
                className={`seg-btn ${isAdjust ? "on" : ""}`}
                onClick={() => setKind("ajuste")}
              >
                <Icon name="edit" width={2} /> Ajuste
              </button>
            </div>
          ) : null}
          {isAdjust ? (
            <p className="muted" style={{ fontSize: 12, marginTop: -4 }}>
              Conciliación de saldo (neutro): no cuenta como ingreso ni gasto.
            </p>
          ) : null}

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
                    data-tip={
                      t.amount
                        ? `${formatMoney(t.amount, t.currency)} · 1 clic`
                        : "Rellenar formulario"
                    }
                    onClick={() => void oneClickTemplate(t)}
                    disabled={pending}
                  >
                    <Icon name="spark" width={2} /> {t.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {/* Monto + moneda */}
          <div className="fld">
            <label className="fld-label">Monto</label>
            <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
              <div className="inp-money" style={{ fontSize: 24, flex: 1 }}>
                <span className="pre" style={{ fontSize: 21 }}>
                  {sym}
                </span>
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
              <select
                className="sel tip"
                data-tip="Moneda de esta transacción"
                aria-label="Moneda de la transacción"
                value={txnCurrency}
                onChange={(e) => setTxnCurrency(e.target.value)}
                style={{ flex: "none", width: "auto", minWidth: 86, fontSize: 13 }}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.value}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Gasto: comercio + categoría jerárquica */}
          {isGasto ? (
            <>
              <div className="fld">
                <label className="fld-label">Comercio</label>
                <input
                  className="inp"
                  value={merchant}
                  onChange={(e) => setMerchant(e.target.value)}
                  placeholder="Automercado, Uber, Netflix…"
                />
                {suggestion ? (
                  <button
                    type="button"
                    className="cmp-sugg"
                    onClick={() => applySuggestion(suggestion)}
                  >
                    <Icon name="spark" width={2} /> Sugerencia:{" "}
                    <strong>{suggestion.categoryName}</strong> · tocar para aplicar
                  </button>
                ) : null}
              </div>

              <div className="fld">
                <label className="fld-label">
                  Categoría{" "}
                  {selectedCat ? <span className="cmp-picked">· {selectedCat.name}</span> : null}
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
                      <span
                        className="cmp-dot"
                        style={{ background: g.color ?? "var(--muted-2)" }}
                      />
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
                    {extraCats
                      .filter(
                        (e) =>
                          e.groupId === activeGroup.id &&
                          !activeGroup.children.some((c) => c.id === e.id),
                      )
                      .map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          className={`chip-sel ${categoryId === e.id ? "on" : ""}`}
                          onClick={() => selectCategory(e.id)}
                        >
                          {e.name}
                        </button>
                      ))}
                    {/* Crear subcategoría inline (hereda el grupo activo). */}
                    {!newCatOpen ? (
                      <button
                        type="button"
                        className="chip-sel tip"
                        data-tip="Crea una subcategoría en este grupo sin salir"
                        style={{ borderStyle: "dashed", color: "var(--muted)" }}
                        onClick={() => setNewCatOpen(true)}
                      >
                        <Icon name="plus" width={2} /> Nueva
                      </button>
                    ) : (
                      <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        <input
                          className="inp"
                          autoFocus
                          value={newCatName}
                          onChange={(e) => setNewCatName(e.target.value)}
                          placeholder="Nombre…"
                          maxLength={60}
                          style={{ padding: "5px 10px", fontSize: 12.5, width: 150 }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void createInlineCategory();
                            }
                            if (e.key === "Escape") setNewCatOpen(false);
                          }}
                        />
                        <button
                          type="button"
                          className="chip-sel"
                          disabled={newCatPending || !newCatName.trim()}
                          onClick={() => void createInlineCategory()}
                        >
                          {newCatPending ? "…" : "Crear"}
                        </button>
                      </span>
                    )}
                  </div>
                ) : null}
              </div>

              {/* Vínculo entidad (Fase 2): 1 tap. Aparece si la categoría lo sugiere. */}
              {linkKind && linkOptions.length > 0 ? (
                <div className="fld">
                  <label className="fld-label">
                    Vincular a {LINK_LABEL[linkKind] ?? "entidad"}
                    {effectiveLinkedId ? (
                      <span className="cmp-picked">
                        {" "}
                        · {linkOptions.find((o) => o.id === effectiveLinkedId)?.name}
                      </span>
                    ) : null}
                  </label>
                  <div className="chip-grid">
                    {linkOptions.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        className={`chip-sel ${effectiveLinkedId === o.id ? "on" : ""}`}
                        onClick={() => {
                          setLinkedId(effectiveLinkedId === o.id ? null : o.id);
                          setTouchedLink(true);
                        }}
                      >
                        {o.name}
                      </button>
                    ))}
                  </div>
                  <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    {linkKind === "debt"
                      ? "El pago también quedará en el historial de la deuda."
                      : linkKind === "goal"
                        ? "El aporte también sumará al avance de la meta."
                        : "La transacción quedará conectada a la entidad."}
                  </p>
                </div>
              ) : null}
            </>
          ) : null}

          {/* Ingreso: fuente (usa categorías de ingreso si existen) */}
          {isIngreso ? (
            <div className="fld">
              <label className="fld-label">Fuente</label>
              <div className="chip-grid">
                {incomeCats.length > 0
                  ? incomeCats.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={`chip-sel ${source === c.name ? "on" : ""}`}
                        onClick={() => {
                          setSource(c.name);
                          setIncomeCatId(c.id);
                        }}
                      >
                        {c.name}
                      </button>
                    ))
                  : INCOME_SOURCES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={`chip-sel ${source === s ? "on" : ""}`}
                        onClick={() => {
                          setSource(s);
                          setIncomeCatId(null);
                        }}
                      >
                        {s}
                      </button>
                    ))}
              </div>
            </div>
          ) : null}

          {/* Cuentas: solo transferencias (el resto usa la predeterminada). */}
          {isTransfer ? (
            <div className="fld-2">
              <div className="fld">
                <label className="fld-label">Desde</label>
                <select
                  className="sel"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="fld">
                <label className="fld-label">Hacia</label>
                <select
                  className="sel"
                  value={toAccountId}
                  onChange={(e) => setToAccountId(e.target.value)}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}

          {/* Fecha y nota, siempre visibles (sin colapso). */}
          <div className="fld-2">
            <div className="fld">
              <label className="fld-label">Fecha</label>
              <input
                className="inp"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="fld">
              <label className="fld-label">Nota</label>
              <input
                className="inp"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Opcional"
              />
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            className={`btn ${isIngreso ? "btn-secondary" : "btn-primary"}`}
            disabled={pending}
          >
            {pending ? (
              "Guardando…"
            ) : (
              <>
                <Icon name="check" width={2} /> Guardar
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
