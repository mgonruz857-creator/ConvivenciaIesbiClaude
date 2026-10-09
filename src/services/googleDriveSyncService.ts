/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Alumno, Profesor, Sancion, Compensacion, AuditLog, ExpedienteSancion } from '../types/convivencia';
import { StorageService } from './storageService';
import { AuthService } from './authService';
import { URL_API_DRIVE, CARPETA_DRIVE_ID } from '../config/entorno';
import { llamarApi } from './apiService';
import { guardarCola, restaurarCola } from './colaPendiente';
import { tomarDatosIniciales } from './datosIniciales';

export const EVENTO_ESTADO_GUARDADO = 'sigc-estado-guardado';

const SYNC_URL_STORAGE_KEY = 'sigc_bi_drive_sync_api_url_v1';
const LAST_SYNC_STORAGE_KEY = 'sigc_bi_last_drive_sync_timestamp_v1';

// Endpoint de Google Apps Script según el entorno (ver src/config/entorno.ts)
export const DEFAULT_OFFICIAL_DRIVE_API_URL = URL_API_DRIVE;

export interface DriveDatabaseState {
  version: string;
  timestamp: string;
  origen: string;
  centro: {
    nombre: string;
    codigo: string;
    cuenta_institucional: string;
    drive_folder_id: string;
  };
  profesores: Profesor[];
  credenciales_profesores?: Record<string, string>;
  alumnos: Alumno[];
  sanciones: Sancion[];
  compensaciones: Compensacion[];
  audit_logs: AuditLog[];
  deleted_sanciones?: string[];
  deleted_alumnos?: string[];
  deleted_profesores?: string[];
  expedientes_sancion?: ExpedienteSancion[];
  deleted_expedientes?: string[];
  reset_credenciales_emails?: string[];
}

export class GoogleDriveSyncService {
  private static pushTimeoutId: any = null;
  private static isPushing: boolean = false;
  private static pendingPushQueued: boolean = false;
  private static lastRemoteTimestamp: string | null = null;
  // Se incrementa cada vez que termina una subida. Una descarga que empezó antes
  // de esa subida trae datos anteriores a ella y no debe aplicarse.
  private static pushEpoch: number = 0;
  /** Último error al guardar (null si el último guardado fue bien). */
  static lastPushError: string | null = null;

  /**
   * Dispara una sincronización rápida no bloqueante con debounce.
   * Agrupa múltiples acciones rápidas de profesores en un único envío eficiente.
   */
  static triggerFastSync(delayMs: number = 350): void {
    // Guardar en el navegador lo que aún no ha confirmado el servidor (por si se cierra la pestaña)
    guardarCola(AuthService.getCurrentUser()?.email);
    if (this.pushTimeoutId) {
      clearTimeout(this.pushTimeoutId);
    }
    this.pushTimeoutId = setTimeout(() => {
      this.pushTimeoutId = null;
      this.pushToGoogleDrive().catch(() => {});
    }, delayMs);
  }

  /**
   * Obtiene la URL configurada del Web App de Google Apps Script vinculado al Drive del centro.
   */
  static getSyncApiUrl(): string {
    // Siempre la dirección configurada para el entorno (src/config/entorno.ts). Se ignora cualquier
    // dirección guardada en el navegador por versiones anteriores: podría apuntar a un servidor antiguo.
    try {
      localStorage.removeItem(SYNC_URL_STORAGE_KEY);
    } catch {
      /* sin almacenamiento */
    }
    return URL_API_DRIVE;
  }

  /** Ya no se puede cambiar la dirección del servidor desde la app (se fija en src/config/entorno.ts). */
  static setSyncApiUrl(_url: string): void {
    try {
      localStorage.removeItem(SYNC_URL_STORAGE_KEY);
    } catch {
      /* sin almacenamiento */
    }
  }

  /**
   * Fecha de la última sincronización completada con éxito.
   */
  static getLastSyncTimestamp(): string | null {
    return localStorage.getItem(LAST_SYNC_STORAGE_KEY);
  }

