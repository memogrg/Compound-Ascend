"use client";

/**
 * Combobox de SOBRE con búsqueda — ÚNICO selector de sobre del chat (form manual + card de la IA,
 * web y móvil). React puro, sin dependencias. Filtra por subcadena normalizada (acentos/mayúsculas)
 * sobre "frasco + sobre", agrupa por frasco en el orden determinista de selectableSobresByFrasco,
 * y navega por teclado (↑/↓/Enter/Esc) con role listbox/option + aria-activedescendant.
 */
import { Fragment, useEffect, useId, useMemo, useRef, useState } from "react";
import { listSobresForKindAction } from "@/modules/assistant/api/actions";

type SobreOption = { id: string; sobre: string; frasco: string | null };
const labelOf = (s: SobreOption) => (s.frasco ? `${s.frasco} › ${s.sobre}` : s.sobre);
// Misma lógica que normalize() de biblia-knowledge; inline para no arrastrar biblia-corpus al
// bundle del cliente.
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

export function SobreCombobox({
  kind,
  value,
  onChange,
  disabled,
  suggestedPath,
  inputClassName = "sel",
}: {
  kind: "ingreso" | "gasto";
  value: string;
  onChange: (categoryId: string) => void;
  disabled?: boolean;
  suggestedPath?: string | null;
  inputClassName?: string;
}) {
  const [sobres, setSobres] = useState<SobreOption[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const baseId = useId();
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sobres reales del usuario (ya ordenados en la fuente). Best-effort.
  useEffect(() => {
    let alive = true;
    listSobresForKindAction(kind)
      .then((l) => alive && setSobres(l))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [kind]);

  useEffect(() => () => { if (blurTimer.current) clearTimeout(blurTimer.current); }, []);

  const selected = value ? (sobres.find((s) => s.id === value) ?? null) : null;
  const displayLabel = value
    ? selected
      ? labelOf(selected)
      : (suggestedPath ?? "Sobre sugerido")
    : "Sin sobre";

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return sobres;
    return sobres.filter((s) => norm(`${s.frasco ?? ""} ${s.sobre}`).includes(q));
  }, [sobres, query]);

  // Ítems navegables por teclado: 0 = "Sin sobre"; 1..n = sobres filtrados (los headers de frasco
  // NO son navegables).
  const navCount = filtered.length + 1;

  const openList = () => {
    if (disabled) return;
    setOpen(true);
    setQuery("");
    setActive(0);
  };
  const close = () => {
    setOpen(false);
    setQuery("");
  };
  const choose = (id: string) => {
    onChange(id);
    close();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        openList();
        e.preventDefault();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      setActive((a) => Math.min(a + 1, navCount - 1));
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      setActive((a) => Math.max(a - 1, 0));
      e.preventDefault();
    } else if (e.key === "Enter") {
      choose(active === 0 ? "" : (filtered[active - 1]?.id ?? ""));
      e.preventDefault();
    } else if (e.key === "Escape") {
      close();
      e.preventDefault();
    }
  };

  const optionStyle = (isActive: boolean): React.CSSProperties => ({
    padding: "8px 10px",
    fontSize: 13,
    cursor: "pointer",
    background: isActive ? "var(--surface-2, rgba(127,127,127,0.14))" : "transparent",
    color: "var(--ink, #111)",
  });

  return (
    <div style={{ position: "relative" }}>
      <input
        className={inputClassName}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${baseId}-list`}
        aria-activedescendant={open ? `${baseId}-opt-${active}` : undefined}
        aria-autocomplete="list"
        aria-label="Sobre"
        placeholder="Buscá tu sobre…"
        disabled={disabled}
        value={open ? query : displayLabel}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={openList}
        onClick={openList}
        onKeyDown={onKeyDown}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 120);
        }}
      />
      {open ? (
        <ul
          id={`${baseId}-list`}
          role="listbox"
          aria-label="Sobres"
          // Evita que el blur del input dispare antes del click en una opción.
          onMouseDown={(e) => e.preventDefault()}
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 60,
            margin: "4px 0 0",
            padding: 0,
            listStyle: "none",
            maxHeight: 240,
            overflowY: "auto",
            background: "var(--bg, #fff)",
            border: "1px solid var(--line, rgba(0,0,0,0.14))",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.14)",
          }}
        >
          <li
            id={`${baseId}-opt-0`}
            role="option"
            aria-selected={value === ""}
            onClick={() => choose("")}
            onMouseEnter={() => setActive(0)}
            style={optionStyle(active === 0)}
          >
            Sin sobre
          </li>
          {filtered.length === 0 ? (
            <li
              role="presentation"
              style={{ padding: "8px 10px", fontSize: 12, color: "var(--muted, #888)" }}
            >
              No encontré ese sobre
            </li>
          ) : (
            filtered.map((s, i) => {
              const navIndex = i + 1;
              const showHeader = i === 0 || (s.frasco ?? "") !== (filtered[i - 1]?.frasco ?? "");
              return (
                <Fragment key={s.id}>
                  {showHeader ? (
                    <li
                      role="presentation"
                      style={{
                        padding: "7px 10px 2px",
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: 0.2,
                        color: "var(--muted, #888)",
                      }}
                    >
                      {s.frasco ?? "Otros"}
                    </li>
                  ) : null}
                  <li
                    id={`${baseId}-opt-${navIndex}`}
                    role="option"
                    aria-selected={value === s.id}
                    onClick={() => choose(s.id)}
                    onMouseEnter={() => setActive(navIndex)}
                    style={{ ...optionStyle(active === navIndex), paddingLeft: 18 }}
                  >
                    {s.sobre}
                  </li>
                </Fragment>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
