/**
 * EL RITMO DEL MES — detectores (lib/rhythm/detectors.ts) y su integración con la
 * campana.
 *
 * Lo que más importa acá no es que emitan, sino que DEJEN de emitir: `syncInsights`
 * marca 'resuelto' todo activo que no venga en la pasada, así que "no emitir" es
 * exactamente el mecanismo por el que una tarjeta se cierra sola. Cada detector se
 * prueba en su condición de silencio.
 */
import { describe, it, expect } from "vitest";

import {
  detectVentanaPresupuesto,
  detectCierreMes,
  detectRegistroDiario,
} from "@/lib/rhythm/detectors";
import { VENTANA_ULTIMO_DIA, CIERRE_PRIMER_DIA, RECORDATORIO_HORA } from "@/lib/rhythm/engine";
import { suggestedAction } from "@/lib/insights/actions";
import { INSIGHT_RELATED_KINDS } from "@/lib/insights/types";

const ventanaBase = {
  dia: 2,
  year: 2026,
  month: 8,
  closedAt: null,
  sobresConPresupuesto: 4,
};

describe("detectVentanaPresupuesto", () => {
  it("emite mientras la ventana esté abierta, con el mes en el título", () => {
    const out = detectVentanaPresupuesto(ventanaBase);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe("ventana_presupuesto");
    expect(out[0]?.title).toContain("agosto");
  });

  it("se auto-resuelve al vencerse la ventana: deja de emitir", () => {
    expect(detectVentanaPresupuesto({ ...ventanaBase, dia: VENTANA_ULTIMO_DIA + 1 })).toEqual([]);
  });

  it("calla si el hogar ya cerró la configuración — insistir es no escuchar", () => {
    expect(detectVentanaPresupuesto({ ...ventanaBase, closedAt: "2026-08-02T10:00:00Z" })).toEqual(
      [],
    );
  });

  it("cambia el TONO según haya sobres o no, pero avisa en los dos casos", () => {
    // Con cero sobres el mes está en blanco (mensaje de arranque); con sobres ya puestos
    // es una invitación a repasar — el caso de quien copió del mes anterior.
    const enBlanco = detectVentanaPresupuesto({ ...ventanaBase, sobresConPresupuesto: 0 });
    const conSobres = detectVentanaPresupuesto(ventanaBase);
    expect(enBlanco).toHaveLength(1);
    expect(conSobres).toHaveLength(1);
    expect(enBlanco[0]?.body).not.toBe(conSobres[0]?.body);
    expect(enBlanco[0]?.body).toContain("Todavía no repartiste");
  });

  it("copiar del mes anterior NO cierra la ventana: sigue avisando", () => {
    // Copiar es un punto de partida, no una decisión final. El usuario copia el día 1 y
    // sigue ajustando hasta el 5.
    const out = detectVentanaPresupuesto({ ...ventanaBase, dia: 1, sobresConPresupuesto: 12 });
    expect(out).toHaveLength(1);
  });
});

const conteosCero = {
  metasSinAporte: 0,
  deudasSinPago: 0,
  sobresSinMovimiento: 0,
  transaccionesSinSobre: 0,
};

