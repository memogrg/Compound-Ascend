"use client";

/**
 * "LO QUE RECUERDO DE VOS" — la pantalla donde el usuario administra la memoria personal del
 * asesor (`user_memory`).
 *
 * No es una preferencia opcional: si el asesor va a recordar cosas de la vida de alguien para
 * siempre, esa persona tiene que poder VER exactamente qué recuerda, corregirlo cuando el
 * extractor entendió mal, olvidarlo de a uno o borrarlo todo. Sin esta pantalla la memoria no
 * debería existir.
 *
 * UNA sola implementación para web y móvil; `skin` cambia las clases, no el comportamiento —
 * mismo molde que `ReferralCard`. Las acciones se importan de `api/actions` directamente (no del
 * barrel del módulo: el barrel arrastra server-only y rompe el build del cliente).
 */
import { useMemo, useState, useTransition } from "react";

import {
  updateMemoryFactAction,
  forgetMemoryFactAction,
  deleteMemoryFactAction,
  clearMyMemoryAction,
  type MemoryItem,
} from "@/modules/assistant/api/actions";
import { MEMORY_CATEGORY_LABEL, MAX_FACT_LEN } from "@/lib/ai/memory-facts";

type Skin = "web" | "mobile";

/** Clases por piel. Solo estética: el flujo es idéntico en los dos lados. */
function clases(skin: Skin) {
  const m = skin === "mobile";
  return {
    btnPrimary: m ? "m-btn m-btn-primary" : "btn btn-primary",
    btnSecondary: m ? "m-btn m-btn-secondary" : "btn btn-secondary",
    btnDanger: m ? "m-btn m-btn-secondary mem-danger" : "btn btn-secondary mem-danger",
    input: m ? "m-inp" : "inp",
  };
}

export function MemoryPanel({ items, skin = "web" }: { items: MemoryItem[]; skin?: Skin }) {
  // Copia local: cada acción confirma contra el servidor y después ajusta la lista, así la
  // pantalla no queda mostrando algo que ya no existe hasta el próximo render del servidor.
  const [lista, setLista] = useState<MemoryItem[]>(items);
  const [editando, setEditando] = useState<string | null>(null);
  const [borrador, setBorrador] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmandoTodo, setConfirmandoTodo] = useState(false);
  const [verArchivados, setVerArchivados] = useState(false);
  const [pending, start] = useTransition();
  const c = clases(skin);

  const activos = useMemo(() => lista.filter((i) => i.status === "activa"), [lista]);
  const archivados = useMemo(() => lista.filter((i) => i.status === "archivada"), [lista]);

  const guardar = (id: string) => {
    const texto = borrador.trim();
    setError(null);
    start(async () => {
      const res = await updateMemoryFactAction(id, texto);
      if (!res.ok) {
        setError(res.message ?? "No pudimos guardarlo.");
        return;
      }
      setLista((l) => l.map((i) => (i.id === id ? { ...i, fact: texto } : i)));
      setEditando(null);
    });
  };

  const olvidar = (id: string) => {
    setError(null);
    start(async () => {
      const res = await forgetMemoryFactAction(id);
      if (!res.ok) {
        setError(res.message ?? "No pudimos olvidarlo.");
        return;
      }
      setLista((l) => l.map((i) => (i.id === id ? { ...i, status: "archivada" } : i)));
    });
  };

  const borrar = (id: string) => {
    setError(null);
    start(async () => {
      const res = await deleteMemoryFactAction(id);
      if (!res.ok) {
        setError(res.message ?? "No pudimos borrarlo.");
        return;
      }
      setLista((l) => l.filter((i) => i.id !== id));
    });
  };

  const borrarTodo = () => {
    setError(null);
    start(async () => {
      const res = await clearMyMemoryAction();
      if (!res.ok) {
        setError(res.message ?? "No pudimos borrar tu memoria.");
        return;
      }
      setLista([]);
      setConfirmandoTodo(false);
    });
  };

  const fila = (i: MemoryItem, archivado: boolean) => (
    <li key={i.id} className={archivado ? "mem-row mem-row-off" : "mem-row"}>
      {editando === i.id ? (
        <div className="mem-edit">
          <input
            className={c.input}
            value={borrador}
            maxLength={MAX_FACT_LEN}
            onChange={(e) => setBorrador(e.target.value)}
            aria-label="Texto del recuerdo"
          />
          <div className="mem-actions">
            <button className={c.btnSecondary} onClick={() => setEditando(null)} disabled={pending}>
              Cancelar
            </button>
            <button className={c.btnPrimary} onClick={() => guardar(i.id)} disabled={pending}>
              Guardar
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mem-text">
            <span className="mem-chip">{MEMORY_CATEGORY_LABEL[i.category]}</span>
            <span>{i.fact}</span>
          </div>
          <div className="mem-actions">
            {!archivado ? (
              <>
                <button
                  className={c.btnSecondary}
                  onClick={() => {
                    setEditando(i.id);
                    setBorrador(i.fact);
                    setError(null);
                  }}
                  disabled={pending}
                >
                  Editar
                </button>
                <button className={c.btnSecondary} onClick={() => olvidar(i.id)} disabled={pending}>
                  Olvidar
                </button>
              </>
            ) : null}
            <button className={c.btnDanger} onClick={() => borrar(i.id)} disabled={pending}>
              Borrar
            </button>
          </div>
        </>
      )}
    </li>
  );

  return (
    <div className={skin === "mobile" ? "mem-panel mem-panel-m" : "mem-panel"}>
      {activos.length === 0 ? (
        <p className="mem-empty">
          Todavía no hay nada. A medida que le contés cosas de tu vida en el chat (tu familia, tus
          planes, tus reglas propias), el asesor las va a recordar acá. Los montos no se guardan
          nunca: esos se leen en vivo de tu cuenta.
        </p>
      ) : (
        <ul className="mem-list">{activos.map((i) => fila(i, false))}</ul>
      )}

      {error ? (
        <p className="mem-error" role="alert">
          {error}
        </p>
      ) : null}

      {archivados.length > 0 ? (
        <div className="mem-archived">
          <button
            className="mem-toggle"
            onClick={() => setVerArchivados((v) => !v)}
            aria-expanded={verArchivados}
          >
            {verArchivados ? "Ocultar" : "Ver"} lo que ya no uso ({archivados.length})
          </button>
          {verArchivados ? (
            <ul className="mem-list">{archivados.map((i) => fila(i, true))}</ul>
          ) : null}
        </div>
      ) : null}

      {lista.length > 0 ? (
        <div className="mem-clear">
          {confirmandoTodo ? (
            <>
              <p className="mem-warn">
                Se borra todo lo que el asesor sabe de tu vida y no se puede recuperar. Tus datos
                financieros no se tocan.
              </p>
              <div className="mem-actions">
                <button
                  className={c.btnSecondary}
                  onClick={() => setConfirmandoTodo(false)}
                  disabled={pending}
                >
                  Mejor no
                </button>
                <button className={c.btnDanger} onClick={borrarTodo} disabled={pending}>
                  Sí, borrar todo
                </button>
              </div>
            </>
          ) : (
            <button
              className={c.btnDanger}
              onClick={() => setConfirmandoTodo(true)}
              disabled={pending}
            >
              Borrar toda mi memoria
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