  /**
   * Empaqueta el estado completo actual del sistema para ser custodiado en Drive.
   */
  static getFullDatabasePayload(): DriveDatabaseState {
    const unidad = StorageService.getUnidadInstitucional();
    // Las contraseñas nunca salen del servidor ni viajan en los datos
    const profs = StorageService.getProfesores().map(p => {
      const { password_hash, requiere_cambio_clave, ...resto } = p as any;
      return resto as Profesor;
    });

    return {
      version: '3.0.0-PROD',
      timestamp: new Date().toISOString(),
      origen: 'S.I.G.C. - IES Blas Infante (Córdoba)',
      centro: {
        nombre: 'IES Blas Infante',
        codigo: '14007180',
        cuenta_institucional: unidad.email,
        drive_folder_id: unidad.folderId || CARPETA_DRIVE_ID,
      },
      profesores: profs,
      alumnos: StorageService.getAlumnos(),
      sanciones: StorageService.getSanciones(),
      compensaciones: StorageService.getCompensaciones(),
      expedientes_sancion: StorageService.getExpedientes(),
      deleted_expedientes: StorageService.getDeletedExpedienteIds(),
      audit_logs: StorageService.getAuditLogs(),
      deleted_sanciones: StorageService.getDeletedSancionIds(),
      deleted_alumnos: StorageService.getDeletedAlumnoIds(),
      deleted_profesores: StorageService.getDeletedProfesorIds(),
    };
  }