describe("detectCierreMes", () => {
  const base = { dia: CIERRE_PRIMER_DIA, year: 2026, month: 8 };

  it("emite en los días de cierre listando lo que falta", () => {
    const out = detectCierreMes({
      ...base,
      conteos: { ...conteosCero, metasSinAporte: 2, transaccionesSinSobre: 5 },
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.body).toContain("2 metas sin su aporte");
    expect(out[0]?.body).toContain("5 movimientos sin sobre");
    // El CTA de conciliación es parte del mensaje, no una pantalla aparte.
    expect(out[0]?.body).toContain("estado de cuenta");
  });

  it("NO emite si no falta nada: un aviso de 'todo en orden' entrena a ignorar avisos", () => {
    expect(detectCierreMes({ ...base, conteos: conteosCero })).toEqual([]);
  });

  it("no emite fuera de los días de cierre aunque falte de todo", () => {
    expect(
      detectCierreMes({
        ...base,
        dia: CIERRE_PRIMER_DIA - 1,
        conteos: {
          metasSinAporte: 9,
          deudasSinPago: 9,
          sobresSinMovimiento: 9,
          transaccionesSinSobre: 9,
        },
      }),
    ).toEqual([]);
  });

  it("usa la coma española: la 'y' reemplaza a la última coma", () => {
    const out = detectCierreMes({
      ...base,
      conteos: { ...conteosCero, metasSinAporte: 1, deudasSinPago: 1, transaccionesSinSobre: 1 },
    });
    expect(out[0]?.body).toMatch(/, .+ y /);
    expect(out[0]?.body).not.toContain(", y ");
  });

  it("la métrica es el total de pendientes", () => {
    const out = detectCierreMes({
      ...base,
      conteos: { ...conteosCero, metasSinAporte: 2, deudasSinPago: 3 },
    });
    expect(out[0]?.metric).toBe(5);
  });
});

describe("detectRegistroDiario", () => {
  const base = { todayIso: "2026-08-13", horaLocal: RECORDATORIO_HORA, movimientosHoy: 0 };

  it("emite a partir de la hora si no registró nada", () => {
    const out = detectRegistroDiario(base);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe("registro_diario");
  });

  it("se auto-resuelve al registrar algo", () => {
    expect(detectRegistroDiario({ ...base, movimientosHoy: 1 })).toEqual([]);
  });

  it("no aparece antes de la hora", () => {
    expect(detectRegistroDiario({ ...base, horaLocal: RECORDATORIO_HORA - 1 })).toEqual([]);
  });

  it("es 'info', no 'accionar': no hay ningún problema que resolver", () => {
    // La campana ordena por severidad. Un recordatorio en rojo se pondría por encima de
    // una deuda en mora, y ahí el rojo deja de significar algo.
    expect(detectRegistroDiario(base)[0]?.severity).toBe("info");
  });
});

describe("claves de identidad (related_id) · cómo se dedupean y se descartan", () => {
  it("ventana y cierre se anclan al MES: una tarjeta que se actualiza, no cinco apiladas", () => {
    const v = detectVentanaPresupuesto(ventanaBase)[0];
    const c = detectCierreMes({
      dia: CIERRE_PRIMER_DIA,
      year: 2026,
      month: 8,
      conteos: { ...conteosCero, metasSinAporte: 1 },
    })[0];
    expect(v?.relatedId).toBe("ventana:2026-08");
    expect(c?.relatedId).toBe("cierre:2026-08");

    // Estable entre días del mismo mes → el upsert por (kind, related_id) actualiza la
    // misma fila, y descartarla la calla todo el mes.
    expect(detectVentanaPresupuesto({ ...ventanaBase, dia: 4 })[0]?.relatedId).toBe(v?.relatedId);
  });

  it("el recordatorio diario se ancla al DÍA: descartarlo es 'hoy no', no 'nunca más'", () => {
    const hoy = detectRegistroDiario({
      todayIso: "2026-08-13",
      horaLocal: RECORDATORIO_HORA,
      movimientosHoy: 0,
    })[0];
    const manana = detectRegistroDiario({
      todayIso: "2026-08-14",
      horaLocal: RECORDATORIO_HORA,
      movimientosHoy: 0,
    })[0];
    expect(hoy?.relatedId).toBe("registro:2026-08-13");
    expect(hoy?.relatedId).not.toBe(manana?.relatedId);
  });

  it("las claves NO son uuids — por eso la columna tuvo que pasar a text", () => {
    // `user_insights.related_id` nació `uuid` y eso hacía fallar el upsert COMPLETO de la
    // pasada (invalid input syntax for type uuid), dejando al usuario sin ningún insight.
    // Se ensanchó a text en la migración 20260813000001. Este test fija la expectativa:
    // si alguien vuelve a estrechar la columna, acá queda escrito por qué no se puede.
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const claves = [
      detectVentanaPresupuesto(ventanaBase)[0]?.relatedId,
      detectCierreMes({
        dia: CIERRE_PRIMER_DIA,
        year: 2026,
        month: 8,
        conteos: { ...conteosCero, metasSinAporte: 1 },
      })[0]?.relatedId,
      detectRegistroDiario({
        todayIso: "2026-08-13",
        horaLocal: RECORDATORIO_HORA,
        movimientosHoy: 0,
      })[0]?.relatedId,
    ];
    for (const k of claves) {
      expect(k).toBeTruthy();
      expect(uuid.test(k!)).toBe(false);
    }
  });

  it("ninguno inventa un relatedKind: no cuelgan de una entidad", () => {
    // `related_kind` SÍ tiene check en la BD. Emitir un valor fuera de la lista abortaría
    // la pasada entera — es el bug que arregló 20260810000001 con 'holding'.
    const todos = [
      ...detectVentanaPresupuesto(ventanaBase),
      ...detectCierreMes({
        dia: CIERRE_PRIMER_DIA,
        year: 2026,
        month: 8,
        conteos: { ...conteosCero, metasSinAporte: 1 },
      }),
      ...detectRegistroDiario({
        todayIso: "2026-08-13",
        horaLocal: RECORDATORIO_HORA,
        movimientosHoy: 0,
      }),
    ];
    expect(todos.length).toBeGreaterThan(0);
    for (const i of todos) {
      expect(i.relatedKind === undefined || INSIGHT_RELATED_KINDS.includes(i.relatedKind)).toBe(
        true,
      );
    }
  });
});

describe("integración con la campana", () => {
  it("los tres kinds tienen acción sugerida y ruta", () => {
    // Sin esto la tarjeta señala un problema y no ofrece salida — el antipatrón que
    // actions.ts existe para evitar.
    for (const kind of ["ventana_presupuesto", "cierre_mes", "registro_diario"] as const) {
      const a = suggestedAction(kind);
      expect(a, kind).toBeDefined();
      expect(a!.route.startsWith("/")).toBe(true);
      expect(a!.label.length).toBeGreaterThan(0);
    }
  });
});
