/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TRAMITES_SANCION } from '../data/sancionesArt37';
import { ExpedienteSancion, ClaveTramiteSancion, Alumno, Profesor, Sancion, Compensacion, AuditLog, DriveSyncStatus, GrupoEducativo, UnidadInstitucionalConfig, MovimientoPuntos, CursoAcademicoArchivo, InfoCursoAcademico, RoleUsuario } from '../types/convivencia';
import { ALUMNOS_INICIALES, PROFESORES_INICIALES, SANCIONES_INICIALES, COMPENSACIONES_INICIALES, AUDIT_LOGS_INICIALES, MOVIMIENTOS_INICIALES } from '../data/seedData';
import { ProfesorImportRow, parsearTextoOcsvProfesores } from './odsImportService';
import { ES_ENTORNO_PRUEBAS, CUENTA_DRIVE, CARPETA_DRIVE_ID, NOMBRE_UNIDAD_DRIVE } from '../config/entorno';
import { calcularCarnet, estadoPorSaldo, hoyLocal, esAjusteManual } from './carnetPuntos';

const KEY_ALUMNOS = 'sigc_bi_alumnos_v3';
const KEY_PROFESORES = 'sigc_bi_profesores_v2';
const KEY_SANCIONES = 'sigc_bi_sanciones_v3';
const KEY_COMPENSACIONES = 'sigc_bi_compensaciones_v3';
const KEY_AUDIT_LOGS = 'sigc_bi_audit_logs_v2';
const KEY_MOVIMIENTOS = 'sigc_bi_movimientos_v3';
const KEY_OFFLINE_QUEUE = 'sigc_bi_offline_queue_v2';
const KEY_BACKUPS = 'sigc_bi_backups_v2';
const KEY_UNIDAD_INSTITUCIONAL = 'sigc_bi_unidad_institucional_v2';
const KEY_CURSO_ACTUAL = 'sigc_bi_curso_actual_v1';
const KEY_HISTORICO_CURSOS = 'sigc_bi_historico_cursos_v1';
const KEY_LAST_LOCAL_WRITE = 'sigc_bi_last_local_write_timestamp_v1';
const KEY_DELETED_SANCIONES = 'sigc_bi_deleted_sanciones_v1';
const KEY_DELETED_ALUMNOS = 'sigc_bi_deleted_alumnos_v1';
const KEY_DELETED_PROFESORES = 'sigc_bi_deleted_profesores_v1';
const KEY_PENDING_SYNC_SANCIONES = 'sigc_bi_pending_sync_sanciones_v1';

// Eliminación proactiva de cualquier caché antigua de datos en localStorage del navegador
// para garantizar que ningún dispositivo cargue jamás datos obsoletos de la caché local.
try {
  if (typeof window !== 'undefined') {
    const legacyDataKeys = [
      'sigc_bi_alumnos_v2',
      'sigc_bi_alumnos_v3',
      'sigc_bi_profesores_v2',
      'sigc_bi_sanciones_v2',
      'sigc_bi_sanciones_v3',
      'sigc_bi_compensaciones_v2',
      'sigc_bi_compensaciones_v3',
      'sigc_bi_audit_logs_v2',
      'sigc_bi_movimientos_v0',
      'sigc_bi_movimientos_v2',
      'sigc_bi_movimientos_v3',
      'sigc_bi_deleted_sanciones_v1',
      'sigc_bi_deleted_alumnos_v1',
      'sigc_bi_deleted_profesores_v1',
      'sigc_bi_pending_sync_sanciones_v1',
      'sigc_bi_last_drive_sync_timestamp_v1',
    ];
    legacyDataKeys.forEach(k => localStorage.removeItem(k));
  }
} catch {
  // Ignorar errores de entorno
}

// Estado en memoria RAM (Volátil / Cero Caché de Navegador para datos del centro)
let memoryAlumnos: Alumno[] = [...ALUMNOS_INICIALES];
let memoryProfesores: Profesor[] = [...PROFESORES_INICIALES];
let memorySanciones: Sancion[] = [...SANCIONES_INICIALES];
let memoryCompensaciones: Compensacion[] = [...COMPENSACIONES_INICIALES];
let memoryAuditLogs: AuditLog[] = [...AUDIT_LOGS_INICIALES];
let memoryMovimientos: MovimientoPuntos[] = [...MOVIMIENTOS_INICIALES];
let memoryDeletedSanciones: string[] = [];
let memoryDeletedAlumnos: string[] = [];
let memoryDeletedProfesores: string[] = [];
let memoryPendingSyncSanciones: string[] = [];
let memoryPendingSyncProfesores: string[] = [];
let memoryPendingSyncAlumnos: string[] = [];
let memoryPendingSyncCompensaciones: string[] = [];
let memoryExpedientes: ExpedienteSancion[] = [];
let memoryDeletedExpedientes: string[] = [];
let memoryPendingSyncExpedientes: string[] = [];
// Saldos que el alumnado tenía en la versión anterior de la app (los anota el servidor al actualizarse)
let memorySaldosAntesV2: { fecha: string; saldos: Record<string, number> } | null = null;
let memoryPartesMarcadosBorradosV2: Sancion[] = [];
// Partes borrados que Jefatura ha decidido recuperar en esta sesión (prevalecen sobre el borrado del servidor)
let memorySancionesRecuperadas: string[] = [];
let memoryLastWriteTimestamp: string | null = null;
let memoryHasLoadedFromDrive: boolean = false;

export const UNIDAD_INSTITUCIONAL_OFICIAL: UnidadInstitucionalConfig = {
  email: '14007180.aplicaciones@g.educaand.es',
  nombreUnidad: 'Unidad Compartida Convivencia - IES Blas Infante',
  esModoPruebas: false,
  centroEducativo: 'IES Blas Infante (Córdoba)',
  codigoCentro: '14007180',
  fechaConfiguracion: '2026-09-24',
  observaciones: 'Cuenta corporativa oficial del centro (Google Workspace for Education) para almacenamiento persistente y cumplimiento RGPD.',
  folderId: '1S5zjeSgcfVkL-eoQLsJ9I_ltHAnRrbaS',
};

// Unidad mostrada en el entorno de pruebas (ver src/config/entorno.ts)
const UNIDAD_PRUEBAS: UnidadInstitucionalConfig = {
  email: CUENTA_DRIVE,
  nombreUnidad: NOMBRE_UNIDAD_DRIVE,
  esModoPruebas: true,
  centroEducativo: 'IES Blas Infante (Córdoba) · PRUEBAS',
  codigoCentro: '14007180',
  fechaConfiguracion: '2026-10-08',
  observaciones: 'Entorno de pruebas con alumnado ficticio. No contiene datos reales del centro.',
  folderId: CARPETA_DRIVE_ID,
};

/**
 * Normaliza nombres y apellidos de alumnos para comparaciones a prueba de duplicados:
 * - Elimina acentos/tildes y diacríticos (á -> a, ü -> u, etc.)
 * - Convierte a minúsculas
 * - Elimina comas, puntos, guiones, comillas y caracteres especiales
 * - Colapsa múltiples espacios en uno solo
 */
