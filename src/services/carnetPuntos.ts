/**
 * Cálculo del Carnet de Puntos.
 *
 * El saldo de cada alumno se obtiene repasando EN ORDEN DE FECHA todo lo que le ha ocurrido,
 * de modo que el resultado es siempre el mismo en todos los dispositivos y solo depende de
 * datos que se guardan en Google Drive (partes y medidas restaurativas):
 *
 *  - Saldo inicial: 10 puntos.
 *  - Parte con puntos: resta sus puntos (mínimo 0).
 *  - Medida educativa/restaurativa cumplida: suma sus puntos (máximo 10).
 *  - Ajuste manual (Jefatura/Convivencia, sin parte; compensación con puntos negativos): resta
 *    sus puntos (mínimo 0). NO reinicia el contador de recuperación semanal (decisión de Miguel Ángel 4/11/2026).
 *    Los ajustes anulados no cuentan.
 *  - Recuperación semanal automática: cada 7 días naturales seguidos sin ningún parte que
 *    reste puntos, +1 punto (máximo 10). El contador se reinicia con cada parte que resta
 *    puntos; los registros de 0 puntos no lo interrumpen. Se aplica al empezar el día 7.
 *    Solo para la ESO: el alumnado de FP Básica, ciclos de FP y Bachillerato deja de recuperar desde
 *    el día siguiente a FECHA_FIN_RECUPERACION_NO_ESO (decisión de Miguel Ángel 12/11/2026). Lo que ya
 *    había recuperado hasta ese día se mantiene (no es retroactivo).
 */

import { Sancion, Compensacion, MovimientoPuntos, ExpedienteSancion } from '../types/convivencia';

export const SALDO_INICIAL = 10;
export const SALDO_MAXIMO = 10;
export const DIAS_RECUPERACION = 7;
/**
 * Último día en que el alumnado que no es de ESO (FP Básica, ciclos, Bachillerato) recupera el punto
 * semanal. Debe ser el día en que el cambio se pasa a la app del centro.
 */
export const FECHA_FIN_RECUPERACION_NO_ESO = '2026-11-12';

/** Grupos de ESO (1ESO_A … 4ESO_D, o escritos como «1º ESO A»). */
export function esGrupoESO(grupo?: string): boolean {
  return /^\s*[1-4]\s*[ºª°]?\s*[-_ ]?\s*ESO/i.test(grupo || '');
}

/** ¿Tiene recuperación semanal este grupo? La ESO, siempre; el resto, solo hasta FECHA_FIN_RECUPERACION_NO_ESO. */
export function recuperaSemanalmente(grupo?: string): boolean {
  return grupo === undefined || esGrupoESO(grupo);
}

const MIN_POR_DIA = 24 * 60;

export interface ResultadoCarnet {
  saldo: number;
  totalPuntosPerdidos: number;
  totalPuntosRecuperados: number;
  /** Número de partes del alumno (incluye registros de 0 puntos). */
  countSanciones: number;
  /** Veces que el saldo ha pasado de más de 0 a 0 puntos (estar ya a 0 y recibir otro parte no cuenta). */
  vecesSaldoCero: number;
  /** Histórico de movimientos, del más reciente al más antiguo. */
  movimientos: MovimientoPuntos[];
  /** Saldo justo antes y justo después de cada parte. */
  saldosPorSancion: Map<string, { saldoAnterior: number; saldoResultante: number }>;
}

/** Número de día (UTC) de una fecha 'YYYY-MM-DD' o ISO. NaN si no es válida. */
export function diaDeFecha(fecha?: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((fecha || '').trim());
  if (!m) return NaN;
  return Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000);
}

function minutosDeHora(hora?: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec((hora || '').trim());
  return m ? Math.min(23, +m[1]) * 60 + Math.min(59, +m[2]) : 8 * 60;
}

function fechaDeDia(dia: number): string {
  return new Date(dia * 86400000).toISOString().split('T')[0];
}

