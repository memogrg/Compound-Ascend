/**
 * EL RITMO DEL MES — motor puro (lib/rhythm/engine.ts).
 *
 * Todo lo de acá decide CUÁNDO la app le habla al usuario, así que cada caso que dispara
 * se prueba junto al que NO dispara. Un recordatorio que aparece de más se silencia a la
 * semana y deja de servir para siempre.
 *
 * Las aserciones van contra las CONSTANTES exportadas y no contra 1/5/28/19 literales:
 * si mañana la ventana pasa a ser de siete días, estos tests siguen siendo verdad en vez
 * de romperse en masa.
 */
import { describe, it, expect } from "vitest";

import {
  VENTANA_PRIMER_DIA,
  VENTANA_ULTIMO_DIA,
  CIERRE_PRIMER_DIA,
  RECORDATORIO_HORA,
  estadoVentana,
  copyDiasRestantes,
  enDiasDeCierre,
  pendientesDeCierre,
  tocaRecordatorioDiario,
  mostrarNudgeDiario,
  nombreMes,
  nombreMesCap,
  diaDe,
  periodoDe,
} from "@/lib/rhythm/engine";

describe("estadoVentana · la ventana de configuración", () => {
  it("está abierta durante los días de ventana", () => {
    for (let dia = VENTANA_PRIMER_DIA; dia <= VENTANA_ULTIMO_DIA; dia++) {
      const v = estadoVentana({ dia, closedAt: null });
      expect(v.abierta, `día ${dia}`).toBe(true);
      expect(v.estado).toBe("abierta");
    }
  });

  it("se vence al día siguiente del último de ventana", () => {
    const v = estadoVentana({ dia: VENTANA_ULTIMO_DIA + 1, closedAt: null });
    expect(v.abierta).toBe(false);
    expect(v.estado).toBe("vencida");
    expect(v.diasRestantes).toBe(0);
  });

  it("cuenta HOY entre los días restantes: el último día queda 1, no 0", () => {
    expect(estadoVentana({ dia: VENTANA_ULTIMO_DIA, closedAt: null }).diasRestantes).toBe(1);
    expect(estadoVentana({ dia: VENTANA_PRIMER_DIA, closedAt: null }).diasRestantes).toBe(
      VENTANA_ULTIMO_DIA,
    );
  });

  it("cerrar a mano gana sobre el calendario, incluso dentro de la ventana", () => {
    // Cerrar el día 2 es una decisión del hogar ("ya está, así queda el mes"), no un
    // error a desautorizar. Si el calendario ganara, el botón de cerrar sería decorativo.
    const v = estadoVentana({ dia: VENTANA_PRIMER_DIA + 1, closedAt: "2026-08-02T10:00:00Z" });
    expect(v.abierta).toBe(false);
    expect(v.estado).toBe("cerrada_por_el_usuario");
  });

  it("distingue 'la cerraste vos' de 'se venció' — merecen copys distintos", () => {
    const cerrada = estadoVentana({ dia: 2, closedAt: "2026-08-02T10:00:00Z" });
    const vencida = estadoVentana({ dia: 20, closedAt: null });
    expect(cerrada.estado).not.toBe(vencida.estado);
  });
});

describe("copyDiasRestantes · el contador, sin alarmismo", () => {
  it("el último día se dice en palabras, no como '1 día'", () => {
    expect(copyDiasRestantes(1)).toContain("último día");
    expect(copyDiasRestantes(1)).not.toContain("1 día");
  });

  it("con varios días usa el plural", () => {
    expect(copyDiasRestantes(3)).toContain("3 días");
  });

  it("sin días restantes no dice nada (cadena vacía, no un '0 días')", () => {
    expect(copyDiasRestantes(0)).toBe("");
    expect(copyDiasRestantes(-1)).toBe("");
  });

  it("nunca es alarmista: sin signos de admiración", () => {
    for (const n of [1, 2, 3, 5]) expect(copyDiasRestantes(n)).not.toContain("!");
  });
});

describe("enDiasDeCierre · el ritual de fin de mes", () => {
  it("arranca el día de cierre y no antes", () => {
    expect(enDiasDeCierre({ dia: CIERRE_PRIMER_DIA - 1, year: 2026, month: 8 })).toBe(false);
    expect(enDiasDeCierre({ dia: CIERRE_PRIMER_DIA, year: 2026, month: 8 })).toBe(true);
  });

  it("llega hasta el último día real del mes: 31 en agosto, 30 en abril", () => {
    expect(enDiasDeCierre({ dia: 31, year: 2026, month: 8 })).toBe(true);
    expect(enDiasDeCierre({ dia: 30, year: 2026, month: 4 })).toBe(true);
    // El 31 de abril no existe: si esto pasara, el tope sería un 31 fijo y no el mes real.
    expect(enDiasDeCierre({ dia: 31, year: 2026, month: 4 })).toBe(false);
  });

  it("febrero no bisiesto cierra el 28; el 29 no existe", () => {
    expect(enDiasDeCierre({ dia: 28, year: 2026, month: 2 })).toBe(true);
    expect(enDiasDeCierre({ dia: 29, year: 2026, month: 2 })).toBe(false);
  });

  it("febrero bisiesto sí llega al 29", () => {
    expect(enDiasDeCierre({ dia: 29, year: 2028, month: 2 })).toBe(true);
  });
});

