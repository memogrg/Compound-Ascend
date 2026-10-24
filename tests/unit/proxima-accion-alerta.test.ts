/**
 * La alerta «Próxima mejor acción» de la home móvil llevaba a `/m/patrimonio` fijo:
 * el mismo destino para cualquier consejo, así que la mitad de las veces la persona
 * aterrizaba donde no podía hacer nada con lo que acababa de leer.
 *
 * Lo que muestra es prosa del Priority Engine, sin acción ni ruta detrás (a diferencia
 * de `ProximaAccionFicha`, que sí recibe `plan.hero`). Por eso el destino correcto es
 * /m/mis-acciones: el único lugar donde las recomendaciones se pueden accionar (#770).
 *
 * Se inspecciona el árbol de elementos de React en vez de renderizar: este repo corre
 * vitest en entorno `node`, sin DOM ni testing-library, y para esto no hace falta.
 */
import { describe, it, expect } from "vitest";
import { ProximaAccionAlerta } from "@/app/(mobile)/m/components/home-cards/proxima-accion-alerta";

/** Todo el texto suelto del árbol, en orden. */
function textos(nodo: unknown, out: string[] = []): string[] {
  if (nodo == null || typeof nodo === "boolean") return out;
  if (typeof nodo === "string" || typeof nodo === "number") {
    out.push(String(nodo));
    return out;
  }
  if (Array.isArray(nodo)) {
    for (const n of nodo) textos(n, out);
    return out;
  }
  const el = nodo as { props?: { children?: unknown } };
  if (el.props) textos(el.props.children, out);
  return out;
}

const CONSEJO = "Pagá primero tu tarjeta al 45%: es lo más caro que tenés.";

describe("ProximaAccionAlerta", () => {
  const el = ProximaAccionAlerta({ texto: CONSEJO }) as {
    props: { href: string; children: unknown };
  };

  it("enlaza a /m/mis-acciones", () => {
    expect(el.props.href).toBe("/m/mis-acciones");
  });

  it("no lleva a un destino fijo ajeno al consejo", () => {
    expect(el.props.href).not.toBe("/m/patrimonio");
  });

  it("renderiza el texto que recibe", () => {
    expect(textos(el)).toContain(CONSEJO);
  });

  it("mantiene el rótulo de la tarjeta", () => {
    expect(textos(el)).toContain("Próxima mejor acción");
  });
});