/** Fecha local de hoy como 'YYYY-MM-DD'. */
export function hoyLocal(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

interface Evento {
  t: number; // minutos desde época (día * 1440 + minuto del día)
  orden: string; // desempate estable
  tipo: 'PARTE' | 'MEDIDA';
  sancion?: Sancion;
  compensacion?: Compensacion;
}

const mismoAlumno = (a?: string, b?: string) =>
  (a || '').toLowerCase().trim() === (b || '').toLowerCase().trim();

/**
 * Calcula el carnet de un alumno a partir de sus partes y medidas restaurativas.
 * @param hasta fecha (YYYY-MM-DD) hasta la que se aplican recuperaciones semanales; por defecto hoy.
 * @param grupo grupo del alumno. Si no es de ESO, la recuperación semanal solo se aplica hasta
 *   FECHA_FIN_RECUPERACION_NO_ESO. Sin grupo (desconocido) se aplica como en la ESO.
 */
export function calcularCarnet(
  idAlumno: string,
  sanciones: Sancion[],
  compensaciones: Compensacion[],
  hasta: string = hoyLocal(),
  grupo?: string
): ResultadoCarnet {
  const diaFinRecuperacion = recuperaSemanalmente(grupo) ? Infinity : diaDeFecha(FECHA_FIN_RECUPERACION_NO_ESO);
  const eventos: Evento[] = [];

  for (const s of sanciones) {
    if (!s || !s.id_sancion || !mismoAlumno(s.id_alumno, idAlumno)) continue;
    const dia = diaDeFecha(s.fecha) || diaDeFecha(s.timestamp);
    if (isNaN(dia)) continue;
    eventos.push({
      t: dia * MIN_POR_DIA + minutosDeHora(s.hora_incidente),
      orden: `${s.timestamp || ''}|${s.id_sancion}`,
      tipo: 'PARTE',
      sancion: s,
    });
  }

  for (const c of compensaciones) {
    if (!c || !c.id_compensacion || !mismoAlumno(c.id_alumno, idAlumno) || c.anulada) continue;
    if (!(Number(c.puntos_recuperados) || 0)) continue; // 0 puntos (p. ej. ajuste anulado): no cuenta
    const dia = diaDeFecha(c.fecha_completada) || diaDeFecha(c.timestamp);
    if (isNaN(dia)) continue;
    // Hora local (la de los partes también es hora local), no la hora UTC del timestamp
    const ts = new Date(c.timestamp || '');
    const minutos = isNaN(ts.getTime()) ? 12 * 60 : ts.getHours() * 60 + ts.getMinutes();
    eventos.push({
      t: dia * MIN_POR_DIA + minutos,
      orden: `${c.timestamp || ''}|${c.id_compensacion}`,
      tipo: 'MEDIDA',
      compensacion: c,
    });
  }

  eventos.sort((a, b) => a.t - b.t || a.orden.localeCompare(b.orden));

  let saldo = SALDO_INICIAL;
  let totalPuntosPerdidos = 0;
  let totalPuntosRecuperados = 0;
  let countSanciones = 0;
  const movimientos: MovimientoPuntos[] = [];
  const saldosPorSancion = new Map<string, { saldoAnterior: number; saldoResultante: number }>();

  // Día del último parte que restó puntos (desde él se cuentan las semanas) y semanas ya aplicadas
  let diaUltimoParte: number | null = null;
  let semanasAplicadas = 0;

  const aplicarRecuperacionesHasta = (tLimite: number) => {
    if (diaUltimoParte === null) return;
    for (;;) {
      const diaRecuperacion = diaUltimoParte + DIAS_RECUPERACION * (semanasAplicadas + 1);
      if (diaRecuperacion * MIN_POR_DIA > tLimite) return;
      if (diaRecuperacion > diaFinRecuperacion) return; // FP Básica, ciclos y Bachillerato: ya no recuperan
      semanasAplicadas++;
      if (saldo >= SALDO_MAXIMO) continue; // con el carnet lleno no hay nada que recuperar
      const anterior = saldo;
      saldo = Math.min(SALDO_MAXIMO, saldo + 1);
      totalPuntosRecuperados += saldo - anterior;
      movimientos.push({
        id_movimiento: `rec-${idAlumno}-${diaRecuperacion}`,
        id_alumno: idAlumno,
        fecha: fechaDeDia(diaRecuperacion),
        tipo: 'RECUPERACION_SEMANAL',
        conducta_titulo: 'Recuperación semanal sin nuevas incidencias',
        puntos: 1,
        profesor_nombre: 'Automático',
        saldo_anterior: anterior,
        saldo_resultante: saldo,
        detalles: `${DIAS_RECUPERACION} días consecutivos sin partes que resten puntos (+1 pt)`,
      });
    }
  };

  for (const ev of eventos) {
    aplicarRecuperacionesHasta(ev.t);

    if (ev.tipo === 'PARTE' && ev.sancion) {
      const s = ev.sancion;
      countSanciones++;
      const puntos = Math.max(0, Number(s.puntos_restados) || 0);
      const anterior = saldo;
      saldo = Math.max(0, saldo - puntos);
      totalPuntosPerdidos += puntos;
      saldosPorSancion.set(s.id_sancion, { saldoAnterior: anterior, saldoResultante: saldo });
      if (puntos > 0) {
        diaUltimoParte = Math.floor(ev.t / MIN_POR_DIA);
        semanasAplicadas = 0;
      }
      movimientos.push({
        id_movimiento: `parte-${s.id_sancion}`,
        id_alumno: idAlumno,
        fecha: s.fecha,
        tipo: 'PARTE',
        conducta_titulo: s.codigo_infraccion,
        puntos: -puntos,
        profesor_nombre: s.nombre_profesor,
        saldo_anterior: anterior,
        saldo_resultante: saldo,
        detalles: s.descripcion_hechos,
      });
    } else if (ev.tipo === 'MEDIDA' && ev.compensacion && esAjusteManual(ev.compensacion)) {
      const c = ev.compensacion;
      const puntos = Math.abs(Number(c.puntos_recuperados) || 0);
      const anterior = saldo;
      saldo = Math.max(0, saldo - puntos);
      totalPuntosPerdidos += anterior - saldo;
      // No reinicia la recuperación semanal: sigue contando desde el último parte que restó puntos
      movimientos.push({
        id_movimiento: `ajuste-${c.id_compensacion}`,
        id_compensacion: c.id_compensacion,
        id_alumno: idAlumno,
        fecha: (c.fecha_completada || c.timestamp || '').split('T')[0],
        tipo: 'AJUSTE_MANUAL',
        conducta_titulo: 'Ajuste manual de puntos (sin parte)',
        puntos: -puntos,
        profesor_nombre: c.nombre_profesor_autoriza || 'Jefatura / Convivencia',
        saldo_anterior: anterior,
        saldo_resultante: saldo,
        detalles: c.descripcion_tarea,
      });
    } else if (ev.tipo === 'MEDIDA' && ev.compensacion) {
      const c = ev.compensacion;
      const puntos = Math.max(0, Number(c.puntos_recuperados) || 0);
      const anterior = saldo;
      saldo = Math.min(SALDO_MAXIMO, saldo + puntos);
      totalPuntosRecuperados += saldo - anterior;
      movimientos.push({
        id_movimiento: `medida-${c.id_compensacion}`,
        id_alumno: idAlumno,
        fecha: (c.fecha_completada || c.timestamp || '').split('T')[0],
        tipo: 'MEDIDA_RESTAURATIVA',
        conducta_titulo: 'Medida educativa/restaurativa cumplida',
        puntos,
        profesor_nombre: c.nombre_profesor_autoriza,
        saldo_anterior: anterior,
        saldo_resultante: saldo,
        detalles: c.descripcion_tarea,
      });
    }
  }

  const diaHasta = diaDeFecha(hasta);
  if (!isNaN(diaHasta)) {
    aplicarRecuperacionesHasta(diaHasta * MIN_POR_DIA + MIN_POR_DIA - 1);
  }

  return {
    saldo,
    totalPuntosPerdidos,
    totalPuntosRecuperados,
    countSanciones,
    vecesSaldoCero: contarVecesSaldoCero(movimientos),
    movimientos: movimientos.reverse(),
    saldosPorSancion,
  };
}

/**
 * Veces que el saldo ha llegado a 0: movimientos que lo dejan en 0 viniendo de más de 0.
 * Los ajustes manuales («Quitar puntos sin parte») no cuentan: sirven para mantener a 0 a quien
 * recuperó un punto por la regla semanal mientras se tramita su sanción (es la misma vez a 0).
 */
export function contarVecesSaldoCero(movimientos: MovimientoPuntos[]): number {
  return movimientos.filter((m) => m.tipo !== 'AJUSTE_MANUAL' && Number(m.saldo_anterior) > 0 && Number(m.saldo_resultante) === 0).length;
}

export interface HistoricoSancionesAlumno {
  /** Expedientes de sanción abiertos al alumno. */
  sanciones: number;
  /** Veces que se ha quedado a 0 puntos. */
  vecesSaldoCero: number;
}

const claveAlumno = (id?: string) => (id || '').toLowerCase().trim();

/**
 * Histórico de sanciones de cada alumno: nº de expedientes de sanción y nº de veces a 0 puntos.
 * Agrupa primero por alumno para no repasar todos los partes una vez por alumno.
 * Para consultar, usar `historicoDe(mapa, idAlumno)`.
 * @param grupoDe grupo de cada alumno (para saber si tiene recuperación semanal).
 */
export function historicoSancionesPorAlumno(
  sanciones: Sancion[],
  compensaciones: Compensacion[],
  expedientes: ExpedienteSancion[],
  grupoDe?: (idAlumno: string) => string | undefined,
  hasta: string = hoyLocal()
): Map<string, HistoricoSancionesAlumno> {
  const partes = new Map<string, Sancion[]>();
  const medidas = new Map<string, Compensacion[]>();
  const ids = new Map<string, string>();
  for (const s of sanciones) {
    if (!s || !s.id_sancion) continue;
    const k = claveAlumno(s.id_alumno);
    if (!k) continue;
    (partes.get(k) || partes.set(k, []).get(k)!).push(s);
    if (!ids.has(k)) ids.set(k, s.id_alumno);
  }
  for (const c of compensaciones) {
    if (!c || !c.id_compensacion) continue;
    const k = claveAlumno(c.id_alumno);
    if (!k) continue;
    (medidas.get(k) || medidas.set(k, []).get(k)!).push(c);
  }
  const resultado = new Map<string, HistoricoSancionesAlumno>();
  for (const [k, ps] of partes) {
    const id = ids.get(k) || k;
    const r = calcularCarnet(id, ps, medidas.get(k) || [], hasta, grupoDe ? grupoDe(id) : undefined);
    if (r.vecesSaldoCero > 0) resultado.set(k, { sanciones: 0, vecesSaldoCero: r.vecesSaldoCero });
  }
  for (const e of expedientes) {
    if (!e || !e.id_expediente) continue;
    const k = claveAlumno(e.id_alumno);
    if (!k) continue;
    const h = resultado.get(k) || { sanciones: 0, vecesSaldoCero: 0 };
    h.sanciones++;
    resultado.set(k, h);
  }
  return resultado;
}

export function historicoDe(mapa: Map<string, HistoricoSancionesAlumno>, idAlumno: string): HistoricoSancionesAlumno {
  return mapa.get(claveAlumno(idAlumno)) || { sanciones: 0, vecesSaldoCero: 0 };
}

/** Un ajuste manual se guarda como compensación con puntos negativos. */
export function esAjusteManual(c?: Compensacion | null): boolean {
  return !!c && (Number(c.puntos_recuperados) || 0) < 0;
}

export function estadoPorSaldo(saldo: number): 'ACTIVO' | 'ALERTA_PUNTOS' | 'SALDO_CERO' {
  if (saldo === 0) return 'SALDO_CERO';
  if (saldo <= 3) return 'ALERTA_PUNTOS';
  return 'ACTIVO';
}