describe("pendientesDeCierre · qué falta para cerrar el mes", () => {
  const cero = {
    metasSinAporte: 0,
    deudasSinPago: 0,
    sobresSinMovimiento: 0,
    transaccionesSinSobre: 0,
  };

  it("sin pendientes devuelve la lista vacía — no se inventa un 'todo en orden'", () => {
    expect(pendientesDeCierre(cero)).toEqual([]);
  });

  it("omite los conteos en cero: '0 metas pendientes' es ruido", () => {
    const out = pendientesDeCierre({ ...cero, metasSinAporte: 2 });
    expect(out).toHaveLength(1);
    expect(out[0]?.clave).toBe("metas");
  });

  it("concuerda en singular y plural", () => {
    expect(pendientesDeCierre({ ...cero, metasSinAporte: 1 })[0]?.texto).toContain(
      "1 meta sin su aporte",
    );
    expect(pendientesDeCierre({ ...cero, metasSinAporte: 3 })[0]?.texto).toContain(
      "3 metas sin su aporte",
    );
    expect(pendientesDeCierre({ ...cero, deudasSinPago: 1 })[0]?.texto).toContain("1 cuota");
    expect(pendientesDeCierre({ ...cero, deudasSinPago: 2 })[0]?.texto).toContain("2 cuotas");
  });

  it("deja los sobres sin movimientos de último: es lo menos urgente y puede ser normal", () => {
    // Un sobre sin movimientos puede ser el seguro que se paga en marzo. Va al final para
    // que lo accionable de verdad (metas, cuotas, movimientos sin sobre) se lea primero.
    const out = pendientesDeCierre({
      metasSinAporte: 1,
      deudasSinPago: 1,
      sobresSinMovimiento: 1,
      transaccionesSinSobre: 1,
    });
    expect(out).toHaveLength(4);
    expect(out[out.length - 1]?.clave).toBe("sobres_sin_uso");
  });

  it("cada pendiente sabe adónde se va a resolverlo", () => {
    const out = pendientesDeCierre({
      metasSinAporte: 1,
      deudasSinPago: 1,
      sobresSinMovimiento: 1,
      transaccionesSinSobre: 1,
    });
    for (const p of out) expect(p.ruta.startsWith("/")).toBe(true);
  });
});

describe("tocaRecordatorioDiario · el correo de las 19:00", () => {
  const base = { horaLocal: RECORDATORIO_HORA, movimientosHoy: 0, yaNotificadoHoy: false };

  it("dispara a la hora exacta si no registró nada", () => {
    expect(tocaRecordatorioDiario(base)).toBe(true);
  });

  it("NO molesta a quien ya registró algo hoy — la regla que lo separa de una alarma", () => {
    expect(tocaRecordatorioDiario({ ...base, movimientosHoy: 1 })).toBe(false);
  });

  it("no se repite si ya se notificó hoy", () => {
    expect(tocaRecordatorioDiario({ ...base, yaNotificadoHoy: true })).toBe(false);
  });

  it("el correo exige la hora EXACTA: el cron pasa una vez por hora", () => {
    expect(tocaRecordatorioDiario({ ...base, horaLocal: RECORDATORIO_HORA - 1 })).toBe(false);
    expect(tocaRecordatorioDiario({ ...base, horaLocal: RECORDATORIO_HORA + 1 })).toBe(false);
  });
});

describe("mostrarNudgeDiario · el pop-up in-app, más laxo que el correo", () => {
  it("sigue visible después de la hora: quien abre la app a las 21:30 también cuenta", () => {
    // Exigir la hora exacta acá lo haría invisible para casi todo el mundo — el usuario
    // tendría que abrir la app justo dentro de esa hora.
    expect(mostrarNudgeDiario({ horaLocal: RECORDATORIO_HORA + 2, movimientosHoy: 0 })).toBe(true);
    expect(
      tocaRecordatorioDiario({
        horaLocal: RECORDATORIO_HORA + 2,
        movimientosHoy: 0,
        yaNotificadoHoy: false,
      }),
    ).toBe(false);
  });

  it("no aparece antes de la hora ni si ya registró", () => {
    expect(mostrarNudgeDiario({ horaLocal: RECORDATORIO_HORA - 1, movimientosHoy: 0 })).toBe(false);
    expect(mostrarNudgeDiario({ horaLocal: RECORDATORIO_HORA, movimientosHoy: 2 })).toBe(false);
  });
});

describe("helpers de fecha y mes", () => {
  it("extrae día y período de un 'YYYY-MM-DD' sin pasar por Date", () => {
    // Sin `new Date(iso)`: eso lo interpretaría como UTC y en zonas negativas daría el
    // día anterior — justo el bug que este módulo existe para evitar.
    expect(diaDe("2026-08-13")).toBe(13);
    expect(periodoDe("2026-08-13")).toEqual({ year: 2026, month: 8 });
  });

  it("nombra los meses en minúscula para la frase y capitalizado para el título", () => {
    expect(nombreMes(8)).toBe("agosto");
    expect(nombreMesCap(8)).toBe("Agosto");
    expect(nombreMes(1)).toBe("enero");
    expect(nombreMes(12)).toBe("diciembre");
  });

  it("un mes fuera de rango devuelve cadena vacía, no 'undefined' en la UI", () => {
    expect(nombreMes(0)).toBe("");
    expect(nombreMes(13)).toBe("");
    expect(nombreMesCap(13)).toBe("");
  });
});
