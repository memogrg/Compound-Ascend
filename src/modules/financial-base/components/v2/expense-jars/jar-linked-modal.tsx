"use client";

/**
 * Modal de un frasco vinculado (Libertad/Deudas/Defensa/Ahorro): despliega las
 * entidades reales del módulo origen (inversiones, deudas, pólizas, metas). Si
 * no hay, muestra el texto vacío exacto. CTA deep-link que abre el pop-up de
 * creación del módulo origen (?new=<kind>, lo atrapa useDeepLinkModal allá).
 * Ahorro suma los fondos fijos (Emergencia/Paz) siempre disponibles.
 */
import Link from "next/link";
import { Modal } from "@/components/ui/modal";
import { Icon } from "@/components/ui/icon";
import type { Jar } from "@/modules/financial-base/engine/expense-jars";

const KIND_TITLE: Record<string, string> = {
  holding: "Inversiones del portafolio",
  debt: "Deudas mapeadas",
  policy: "Pólizas activas",
  goal: "Objetivos de ahorro",
};

export function JarLinkedModal({
  jar,
  onClose,
}: {
  jar: Extract<Jar, { kind: "linked" }>;
  onClose: () => void;
}) {
  const hasItems = jar.items.length > 0;
  const fixed = jar.fixedFunds ?? [];

  return (
    <Modal
      title={jar.name}
      sub={KIND_TITLE[jar.linkedKind] ?? "Elementos vinculados"}
      onClose={onClose}
    >
      <div className="modal-body">
        {/* Fondos fijos (solo Ahorro) — siempre disponibles. */}
        {fixed.length > 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              marginBottom: hasItems ? 12 : 0,
            }}
          >
            {fixed.map((f) => (
              <div key={f.name} className="list-row" style={{ gridTemplateColumns: "1fr auto" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{f.name}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>
                    {f.sub}
                  </div>
                </div>
                <span
                  className="chip"
                  style={{ fontSize: 10, background: "var(--chip)", color: "var(--muted)" }}
                >
                  fijo
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {/* Entidades reales o texto vacío exacto. */}
        {hasItems ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {jar.items.map((it) => (
              <div key={it.id} className="list-row" style={{ gridTemplateColumns: "1fr auto" }}>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {it.name}
                  </div>
                  <div className="muted" style={{ fontSize: 11.5 }}>
                    {it.sub}
                  </div>
                </div>
                <span className="tnum" style={{ fontSize: 13, fontWeight: 500 }}>
                  {it.amount}
                </span>
              </div>
            ))}
          </div>
        ) : fixed.length === 0 ? (
          <div className="muted" style={{ padding: "18px 0", textAlign: "center", fontSize: 13 }}>
            {jar.emptyText}
          </div>
        ) : null}
      </div>

      <div className="modal-foot">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cerrar
        </button>
        <Link href={jar.cta.href} className="btn btn-primary" style={{ textDecoration: "none" }}>
          <Icon name="plus" width={2} /> {jar.cta.label}
        </Link>
      </div>
    </Modal>
  );
}