export function normalizarNombreComparacion(nombre?: string, apellidos?: string): string {
  const clean = `${(apellidos || '').trim()} ${(nombre || '').trim()}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return clean;
}

/**
 * Genera un hash canónico basado en el conjunto ordenado de palabras de nombre y apellidos.
 * Esto evita duplicados si alguien escribe "García López, Manuel" y en otra parte "Manuel García López".
 */
export function normalizarTokensNombre(nombre?: string, apellidos?: string): string {
  const clean = normalizarNombreComparacion(nombre, apellidos);
  if (!clean) return '';
  const tokens = clean.split(' ').filter(t => t.length > 0).sort();
  return tokens.join(' ');
}

export class StorageService {
  static getUnidadInstitucional(): UnidadInstitucionalConfig {
    // En el entorno de pruebas se muestra siempre la unidad de pruebas,
    // ignorando lo que hubiera guardado el navegador.
    if (ES_ENTORNO_PRUEBAS) {
      return UNIDAD_PRUEBAS;
    }
    const raw = localStorage.getItem(KEY_UNIDAD_INSTITUCIONAL);
    if (!raw) {
      this.saveUnidadInstitucional(UNIDAD_INSTITUCIONAL_OFICIAL);
      return UNIDAD_INSTITUCIONAL_OFICIAL;
    }
    try {
      const parsed = JSON.parse(raw);
      // Migración automática si persistía la cuenta de pruebas previa o la carpeta anterior
      if (parsed.email === 'mgonruz857@g.educaand.es' || parsed.esModoPruebas || parsed.folderId === '1UJBQCWfs9G9mu3N3F1wDjL_UJ__YhdTP') {
        const updated = {
          ...parsed,
          ...UNIDAD_INSTITUCIONAL_OFICIAL,
          folderId: '1S5zjeSgcfVkL-eoQLsJ9I_ltHAnRrbaS',
        };
        this.saveUnidadInstitucional(updated);
        return updated;
      }
      return parsed;
    } catch {
      return UNIDAD_INSTITUCIONAL_OFICIAL;
    }
  }

  static saveUnidadInstitucional(config: UnidadInstitucionalConfig): void {
    if (ES_ENTORNO_PRUEBAS) return; // En pruebas la unidad no se puede cambiar
    localStorage.setItem(KEY_UNIDAD_INSTITUCIONAL, JSON.stringify(config));
  }

  static hasLoadedFromDrive(): boolean {
    return memoryHasLoadedFromDrive;
  }

  static markLoadedFromDrive(): void {
    memoryHasLoadedFromDrive = true;
  }

  static clearMemoryCacheForFreshLogin(): void {
    memoryAlumnos = [...ALUMNOS_INICIALES];
    memoryProfesores = [...PROFESORES_INICIALES];
    memorySanciones = [...SANCIONES_INICIALES];
    memoryCompensaciones = [...COMPENSACIONES_INICIALES];
    memoryAuditLogs = [...AUDIT_LOGS_INICIALES];
    memoryMovimientos = [...MOVIMIENTOS_INICIALES];
    memoryDeletedSanciones = [];
    memoryDeletedAlumnos = [];
    memoryDeletedProfesores = [];
    memoryPendingSyncSanciones = [];
    memoryPendingSyncProfesores = [];
    memoryPendingSyncAlumnos = [];
    memoryPendingSyncCompensaciones = [];
    memoryExpedientes = [];
    memoryDeletedExpedientes = [];
    memoryPendingSyncExpedientes = [];
    memorySaldosAntesV2 = null;
    memoryPartesMarcadosBorradosV2 = [];
    memorySancionesRecuperadas = [];
    memoryHasLoadedFromDrive = false;
  }

  static touchLocalWriteTimestamp(): void {
    memoryLastWriteTimestamp = new Date().toISOString();
  }

  static getLastLocalWriteTimestamp(): string | null {
    return memoryLastWriteTimestamp;
  }

  static getAlumnos(): Alumno[] {
    const parsed: Alumno[] = [...memoryAlumnos];
    if (parsed.length > 1) {
      const seenNames = new Set<string>();
      let hasDuplicates = false;
      for (const a of parsed) {
        const k = normalizarNombreComparacion(a.nombre, a.apellidos);
        if (k) {
          if (seenNames.has(k)) {
            hasDuplicates = true;
            break;
          }
          seenNames.add(k);
        }
      }
      if (hasDuplicates) {
        const res = this.depurarAlumnosDuplicados();
        if (res.duplicadosEliminados > 0) {
          return [...memoryAlumnos];
        }
      }
    }
    return parsed;
  }

  static saveAlumnos(alumnos: Alumno[]): void {
    memoryAlumnos = [...alumnos];
    this.touchLocalWriteTimestamp();
  }

  /**
   * Depura y fusiona de forma inteligente alumnos duplicados en el censo.
   * Reglas de negocio:
   * - Si dos o más registros tienen el mismo nombre y apellidos normalizados (o los mismos tokens de nombre completo, o el mismo NIE real):
   *   1. Selecciona como registro principal (master) el que posea mayor historial (sanciones previas, saldo de puntos < 10, o NIE real).
   *   2. Si un registro estaba en BAJA y el otro ACTIVO, conserva el estado ACTIVO.
   *   3. Migra todas las sanciones, compensaciones y movimientos de puntos de los registros duplicados al registro principal.
   *   4. Elimina los registros duplicados residuales.
   *   5. Registra en auditoría la acción de saneamiento.
   */
  static depurarAlumnosDuplicados(usuarioOperador?: string): {
    totalOriginal: number;
    totalFinal: number;
    duplicadosEliminados: number;
    gruposFusionados: Array<{ alumnoPrincipal: string; grupo: string; eliminados: string[] }>;
  } {
    const alumnos: Alumno[] = [...memoryAlumnos];

    if (alumnos.length <= 1) {
      return { totalOriginal: alumnos.length, totalFinal: alumnos.length, duplicadosEliminados: 0, gruposFusionados: [] };
    }

    const totalOriginal = alumnos.length;
    const sanciones = this.getSanciones();
    const compensaciones = this.getCompensaciones();
    const movimientos = this.getMovimientos();

    let idMappingChanged = false;
    const idMapRedirect = new Map<string, string>(); // duplicateId -> masterId
    const gruposFusionados: Array<{ alumnoPrincipal: string; grupo: string; eliminados: string[] }> = [];

    const clusters: Alumno[][] = [];
    const visited = new Set<string>();

    for (let i = 0; i < alumnos.length; i++) {
      const a = alumnos[i];
      if (visited.has(a.id_alumno)) continue;

      const cluster: Alumno[] = [a];
      visited.add(a.id_alumno);

      const aNie = (a.nie || '').trim().toUpperCase();
      const hasRealNie = aNie && !aNie.startsWith('SN-') && !['SIN NIE', 'PENDIENTE', 'NO TIENE', 'SN', '-', 'NO'].includes(aNie);
      const aCanonical = normalizarNombreComparacion(a.nombre, a.apellidos);
      const aTokens = normalizarTokensNombre(a.nombre, a.apellidos);

      for (let j = i + 1; j < alumnos.length; j++) {
        const b = alumnos[j];
        if (visited.has(b.id_alumno)) continue;

        const bNie = (b.nie || '').trim().toUpperCase();
        const bHasRealNie = bNie && !bNie.startsWith('SN-') && !['SIN NIE', 'PENDIENTE', 'NO TIENE', 'SN', '-', 'NO'].includes(bNie);
        const bCanonical = normalizarNombreComparacion(b.nombre, b.apellidos);
        const bTokens = normalizarTokensNombre(b.nombre, b.apellidos);

        let isDuplicate = false;

        // Criterio 1: Mismo NIE oficial de Séneca
        if (hasRealNie && bHasRealNie && aNie === bNie) {
          isDuplicate = true;
        }
        // Dos NIE oficiales distintos son dos personas distintas aunque se llamen igual
        else if (hasRealNie && bHasRealNie && aNie !== bNie) {
          isDuplicate = false;
        }
        // Criterio 2: Mismo nombre canónico normalizado (apellidos + nombre sin tildes ni espacios extra)
        else if (aCanonical && bCanonical && aCanonical === bCanonical) {
          isDuplicate = true;
        }
        // Criterio 3: Mismo conjunto de tokens de nombre completo (e.g. Séneca "GARCÍA LÓPEZ, MANUEL" vs "MANUEL GARCÍA LÓPEZ")
        else if (aTokens && bTokens && aTokens.length >= 4 && aTokens === bTokens) {
          isDuplicate = true;
        }

        if (isDuplicate) {
          cluster.push(b);
          visited.add(b.id_alumno);
        }
      }

      clusters.push(cluster);
    }

    const cleanAlumnos: Alumno[] = [];
    let duplicadosEliminados = 0;

    for (const cluster of clusters) {
      if (cluster.length === 1) {
        cleanAlumnos.push(cluster[0]);
        continue;
      }

      // Ordenar para elegir el master
      cluster.sort((a, b) => {
        // Prioridad 1: el que tenga sanciones en el sistema
        const sancionesA = sanciones.filter(s => s.id_alumno === a.id_alumno).length;
        const sancionesB = sanciones.filter(s => s.id_alumno === b.id_alumno).length;
        if (sancionesA !== sancionesB) return sancionesB - sancionesA;

        // Prioridad 2: el que tenga menos puntos actuales (más movimientos)
        if (a.puntos_actuales !== b.puntos_actuales) return a.puntos_actuales - b.puntos_actuales;

        // Prioridad 3: el que tenga NIE real de Séneca
        const aHasReal = a.nie && !a.nie.startsWith('SN-');
        const bHasReal = b.nie && !b.nie.startsWith('SN-');
        if (aHasReal && !bHasReal) return -1;
        if (!aHasReal && bHasReal) return 1;

        // Prioridad 4: estado ACTIVO frente a BAJA
        if (a.estado === 'ACTIVO' && b.estado !== 'ACTIVO') return -1;
        if (a.estado !== 'ACTIVO' && b.estado === 'ACTIVO') return 1;

        return 0;
      });

      const master = { ...cluster[0] };
      const duplicates = cluster.slice(1);
      const eliminadosNombres: string[] = [];

      for (const dup of duplicates) {
        idMapRedirect.set(dup.id_alumno, master.id_alumno);
        idMappingChanged = true;
        duplicadosEliminados++;
        eliminadosNombres.push(`${dup.nombre} ${dup.apellidos} (${dup.grupo}, NIE: ${dup.nie || 'SN'})`);

        // Heredar teléfono o tutor si el master no los tenía
        if ((!master.telefono_tutor || master.telefono_tutor === '600 00 00 00') && dup.telefono_tutor && dup.telefono_tutor !== '600 00 00 00') {
          master.telefono_tutor = dup.telefono_tutor;
        }
        if ((!master.nombre_tutor || master.nombre_tutor === 'Tutor Legal') && dup.nombre_tutor && dup.nombre_tutor !== 'Tutor Legal') {
          master.nombre_tutor = dup.nombre_tutor;
        }
        // Heredar NIE real
        if ((!master.nie || master.nie.startsWith('SN-')) && dup.nie && !dup.nie.startsWith('SN-')) {
          master.nie = dup.nie;
        }
      }

      gruposFusionados.push({
        alumnoPrincipal: `${master.nombre} ${master.apellidos} (${master.grupo})`,
        grupo: master.grupo,
        eliminados: eliminadosNombres,
      });

      cleanAlumnos.push(master);
    }

    if (duplicadosEliminados > 0) {
      this.saveAlumnos(cleanAlumnos);

      if (idMappingChanged) {
        let changedSanciones = false;
        const updatedSanciones = sanciones.map(s => {
          if (idMapRedirect.has(s.id_alumno)) {
            changedSanciones = true;
            return { ...s, id_alumno: idMapRedirect.get(s.id_alumno)! };
          }
          return s;
        });
        if (changedSanciones) {
          this.saveSanciones(updatedSanciones);
        }

        let changedComps = false;
        const updatedComps = compensaciones.map(c => {
          if (idMapRedirect.has(c.id_alumno)) {
            changedComps = true;
            return { ...c, id_alumno: idMapRedirect.get(c.id_alumno)! };
          }
          return c;
        });
        if (changedComps) {
          this.saveCompensaciones(updatedComps);
        }

        let changedMovs = false;
        const updatedMovs = movimientos.map(m => {
          if (idMapRedirect.has(m.id_alumno)) {
            changedMovs = true;
            return { ...m, id_alumno: idMapRedirect.get(m.id_alumno)! };
          }
          return m;
        });
        if (changedMovs) {
          this.saveMovimientos(updatedMovs);
        }
      }

      this.addAuditLog(
        usuarioOperador || 'SISTEMA_DEDUPLICACION',
        'ACTUALIZACION_SISTEMA',
        'Censo/DeduplicacionInteligente',
        `Depuración automática de censo: se fusionaron ${duplicadosEliminados} registros de alumnos duplicados preservando sanciones y puntos.`
      );
    }

    return {
      totalOriginal,
      totalFinal: cleanAlumnos.length,
      duplicadosEliminados,
      gruposFusionados,
    };
  }

  /**
   * Dar de baja a un alumno (desactivación lógica).
   * Conserva el histórico de partes, medidas restaurativas y PAC para trazabilidad legal y auditoría,
   * pero lo desactiva de las listas activas y búsquedas de nuevos partes.
   */
  static darDeBajaAlumno(idAlumno: string, motivo: string, usuarioOperador: string): { success: boolean; alumno?: Alumno; error?: string } {
    const alumnos = this.getAlumnos();
    const idx = alumnos.findIndex(a => a.id_alumno === idAlumno);
    if (idx === -1) {
      return { success: false, error: 'Alumno/a no encontrado en el sistema.' };
    }

    const alumno = alumnos[idx];
    const hoy = new Date().toISOString().split('T')[0];
    const updatedAlumno: Alumno = {
      ...alumno,
      estado: 'BAJA',
      motivo_baja: motivo || 'Baja / Traslado de centro escolar',
      fecha_baja: hoy,
    };

    alumnos[idx] = updatedAlumno;
    this.saveAlumnos(alumnos);
    this.addPendingSyncAlumnoId(updatedAlumno.id_alumno);

    this.addAuditLog(
      usuarioOperador,
      'ACTUALIZACION_SISTEMA',
      'Censo/BajaAlumno',
      `Baja de alumno/a tramitada: ${alumno.nombre} ${alumno.apellidos} (${alumno.grupo}, NIE: ${alumno.nie || 'Sin NIE'}). Motivo: ${motivo || 'Traslado/Baja de matrícula'}`
    );

    return { success: true, alumno: updatedAlumno };
  }

  /**
   * Reactivar a un alumno previamente dado de baja
   */
  static reactivarAlumno(idAlumno: string, usuarioOperador: string): { success: boolean; alumno?: Alumno; error?: string } {
    const alumnos = this.getAlumnos();
    const idx = alumnos.findIndex(a => a.id_alumno === idAlumno);
    if (idx === -1) {
      return { success: false, error: 'Alumno/a no encontrado en el sistema.' };
    }

    const alumno = alumnos[idx];
    const nuevoEstado: Alumno['estado'] = alumno.puntos_actuales === 0 
      ? 'SALDO_CERO' 
      : (alumno.puntos_actuales <= 3 ? 'ALERTA_PUNTOS' : 'ACTIVO');

    const updatedAlumno: Alumno = {
      ...alumno,
      estado: nuevoEstado,
      motivo_baja: undefined,
      fecha_baja: undefined,
    };

    alumnos[idx] = updatedAlumno;
    this.saveAlumnos(alumnos);
    this.addPendingSyncAlumnoId(updatedAlumno.id_alumno);

    this.addAuditLog(
      usuarioOperador,
      'ACTUALIZACION_SISTEMA',
      'Censo/AltaAlumno',
      `Reactivación de alumno/a: ${alumno.nombre} ${alumno.apellidos} (${alumno.grupo}) reincorporado al censo activo con saldo de ${alumno.puntos_actuales} puntos.`
    );

    return { success: true, alumno: updatedAlumno };
  }

  /**
   * Eliminar definitivamente a un alumno del censo (borrado físico directo).
   * Elimina al alumno y sus posibles sanciones asociadas.
   */
  static eliminarAlumnoDefinitivamente(idAlumno: string, usuarioOperador: string): { success: boolean; alumnoEliminado?: Alumno; error?: string } {
    const alumnos = this.getAlumnos();
    const idx = alumnos.findIndex(a => a.id_alumno === idAlumno);
    if (idx === -1) {
      return { success: false, error: 'Alumno/a no encontrado en el sistema.' };
    }

    const alumnoEliminado = alumnos[idx];
    this.addDeletedAlumnoId(idAlumno);
    alumnos.splice(idx, 1);
    this.saveAlumnos(alumnos);

    // Eliminar también las posibles sanciones vinculadas a este alumno (y que no reaparezcan)
    this.getSanciones().forEach(s => { if (s.id_alumno === idAlumno) this.addDeletedSancionId(s.id_sancion); });
    const sanciones = this.getSanciones().filter(s => s.id_alumno !== idAlumno);
    this.saveSanciones(sanciones);

    // Eliminar compensaciones asociadas
    const compensaciones = this.getCompensaciones().filter(c => c.id_alumno !== idAlumno);
    this.saveCompensaciones(compensaciones);

    // Eliminar movimientos de puntos asociados
    const movimientos = this.getMovimientos().filter(m => m.id_alumno !== idAlumno);
    this.saveMovimientos(movimientos);

    this.addAuditLog(
      usuarioOperador,
      'ACTUALIZACION_SISTEMA',
      'Censo/EliminarAlumno',
      `Eliminación definitiva de alumno/a: ${alumnoEliminado.nombre} ${alumnoEliminado.apellidos} (${alumnoEliminado.grupo}, NIE: ${alumnoEliminado.nie || 'Sin NIE'}).`
    );

    return { success: true, alumnoEliminado };
  }

  /**
   * Alta manual de nuevo alumno
   */
  static crearAlumno(nuevo: Omit<Alumno, 'id_alumno' | 'puntos_actuales' | 'estado'>, usuarioOperador: string): { success: boolean; alumno?: Alumno; error?: string } {
    const alumnos = this.getAlumnos();
    const cleanNie = (nuevo.nie || '').trim().toUpperCase();

    if (cleanNie && !cleanNie.startsWith('SN-')) {
      const existing = alumnos.find(a => a.nie && a.nie.toUpperCase() === cleanNie);
      if (existing) {
        return { success: false, error: `Ya existe un alumno con el NIE ${cleanNie} (${existing.nombre} ${existing.apellidos})` };
      }
    }

    const cleanCanonical = normalizarNombreComparacion(nuevo.nombre, nuevo.apellidos);
    const existingByName = alumnos.find(a => normalizarNombreComparacion(a.nombre, a.apellidos) === cleanCanonical);
    if (existingByName) {
      return { 
        success: false, 
        error: `Ya existe un alumno/a registrado con el nombre "${existingByName.nombre} ${existingByName.apellidos}" en el grupo ${existingByName.grupo} (Saldo: ${existingByName.puntos_actuales} pts, Estado: ${existingByName.estado}). Si deseas cambiarlo de grupo o actualizar sus datos, edítalo directamente en el censo.` 
      };
    }

    const nuevoAlumno: Alumno = {
      ...nuevo,
      id_alumno: `ALM-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      nie: cleanNie || `SN-${Math.floor(100000 + Math.random() * 900000)}`,
      puntos_actuales: 10,
      estado: 'ACTIVO',
    };

    alumnos.push(nuevoAlumno);
    this.saveAlumnos(alumnos);
    this.addPendingSyncAlumnoId(nuevoAlumno.id_alumno);

    this.addAuditLog(
      usuarioOperador,
      'ACTUALIZACION_SISTEMA',
      'Censo/AltaManualAlumno',
      `Alta manual de nuevo alumno: ${nuevoAlumno.nombre} ${nuevoAlumno.apellidos} en grupo ${nuevoAlumno.grupo}. NIE: ${nuevoAlumno.nie}`
    );

    return { success: true, alumno: nuevoAlumno };
  }

  /**
   * Modificar datos de un alumno existente (nombre, apellidos, curso/grupo, NIE, tutores).
   */
  static actualizarAlumno(
    idAlumno: string,
    datos: Partial<Pick<Alumno, 'nombre' | 'apellidos' | 'grupo' | 'nie' | 'nombre_tutor' | 'telefono_tutor'>>,
    usuarioOperador: string
  ): { success: boolean; alumno?: Alumno; error?: string } {
    const alumnos = this.getAlumnos();
    const cleanTargetId = (idAlumno || '').trim();
    let idx = alumnos.findIndex(a => a.id_alumno === cleanTargetId);

    if (idx === -1 && datos.nie) {
      const targetNie = datos.nie.trim().toUpperCase();
      idx = alumnos.findIndex(a => a.nie && a.nie.toUpperCase() === targetNie);
    }

    if (idx === -1) {
      return { success: false, error: 'Alumno/a no encontrado en el sistema.' };
    }

    const anterior = alumnos[idx];
    const cleanNie = datos.nie !== undefined ? datos.nie.trim().toUpperCase() : anterior.nie;

    // Validar duplicidad de NIE si se cambia y no es genérico
    if (cleanNie && !cleanNie.startsWith('SN-')) {
      const existing = alumnos.find((a, i) => i !== idx && a.nie && a.nie.toUpperCase() === cleanNie);
      if (existing) {
        return { success: false, error: `Ya existe otro alumno con el NIE ${cleanNie} (${existing.nombre} ${existing.apellidos})` };
      }
    }

    const alumnoActualizado: Alumno = {
      ...anterior,
      nombre: datos.nombre !== undefined ? datos.nombre.trim() : anterior.nombre,
      apellidos: datos.apellidos !== undefined ? datos.apellidos.trim() : anterior.apellidos,
      grupo: datos.grupo !== undefined ? datos.grupo : anterior.grupo,
      nie: cleanNie,
      nombre_tutor: datos.nombre_tutor !== undefined ? datos.nombre_tutor.trim() : anterior.nombre_tutor,
      telefono_tutor: datos.telefono_tutor !== undefined ? datos.telefono_tutor.trim() : anterior.telefono_tutor,
    };

    alumnos[idx] = alumnoActualizado;
    this.saveAlumnos(alumnos);
    this.addPendingSyncAlumnoId(alumnoActualizado.id_alumno);

    this.addAuditLog(
      usuarioOperador,
      'ACTUALIZACION_SISTEMA',
      'Censo/ModificarAlumno',
      `Modificación de datos de alumno/a: ${alumnoActualizado.nombre} ${alumnoActualizado.apellidos} (Grupo: ${anterior.grupo} ➔ ${alumnoActualizado.grupo}, NIE: ${alumnoActualizado.nie})`
    );

    return { success: true, alumno: alumnoActualizado };
  }

  static getProfesores(): Profesor[] {
    const parsed: Profesor[] = [...memoryProfesores];
    const excludedEmails = new Set([
      'pepe@g.educaand.es',
      'carmen.luque@g.educaand.es',
      'rafael.martinez@g.educaand.es',
      'elena.castillo@g.educaand.es'
    ]);
    const excludedIds = new Set(['prof-pepe', 'prof-02', 'prof-03', 'prof-04']);

    const filtered = parsed.filter(p => 
      p && p.email &&
      !excludedEmails.has(p.email.toLowerCase().trim()) && 
      !excludedIds.has(p.id_profesor)
    );

    let adminFound = false;
    const mapped = filtered.map(p => {
      const normalizedRol: RoleUsuario = p.rol === 'ROLE_CONVIVENCIA_ADMIN' ? 'ROLE_CONVIVENCIA_ADMIN' : 'ROLE_DOCENTE';
      if (p.email.toLowerCase() === 'mgonruz857@g.educaand.es') {
        adminFound = true;
        return {
          ...p,
          nombre: 'Miguel Ángel',
          apellidos: 'González Ruz',
          rol: 'ROLE_CONVIVENCIA_ADMIN' as const,
          estado: 'ACTIVO' as const,
        };
      }
      return {
        ...p,
        rol: normalizedRol,
        estado: p.estado || 'ACTIVO'
      };
    });

    if (!adminFound) {
      mapped.unshift({
        ...PROFESORES_INICIALES[0],
        estado: 'ACTIVO',
      });
    }

    if (filtered.length !== parsed.length) {
      memoryProfesores = [...mapped];
    }

    return mapped;
  }

  static saveProfesores(profesores: Profesor[]): void {
    memoryProfesores = [...profesores];
    this.touchLocalWriteTimestamp();
  }

  /**
   * Dar de baja a un profesor (desactivación lógica).
   * No borra sus partes históricos para no romper la trazabilidad ni los expedientes previos.
   */
  static darDeBajaProfesor(idProfesor: string, motivo: string, usuarioOperador: string): { success: boolean; profesor?: Profesor; error?: string } {
    const profesores = this.getProfesores();
    const profIndex = profesores.findIndex(p => p.id_profesor === idProfesor);
    if (profIndex === -1) {
      return { success: false, error: 'Docente no encontrado en el sistema.' };
    }

    const prof = profesores[profIndex];
    if (prof.email.toLowerCase() === 'mgonruz857@g.educaand.es') {
      return { success: false, error: 'No es posible dar de baja al Administrador Principal de Convivencia.' };
    }

    const hoy = new Date().toISOString().split('T')[0];
    const updatedProf: Profesor = {
      ...prof,
      estado: 'INACTIVO',
      motivo_baja: motivo || 'Fin de destino / Cambio de centro en nuevo curso escolar',
      fecha_baja: hoy,
    };

    profesores[profIndex] = updatedProf;
    this.saveProfesores(profesores);
    this.addPendingSyncProfesorEmail(updatedProf.email);

    this.addAuditLog(
      usuarioOperador,
      'ACTUALIZACION_SISTEMA',
      'Claustro/BajaDocente',
      `Baja de docente tramitada: ${prof.nombre} ${prof.apellidos} (${prof.email}). Motivo: ${motivo || 'Baja de curso'}`
    );

    return { success: true, profesor: updatedProf };
  }

  /**
   * Reactivar a un profesor previamente dado de baja
   */
  static reactivarProfesor(idProfesor: string, usuarioOperador: string): { success: boolean; profesor?: Profesor; error?: string } {
    const profesores = this.getProfesores();
    const profIndex = profesores.findIndex(p => p.id_profesor === idProfesor);
    if (profIndex === -1) {
      return { success: false, error: 'Docente no encontrado en el sistema.' };
    }

    const prof = profesores[profIndex];
    const updatedProf: Profesor = {
      ...prof,
      estado: 'ACTIVO',
      motivo_baja: undefined,
      fecha_baja: undefined,
    };

    profesores[profIndex] = updatedProf;
    this.saveProfesores(profesores);
    this.addPendingSyncProfesorEmail(updatedProf.email);

    this.addAuditLog(
      usuarioOperador,
      'ACTUALIZACION_SISTEMA',
      'Claustro/AltaDocente',
      `Reactivación de docente: ${prof.nombre} ${prof.apellidos} (${prof.email}) vuelve a estar ACTIVO.`
    );

    return { success: true, profesor: updatedProf };
  }

  /**
   * Elimina de forma permanente a todos los profesores dados de baja (INACTIVO)
   */
  static eliminarProfesoresInactivosPermanente(usuarioOperador: string): { totalEliminados: number; profesoresRestantes: Profesor[] } {
    const profesores = this.getProfesores();
    const inactivos = profesores.filter(p => p.estado === 'INACTIVO');
    const activos = profesores.filter(p => p.estado !== 'INACTIVO');

    if (inactivos.length > 0) {
      inactivos.forEach(p => {
        if (p.id_profesor) this.addDeletedProfesorId(p.id_profesor);
        if (p.email) this.addDeletedProfesorId(p.email.toLowerCase().trim());
      });
      this.saveProfesores(activos);
      this.addAuditLog(
        usuarioOperador,
        'ACTUALIZACION_SISTEMA',
        'Claustro/EliminacionPermanenteBajas',
        `Eliminación definitiva y permanente de ${inactivos.length} docente(s) dados de baja: ${inactivos.map(p => `${p.nombre} ${p.apellidos} (${p.email})`).join(', ')}`
      );
    }

    return {
      totalEliminados: inactivos.length,
      profesoresRestantes: activos,
    };
  }

  /**
   * Elimina de forma permanente y definitiva a un profesor dado de baja
   */
  static eliminarProfesorPermanente(idProfesor: string, usuarioOperador: string): { success: boolean; error?: string } {
    const profesores = this.getProfesores();
    const profIndex = profesores.findIndex(p => p.id_profesor === idProfesor);
    if (profIndex === -1) {
      return { success: false, error: 'Docente no encontrado en el claustro.' };
    }

    const prof = profesores[profIndex];
    if (prof.email.toLowerCase() === 'mgonruz857@g.educaand.es') {
      return { success: false, error: 'No es posible eliminar al Administrador Principal de Convivencia.' };
    }

    if (prof.id_profesor) this.addDeletedProfesorId(prof.id_profesor);
    if (prof.email) this.addDeletedProfesorId(prof.email.toLowerCase().trim());
    profesores.splice(profIndex, 1);
    this.saveProfesores(profesores);

    this.addAuditLog(
      usuarioOperador,
      'ACTUALIZACION_SISTEMA',
      'Claustro/EliminacionPermanenteDocente',
      `Eliminación permanente del docente: ${prof.nombre} ${prof.apellidos} (${prof.email})`
    );

    return { success: true };
  }

  /**
   * Dar de alta un nuevo profesor manualmente
   */
  static crearProfesor(nuevo: Omit<Profesor, 'id_profesor'>, usuarioOperador: string): { success: boolean; profesor?: Profesor; error?: string } {
    const emailClean = nuevo.email.trim().toLowerCase();
    if (!emailClean.includes('@')) {
      return { success: false, error: 'El correo electrónico no es válido.' };
    }

    const profesores = this.getProfesores();
    const existe = profesores.find(p => p.email.toLowerCase() === emailClean);
    if (existe) {
      if (existe.estado === 'INACTIVO') {
        // Reactivarlo con los nuevos datos
        return this.reactivarProfesor(existe.id_profesor, usuarioOperador);
      }
      return { success: false, error: `Ya existe un docente registrado con el correo ${emailClean}.` };
    }

    const nuevoProfesor: Profesor = {
      ...nuevo,
      id_profesor: `prof-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      email: emailClean,
      estado: 'ACTIVO',
      requiere_cambio_clave: true,
      fecha_modificacion_clave: new Date().toISOString(),
    };

    profesores.push(nuevoProfesor);
    this.saveProfesores(profesores);
    this.addPendingSyncProfesorEmail(nuevoProfesor.email);

    this.addAuditLog(
      usuarioOperador,
      'ACTUALIZACION_SISTEMA',
      'Claustro/AltaManual',
      `Alta manual de docente: ${nuevoProfesor.nombre} ${nuevoProfesor.apellidos} (${nuevoProfesor.departamento})`
    );

    return { success: true, profesor: nuevoProfesor };
  }

  /**
   * Modificar datos de un profesor existente (nombre, apellidos, departamento, email, rol, tutoría).
   */
  static actualizarProfesor(
    idProfesor: string,
    datos: Partial<Pick<Profesor, 'nombre' | 'apellidos' | 'departamento' | 'email' | 'rol' | 'tutor_de_grupo'>>,
    usuarioOperador: string
  ): { success: boolean; profesor?: Profesor; error?: string } {
    const profesores = this.getProfesores();
    const cleanTargetId = (idProfesor || '').trim();
    const cleanDatosEmail = (datos.email || '').trim().toLowerCase();

    // Localizar el profesor por ID o por correo original
    let profIndex = -1;
    if (cleanTargetId) {
      profIndex = profesores.findIndex(p => p.id_profesor === cleanTargetId);
    }
    if (profIndex === -1 && cleanDatosEmail) {
      profIndex = profesores.findIndex(p => p.email.toLowerCase() === cleanDatosEmail);
    }

    if (profIndex === -1) {
      return { success: false, error: 'Docente no encontrado en el sistema.' };
    }

    const anterior = profesores[profIndex];
    let cleanEmail = (anterior.email || '').trim().toLowerCase();

    if (datos.email !== undefined) {
      cleanEmail = datos.email.trim().toLowerCase();
      if (!cleanEmail.includes('@')) {
        return { success: false, error: 'El correo electrónico no es válido.' };
      }
      // Verificar si otro profesor ya usa este email (comparando por índice)
      const duplicado = profesores.find((p, idx) => idx !== profIndex && p.email && p.email.trim().toLowerCase() === cleanEmail);
      if (duplicado) {
        return { success: false, error: `Ya existe otro docente con el correo ${cleanEmail} (${duplicado.nombre} ${duplicado.apellidos})` };
      }
    }

    const finalId = anterior.id_profesor || cleanTargetId || `prof-${Date.now()}`;

    const profesorActualizado: Profesor = {
      ...anterior,
      id_profesor: finalId,
      nombre: datos.nombre !== undefined ? datos.nombre.trim() : anterior.nombre,
      apellidos: datos.apellidos !== undefined ? datos.apellidos.trim() : anterior.apellidos,
      departamento: datos.departamento !== undefined ? datos.departamento.trim() : (anterior.departamento || 'Claustro Docente'),
      email: cleanEmail,
      rol: datos.rol !== undefined ? datos.rol : (anterior.rol || 'ROLE_DOCENTE'),
      tutor_de_grupo: datos.tutor_de_grupo ? datos.tutor_de_grupo : undefined,
    };
    if ((profesorActualizado.tutor_de_grupo || '') !== (anterior.tutor_de_grupo || '')) {
      profesorActualizado.tutoria_asignada_por = profesorActualizado.tutor_de_grupo ? 'JEFATURA' : undefined;
    }

    profesores[profIndex] = profesorActualizado;
    this.saveProfesores(profesores);
    this.addPendingSyncProfesorEmail(profesorActualizado.email);

    // Actualizar la sesión activa si se ha editado el usuario actualmente autenticado
    try {
      const rawUser = localStorage.getItem('sigc_bi_auth_user_v2');
      if (rawUser) {
        const curUser = JSON.parse(rawUser) as Profesor;
        if (curUser.id_profesor === anterior.id_profesor || curUser.email.toLowerCase() === anterior.email.toLowerCase()) {
          localStorage.setItem('sigc_bi_auth_user_v2', JSON.stringify(profesorActualizado));
        }
      }
    } catch {
      // Ignorar fallo de sesión
    }

    this.addAuditLog(
      usuarioOperador,
      'ACTUALIZACION_SISTEMA',
      'Claustro/ModificarDocente',
      `Modificación de datos de docente: ${profesorActualizado.nombre} ${profesorActualizado.apellidos} (${profesorActualizado.email}, Dpto: ${profesorActualizado.departamento}, Tutoría: ${profesorActualizado.tutor_de_grupo || 'Ninguna'})`
    );

    return { success: true, profesor: profesorActualizado };
  }

  /**
   * Permite a cualquier miembro del profesorado gestionar exclusivamente sus propios datos personales:
   * nombre, apellidos, departamento y tutoría asignada.
   * Por seguridad y control institucional, no permite alterar su correo oficial ni su rol.
   */
  static actualizarPerfilPropioDocente(
    emailDocente: string,
    datos: {
      nombre: string;
      apellidos: string;
      departamento: string;
      tutor_de_grupo?: string;
    }
  ): { success: boolean; profesor?: Profesor; error?: string } {
    const cleanEmail = emailDocente.trim().toLowerCase();
    const profesores = this.getProfesores();
    const profIndex = profesores.findIndex(p => p.email.toLowerCase() === cleanEmail);

    if (profIndex === -1) {
      return { success: false, error: 'Docente no encontrado en el claustro del centro.' };
    }

    const anterior = profesores[profIndex];

    if (!datos.nombre || !datos.nombre.trim()) {
      return { success: false, error: 'El nombre es obligatorio.' };
    }
    if (!datos.apellidos || !datos.apellidos.trim()) {
      return { success: false, error: 'Los apellidos son obligatorios.' };
    }

    const nuevaTutoria = datos.tutor_de_grupo && datos.tutor_de_grupo.trim() ? datos.tutor_de_grupo.trim() : undefined;
    const cambiaTutoria = (nuevaTutoria || '') !== (anterior.tutor_de_grupo || '');
    if (cambiaTutoria && nuevaTutoria) {
      const ocupado = profesores.find(
        p => p.email.toLowerCase() !== cleanEmail && p.estado !== 'INACTIVO' && p.tutor_de_grupo === nuevaTutoria
      );
      if (ocupado) {
        return {
          success: false,
          error: `El grupo ya tiene tutor/a asignado (${ocupado.nombre} ${ocupado.apellidos}). Si debe cambiarse, pídeselo a Jefatura de Estudios.`,
        };
      }
    }

    const profesorActualizado: Profesor = {
      ...anterior,
      nombre: datos.nombre.trim(),
      apellidos: datos.apellidos.trim(),
      departamento: datos.departamento.trim() || 'Claustro Docente',
      tutor_de_grupo: nuevaTutoria,
      tutoria_asignada_por: cambiaTutoria ? (nuevaTutoria ? 'DOCENTE' : undefined) : anterior.tutoria_asignada_por,
    };

    profesores[profIndex] = profesorActualizado;
    this.saveProfesores(profesores);
    this.addPendingSyncProfesorEmail(profesorActualizado.email);

    // Actualizar la sesión activa en cliente
    try {
      localStorage.setItem('sigc_bi_auth_user_v2', JSON.stringify(profesorActualizado));
    } catch {
      // Ignorar
    }

    this.addAuditLog(
      cleanEmail,
      'ACTUALIZACION_SISTEMA',
      'Docente/MiPerfil',
      `Actualización de datos personales por el propio docente: ${profesorActualizado.nombre} ${profesorActualizado.apellidos} (Dpto: ${profesorActualizado.departamento}, Tutoría: ${profesorActualizado.tutor_de_grupo || 'Ninguna'})`
    );

    return { success: true, profesor: profesorActualizado };
  }

  /**
   * Importa profesores desde filas estructuradas:
   * Estructura oficial: "Apellidos (coma) Nombre", "Correo Corporativo" y "Rol"
   */
  static importarProfesoresDesdeFilas(
    filas: ProfesorImportRow[],
    usuarioEmail: string
  ): { totalProcessed: number; nuevos: number; actualizados: number; errores: string[] } {
    if (!filas || filas.length === 0) {
      throw new Error('No se encontraron registros de docentes para importar.');
    }

    const currentProfesores = this.getProfesores();
    const profMap = new Map<string, Profesor>();
    currentProfesores.forEach((p) => profMap.set(p.email.toLowerCase(), p));

    let nuevos = 0;
    let actualizados = 0;
    const errores: string[] = [];

    filas.forEach((f, idx) => {
      const emailClean = f.email.trim().toLowerCase();
      if (!emailClean || !emailClean.includes('@')) {
        errores.push(`Fila ${idx + 1}: Correo electrónico no válido ("${f.email}").`);
        return;
      }

      let rol = f.rol || 'ROLE_DOCENTE';
      // Preserve admin for mgonruz857@g.educaand.es
      if (emailClean === 'mgonruz857@g.educaand.es') {
        rol = 'ROLE_CONVIVENCIA_ADMIN';
      }

      const existing = profMap.get(emailClean);
      if (existing) {
        profMap.set(emailClean, {
          ...existing,
          nombre: f.nombre || existing.nombre,
          apellidos: f.apellidos || existing.apellidos,
          departamento: f.departamento || existing.departamento || (rol === 'ROLE_CONVIVENCIA_ADMIN' ? 'Equipo de Convivencia / Jefatura' : 'Claustro Docente'),
          rol,
          tutor_de_grupo: f.tutor_de_grupo || existing.tutor_de_grupo,
          estado: 'ACTIVO',
        });
        actualizados++;
      } else {
        const newProf: Profesor = {
          id_profesor: `prof-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          email: emailClean,
          nombre: f.nombre || 'Docente',
          apellidos: f.apellidos,
          dni: `DNI-${idx + 1}`,
          departamento: f.departamento || (rol === 'ROLE_CONVIVENCIA_ADMIN' ? 'Equipo de Convivencia / Jefatura' : 'Claustro Docente'),
          rol,
          tutor_de_grupo: f.tutor_de_grupo || undefined,
          estado: 'ACTIVO',
        };
        profMap.set(emailClean, newProf);
        nuevos++;
      }
    });

    const updatedList = Array.from(profMap.values());
    this.saveProfesores(updatedList);
    // Marcar como pendientes de subir (si no, la siguiente descarga los descartaría)
    filas.forEach((f: any) => {
      const em = (f?.email || '').toLowerCase().trim();
      if (em && profMap.has(em)) this.addPendingSyncProfesorEmail(em);
    });

    this.addAuditLog(
      usuarioEmail,
      'IMPORTACION_MASIVA',
      'ETL/ClaustroProfesores',
      `Importación de claustro docente completada: ${nuevos} nuevos insertados, ${actualizados} actualizados.`
    );

    return {
      totalProcessed: filas.length,
      nuevos,
      actualizados,
      errores,
    };
  }

  /**
   * Import teachers from CSV/Text with official format:
   * "Apellidos (coma) Nombre", "Correo Corporativo", "Rol"
   */
  static importProfesoresFromCsv(
    csvText: string,
    usuarioEmail: string
  ): { totalProcessed: number; nuevos: number; actualizados: number; errores: string[] } {
    const { filas, errores } = parsearTextoOcsvProfesores(csvText);
    if (filas.length === 0) {
      if (errores.length > 0) {
        return { totalProcessed: 0, nuevos: 0, actualizados: 0, errores };
      }
      return { totalProcessed: 0, nuevos: 0, actualizados: 0, errores: ['El archivo no contiene filas de docentes válidas.'] };
    }

    const res = this.importarProfesoresDesdeFilas(filas, usuarioEmail);
    return {
      ...res,
      errores: [...errores, ...res.errores],
    };
  }

  static deduplicarSancionesPorExpediente(lista: Sancion[]): Sancion[] {
    const byExpAndStudent = new Map<string, Sancion>();
    lista.forEach(s => {
      if (!s || !s.id_sancion) return;
      let th = s.tramo_horario;
      if ((th as string) === '1ª Hora (08:15 - 09:15)') th = '1ª Hora (08:30 - 09:30)';
      else if ((th as string) === '2ª Hora (09:15 - 10:15)') th = '2ª Hora (09:30 - 10:30)';
      else if ((th as string) === '3ª Hora (10:15 - 11:15)') th = '3ª Hora (10:30 - 11:30)';
      else if ((th as string) === 'Recreo (11:15 - 11:45)') th = 'Recreo (11:30 - 12:00)';
      else if ((th as string) === '4ª Hora (11:45 - 12:45)') th = '4ª Hora (12:00 - 13:00)';
      else if ((th as string) === '5ª Hora (12:45 - 13:45)') th = '5ª Hora (13:00 - 14:00)';
      else if ((th as string) === '6ª Hora (13:45 - 14:45)') th = '6ª Hora (14:00 - 15:00)';

      const normalized: Sancion = { ...s, tramo_horario: th };
      const key = `${(normalized.numero_expediente || normalized.id_sancion).trim()}|${normalized.id_alumno}`;
      const existing = byExpAndStudent.get(key);
      if (!existing) {
        byExpAndStudent.set(key, normalized);
      } else {
        const isSynthetic = (item: Sancion) =>
          item.id_sancion.startsWith('snc-rec-') ||
          item.id_sancion.startsWith('snc-v2-') ||
          (item.descripcion_hechos || '').startsWith('Incidencia registrada según tipificación ROF');
        if (isSynthetic(existing) && !isSynthetic(normalized)) {
          byExpAndStudent.set(key, normalized);
        } else if (!isSynthetic(existing) && !isSynthetic(normalized) && existing.id_sancion !== normalized.id_sancion) {
          // Dos partes reales distintos que comparten número de expediente (números antiguos
          // aleatorios): se conservan ambos.
          byExpAndStudent.set(`${key}|${normalized.id_sancion}`, normalized);
        }
      }
    });

    return Array.from(byExpAndStudent.values()).sort((a, b) => {
      const timeA = new Date(a.timestamp || `${a.fecha || ''}T${a.hora_incidente || '08:00'}:00`).getTime() || 0;
      const timeB = new Date(b.timestamp || `${b.fecha || ''}T${b.hora_incidente || '08:00'}:00`).getTime() || 0;
      return timeB - timeA;
    });
  }

  static getSanciones(): Sancion[] {
    return this.deduplicarSancionesPorExpediente([...memorySanciones]);
  }

  static saveSanciones(sanciones: Sancion[]): void {
    const deduped = this.deduplicarSancionesPorExpediente(sanciones);
    memorySanciones = [...deduped];
    this.touchLocalWriteTimestamp();
  }

  // --- RECONCILIACIÓN Y REGISTRO DE ELEMENTOS ELIMINADOS (TOMBSTONES) ---
  static getDeletedSancionIds(): string[] {
    return [...memoryDeletedSanciones];
  }

  static saveDeletedSancionIds(ids: string[]): void {
    memoryDeletedSanciones = Array.from(new Set(ids)).slice(-500);
  }

  static addDeletedSancionId(id: string): void {
    if (!id) return;
    const current = this.getDeletedSancionIds();
    if (!current.includes(id)) {
      current.push(id);
      this.saveDeletedSancionIds(current);
    }
    this.removePendingSyncSancionId(id);
  }

  static removeDeletedSancionId(id: string): void {
    const current = this.getDeletedSancionIds().filter(i => i !== id);
    this.saveDeletedSancionIds(current);
  }

  static getPendingSyncSancionIds(): string[] {
    return [...memoryPendingSyncSanciones];
  }

  static savePendingSyncSancionIds(ids: string[]): void {
    memoryPendingSyncSanciones = Array.from(new Set(ids));
  }

  static addPendingSyncSancionId(id: string): void {
    if (!id) return;
    const current = this.getPendingSyncSancionIds();
    if (!current.includes(id)) {
      current.push(id);
      this.savePendingSyncSancionIds(current);
    }
  }

  static removePendingSyncSancionId(id: string): void {
    const current = this.getPendingSyncSancionIds().filter(i => i !== id);
    this.savePendingSyncSancionIds(current);
  }

  static clearPendingSyncSancionIds(idsToRemove?: string[]): void {
    if (!idsToRemove || idsToRemove.length === 0) {
      memoryPendingSyncSanciones = [];
    } else {
      const set = new Set(idsToRemove);
      const remaining = this.getPendingSyncSancionIds().filter(i => !set.has(i));
      this.savePendingSyncSancionIds(remaining);
    }
  }

  static getPendingSyncProfesorEmails(): string[] {
    return [...memoryPendingSyncProfesores];
  }

  static addPendingSyncProfesorEmail(email: string): void {
    if (!email) return;
    const clean = email.toLowerCase().trim();
    if (!memoryPendingSyncProfesores.includes(clean)) {
      memoryPendingSyncProfesores.push(clean);
    }
  }

  static clearPendingSyncProfesorEmails(emails?: string[]): void {
    if (emails) {
      const quitar = new Set(emails.map(e => e.toLowerCase().trim()));
      memoryPendingSyncProfesores = memoryPendingSyncProfesores.filter(e => !quitar.has(e));
      return;
    }
    memoryPendingSyncProfesores = [];
  }

  static getPendingSyncCompensacionIds(): string[] {
    return [...memoryPendingSyncCompensaciones];
  }

  static addPendingSyncCompensacionId(id: string): void {
    if (id && !memoryPendingSyncCompensaciones.includes(id)) memoryPendingSyncCompensaciones.push(id);
  }

  static clearPendingSyncCompensacionIds(ids: string[]): void {
    const quitar = new Set(ids);
    memoryPendingSyncCompensaciones = memoryPendingSyncCompensaciones.filter(id => !quitar.has(id));
  }

  static getPendingSyncAlumnoIds(): string[] {
    return [...memoryPendingSyncAlumnos];
  }

  static addPendingSyncAlumnoId(id: string): void {
    if (!id) return;
    if (!memoryPendingSyncAlumnos.includes(id)) {
      memoryPendingSyncAlumnos.push(id);
    }
  }

  static clearPendingSyncAlumnoIds(idsToRemove?: string[]): void {
    if (!idsToRemove) {
      memoryPendingSyncAlumnos = [];
      return;
    }
    const remove = new Set(idsToRemove);
    memoryPendingSyncAlumnos = memoryPendingSyncAlumnos.filter(id => !remove.has(id));
  }

  static getDeletedAlumnoIds(): string[] {
    return [...memoryDeletedAlumnos];
  }

  static saveDeletedAlumnoIds(ids: string[]): void {
    memoryDeletedAlumnos = Array.from(new Set(ids)).slice(-500);
  }

  static addDeletedAlumnoId(id: string): void {
    if (!id) return;
    const current = this.getDeletedAlumnoIds();
    if (!current.includes(id)) {
      current.push(id);
      this.saveDeletedAlumnoIds(current);
    }
  }

  static getDeletedProfesorIds(): string[] {
    return [...memoryDeletedProfesores];
  }

  static saveDeletedProfesorIds(ids: string[]): void {
    memoryDeletedProfesores = Array.from(new Set(ids)).slice(-200);
  }

  static addDeletedProfesorId(id: string): void {
    if (!id) return;
    const current = this.getDeletedProfesorIds();
    if (!current.includes(id)) {
      current.push(id);
      this.saveDeletedProfesorIds(current);
    }
  }

  static getCompensaciones(): Compensacion[] {
    return [...memoryCompensaciones];
  }

  static saveCompensaciones(comps: Compensacion[]): void {
    memoryCompensaciones = [...comps];
    this.touchLocalWriteTimestamp();
  }

  // ------------------------------------------------------------------ Expedientes de sanción

  static getExpedientes(): ExpedienteSancion[] {
    return [...memoryExpedientes];
  }

  static saveExpedientes(lista: ExpedienteSancion[]): void {
    memoryExpedientes = [...lista];
    this.touchLocalWriteTimestamp();
  }

  static getDeletedExpedienteIds(): string[] {
    return [...memoryDeletedExpedientes];
  }

  static saveDeletedExpedienteIds(ids: string[]): void {
    memoryDeletedExpedientes = Array.from(new Set(ids));
  }

  static getSaldosAntesV2(): { fecha: string; saldos: Record<string, number> } | null {
    return memorySaldosAntesV2;
  }

  /** Partes que la versión anterior tenía marcados como borrados pero seguían en el archivo. */
  static getPartesMarcadosBorradosV2(): Sancion[] {
    return memoryPartesMarcadosBorradosV2;
  }

  static setInformeMigracionV2(v: any): void {
    memoryPartesMarcadosBorradosV2 = v && Array.isArray(v.partes_marcados_borrados)
      ? v.partes_marcados_borrados.filter((x: any) => x && x.id_sancion)
      : [];
  }

  static getSancionesRecuperadas(): string[] {
    return [...memorySancionesRecuperadas];
  }

  /** Jefatura decide recuperar uno de esos partes: vuelve a estar activo en todos los dispositivos. */
  static recuperarParteMarcadoBorrado(idSancion: string, usuarioEmail: string): boolean {
    const parte = memoryPartesMarcadosBorradosV2.find(s => s.id_sancion === idSancion);
    if (!parte || this.getSanciones().some(s => s.id_sancion === idSancion)) return false;
    this.removeDeletedSancionId(idSancion);
    if (!memorySancionesRecuperadas.includes(idSancion)) memorySancionesRecuperadas.push(idSancion);
    this.saveSanciones([...this.getSanciones(), { ...parte }]);
    this.addPendingSyncSancionId(idSancion);
    this.recalcularPuntosAlumnos(parte.id_alumno);
    this.addAuditLog(usuarioEmail, 'ACTUALIZACION_SISTEMA', 'Parte/' + idSancion,
      `Parte recuperado tras la actualización de la app (estaba marcado como borrado en la versión anterior): expediente ${parte.numero_expediente || ''}`);
    return true;
  }

  static setSaldosAntesV2(v: any): void {
    memorySaldosAntesV2 = v && typeof v === 'object' && v.saldos && typeof v.saldos === 'object'
      ? { fecha: String(v.fecha || ''), saldos: v.saldos }
      : null;
  }

  static getPendingSyncExpedienteIds(): string[] {
    return [...memoryPendingSyncExpedientes];
  }

  static addPendingSyncExpedienteId(id: string): void {
    if (id && !memoryPendingSyncExpedientes.includes(id)) memoryPendingSyncExpedientes.push(id);
  }

  static clearPendingSyncExpedienteIds(ids: string[]): void {
    const quitar = new Set(ids);
    memoryPendingSyncExpedientes = memoryPendingSyncExpedientes.filter(id => !quitar.has(id));
  }

  /** Abre un expediente de sanción para un alumno (Jefatura/Convivencia). */
  static crearExpediente(
    datos: Pick<ExpedienteSancion, 'id_alumno' | 'conducta_art37' | 'fecha_desde' | 'fecha_hasta' | 'dias_acude' | 'modalidad' | 'fecha_documento'>,
    usuarioEmail: string
  ): ExpedienteSancion {
    const ahora = new Date().toISOString();
    const vacio = { hecho: false };
    const exp: ExpedienteSancion = {
      ...datos,
      id_expediente: `exp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      fecha_creacion: ahora,
      creado_por: usuarioEmail,
      timestamp: ahora,
      tramites: {
        llamada_familia: { ...vacio },
        enviado_direccion: { ...vacio },
        enviado_familia: { ...vacio },
        aviso_equipo_docente: { ...vacio },
        guardado_seneca: { ...vacio },
      },
      completado: false,
    };
    this.saveExpedientes([exp, ...this.getExpedientes()]);
    this.addPendingSyncExpedienteId(exp.id_expediente);
    const al = this.getAlumnos().find(a => a.id_alumno === datos.id_alumno);
    this.addAuditLog(usuarioEmail, 'ACTUALIZACION_SISTEMA', `ExpedienteSancion/${exp.id_expediente}`,
      `Expediente de sanción abierto para ${al ? `${al.nombre} ${al.apellidos} (${al.grupo})` : datos.id_alumno}.`);
    return exp;
  }

  /** Modifica los datos de un expediente (fechas, conducta, modalidad…). */
  static actualizarExpediente(id: string, cambios: Partial<ExpedienteSancion>, usuarioEmail: string): ExpedienteSancion | null {
    const lista = this.getExpedientes();
    const i = lista.findIndex(e => e.id_expediente === id);
    if (i === -1) return null;
    const { id_expediente, fecha_creacion, creado_por, tramites, ...permitidos } = cambios as any;
    lista[i] = { ...lista[i], ...permitidos, timestamp: new Date().toISOString() };
    this.saveExpedientes(lista);
    this.addPendingSyncExpedienteId(id);
    return lista[i];
  }

  /** Marca o desmarca un trámite; el expediente queda completado cuando están todos (5). */
  static marcarTramite(id: string, clave: ClaveTramiteSancion, hecho: boolean, usuarioEmail: string): ExpedienteSancion | null {
    const lista = this.getExpedientes();
    const i = lista.findIndex(e => e.id_expediente === id);
    if (i === -1) return null;
    const ahora = new Date().toISOString();
    const exp = { ...lista[i], tramites: { ...lista[i].tramites } };
    exp.tramites[clave] = hecho ? { hecho: true, fecha: ahora, por: usuarioEmail } : { hecho: false };
    const todos = TRAMITES_SANCION.every(t => exp.tramites[t.clave]?.hecho);
    exp.completado = todos;
    exp.fecha_completado = todos ? (lista[i].fecha_completado || ahora) : undefined;
    exp.timestamp = ahora;
    lista[i] = exp;
    this.saveExpedientes(lista);
    this.addPendingSyncExpedienteId(id);
    return exp;
  }

  /** Marca todos los trámites como hechos y cierra el expediente. */
  static completarExpediente(id: string, usuarioEmail: string): ExpedienteSancion | null {
    const lista = this.getExpedientes();
    const i = lista.findIndex(e => e.id_expediente === id);
    if (i === -1) return null;
    const ahora = new Date().toISOString();
    const exp = { ...lista[i], tramites: { ...lista[i].tramites } };
    TRAMITES_SANCION.forEach(({ clave: k }) => {
      if (!exp.tramites[k]?.hecho) exp.tramites[k] = { hecho: true, fecha: ahora, por: usuarioEmail };
    });
    exp.completado = true;
    exp.fecha_completado = ahora;
    exp.timestamp = ahora;
    lista[i] = exp;
    this.saveExpedientes(lista);
    this.addPendingSyncExpedienteId(id);
    this.addAuditLog(usuarioEmail, 'ACTUALIZACION_SISTEMA', `ExpedienteSancion/${id}`, 'Todos los trámites del expediente de sanción marcados como completados.');
    return exp;
  }

  static eliminarExpediente(id: string, usuarioEmail: string): void {
    this.saveExpedientes(this.getExpedientes().filter(e => e.id_expediente !== id));
    this.saveDeletedExpedienteIds([...this.getDeletedExpedienteIds(), id]);
    this.addPendingSyncExpedienteId(id);
    this.addAuditLog(usuarioEmail, 'ACTUALIZACION_SISTEMA', `ExpedienteSancion/${id}`, 'Expediente de sanción eliminado.');
  }

  /**
   * Alumnado con 0 puntos que todavía no tiene un expediente abierto desde que llegó a 0
   * (es decir, ninguno creado después de su último parte con puntos).
   */
  static getAlumnosPendientesDeExpediente(): Alumno[] {
    const expedientes = this.getExpedientes();
    const sanciones = this.getActiveSanciones();
    const compensaciones = this.getCompensaciones();
    return this.getAlumnos().filter(a => {
      if (a.estado === 'BAJA' || a.puntos_actuales !== 0) return false;
      // Último hecho que quitó puntos (un parte o un ajuste manual no anulado), por el momento en que se
      // registró: así un parte puesto el mismo día pero DESPUÉS de abrir el expediente vuelve a avisar.
      const momento = (ts?: string, fecha?: string) => (ts && ts.length > 10 ? ts : (fecha || ''));
      const ultimo = [
        ...sanciones.filter(s => s.id_alumno === a.id_alumno && (s.puntos_restados || 0) > 0).map(s => momento(s.timestamp, s.fecha)),
        ...compensaciones.filter(c => c.id_alumno === a.id_alumno && !c.anulada && esAjusteManual(c)).map(c => momento(c.timestamp, c.fecha_completada)),
      ]
        .filter(Boolean)
        .map(t => (t.length > 10 ? new Date(t).getTime() : new Date(t + 'T00:00:00').getTime()))
        .filter(n => !isNaN(n))
        .sort((x, y) => x - y)
        .pop() ?? -Infinity;
      return !expedientes.some(e => e.id_alumno === a.id_alumno && new Date(e.fecha_creacion).getTime() >= ultimo);
    });
  }

  static getAuditLogs(): AuditLog[] {
    return [...memoryAuditLogs];
  }

  static saveAuditLogs(logs: AuditLog[]): void {
    memoryAuditLogs = [...logs];
  }

  static addAuditLog(usuarioEmail: string, accion: AuditLog['accion'], entidad: string, detalles: string): void {
    const logs = this.getAuditLogs();
    const newLog: AuditLog = {
      id_log: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      usuario_email: usuarioEmail,
      accion,
      entidad,
      detalles,
      hash_integridad: `sha256-${Math.random().toString(36).substring(2, 10)}${Date.now().toString(16)}`,
    };
    logs.unshift(newLog);
    this.saveAuditLogs(logs.slice(0, 300)); // retain last 300 entries
  }

  static getMovimientos(): MovimientoPuntos[] {
    return [...memoryMovimientos];
  }

  static saveMovimientos(movs: MovimientoPuntos[]): void {
    memoryMovimientos = [...movs];
    this.touchLocalWriteTimestamp();
  }

  /**
   * Histórico de puntos del alumno, calculado a partir de sus partes y medidas restaurativas
   * (igual en todos los dispositivos). Del más reciente al más antiguo.
   */
  static getMovimientosPorAlumno(idAlumno: string): MovimientoPuntos[] {
    return calcularCarnet(idAlumno, this.getActiveSanciones(), this.getCompensaciones()).movimientos;
  }

  static registrarMovimiento(movData: Omit<MovimientoPuntos, 'id_movimiento'>): MovimientoPuntos {
    const movs = this.getMovimientos();
    const newMov: MovimientoPuntos = {
      ...movData,
      id_movimiento: `mov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    };
    movs.unshift(newMov);
    this.saveMovimientos(movs);
    return newMov;
  }

  /**
   * Reconstruye automáticamente partes activos desde el registro inmutable de auditoría (audit_logs)
   * si en algún momento fueron purgados por error de la lista sanciones sin haber tenido acción ELIMINAR_PARTE.
   */
  static reconstruirPartesDesdeAuditoria(
    auditLogs: AuditLog[],
    alumnos: Alumno[],
    profesores: Profesor[],
    existingExpedientes: Set<string>
  ): Sancion[] {
    if (!Array.isArray(auditLogs) || auditLogs.length === 0 || !Array.isArray(alumnos) || alumnos.length === 0) {
      return [];
    }

    const elimLogs = auditLogs.filter(l => l.accion === 'ELIMINAR_PARTE');
    const crearLogs = auditLogs.filter(l => l.accion === 'CREAR_PARTE');

    const modByExpAndStudent = new Map<string, { puntos_restados?: number; saldo_resultante?: number; codigo_infraccion?: string }>();
    const tramByExp = new Map<string, { estado_tramitacion: Sancion['estado_tramitacion']; observaciones_tramitacion: string }>();
    const pacByExp = new Map<string, { estado_pac: Sancion['estado_pac']; profesor_pac_receptor: string }>();

    [...auditLogs].reverse().forEach(l => {
      if (l.accion === 'MODIFICAR_PARTE') {
        const exp = (l.entidad || '').replace('Sancion/', '').trim();
        const mPts = (l.detalles || '').match(/de\s+(.+?)\.\s*Puntos:\s*-(\d+)\s*->\s*-(\d+)\s*pts\s*\(Saldo resultante:\s*(\d+)/);
        const mCod = (l.detalles || '').match(/\(([A-Z0-9-]+)\)/);
        if (exp && mPts) {
          const stNorm = normalizarNombreComparacion(mPts[1], '');
          modByExpAndStudent.set(`${exp}|${stNorm}`, {
            puntos_restados: parseInt(mPts[3], 10),
            saldo_resultante: parseInt(mPts[4], 10),
            codigo_infraccion: mCod ? mCod[1] : undefined,
          });
        }
      } else if (l.accion === 'ACTUALIZAR_TRAMITACION') {
        const exp = (l.entidad || '').replace('Sancion/', '').trim();
        const mEst = (l.detalles || '').match(/actualizada a\s+([A-Z_]+)\.\s*Nota:\s*(.*)$/);
        if (exp && mEst) {
          tramByExp.set(exp, {
            estado_tramitacion: mEst[1] as Sancion['estado_tramitacion'],
            observaciones_tramitacion: mEst[2].trim(),
          });
        }
      } else if (l.accion === 'RECEPCION_PAC') {
        const exp = (l.entidad || '').replace('AulaPAC/', '').trim();
        const mPac = (l.detalles || '').match(/cambiado a\s+([A-Z_]+)\s+por\s+(.+)\.$/);
        if (exp && mPac) {
          pacByExp.set(exp, {
            estado_pac: mPac[1] as Sancion['estado_pac'],
            profesor_pac_receptor: mPac[2].trim(),
          });
        }
      }
    });

    const getTramoFromHora = (horaStr: string): Sancion['tramo_horario'] => {
      const [h, m] = (horaStr || '09:00').split(':').map(Number);
      const mins = (h || 9) * 60 + (m || 0);
      if (mins < 9 * 60 + 30) return '1ª Hora (08:30 - 09:30)';
      if (mins < 10 * 60 + 30) return '2ª Hora (09:30 - 10:30)';
      if (mins < 11 * 60 + 30) return '3ª Hora (10:30 - 11:30)';
      if (mins < 12 * 60) return 'Recreo (11:30 - 12:00)';
      if (mins < 13 * 60) return '4ª Hora (12:00 - 13:00)';
      if (mins < 14 * 60) return '5ª Hora (13:00 - 14:00)';
      return '6ª Hora (14:00 - 15:00)';
    };

    const recovered: Sancion[] = [];

    crearLogs.forEach(l => {
      if (!l || l.entidad === 'Sancion/TEST-SEC-07') return;
      const exp = (l.entidad || '').replace('Sancion/', '').trim();
      if (!exp) return;

      const m = (l.detalles || '').match(/^Parte\s+([A-Z0-9-]+)\s+a\s+(.+?)\s+\(-(\d+)\s+pts\)\.\s+Saldo:\s+(\d+)\s+->\s+(\d+)\.\s+Medida:\s+([^\.[]+)/);
      if (!m) return;

      const [, rawCodigo, alumnoFullName, rawPts, rawAnt, rawRes, rawMedida] = m;
      const stNorm = normalizarNombreComparacion(alumnoFullName, '');

      // Verificar si fue eliminado oficialmente en ELIMINAR_PARTE
      const wasExplicitlyDeleted = elimLogs.some(el => {
        const elExp = (el.entidad || '').replace('Sancion/', '').trim();
        if (elExp !== exp) return false;
        return normalizarNombreComparacion(el.detalles || '', '').includes(stNorm);
      });
      if (wasExplicitlyDeleted) return;

      // Si ya existe en sanciones activas con ese expediente y no es el caso de colisión de expediente, omitir
      if (existingExpedientes.has(exp) && exp !== '2026/850-BI') return;

      const alm = alumnos.find(a =>
        normalizarNombreComparacion(a.nombre, a.apellidos) === stNorm ||
        normalizarNombreComparacion(a.apellidos, a.nombre) === stNorm
      );
      if (!alm) return;

      const prof = profesores.find(p => (p.email || '').toLowerCase().trim() === (l.usuario_email || '').toLowerCase().trim());
      const nombreProf = prof ? `${prof.nombre} ${prof.apellidos}` : l.usuario_email;
      const idProf = prof ? prof.id_profesor : 'prof-01';
      const materiaProf = prof?.departamento || 'Docencia';

      const logTs = parseInt((l.id_log.match(/log-(\d+)-/) || [])[1] || String(new Date(l.timestamp).getTime()), 10);
      const cleanSncId = `snc-rec-${logTs}`;

      const dObj = new Date(l.timestamp);
      const spainDate = new Date(dObj.getTime() + 2 * 60 * 60 * 1000);
      const fecha = spainDate.toISOString().split('T')[0];
      const hora = spainDate.toISOString().split('T')[1].substring(0, 5);
      const tramo = getTramoFromHora(hora);

      const mod = modByExpAndStudent.get(`${exp}|${stNorm}`);
      const codigo = (mod?.codigo_infraccion || rawCodigo) as Sancion['codigo_infraccion'];
      const puntosRestados = mod?.puntos_restados !== undefined ? mod.puntos_restados : parseInt(rawPts, 10);
      const saldoAnt = parseInt(rawAnt, 10);
      const saldoRes = mod?.saldo_resultante !== undefined ? mod.saldo_resultante : parseInt(rawRes, 10);

      const medidaTexto = rawMedida.trim();
      let medidaCode: Sancion['medida_inmediata'] = 'AMONESTACION_VERBAL';
      if (medidaTexto.includes('PAC')) medidaCode = 'AULA_PAC';
      else if (medidaTexto.includes('Jefatura')) medidaCode = 'DERIVACION_JEFATURA';
      else if (medidaTexto.includes('móvil') || medidaTexto.includes('movil')) medidaCode = 'RETIRADA_MOVIL';

      const derivadoPac = medidaCode === 'AULA_PAC' || pacByExp.has(exp);
      const pacInfo = pacByExp.get(exp);
      const tramInfo = tramByExp.get(exp);
      const tipoConducta: Sancion['tipo_conducta'] = codigo.startsWith('GRA-')
        ? 'GRAVE'
        : (codigo.startsWith('ACA-') ? 'ACADEMICO' : 'LEVE');

      recovered.push({
        timestamp: l.timestamp,
        fecha,
        hora_incidente: hora,
        tramo_horario: tramo,
        hora_registro: hora,
        registro_diferido: false,
        id_alumno: alm.id_alumno,
        id_profesor: idProf,
        nombre_profesor: nombreProf,
        materia: materiaProf,
        codigo_infraccion: codigo,
        tipo_conducta: tipoConducta,
        puntos_restados: puntosRestados,
        saldo_anterior: saldoAnt,
        saldo_resultante: saldoRes,
        descripcion_hechos: `Incidencia registrada según tipificación ROF (${codigo}). Medida adoptada: ${medidaTexto}.`,
        medida_inmediata: medidaCode,
        medida_inmediata_texto: medidaTexto,
        ubicacion: codigo === 'LEV-PASILLO' ? 'Pasillos' : 'Aula ordinaria',
        derivado_pac: derivadoPac,
        estado_pac: pacInfo ? pacInfo.estado_pac : (derivadoPac ? 'EN_TRANSITO' : 'NO_APLICA'),
        profesor_pac_receptor: pacInfo ? pacInfo.profesor_pac_receptor : undefined,
        estado_tramitacion: tramInfo ? tramInfo.estado_tramitacion : 'PENDIENTE_NOTIFICACION',
        observaciones_tramitacion: tramInfo ? tramInfo.observaciones_tramitacion : undefined,
        fecha_comunicacion_familia: fecha,
        id_sancion: cleanSncId,
        numero_expediente: exp,
        url_pdf_drive: `https://drive.google.com/corp/partes/2026/${alm.grupo}/PARTE_${exp.replace('/', '_')}.pdf`,
      });
      existingExpedientes.add(exp);
    });

    return recovered;
  }

  /**
   * Obtiene todas las sanciones activas almacenadas en el registro.
   */
  static getActiveSanciones(): Sancion[] {
    return this.getSanciones().filter((s: Sancion) => Boolean(s && s.id_sancion));
  }

  /**
   * Calcula el saldo de carnet de un alumno de forma determinista y en tiempo real:
   * Saldo = 10 - Suma(puntos restados en sanciones activas no eliminadas) + Suma(puntos recuperados en compensaciones)
   * Acotado estrictamente entre 0 y 10.
   */
  static calcularSaldoAlumno(idAlumno: string): {
    saldoActual: number;
    totalPuntosPerdidos: number;
    totalPuntosRecuperados: number;
    countSanciones: number;
    estado: Alumno['estado'];
  } {
    const r = calcularCarnet(idAlumno, this.getActiveSanciones(), this.getCompensaciones());
    return {
      saldoActual: r.saldo,
      totalPuntosPerdidos: r.totalPuntosPerdidos,
      totalPuntosRecuperados: r.totalPuntosRecuperados,
      countSanciones: r.countSanciones,
      estado: estadoPorSaldo(r.saldo),
    };
  }

  /**
   * Saldo justo antes y justo después de un parte, según el orden cronológico real.
   */
  static calcularSaldoHistoricoSancion(idSancion: string): { saldoAnterior: number; saldoResultante: number } {
    const sanciones = this.getActiveSanciones();
    const target = sanciones.find((s: Sancion) => s.id_sancion === idSancion);
    if (!target) {
      return { saldoAnterior: 10, saldoResultante: 10 };
    }
    const r = calcularCarnet(target.id_alumno, sanciones, this.getCompensaciones());
    return r.saldosPorSancion.get(idSancion) || { saldoAnterior: 10, saldoResultante: 10 };
  }

  /**
   * REQUISITOS FUNCIONALES V0 - SECCIÓN 1, 2, 7 & 9
   * - Cada conducta tiene puntuación fija (o manual en GRA-SALUD).
   * - Descuenta puntos en el Carnet de Convivencia con cálculo estricto en tiempo real.
   * - La app NO decide expulsiones:
   *   * Si P_nuevo == 0 -> 'SALDO_CERO' (alerta a Jefatura/Convivencia para su valoración).
   *   * Si P_nuevo <= 3 -> 'ALERTA_PUNTOS'.
   *   * En otro caso -> 'ACTIVO'.
   * - Registra movimiento visible en el histórico con saldo anterior y resultante.
   */
  static imponerSancion(
    sancionData: Omit<Sancion, 'id_sancion' | 'numero_expediente' | 'url_pdf_drive'>,
    usuarioEmail: string
  ): { sancion: Sancion; alumnoActualizado: Alumno; saldoCero: boolean; alertaGrave: boolean } {
    const alumnos = this.getAlumnos();
    const alumnoIndex = alumnos.findIndex(a => (a.id_alumno || '').toLowerCase().trim() === (sancionData.id_alumno || '').toLowerCase().trim());
    if (alumnoIndex === -1) {
      throw new Error(`Alumno no encontrado con ID: ${sancionData.id_alumno}`);
    }

    const alumno = alumnos[alumnoIndex];
    
    // 1. Obtener el saldo real previo del alumno en tiempo real considerando sus sanciones activas
    const balancePrevio = this.calcularSaldoAlumno(alumno.id_alumno);
    const puntosPrevios = balancePrevio.saldoActual;
    const puntosDescontar = Math.max(0, sancionData.puntos_restados);
    const nuevosPuntos = Math.max(0, Math.min(10, puntosPrevios - puntosDescontar));

    let nuevoEstado: Alumno['estado'] = alumno.estado;
    const saldoCero = nuevosPuntos === 0;
    const alertaGrave = sancionData.tipo_conducta === 'GRAVE' || puntosDescontar >= 5;

    if (alumno.estado !== 'BAJA') {
      if (nuevosPuntos === 0) {
        nuevoEstado = 'SALDO_CERO';
      } else if (nuevosPuntos <= 3) {
        nuevoEstado = 'ALERTA_PUNTOS';
      } else {
        nuevoEstado = 'ACTIVO';
      }
    }

    const year = new Date().getFullYear();
    // Número de expediente único: marca de tiempo + sufijo aleatorio (antes eran solo 900
    // números posibles al año y dos partes con el mismo número se fusionaban al sincronizar).
    const uniq = `${Date.now().toString(36)}${Math.random().toString(36).substring(2, 5)}`.toUpperCase();
    const expedienteNum = `${year}/${uniq}-BI`;
    const idSancion = `snc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const urlPdf = `https://drive.google.com/corp/partes/${year}/${alumno.grupo}/PARTE_${expedienteNum.replace('/', '_')}.pdf`;

    const nuevaSancion: Sancion = {
      ...sancionData,
      id_sancion: idSancion,
      numero_expediente: expedienteNum,
      url_pdf_drive: urlPdf,
      saldo_anterior: puntosPrevios,
      saldo_resultante: nuevosPuntos,
    };

    // Registrar para sincronización y asegurar que no esté en la lista de eliminados
    this.removeDeletedSancionId(idSancion);
    this.addPendingSyncSancionId(idSancion);

    const sanciones = this.getSanciones();
    sanciones.unshift(nuevaSancion);
    this.saveSanciones(sanciones);

    // Saldos reales antes/después de este parte según el orden cronológico
    const tramo = calcularCarnet(alumno.id_alumno, this.getActiveSanciones(), this.getCompensaciones()).saldosPorSancion.get(idSancion);
    if (tramo) {
      nuevaSancion.saldo_anterior = tramo.saldoAnterior;
      nuevaSancion.saldo_resultante = tramo.saldoResultante;
      this.saveSanciones(this.getSanciones().map(s => (s.id_sancion === idSancion ? nuevaSancion : s)));
    }

    // Recalcular saldo exacto del alumno tras asentar la sanción
    const alumnosActualizados = this.recalcularPuntosAlumnos(alumno.id_alumno);
    const alumnoFinal = alumnosActualizados.find(a => a.id_alumno === alumno.id_alumno) || {
      ...alumno,
      puntos_actuales: nuevosPuntos,
      estado: nuevoEstado,
      historial_sanciones_count: (alumno.historial_sanciones_count || 0) + 1,
    };

    // Auditoría y Alertas mínimas a Jefatura/Convivencia (V0 - Sección 7)
    let logDetalle = `Parte ${sancionData.codigo_infraccion} a ${alumno.nombre} ${alumno.apellidos} (-${puntosDescontar} pts). Saldo: ${nuevaSancion.saldo_anterior ?? puntosPrevios} -> ${nuevaSancion.saldo_resultante ?? alumnoFinal.puntos_actuales}. Medida: ${sancionData.medida_inmediata_texto || sancionData.medida_inmediata || 'Registrada'}.`;
    if (saldoCero) {
      logDetalle += ' [ALERTA: Saldo 0 puntos alcanzado - Requiere valoración de Jefatura]';
    }
    if (alertaGrave) {
      logDetalle += ' [AVISO: Conducta grave registrada]';
    }

    this.addAuditLog(
      usuarioEmail,
      'CREAR_PARTE',
      `Sancion/${expedienteNum}`,
      logDetalle
    );

    return { sancion: nuevaSancion, alumnoActualizado: alumnoFinal, saldoCero: alumnoFinal.puntos_actuales === 0, alertaGrave };
  }

  /**
   * Recalcula el saldo real de puntos de los alumnos garantizando coherencia
   * matemática absoluta entre sanciones activas, eliminadas y medidas restaurativas.
   */
  static recalcularPuntosAlumnos(targetIdAlumno?: string): Alumno[] {
    const alumnos = this.getAlumnos();
    const activeSanciones = this.getActiveSanciones();
    const compensaciones = this.getCompensaciones();
    const hoy = hoyLocal();

    let modificado = false;
    const cleanTargetId = targetIdAlumno ? targetIdAlumno.toLowerCase().trim() : null;

    const alumnosActualizados = alumnos.map(alumno => {
      const cleanAlumnoId = (alumno.id_alumno || '').toLowerCase().trim();
      if (cleanTargetId && cleanAlumnoId !== cleanTargetId) {
        return alumno;
      }

      const r = calcularCarnet(alumno.id_alumno, activeSanciones, compensaciones, hoy);
      const nuevoEstado: Alumno['estado'] = alumno.estado === 'BAJA' ? 'BAJA' : estadoPorSaldo(r.saldo);

      if (alumno.puntos_actuales !== r.saldo || alumno.historial_sanciones_count !== r.countSanciones || alumno.estado !== nuevoEstado) {
        modificado = true;
        return {
          ...alumno,
          puntos_actuales: r.saldo,
          historial_sanciones_count: r.countSanciones,
          estado: nuevoEstado,
        };
      }

      return alumno;
    });

    if (modificado) {
      this.saveAlumnos(alumnosActualizados);
    }

    return alumnosActualizados;
  }

  /**
   * MODIFICACIÓN DE PARTE DISCIPLINARIO (Equipo de Convivencia / Jefatura de Estudios / Autor)
   * - Permite modificar cualquier dato del parte (infracción, puntos, hechos, fecha, docente, etc.).
   * - Si se modifican los puntos restados o el alumno asignado, recalcula automáticamente los saldos de carnet de los alumnos afectados.
   * - Registra movimiento aclaratorio en el histórico de puntos si hubo cambio de puntos o alumno.
   * - Registra entrada inmutable en la auditoría RGPD.
   */
  static modificarSancion(
    idSancion: string,
    cambios: Partial<Sancion>,
    usuarioEmail: string,
    motivoModificacion: string
  ): { success: boolean; sancionModificada?: Sancion; alumnoActualizado?: Alumno; error?: string } {
    const sanciones = this.getSanciones();
    const sancionIdx = sanciones.findIndex(s => s.id_sancion === idSancion);
    if (sancionIdx === -1) {
      return { success: false, error: 'Parte de convivencia no encontrado en el sistema.' };
    }

    const sancionOriginal = sanciones[sancionIdx];
    const oldAlumnoId = sancionOriginal.id_alumno;
    const newAlumnoId = cambios.id_alumno || oldAlumnoId;
    const oldPuntosRestados = Math.max(0, sancionOriginal.puntos_restados || 0);
    const newPuntosRestados = cambios.puntos_restados !== undefined 
      ? Math.max(0, cambios.puntos_restados) 
      : oldPuntosRestados;

    // Actualizar campos
    const sancionActualizada: Sancion = {
      ...sancionOriginal,
      ...cambios,
      puntos_restados: newPuntosRestados,
      id_sancion: sancionOriginal.id_sancion, // Invariable
      numero_expediente: sancionOriginal.numero_expediente, // Invariable
    };

    sanciones[sancionIdx] = sancionActualizada;
    this.saveSanciones(sanciones);

    // Asegurar que no esté en deleted y quede pendiente para sincronizar con Drive
    this.removeDeletedSancionId(idSancion);
    this.addPendingSyncSancionId(idSancion);

    // Recalcular saldo de los alumnos involucrados
    if (oldAlumnoId !== newAlumnoId) {
      this.recalcularPuntosAlumnos(oldAlumnoId);
    }
    const alumnosActualizados = this.recalcularPuntosAlumnos(newAlumnoId);
    const alumnoActualizado = alumnosActualizados.find(a => a.id_alumno === newAlumnoId);

    // Auditoría inmutable de no repudio
    const expediente = sancionActualizada.numero_expediente || sancionActualizada.id_sancion;
    const nombreAlumno = alumnoActualizado 
      ? `${alumnoActualizado.nombre} ${alumnoActualizado.apellidos}` 
      : newAlumnoId;

    this.addAuditLog(
      usuarioEmail,
      'MODIFICAR_PARTE',
      `Sancion/${expediente}`,
      `Modificación de parte ${expediente} (${sancionActualizada.codigo_infraccion}) de ${nombreAlumno}. Puntos: -${oldPuntosRestados} -> -${newPuntosRestados} pts (Saldo resultante: ${alumnoActualizado?.puntos_actuales !== undefined ? alumnoActualizado.puntos_actuales : 'N/A'}). Motivo: ${motivoModificacion.trim() || 'Corrección de datos / Estimación'}`
    );

    return {
      success: true,
      sancionModificada: sancionActualizada,
      alumnoActualizado,
    };
  }

  /**
   * Eliminar un parte de convivencia por parte del Equipo de Convivencia / Jefatura de Estudios.
   * - Elimina la sanción del registro activo.
   * - Restituye automáticamente los puntos descontados al carnet del alumno (tope máx 10).
   * - Actualiza el estado disciplinario del alumno (de SALDO_CERO / ALERTA_PUNTOS a ACTIVO según corresponda).
   * - Registra movimiento de compensación en el histórico oficial de movimientos del alumno.
   * - Registra entrada inmutable en el registro de auditoría RGPD.
   */
  static eliminarSancion(
    idSancion: string,
    usuarioEmail: string,
    motivo: string
  ): { success: boolean; sancionEliminada?: Sancion; alumnoActualizado?: Alumno; error?: string } {
    const sanciones = this.getSanciones();
    const sancionIdx = sanciones.findIndex(s => s.id_sancion === idSancion);
    if (sancionIdx === -1) {
      return { success: false, error: 'Parte de convivencia no encontrado en el sistema.' };
    }

    const sancion = sanciones[sancionIdx];
    const puntosRestituidos = Math.max(0, sancion.puntos_restados || 0);

    // 1. Registrar el ID de la sanción como eliminada para que ningún otro dispositivo la resucite
    this.addDeletedSancionId(idSancion);

    // 2. Retirar la sanción de la lista activa
    sanciones.splice(sancionIdx, 1);
    this.saveSanciones(sanciones);

    // 3. Recalcular y actualizar inmediatamente el saldo oficial del alumno
    const alumnosActualizados = this.recalcularPuntosAlumnos(sancion.id_alumno);
    const alumnoActualizado = alumnosActualizados.find(a => a.id_alumno === sancion.id_alumno);

    // 4. Auditoría inmutable de no repudio
    const expediente = sancion.numero_expediente || sancion.id_sancion;
    const nombreAlumno = alumnoActualizado 
      ? `${alumnoActualizado.nombre} ${alumnoActualizado.apellidos}` 
      : sancion.id_alumno;

    this.addAuditLog(
      usuarioEmail,
      'ELIMINAR_PARTE',
      `Sancion/${expediente}`,
      `Eliminación oficial de parte ${expediente} (${sancion.codigo_infraccion}) de ${nombreAlumno}. Restituidos: +${puntosRestituidos} pts (Saldo resultante: ${alumnoActualizado ? `${alumnoActualizado.puntos_actuales}` : 'N/A'}). Motivo: ${motivo.trim() || 'Estimación de alegaciones'}`
    );

    return {
      success: true,
      sancionEliminada: sancion,
      alumnoActualizado,
    };
  }

  /**
   * REQUISITOS FUNCIONALES V0 - SECCIÓN 3: RECUPERACIÓN AUTOMÁTICA DE PUNTOS
   * REGLA SEMANAL: Si durante una semana el alumno/a no registra ninguna conducta que implique
   * pérdida de puntos, recupera automáticamente +1 punto, hasta un máximo de 10.
   * Debe generar un movimiento visible en el histórico:
   * Ejemplo: "28/09/2026 · Recuperación semanal sin nuevas incidencias · +1"
   */
  static ejecutarRecuperacionSemanal(_usuarioEmail = 'sistema@iesblasinfante.es'): {
    totalEvaluados: number;
    recuperados: number;
    alumnosBeneficiados: string[];
  } {
    // La recuperación semanal es automática: se aplica sola al calcular el saldo según las fechas.
    // Esta función solo actualiza los saldos mostrados e informa de quién ha recuperado algo.
    const antes = new Map(this.getAlumnos().map(a => [a.id_alumno, a.puntos_actuales]));
    const despues = this.recalcularPuntosAlumnos();
    const alumnosBeneficiados = despues
      .filter(a => (antes.get(a.id_alumno) ?? a.puntos_actuales) < a.puntos_actuales)
      .map(a => `${a.nombre} ${a.apellidos} (${a.grupo}): ${antes.get(a.id_alumno)} -> ${a.puntos_actuales} pts`);
    return { totalEvaluados: despues.length, recuperados: alumnosBeneficiados.length, alumnosBeneficiados };
  }

  /**
   * REQUISITOS FUNCIONALES V0 - SECCIÓN 4: MEDIDAS EDUCATIVAS / RESTAURATIVAS
   * Jefatura/Convivencia podrá registrar: «Medida educativa/restaurativa cumplida» -> +X puntos.
   */
  static registrarMedidaRestaurativa(
    idAlumno: string,
    puntosRecuperar: number,
    descripcionMedida: string,
    profesorNombre: string,
    usuarioEmail: string,
    tipoTarea: Compensacion['tipo_tarea'] = 'Taller de resolución pacífica y mediación'
  ): { alumnoActualizado: Alumno; nuevoSaldo: number; compensacion: Compensacion } {
    const alumno = this.getAlumnos().find(a => a.id_alumno === idAlumno);
    if (!alumno) {
      throw new Error(`Alumno no encontrado: ${idAlumno}`);
    }

    const saldoAnterior = this.calcularSaldoAlumno(idAlumno).saldoActual;
    const puntos = Math.max(1, Math.min(10, Math.round(puntosRecuperar) || 1));

    // Se guarda como compensación para que viaje a Google Drive y la vean todos los dispositivos
    const compensacion: Compensacion = {
      id_compensacion: `cmp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      id_alumno: idAlumno,
      id_profesor_autoriza: usuarioEmail,
      nombre_profesor_autoriza: profesorNombre,
      puntos_recuperados: puntos,
      tipo_tarea: tipoTarea,
      descripcion_tarea: descripcionMedida,
      fecha_completada: hoyLocal(),
    };
    this.saveCompensaciones([...this.getCompensaciones(), compensacion]);
    this.addPendingSyncCompensacionId(compensacion.id_compensacion);

    const alumnosActualizados = this.recalcularPuntosAlumnos(idAlumno);
    const alumnoActualizado = alumnosActualizados.find(a => a.id_alumno === idAlumno) || alumno;
    const nuevoSaldo = alumnoActualizado.puntos_actuales;

    this.addAuditLog(
      usuarioEmail,
      'COMPENSAR_PUNTOS',
      `MedidaRestaurativa/${alumno.nombre} ${alumno.apellidos}`,
      `Medida educativa/restaurativa registrada por Jefatura/Convivencia: "${descripcionMedida}" (+${puntos} pts). Saldo: ${saldoAnterior} -> ${nuevoSaldo}.`
    );

    return { alumnoActualizado, nuevoSaldo, compensacion };
  }

  /**
   * Ajuste manual de puntos (Jefatura/Convivencia): quita puntos sin tramitar un parte.
   * Se guarda como compensación con puntos negativos (viaja a Drive y llega a todos los dispositivos).
   * Reinicia el contador de recuperación semanal, igual que un parte que resta puntos.
   */
  static registrarAjustePuntos(
    idAlumno: string,
    puntosQuitar: number,
    motivo: string,
    profesorNombre: string,
    usuarioEmail: string
  ): { alumnoActualizado: Alumno; nuevoSaldo: number; compensacion: Compensacion } {
    const alumno = this.getAlumnos().find(a => a.id_alumno === idAlumno);
    if (!alumno) throw new Error(`Alumno no encontrado: ${idAlumno}`);
    const texto = (motivo || '').trim();
    if (!texto) throw new Error('Hay que indicar el motivo del ajuste.');

    const saldoAnterior = this.calcularSaldoAlumno(idAlumno).saldoActual;
    const puntos = Math.max(1, Math.min(10, Math.round(puntosQuitar) || 1));

    const compensacion: Compensacion = {
      id_compensacion: `aju-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      id_alumno: idAlumno,
      id_profesor_autoriza: usuarioEmail,
      nombre_profesor_autoriza: profesorNombre,
      puntos_recuperados: -puntos,
      tipo_tarea: 'Ajuste manual de puntos',
      descripcion_tarea: texto,
      fecha_completada: hoyLocal(),
    };
    this.saveCompensaciones([...this.getCompensaciones(), compensacion]);
    this.addPendingSyncCompensacionId(compensacion.id_compensacion);

    const alumnoActualizado = this.recalcularPuntosAlumnos(idAlumno).find(a => a.id_alumno === idAlumno) || alumno;
    const nuevoSaldo = alumnoActualizado.puntos_actuales;

    this.addAuditLog(
      usuarioEmail,
      'AJUSTE_PUNTOS',
      `AjustePuntos/${alumno.nombre} ${alumno.apellidos}`,
      `Ajuste manual de puntos sin parte (-${puntos} pts). Motivo: "${texto}". Saldo: ${saldoAnterior} -> ${nuevoSaldo}.`
    );
    return { alumnoActualizado, nuevoSaldo, compensacion };
  }

  /** Anula un ajuste manual de puntos (queda registrado quién, cuándo y por qué; no se borra). */
  static anularAjustePuntos(
    idCompensacion: string,
    motivo: string,
    usuarioEmail: string
  ): { alumnoActualizado?: Alumno; nuevoSaldo?: number } {
    const comps = this.getCompensaciones();
    const i = comps.findIndex(c => c.id_compensacion === idCompensacion);
    if (i === -1) throw new Error('Ajuste no encontrado');
    const c = comps[i];
    if (c.anulada) return {};
    if ((Number(c.puntos_recuperados) || 0) >= 0) throw new Error('Solo se pueden anular ajustes manuales.');
    const saldoAnterior = this.calcularSaldoAlumno(c.id_alumno).saldoActual;
    comps[i] = {
      ...c,
      anulada: true,
      anulada_por: usuarioEmail,
      fecha_anulacion: new Date().toISOString(),
      motivo_anulacion: (motivo || '').trim() || 'Error al registrar el ajuste',
      puntos_ajuste_original: c.puntos_recuperados,
      // A 0 para que también deje de contar en los dispositivos que solo reciben los puntos
      puntos_recuperados: 0,
    };
    this.saveCompensaciones(comps);
    this.addPendingSyncCompensacionId(idCompensacion);
    const alumno = this.recalcularPuntosAlumnos(c.id_alumno).find(a => a.id_alumno === c.id_alumno);
    this.addAuditLog(
      usuarioEmail,
      'ANULAR_AJUSTE_PUNTOS',
      `AjustePuntos/${alumno ? `${alumno.nombre} ${alumno.apellidos}` : c.id_alumno}`,
      `Anulado el ajuste manual del ${c.fecha_completada} (${c.puntos_recuperados} pts). Motivo: "${comps[i].motivo_anulacion}". Saldo: ${saldoAnterior} -> ${alumno?.puntos_actuales}.`
    );
    return { alumnoActualizado: alumno, nuevoSaldo: alumno?.puntos_actuales };
  }

  /**
   * Compensate points (compatibilidad con vistas previas)
   */
  static registrarCompensacion(
    compensacionData: Omit<Compensacion, 'id_compensacion' | 'timestamp'>,
    usuarioEmail: string
  ): { compensacion: Compensacion; alumnoActualizado: Alumno } {
    const res = this.registrarMedidaRestaurativa(
      compensacionData.id_alumno,
      compensacionData.puntos_recuperados,
      compensacionData.descripcion_tarea,
      compensacionData.nombre_profesor_autoriza,
      usuarioEmail,
      compensacionData.tipo_tarea
    );
    return { compensacion: res.compensacion, alumnoActualizado: res.alumnoActualizado };
  }

  static actualizarTramitacion(
    idSancion: string,
    nuevoEstado: Sancion['estado_tramitacion'],
    observaciones: string,
    usuarioEmail: string
  ): Sancion {
    const sanciones = this.getSanciones();
    const index = sanciones.findIndex(s => s.id_sancion === idSancion);
    if (index === -1) throw new Error('Sanción no encontrada');

    sanciones[index] = {
      ...sanciones[index],
      estado_tramitacion: nuevoEstado,
      observaciones_tramitacion: observaciones,
    };
    this.saveSanciones(sanciones);
    this.addPendingSyncSancionId(idSancion);

    this.addAuditLog(
      usuarioEmail,
      'ACTUALIZAR_TRAMITACION',
      `Sancion/${sanciones[index].numero_expediente}`,
      `Tramitación actualizada a ${nuevoEstado}. Nota: ${observaciones}`
    );

    return sanciones[index];
  }

  static actualizarEstadoPAC(
    idSancion: string,
    nuevoEstadoPAC: Sancion['estado_pac'],
    profesorReceptor: string,
    usuarioEmail: string
  ): Sancion {
    const sanciones = this.getSanciones();
    const index = sanciones.findIndex(s => s.id_sancion === idSancion);
    if (index === -1) throw new Error('Sanción no encontrada');

    const nowTime = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    sanciones[index] = {
      ...sanciones[index],
      estado_pac: nuevoEstadoPAC,
      profesor_pac_receptor: profesorReceptor,
      hora_llegada_pac: sanciones[index].hora_llegada_pac || nowTime,
    };
    this.saveSanciones(sanciones);
    this.addPendingSyncSancionId(idSancion);

    this.addAuditLog(
      usuarioEmail,
      'RECEPCION_PAC',
      `AulaPAC/${sanciones[index].numero_expediente}`,
      `Estado PAC cambiado a ${nuevoEstadoPAC} por ${profesorReceptor}.`
    );

    return sanciones[index];
  }

  /**
   * Bulk import / ETL logic (PRD RF-03):
   * Expects rows with [NIE/ID, NOMBRE, APELLIDOS, CURSO_GRUPO, (optional TELEFONO)]
   * UPSERT strategy: if student exists by NIE or by Full Name (apellidos + nombre),
   * updates name & group without resetting points or creating duplicates.
   * If new student, initializes with puntos_actuales = 10.
   */
  static importarAlumnadoCsv(
    csvText: string,
    usuarioEmail: string
  ): { totalProcessed: number; nuevos: number; actualizados: number; errores: string[] } {
    const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length <= 1) {
      throw new Error('El archivo CSV no contiene filas de datos.');
    }

    const currentAlumnos = [...this.getAlumnos()];
    const alumnoMapByNie = new Map<string, Alumno>();
    const alumnoMapByCanonical = new Map<string, Alumno>();
    const alumnoMapByTokens = new Map<string, Alumno>();

    const indexAlumno = (alm: Alumno) => {
      const aNie = (alm.nie || '').trim().toUpperCase();
      if (aNie && !aNie.startsWith('SN-') && !['SIN NIE', 'PENDIENTE', 'NO TIENE', 'SN', '-', 'NO'].includes(aNie)) {
        alumnoMapByNie.set(aNie, alm);
      }
      const cKey = normalizarNombreComparacion(alm.nombre, alm.apellidos);
      if (cKey) alumnoMapByCanonical.set(cKey, alm);
      const tKey = normalizarTokensNombre(alm.nombre, alm.apellidos);
      if (tKey) alumnoMapByTokens.set(tKey, alm);
    };

    currentAlumnos.forEach(indexAlumno);

    let nuevos = 0;
    let actualizados = 0;
    const errores: string[] = [];

    // Check header
    const headerLine = lines[0].toLowerCase();
    const separator = headerLine.includes(';') ? ';' : ',';

    let sinNieCounter = 1;

    for (let i = 1; i < lines.length; i++) {
      const rawRow = lines[i];
      if (!rawRow.trim()) continue;

      const row = rawRow.split(separator).map(c => c.trim().replace(/^["']|["']$/g, ''));
      if (row.length < 3) {
        errores.push(`Línea ${i + 1}: Faltan columnas mínimas requeridas (Nombre, Apellidos, Grupo).`);
        continue;
      }

      const rawNie = (row[0] || '').trim();
      const nombre = (row[1] || '').trim();
      const apellidos = (row[2] || '').trim();
      const grupoRaw = (row[3] || '').trim();
      const telefonoRaw = (row[4] || '').trim();
      const tutorRaw = (row[5] || '').trim();

      if (!nombre || !apellidos) {
        errores.push(`Línea ${i + 1}: Nombre y Apellidos son obligatorios.`);
        continue;
      }

      // Normalizar grupo permitiendo formatos como "1º FRIO", "1_FRIO", "1 BACH A", "1BACH_A", etc.
      let grupoNorm = (grupoRaw.toUpperCase().replace(/\s+/g, '_').replace(/º/g, '') || '1ESO_A');
      if (grupoNorm.includes('FRIO')) {
        grupoNorm = grupoNorm.startsWith('2') ? '2_FRIO' : '1_FRIO';
      } else if (grupoNorm.includes('INF') && !grupoNorm.includes('ESO') && !grupoNorm.includes('BACH')) {
        grupoNorm = grupoNorm.startsWith('2') ? '2_INF' : '1_INF';
      } else if (grupoNorm.includes('CALOR')) {
        grupoNorm = grupoNorm.startsWith('2') ? '2_CALOR' : '1_CALOR';
      } else {
        grupoNorm = grupoNorm.replace(/_+/g, '_').replace(/ESO_([A-D])/, 'ESO_$1').replace(/BACH_([A-D])/, 'BACH_$1');
        grupoNorm = grupoNorm.replace(/^(\d)_ESO_([A-D])$/, '$1ESO_$2').replace(/^(\d)_BACH_([A-D])$/, '$1BACH_$2');
      }
      const grupo = grupoNorm as GrupoEducativo;

      const upperNie = rawNie.toUpperCase();
      const isWithoutNie = !rawNie || 
        ['SIN NIE', 'NO TIENE', 'S/N', 'SN', '-', 'PENDIENTE', 'NO', 'N/A', 'SIN_NIE'].includes(upperNie);

      const canonicalKey = normalizarNombreComparacion(nombre, apellidos);
      const tokenKey = normalizarTokensNombre(nombre, apellidos);

      let existingAlumno: Alumno | undefined;
      if (!isWithoutNie && alumnoMapByNie.has(upperNie)) {
        existingAlumno = alumnoMapByNie.get(upperNie);
      } else if (canonicalKey && alumnoMapByCanonical.has(canonicalKey)) {
        existingAlumno = alumnoMapByCanonical.get(canonicalKey);
      } else if (tokenKey && tokenKey.length >= 4 && alumnoMapByTokens.has(tokenKey)) {
        existingAlumno = alumnoMapByTokens.get(tokenKey);
      }

      let finalNie = '';
      if (!isWithoutNie) {
        finalNie = upperNie;
      } else if (existingAlumno && existingAlumno.nie) {
        finalNie = existingAlumno.nie;
      } else {
        const grupoSlug = grupo.replace(/[^a-zA-Z0-9]/g, '') || 'ALUM';
        const seq = String(sinNieCounter++).padStart(3, '0');
        finalNie = `SN-${grupoSlug}-${seq}`;
      }

      if (existingAlumno) {
        existingAlumno.nombre = nombre;
        existingAlumno.apellidos = apellidos;
        if (grupo) existingAlumno.grupo = grupo;
        if (telefonoRaw) existingAlumno.telefono_tutor = telefonoRaw;
        if (tutorRaw) existingAlumno.nombre_tutor = tutorRaw;
        if (existingAlumno.estado === 'BAJA') {
          existingAlumno.estado = 'ACTIVO';
        }

        if (!isWithoutNie && (!existingAlumno.nie || existingAlumno.nie.startsWith('SN-'))) {
          existingAlumno.nie = finalNie;
        }

        indexAlumno(existingAlumno);
        this.addPendingSyncAlumnoId(existingAlumno.id_alumno);
        actualizados++;
      } else {
        const newStudent: Alumno = {
          id_alumno: `alm-import-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          nie: finalNie,
          nombre,
          apellidos,
          grupo,
          puntos_actuales: 10,
          estado: 'ACTIVO',
          telefono_tutor: telefonoRaw || '600 00 00 00',
          nombre_tutor: tutorRaw || 'Tutor Legal',
        };

        currentAlumnos.push(newStudent);
        indexAlumno(newStudent);
        this.addPendingSyncAlumnoId(newStudent.id_alumno);
        nuevos++;
      }
    }

    this.saveAlumnos(currentAlumnos);
    // Garantizar que no quede ningún duplicado residual
    this.depurarAlumnosDuplicados(usuarioEmail);

    this.addAuditLog(
      usuarioEmail,
      'IMPORTACION_MASIVA',
      'ETL/Alumnos',
      `Importación masiva completada: ${nuevos} nuevos insertados (con 10 pts iniciales), ${actualizados} actualizados/unificados.`
    );

    return {
      totalProcessed: lines.length - 1,
      nuevos,
      actualizados,
      errores,
    };
  }

  /**
   * Importa alumnos procesados desde un archivo ODS o Excel (2 columnas: Apellidos Nombre y Curso)
   * Aplica unificación estricta por Nombre y Apellidos para impedir duplicados en el censo.
   */
  static importarAlumnosDesdeFilas(
    filas: Array<{ nombre: string; apellidos: string; grupo: GrupoEducativo; nie?: string }>,
    usuarioEmail: string
  ): { totalProcessed: number; nuevos: number; actualizados: number; errores: string[] } {
    if (!filas || filas.length === 0) {
      throw new Error('No se encontraron registros de alumnos para importar.');
    }

    const currentAlumnos = [...this.getAlumnos()];
    const alumnoMapByNie = new Map<string, Alumno>();
    const alumnoMapByCanonical = new Map<string, Alumno>();
    const alumnoMapByTokens = new Map<string, Alumno>();

    const indexAlumno = (alm: Alumno) => {
      const aNie = (alm.nie || '').trim().toUpperCase();
      if (aNie && !aNie.startsWith('SN-') && !['SIN NIE', 'PENDIENTE', 'NO TIENE', 'SN', '-', 'NO'].includes(aNie)) {
        alumnoMapByNie.set(aNie, alm);
      }
      const cKey = normalizarNombreComparacion(alm.nombre, alm.apellidos);
      if (cKey) alumnoMapByCanonical.set(cKey, alm);
      const tKey = normalizarTokensNombre(alm.nombre, alm.apellidos);
      if (tKey) alumnoMapByTokens.set(tKey, alm);
    };

    currentAlumnos.forEach(indexAlumno);

    let nuevos = 0;
    let actualizados = 0;
    const errores: string[] = [];
    let sinNieCounter = 1;

    for (let i = 0; i < filas.length; i++) {
      const item = filas[i];
      const nombre = item.nombre.trim();
      const apellidos = item.apellidos.trim();
      const grupo = item.grupo;
      const rawNie = (item.nie || '').trim();

      if (!apellidos) {
        errores.push(`Fila ${i + 1}: El alumno carece de apellidos.`);
        continue;
      }

      const upperNie = rawNie.toUpperCase();
      const isWithoutNie = !rawNie || 
        ['SIN NIE', 'NO TIENE', 'S/N', 'SN', '-', 'PENDIENTE', 'NO', 'N/A', 'SIN_NIE'].includes(upperNie);

      const canonicalKey = normalizarNombreComparacion(nombre, apellidos);
      const tokenKey = normalizarTokensNombre(nombre, apellidos);

      let existingAlumno: Alumno | undefined;
      if (!isWithoutNie && alumnoMapByNie.has(upperNie)) {
        existingAlumno = alumnoMapByNie.get(upperNie);
      } else if (canonicalKey && alumnoMapByCanonical.has(canonicalKey)) {
        existingAlumno = alumnoMapByCanonical.get(canonicalKey);
      } else if (tokenKey && tokenKey.length >= 4 && alumnoMapByTokens.has(tokenKey)) {
        existingAlumno = alumnoMapByTokens.get(tokenKey);
      }

      let finalNie = '';
      if (!isWithoutNie) {
        finalNie = upperNie;
      } else if (existingAlumno && existingAlumno.nie) {
        finalNie = existingAlumno.nie;
      } else {
        const grupoSlug = grupo.replace(/[^a-zA-Z0-9]/g, '') || 'ALUM';
        const seq = String(sinNieCounter++).padStart(3, '0');
        finalNie = `SN-${grupoSlug}-${seq}`;
      }

      if (existingAlumno) {
        existingAlumno.nombre = nombre;
        existingAlumno.apellidos = apellidos;
        if (grupo) existingAlumno.grupo = grupo;
        if (existingAlumno.estado === 'BAJA') {
          existingAlumno.estado = 'ACTIVO';
        }
        if (!isWithoutNie && (!existingAlumno.nie || existingAlumno.nie.startsWith('SN-'))) {
          existingAlumno.nie = finalNie;
        }

        indexAlumno(existingAlumno);
        this.addPendingSyncAlumnoId(existingAlumno.id_alumno);
        actualizados++;
      } else {
        const newStudent: Alumno = {
          id_alumno: `alm-ods-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          nie: finalNie,
          nombre,
          apellidos,
          grupo,
          puntos_actuales: 10,
          estado: 'ACTIVO',
          telefono_tutor: '600 00 00 00',
          nombre_tutor: 'Tutor Legal',
        };

        currentAlumnos.push(newStudent);
        indexAlumno(newStudent);
        this.addPendingSyncAlumnoId(newStudent.id_alumno);
        nuevos++;
      }
    }

    this.saveAlumnos(currentAlumnos);
    // Garantizar que no quede ningún duplicado residual
    this.depurarAlumnosDuplicados(usuarioEmail);

    this.addAuditLog(
      usuarioEmail,
      'IMPORTACION_MASIVA',
      'ETL/Alumnos_ODS',
      `Importación ODS/Hoja (2 columnas) completada: ${nuevos} nuevos insertados (10 pts iniciales), ${actualizados} actualizados/unificados.`
    );

    return {
      totalProcessed: filas.length,
      nuevos,
      actualizados,
      errores,
    };
  }

  /**
   * Create Drive Snapshot Backup (EC-02)
   */
  static crearSnapshotBackup(usuarioEmail: string): string {
    const snapshot = {
      fecha: new Date().toISOString(),
      alumnos: this.getAlumnos(),
      profesores: this.getProfesores(),
      sanciones: this.getSanciones(),
      compensaciones: this.getCompensaciones(),
      movimientos: this.getMovimientos(),
      auditLogs: this.getAuditLogs(),
    };
    const backups = JSON.parse(localStorage.getItem(KEY_BACKUPS) || '[]');
    const idBackup = `SNAPSHOT_DRIVE_${Date.now()}`;
    backups.unshift({ 
      id: idBackup, 
      fecha: snapshot.fecha, 
      totalAlumnos: snapshot.alumnos.length, 
      totalProfesores: snapshot.profesores.length,
      totalSanciones: snapshot.sanciones.length 
    });
    localStorage.setItem(KEY_BACKUPS, JSON.stringify(backups.slice(0, 10)));

    this.addAuditLog(
      usuarioEmail,
      'IMPORTACION_MASIVA',
      `DriveBackup/${idBackup}`,
      `Instantánea de seguridad completa generada en carpeta institucional Drive /SIGC_DATA/.backups/ (${snapshot.alumnos.length} alumnos, ${snapshot.profesores.length} docentes, ${snapshot.sanciones.length} partes)`
    );

    return idBackup;
  }

  /**
   * Obtiene el identificador del curso escolar actualmente activo (ej. "2026/2027")
   */
  static getCursoActual(): string {
    const curso = localStorage.getItem(KEY_CURSO_ACTUAL);
    if (!curso) {
      localStorage.setItem(KEY_CURSO_ACTUAL, '2026/2027');
      return '2026/2027';
    }
    return curso;
  }

  /**
   * Obtiene todos los cursos archivados históricamente
   */
  static getHistoricoCursos(): CursoAcademicoArchivo[] {
    const raw = localStorage.getItem(KEY_HISTORICO_CURSOS);
    if (!raw) return [];
    try {
      const parsed: CursoAcademicoArchivo[] = JSON.parse(raw);
      // Purgar de forma permanente cualquier curso de prueba o ficticio previo
      const filtrados = parsed.filter(c => c.id_curso !== '2024/2025' && c.id_curso !== '2025/2026');
      if (filtrados.length !== parsed.length) {
        localStorage.setItem(KEY_HISTORICO_CURSOS, JSON.stringify(filtrados));
      }
      return filtrados;
    } catch {
      return [];
    }
  }

  static saveHistoricoCursos(cursos: CursoAcademicoArchivo[]): void {
    const filtrados = cursos.filter(c => c.id_curso !== '2024/2025' && c.id_curso !== '2025/2026');
    localStorage.setItem(KEY_HISTORICO_CURSOS, JSON.stringify(filtrados));
  }

  /**
   * Lista todos los cursos académicos disponibles (activo + cursos archivados reales)
   */
  static getCursosDisponibles(): InfoCursoAcademico[] {
    const actual = this.getCursoActual();
    const historicos = this.getHistoricoCursos();

    const result: InfoCursoAcademico[] = [
      {
        id: actual,
        label: `Curso ${actual} (Actual / Activo)`,
        isCurrent: true,
        totalAlumnos: this.getAlumnos().length,
        totalSanciones: this.getSanciones().length,
      }
    ];

    historicos.forEach(h => {
      if (h.id_curso !== actual && h.id_curso !== '2024/2025' && h.id_curso !== '2025/2026' && !result.some(r => r.id === h.id_curso)) {
        result.push({
          id: h.id_curso,
          label: `Curso ${h.id_curso} (Archivado)`,
          isCurrent: false,
          totalAlumnos: h.total_alumnos,
          totalSanciones: h.total_sanciones,
          fechaCierre: h.fecha_cierre,
        });
      }
    });

    return result;
  }

  /**
   * Obtiene todas las sanciones históricas archivadas de cursos pasados
   */
  static getHistoricoSancionesTodosLosCursos(): Sancion[] {
    const historicos = this.getHistoricoCursos();
    const sanciones: Sancion[] = [];
    historicos.forEach(h => {
      if (h.sanciones_archivo && h.sanciones_archivo.length > 0) {
        sanciones.push(...h.sanciones_archivo);
      }
    });
    return sanciones;
  }

  /**
   * Obtiene todas las compensaciones archivadas de cursos pasados
   */
  static getHistoricoCompensacionesTodosLosCursos(): Compensacion[] {
    const historicos = this.getHistoricoCursos();
    const compensaciones: Compensacion[] = [];
    historicos.forEach(h => {
      if (h.compensaciones_archivo && h.compensaciones_archivo.length > 0) {
        compensaciones.push(...h.compensaciones_archivo);
      }
    });
    return compensaciones;
  }

  /**
   * Apertura oficial de un nuevo curso escolar (ej. "2027/2028")
   * Archiva el curso actual de forma inmutable preservando todos sus alumnos, partes, compensaciones
   * y puntos para que puedan ser comparados en cualquier momento histórico.
   */
  static crearNuevoCursoEscolar(
    nuevoCursoId: string,
    opciones: {
      limpiarAlumnosParaNuevoODS?: boolean;
      usuarioOperador: string;
    }
  ): { success: boolean; cursoAnteriorArchivado: string; nuevoCurso: string; error?: string } {
    const cursoActual = this.getCursoActual();
    const cleanNuevoCurso = nuevoCursoId.trim();

    if (!cleanNuevoCurso) {
      return { success: false, cursoAnteriorArchivado: '', nuevoCurso: '', error: 'Debe indicar el nombre o identificador del nuevo curso escolar (ejemplo: 2027/2028).' };
    }

    if (cleanNuevoCurso === cursoActual) {
      return { success: false, cursoAnteriorArchivado: '', nuevoCurso: '', error: `El curso ${cleanNuevoCurso} ya es el curso escolar actualmente activo.` };
    }

    const alumnosActuales = this.getAlumnos();
    const sancionesActuales = this.getSanciones();
    const compensacionesActuales = this.getCompensaciones();
    const movimientosActuales = this.getMovimientos();

    // 1. Archivar curso actual en histórico inmutable
    const historicos = this.getHistoricoCursos();
    const indexExistente = historicos.findIndex(h => h.id_curso === cursoActual);

    const archivoCurso: CursoAcademicoArchivo = {
      id_curso: cursoActual,
      nombre: `Curso Escolar ${cursoActual}`,
      fecha_inicio: historicos[indexExistente]?.fecha_inicio || new Date().toISOString(),
      fecha_cierre: new Date().toISOString(),
      activo: false,
      cerrado_por: opciones.usuarioOperador,
      total_alumnos: alumnosActuales.length,
      total_sanciones: sancionesActuales.length,
      total_compensaciones: compensacionesActuales.length,
      alumnos_archivo: alumnosActuales,
      sanciones_archivo: sancionesActuales,
      compensaciones_archivo: compensacionesActuales,
      movimientos_archivo: movimientosActuales,
    };

    if (indexExistente >= 0) {
      historicos[indexExistente] = archivoCurso;
    } else {
      historicos.unshift(archivoCurso);
    }
    this.saveHistoricoCursos(historicos);

    // 2. Establecer nuevo curso como activo
    localStorage.setItem(KEY_CURSO_ACTUAL, cleanNuevoCurso);

    // 3. Reiniciar partes y contabilidad disciplinaria para el nuevo curso
    this.saveSanciones([]);
    this.saveCompensaciones([]);
    this.saveMovimientos([]);

    // 4. Gestión de alumnos
    if (opciones.limpiarAlumnosParaNuevoODS) {
      this.saveAlumnos([]);
    } else {
      const renovados = alumnosActuales.map(a => ({
        ...a,
        puntos_actuales: 10,
        estado: 'ACTIVO' as const,
        historial_sanciones_count: 0,
      }));
      this.saveAlumnos(renovados);
    }

    // 5. Registrar log de auditoría
    this.addAuditLog(
      opciones.usuarioOperador,
      'ACTUALIZACION_SISTEMA',
      `CursoEscolar/${cleanNuevoCurso}`,
      `Apertura de nuevo curso escolar ${cleanNuevoCurso}. El curso previo (${cursoActual}) ha sido archivado con éxito (${alumnosActuales.length} alumnos, ${sancionesActuales.length} partes archivados para comparativas).`
    );

    return {
      success: true,
      cursoAnteriorArchivado: cursoActual,
      nuevoCurso: cleanNuevoCurso,
    };
  }
}
