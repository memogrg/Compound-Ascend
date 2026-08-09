/**
 * EL RITMO DEL MES — barrel del SERVIDOR.
 *
 * ⚠ NO importar esto desde un client component. Reexporta `rhythm-service`, que lleva
 * `import "server-only"`, y arrastrarlo a un bundle de cliente rompe el build (y no
 * siempre en local: se cae en CI). Los componentes cliente importan las funciones puras
 * directo de `@/lib/rhythm/engine`, que no tiene IO ni `server-only`.
 */
export {
  VENTANA_PRIMER_DIA,
  VENTANA_ULTIMO_DIA,
  CIERRE_PRIMER_DIA,
  RECORDATORIO_HORA,
  nombreMes,
  nombreMesCap,
  diaDe,
  periodoDe,
  estadoVentana,
  copyDiasRestantes,
  enDiasDeCierre,
  pendientesDeCierre,
  tocaRecordatorioDiario,
  mostrarNudgeDiario,
  type Ventana,
  type VentanaEstado,
  type PendienteCierre,
} from "@/lib/rhythm/engine";

export {
  RITMO_MARGEN_PUNTOS,
  RITMO_PESO_MINIMO,
  detectarRitmo,
  textoDiagnostico,
  textoSalida,
  semanaISO,
  type SobrePace,
  type SalidaRitmo,
  type SenalRitmo,
} from "@/lib/rhythm/spend-pace";

export {
  detectVentanaPresupuesto,
  detectCierreMes,
  detectRegistroDiario,
  detectRitmoSobre,
} from "@/lib/rhythm/detectors";

export {
  getMonthConfig,
  setMonthConfigClosed,
  getVentana,
  recordLateBudgetEdit,
  getLateEditCounts,
  contarMovimientosHoy,
  contarSobresConPresupuesto,
  getConteosCierre,
  getRhythmState,
  silenciarNudgeHoy,
  getSenalesRitmo,
  moverPresupuestoEntreSobres,
  type MonthConfig,
  type LateEditCount,
  type ConteosCierre,
  type RhythmState,
} from "@/lib/rhythm/rhythm-service";

export {
  reclamarEnvio,
  yaNotificadoHoy,
  type RhythmNotificationKind,
} from "@/lib/rhythm/notification-log";