  /**
   * Descarga el censo y los datos más recientes desde Google Drive y los fusiona de forma segura.
   * Utiliza reconciliación bidireccional con soporte estricto de borrados (tombstones) para que
   * cuando un administrador o docente elimina un parte, se borre de inmediato en todos los ordenadores y sesiones.
   */
  static async pullFromGoogleDrive(options?: { forceRefresh?: boolean; skipAutoPush?: boolean }): Promise<{ success: boolean; message: string; notModified?: boolean; dataCount?: { profesores: number; alumnos: number; sanciones: number } }> {
    const apiUrl = this.getSyncApiUrl();
    if (!apiUrl) {
      const profesores = StorageService.getProfesores();
      const alumnos = StorageService.getAlumnos();
      const sanciones = StorageService.getSanciones();
      localStorage.setItem(LAST_SYNC_STORAGE_KEY, new Date().toISOString());
      return {
        success: true,
        message: 'Datos locales verificados y listos para custodia institucional.',
        dataCount: { profesores: profesores.length, alumnos: alumnos.length, sanciones: sanciones.length },
      };
    }

    const pushEpochAtStart = this.pushEpoch;

    const token = AuthService.getToken();
    if (!token) {
      return { success: false, message: 'Debe iniciar sesión para sincronizar.' };
    }

    try {
      const primeraCarga = !StorageService.hasLoadedFromDrive();
      // Si ya tenemos los datos, pedir solo "¿ha cambiado algo desde esta versión?"
      const desde = StorageService.hasLoadedFromDrive() ? this.lastRemoteTimestamp : null;
      // Primera carga tras iniciar sesión: los datos ya vinieron con la respuesta del inicio de sesión
      const iniciales = primeraCarga ? tomarDatosIniciales() : null;
      const respuesta = iniciales ? { ok: true, data: iniciales } : await llamarApi('leer', desde ? { token, desde } : { token });
      if (!respuesta.ok) {
        throw new Error(respuesta.error || 'El servidor de datos no ha respondido correctamente.');
      }
      if (respuesta.sinCambios) {
        // Nada nuevo en Drive: solo actualizar saldos (la recuperación semanal depende de la fecha)
        StorageService.recalcularPuntosAlumnos();
        return {
          success: true,
          notModified: true,
          message: 'Base de datos al día (sin cambios).',
          dataCount: {
            profesores: StorageService.getProfesores().length,
            alumnos: StorageService.getAlumnos().length,
            sanciones: StorageService.getSanciones().length,
          },
        };
      }
      const remoteData: any = respuesta.data;
      if (!remoteData || typeof remoteData !== 'object') {
        throw new Error('Respuesta inválida del servidor de datos.');
      }

      // Si mientras esperábamos la respuesta terminó una subida desde este dispositivo,
      // esta respuesta es anterior a esa subida: descartarla para no borrar lo recién guardado.
      if (this.pushEpoch !== pushEpochAtStart) {
        return {
          success: true,
          notModified: true,
          message: 'Lectura descartada: se ha guardado información más reciente durante la descarga.',
        };
      }

      this.lastRemoteTimestamp = remoteData.timestamp || new Date().toISOString();

      let localHasPendingData = false;

      // 0. Reconciliación de Tombstones (Elementos eliminados oficialmente)
      const remoteDeletedSanciones = new Set<string>(remoteData.deleted_sanciones || []);
      const localDeletedSanciones = new Set<string>(StorageService.getDeletedSancionIds());
      const pendingSyncSancionIds = new Set<string>(StorageService.getPendingSyncSancionIds());
      const pendingSyncProfEmails = new Set<string>(StorageService.getPendingSyncProfesorEmails());
      const pendingSyncAlumnoIds = new Set<string>(StorageService.getPendingSyncAlumnoIds());

      // Solo mantener tombstones que estén en el servidor o que acaben de ser eliminados en esta sesión
      const allDeletedSanciones = new Set<string>([...remoteDeletedSanciones, ...localDeletedSanciones]);
      // Partes borrados que Jefatura acaba de recuperar y aún no ha confirmado el servidor
      StorageService.getSancionesRecuperadas().forEach(id => {
        if (pendingSyncSancionIds.has(id)) allDeletedSanciones.delete(id);
      });

      // Si vienen sanciones en remoteData.sanciones y NO acaban de ser eliminadas en esta sesión, son ACTIVAS en Drive
      if (remoteData.sanciones && Array.isArray(remoteData.sanciones)) {
        remoteData.sanciones.forEach((s: Sancion) => {
          if (s?.id_sancion && !localDeletedSanciones.has(s.id_sancion)) {
            allDeletedSanciones.delete(s.id_sancion);
            StorageService.removeDeletedSancionId(s.id_sancion);
          }
        });
      }
      StorageService.saveDeletedSancionIds(Array.from(allDeletedSanciones));

      const remoteDeletedAlumnos = new Set<string>(remoteData.deleted_alumnos || []);
      const localDeletedAlumnos = new Set<string>(StorageService.getDeletedAlumnoIds());
      const allDeletedAlumnos = new Set<string>([...remoteDeletedAlumnos, ...localDeletedAlumnos]);
      if (remoteData.alumnos && Array.isArray(remoteData.alumnos)) {
        remoteData.alumnos.forEach((a: Alumno) => {
          if (a?.id_alumno && !localDeletedAlumnos.has(a.id_alumno)) {
            allDeletedAlumnos.delete(a.id_alumno);
          }
        });
      }
      StorageService.saveDeletedAlumnoIds(Array.from(allDeletedAlumnos));

      const remoteDeletedProfs = new Set<string>(remoteData.deleted_profesores || []);
      const localDeletedProfs = new Set<string>(StorageService.getDeletedProfesorIds());
      const allDeletedProfs = new Set<string>([...remoteDeletedProfs, ...localDeletedProfs]);
      StorageService.saveDeletedProfesorIds(Array.from(allDeletedProfs));

      // 1. Fusión de Profesores (Drive es la fuente de verdad; solo sobrescribir si hay cambio en vuelo en esta sesión)
      if (remoteData.profesores && Array.isArray(remoteData.profesores)) {
        const localProfs = StorageService.getProfesores();
        const profMap = new Map<string, Profesor>();
        remoteData.profesores.forEach((p: Profesor) => {
          if (p?.email && !allDeletedProfs.has(p.id_profesor) && !allDeletedProfs.has(p.email)) {
            profMap.set(p.email.toLowerCase().trim(), p);
          }
        });
        localProfs.forEach(lp => {
          if (lp?.email && !allDeletedProfs.has(lp.id_profesor) && !allDeletedProfs.has(lp.email)) {
            const k = lp.email.toLowerCase().trim();
            const existing = profMap.get(k);
            if (!existing) {
              if (pendingSyncProfEmails.has(k)) {
                profMap.set(k, lp);
                localHasPendingData = true;
              }
            } else if (pendingSyncProfEmails.has(k)) {
              // El usuario acaba de editar este profesor en esta sesión activa
              profMap.set(k, { ...existing, ...lp });
              localHasPendingData = true;
            }
          }
        });
        StorageService.saveProfesores(Array.from(profMap.values()));
      }

      // 3. Fusión de Sanciones (Google Drive es la única fuente de verdad salvo ediciones en vuelo en esta sesión)
      if (remoteData.sanciones && Array.isArray(remoteData.sanciones)) {
        const localSanciones = StorageService.getSanciones();
        const sancionMap = new Map<string, Sancion>();

        // Cargar todas las sanciones activas del JSON remoto de Drive (excluyendo las recién eliminadas en esta sesión)
        remoteData.sanciones.forEach((s: Sancion) => {
          if (s?.id_sancion && !localDeletedSanciones.has(s.id_sancion)) {
            sancionMap.set(s.id_sancion, s);
          }
        });

        // Aplicar únicamente las creaciones o modificaciones pendientes en vuelo de esta sesión
        localSanciones.forEach(localS => {
          if (!localS?.id_sancion) return;
          if (allDeletedSanciones.has(localS.id_sancion)) return;

          if (pendingSyncSancionIds.has(localS.id_sancion)) {
            const existingRemote = sancionMap.get(localS.id_sancion);
            sancionMap.set(localS.id_sancion, existingRemote ? { ...existingRemote, ...localS } : localS);
            localHasPendingData = true;
          }
        });

        const mergedSanciones = StorageService.deduplicarSancionesPorExpediente(Array.from(sancionMap.values()));
        StorageService.saveSanciones(mergedSanciones);
      }

      // 4b. Expedientes de sanción: Drive manda, salvo los cambios de esta sesión aún sin confirmar
      if (Array.isArray(remoteData.expedientes_sancion)) {
        const pendientesExp = new Set(StorageService.getPendingSyncExpedienteIds());
        const borradosExp = new Set<string>([...(remoteData.deleted_expedientes || []), ...StorageService.getDeletedExpedienteIds()]);
        StorageService.saveDeletedExpedienteIds(Array.from(borradosExp));
        const mapaExp = new Map<string, ExpedienteSancion>();
        remoteData.expedientes_sancion.forEach((e: ExpedienteSancion) => {
          if (e?.id_expediente && !borradosExp.has(e.id_expediente)) mapaExp.set(e.id_expediente, e);
        });
        StorageService.getExpedientes().forEach(e => {
          if (pendientesExp.has(e.id_expediente) && !borradosExp.has(e.id_expediente)) {
            mapaExp.set(e.id_expediente, e);
            localHasPendingData = true;
          }
        });
        if (Array.from(pendientesExp).some(id => borradosExp.has(id))) localHasPendingData = true;
        StorageService.saveExpedientes(
          Array.from(mapaExp.values()).sort((a, b) => b.fecha_creacion.localeCompare(a.fecha_creacion))
        );
      }

      // 4. Fusión de Compensaciones (Unión por id_compensacion)
      if (remoteData.compensaciones && Array.isArray(remoteData.compensaciones)) {
        const localComps = StorageService.getCompensaciones();
        const compMap = new Map<string, Compensacion>();
        remoteData.compensaciones.forEach((c: Compensacion) => {
          if (c?.id_compensacion) compMap.set(c.id_compensacion, c);
        });
        localComps.forEach(lc => {
          if (lc?.id_compensacion && !compMap.has(lc.id_compensacion)) {
            compMap.set(lc.id_compensacion, lc);
            localHasPendingData = true;
          }
        });
        StorageService.saveCompensaciones(Array.from(compMap.values()));
      }

      // 5. Fusión de Alumnos (Google Drive es la única fuente de verdad salvo ediciones en vuelo en esta sesión)
      if (remoteData.alumnos && Array.isArray(remoteData.alumnos)) {
        const localAlumnos = StorageService.getAlumnos();
        const alumnoMap = new Map<string, Alumno>();

        remoteData.alumnos.forEach((a: Alumno) => {
          if (a?.id_alumno && !allDeletedAlumnos.has(a.id_alumno)) {
            alumnoMap.set(a.id_alumno, a);
          }
        });

        localAlumnos.forEach(localA => {
          if (!localA?.id_alumno || allDeletedAlumnos.has(localA.id_alumno)) return;

          if (pendingSyncAlumnoIds.has(localA.id_alumno)) {
            const existingRemote = alumnoMap.get(localA.id_alumno);
            alumnoMap.set(localA.id_alumno, existingRemote ? { ...existingRemote, ...localA } : localA);
            localHasPendingData = true;
          }
        });

        StorageService.saveAlumnos(Array.from(alumnoMap.values()));
        StorageService.depurarAlumnosDuplicados('SISTEMA_SYNC');
      }

      // Informe del paso a la versión 2 (solo lo recibe Jefatura/Convivencia)
      StorageService.setSaldosAntesV2(remoteData.saldos_antes_v2);
      StorageService.setInformeMigracionV2(remoteData.migracion_v2);

      // 6. Recálculo automático estricto de puntos de carnet tras sincronizar sanciones y compensaciones
      StorageService.recalcularPuntosAlumnos();
      StorageService.markLoadedFromDrive();

      // 6. Fusión de Audit Logs
      if (remoteData.audit_logs && Array.isArray(remoteData.audit_logs)) {
        const localLogs = StorageService.getAuditLogs();
        const logMap = new Map<string, AuditLog>();
        remoteData.audit_logs.forEach((l: AuditLog) => {
          if (l?.id_log) logMap.set(l.id_log, l);
        });
        // El servidor no envía la auditoría al profesorado sin privilegios: en esas cuentas
        // que falten registros no significa que haya algo pendiente (evita envíos continuos)
        const usuarioEsAdmin = AuthService.isAdmin(AuthService.getCurrentUser());
        localLogs.forEach(ll => {
          if (ll?.id_log && !logMap.has(ll.id_log)) {
            logMap.set(ll.id_log, ll);
            if (usuarioEsAdmin) localHasPendingData = true;
          }
        });
        const mergedLogs = Array.from(logMap.values())
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, 300);
        StorageService.saveAuditLogs(mergedLogs);
      }

      localStorage.setItem(LAST_SYNC_STORAGE_KEY, new Date().toISOString());

      // Recuperar (una vez por sesión) los cambios que quedaron sin subir en este navegador
      const usuario = AuthService.getCurrentUser();
      if (usuario && primeraCarga) {
        if (restaurarCola(usuario.email) > 0) localHasPendingData = true;
      }

      // Si teníamos datos locales pendientes que el servidor no tenía, sincronizar de vuelta
      if (localHasPendingData && !options?.skipAutoPush) {
        this.triggerFastSync(200);
      }

      return {
        success: true,
        message: 'Base de datos sincronizada con Google Drive corporativo.',
        dataCount: {
          profesores: StorageService.getProfesores().length,
          alumnos: StorageService.getAlumnos().length,
          sanciones: StorageService.getSanciones().length,
        },
      };
    } catch (err: any) {
      return {
        success: false,
        message: `No se pudo conectar con el endpoint de Google Drive: ${err.message || err}`,
      };
    }
  }

  /**
   * Sube los datos locales hacia Google Drive de manera ultrarrápida y segura para concurrencia.
   * Antes de subir, realiza una lectura y fusión atómica (Read-Modify-Write) desde Drive
   * para garantizar que dos dispositivos simultáneos nunca sobrescriban los cambios del otro.
   */
  static async pushToGoogleDrive(): Promise<{ success: boolean; message: string; avisos?: string[] }> {
    const apiUrl = this.getSyncApiUrl();

    if (!apiUrl) {
      StorageService.crearSnapshotBackup('sistema@g.educaand.es');
      localStorage.setItem(LAST_SYNC_STORAGE_KEY, new Date().toISOString());
      return {
        success: true,
        message: 'Copia de seguridad local preparada para Google Drive.',
      };
    }

    // Manejo de concurrencia: si ya hay una subida en vuelo, encolar
    if (this.isPushing) {
      this.pendingPushQueued = true;
      return {
        success: true,
        message: 'Petición encolada para sincronización concurrente segura.',
      };
    }

    this.isPushing = true;

    // 0. Fusión atómica previa (Read-Modify-Write): descargar y fusionar estado remoto actual antes de empaquetar
    try {
      await this.pullFromGoogleDrive({ forceRefresh: true, skipAutoPush: true });
    } catch {
      // Si la red falla puntualmente en la lectura previa, continuar con el estado local
    }

    const payload = this.getFullDatabasePayload();
    // Copia del estado en este momento: lo que llegue después irá en el siguiente envío
    // Solo se dan por subidos los cambios incluidos en este envío; los que lleguen
    // mientras tanto siguen pendientes para el siguiente.
    const sentSancionIds = StorageService.getPendingSyncSancionIds();
    const sentAlumnoIds = StorageService.getPendingSyncAlumnoIds();
    const sentCompIds = StorageService.getPendingSyncCompensacionIds();
    const sentExpIds = StorageService.getPendingSyncExpedienteIds();
    const sentProfEmails = StorageService.getPendingSyncProfesorEmails();
    // Lista de lo que este dispositivo ha cambiado: del resto, el servidor conserva su versión
    // (así unos datos con unos segundos de antigüedad no deshacen lo que otro acaba de guardar)
    (payload as any).cambios = {
      sanciones: sentSancionIds,
      alumnos: sentAlumnoIds,
      profesores: sentProfEmails,
      compensaciones: sentCompIds,
      expedientes: sentExpIds,
    };
    const markSent = () => {
      this.pushEpoch++;
      StorageService.clearPendingSyncSancionIds(sentSancionIds.length ? sentSancionIds : ['__ninguno__']);
      StorageService.clearPendingSyncProfesorEmails(sentProfEmails);
      StorageService.clearPendingSyncAlumnoIds(sentAlumnoIds);
      StorageService.clearPendingSyncCompensacionIds(sentCompIds);
      StorageService.clearPendingSyncExpedienteIds(sentExpIds);
      guardarCola(AuthService.getCurrentUser()?.email);
    };

    const token = AuthService.getToken();
    if (!token) {
      this.finishPush();
      return { success: false, message: 'Debe iniciar sesión para guardar en Google Drive.' };
    }

    // El servidor responde y se COMPRUEBA su respuesta: solo se da por guardado si lo confirma
    const respuesta = await llamarApi('guardar', { token, data: JSON.parse(JSON.stringify(payload)) }, 30000);
    if (respuesta.ok) {
      localStorage.setItem(LAST_SYNC_STORAGE_KEY, new Date().toISOString());
      markSent();
      this.lastPushError = null;
      this.avisarEstadoGuardado(true);
      this.finishPush();
      const avisos: string[] = Array.isArray(respuesta.avisos) ? respuesta.avisos : [];
      if (avisos.length) {
        // El servidor no ha aceptado algún cambio: volver a descargar el estado real
        setTimeout(() => this.pullFromGoogleDrive({ forceRefresh: true }).catch(() => {}), 100);
      }
      return { success: true, message: 'Datos guardados en Google Drive.', avisos };
    }

    this.lastPushError = respuesta.error || 'Error desconocido al guardar.';
    guardarCola(AuthService.getCurrentUser()?.email);
    this.avisarEstadoGuardado(false);
    this.finishPush();
    // Reintentar más tarde: los cambios siguen marcados como pendientes
    if (respuesta.codigo !== 'NO_AUTH') {
      setTimeout(() => this.triggerFastSync(0), 15000);
    }
    return { success: false, message: `No se ha podido guardar en Google Drive: ${this.lastPushError}` };
  }

  /** Notifica a la interfaz si el último guardado llegó a Google Drive. */
  private static avisarEstadoGuardado(ok: boolean): void {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent(EVENTO_ESTADO_GUARDADO, { detail: { ok, error: this.lastPushError } }));
    }
  }

  private static finishPush(): void {
    this.isPushing = false;
    if (this.pendingPushQueued) {
      this.pendingPushQueued = false;
      setTimeout(() => {
        this.pushToGoogleDrive().catch(() => {});
      }, 250);
    }
  }
}
