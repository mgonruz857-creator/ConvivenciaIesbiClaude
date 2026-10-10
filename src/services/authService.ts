/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { guardarDatosIniciales } from './datosIniciales';
import { Profesor } from '../types/convivencia';
import { StorageService } from './storageService';
import { llamarApi } from './apiService';

const SESSION_KEY = 'sigc_bi_auth_user_v2';
const SESSION_TYPE_KEY = 'sigc_bi_session_type_v1';
const LAST_ACTIVITY_KEY = 'sigc_bi_last_activity_v1';
const LOGOUT_REASON_KEY = 'sigc_bi_logout_reason_v1';
const TOKEN_KEY = 'sigc_bi_session_token_v2';
const LOGOUT_MSG_KEY = 'sigc_bi_logout_message_v1';

// Restos de la versión 1 (contraseñas guardadas en el navegador): se eliminan al cargar
try {
  ['sigc_bi_teacher_hashes_v3', 'sigc_bi_teacher_hashes_v2', 'sigc_bi_teacher_hashes_v1',
   'sigc_bi_reset_credentials_emails_v1', 'sigc_bi_google_oauth_client_id_v1'].forEach((k) => localStorage.removeItem(k));
} catch {
  // Ignorar
}

/**
 * Tiempos límite de inactividad para garantizar el cumplimiento del RGPD / ENS
 * en centros educativos donde los ordenadores se comparten en salas de profesores y aulas.
 */
export const INACTIVITY_LIMIT_SHARED_MS = 15 * 60 * 1000; // 15 minutos en equipos compartidos
export const INACTIVITY_LIMIT_PERSONAL_MS = 8 * 60 * 60 * 1000; // 8 horas en equipos personales
export const WARNING_BEFORE_LOGOUT_MS = 60 * 1000; // Aviso preventivo 60 segundos antes de cerrar

export class AuthService {
  /**
   * Guarda de forma segura la sesión del usuario.
   * - En equipos compartidos (por defecto): Se almacena en sessionStorage para que la sesión se
   *   destruya automáticamente en cuanto se cierre la pestaña o el navegador, y se activa el límite
   *   estricto de inactividad de 15 minutos (RGPD / ENS).
   * - En equipos personales: Se almacena en localStorage con caducidad prolongada.
   */
  static persistSession(user: Profesor, isShared: boolean = true): void {
    try {
      const userJson = JSON.stringify(user);
      const nowStr = Date.now().toString();
      const typeStr = isShared ? 'shared' : 'personal';

      if (isShared) {
        sessionStorage.setItem(SESSION_KEY, userJson);
        sessionStorage.setItem(SESSION_TYPE_KEY, typeStr);
        sessionStorage.setItem(LAST_ACTIVITY_KEY, nowStr);

        // Limpiar cualquier persistencia previa en localStorage para evitar fugas en este equipo
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(SESSION_TYPE_KEY);
        localStorage.removeItem(LAST_ACTIVITY_KEY);
      } else {
        localStorage.setItem(SESSION_KEY, userJson);
        localStorage.setItem(SESSION_TYPE_KEY, typeStr);
        localStorage.setItem(LAST_ACTIVITY_KEY, nowStr);

        sessionStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem(SESSION_TYPE_KEY);
        sessionStorage.removeItem(LAST_ACTIVITY_KEY);
      }
    } catch (e) {
      console.error('Error persistiendo sesión de usuario:', e);
    }
  }

  /**
   * Devuelve si la sesión actual corresponde a un equipo compartido (sala de profesores, aula, etc.)
   */
  static isSharedSession(): boolean {
    try {
      const sessionType = sessionStorage.getItem(SESSION_TYPE_KEY) || localStorage.getItem(SESSION_TYPE_KEY);
      if (sessionType === 'personal') return false;
      return true; // Seguro por defecto: si no está definido, se asume compartido
    } catch {
      return true;
    }
  }

  /**
   * Registra actividad reciente del usuario (movimiento de ratón, pulsación de tecla, clic).
   * Se invoca periódicamente desde la interfaz para refrescar el tiempo de inactividad.
   */
  static recordActivity(): void {
    try {
      const nowStr = Date.now().toString();
      if (sessionStorage.getItem(SESSION_KEY)) {
        sessionStorage.setItem(LAST_ACTIVITY_KEY, nowStr);
      }
      if (localStorage.getItem(SESSION_KEY)) {
        localStorage.setItem(LAST_ACTIVITY_KEY, nowStr);
      }
    } catch {
      // Ignorar fallos de cuota o modo privado
    }
  }

  /**
   * Obtiene el estado actual de la sesión, comprobando si ha caducado por inactividad.
   */
  static getSessionStatus(): {
    isAuthenticated: boolean;
    isShared: boolean;
    remainingSeconds: number;
    showWarning: boolean;
    limitMs: number;
  } {
    try {
      const isShared = this.isSharedSession();
      const limit = isShared ? INACTIVITY_LIMIT_SHARED_MS : INACTIVITY_LIMIT_PERSONAL_MS;

      const hasSession = Boolean(sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY));
      const lastActivityRaw = sessionStorage.getItem(LAST_ACTIVITY_KEY) || localStorage.getItem(LAST_ACTIVITY_KEY);

      if (!hasSession || !lastActivityRaw) {
        return {
          isAuthenticated: false,
          isShared,
          remainingSeconds: 0,
          showWarning: false,
          limitMs: limit,
        };
      }

      const lastActivity = parseInt(lastActivityRaw, 10);
      const now = Date.now();
      const elapsed = Math.max(0, now - (isNaN(lastActivity) ? now : lastActivity));
      const remainingMs = Math.max(0, limit - elapsed);
      const remainingSeconds = Math.ceil(remainingMs / 1000);

      return {
        isAuthenticated: true,
        isShared,
        remainingSeconds,
        showWarning: remainingMs > 0 && remainingMs <= WARNING_BEFORE_LOGOUT_MS,
        limitMs: limit,
      };
    } catch {
      return {
        isAuthenticated: false,
        isShared: true,
        remainingSeconds: 0,
        showWarning: false,
        limitMs: INACTIVITY_LIMIT_SHARED_MS,
      };
    }
  }

  /**
   * Recupera el usuario autenticado actualmente.
   * Si la sesión ha superado el tiempo máximo de inactividad, la destruye automáticamente
   * y devuelve null (desconectando al usuario según RGPD).
   */
  static getCurrentUser(): Profesor | null {
    try {
      // 1. Prioridad: sessionStorage (equipo compartido)
      let raw = sessionStorage.getItem(SESSION_KEY);
      let isShared = true;

      if (raw) {
        isShared = true;
      } else {
        // 2. Comprobar en localStorage (equipo personal)
        raw = localStorage.getItem(SESSION_KEY);
        isShared = localStorage.getItem(SESSION_TYPE_KEY) !== 'personal';
      }

      if (!raw) return null;

      // 3. Comprobar inactividad
      const lastActivityRaw = sessionStorage.getItem(LAST_ACTIVITY_KEY) || localStorage.getItem(LAST_ACTIVITY_KEY);
      const now = Date.now();
      const limit = isShared ? INACTIVITY_LIMIT_SHARED_MS : INACTIVITY_LIMIT_PERSONAL_MS;

      if (lastActivityRaw) {
        const lastActivity = parseInt(lastActivityRaw, 10);
        if (!isNaN(lastActivity) && (now - lastActivity > limit)) {
          this.logout('INACTIVITY');
          return null;
        }
      }

      return JSON.parse(raw) as Profesor;
    } catch {
      return null;
    }
  }

  /** Token de la sesión abierta en el servidor (o null). */
  static getToken(): string | null {
    try {
      return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  private static guardarToken(token: string, isShared: boolean): void {
    try {
      if (isShared) {
        sessionStorage.setItem(TOKEN_KEY, token);
        localStorage.removeItem(TOKEN_KEY);
      } else {
        localStorage.setItem(TOKEN_KEY, token);
        sessionStorage.removeItem(TOKEN_KEY);
      }
    } catch {
      // Ignorar
    }
  }

  /** Comprueba que el correo pertenece al dominio corporativo @g.educaand.es. */
  static esCorreoCorporativo(email: string): boolean {
    return /^[a-z0-9._%+-]+@g\.educaand\.es$/i.test((email || '').trim());
  }

  /**
   * Consulta al servidor si un correo está dado de alta, activo y con contraseña ya fijada.
   * Sirve para saber si hay que pedir la contraseña dos veces (primer acceso).
   */
  static async consultarCuenta(email: string): Promise<{
    ok: boolean;
    registrado?: boolean;
    activo?: boolean;
    tieneClave?: boolean;
    motivoBaja?: string;
    error?: string;
  }> {
    // Con margen: la primera petición tras un rato sin uso (o tras actualizar el servidor) puede tardar
    const r = await llamarApi('estadoCuenta', { email: email.trim().toLowerCase() }, 45000);
    return r as any;
  }

  /**
   * Valida la complejidad mínima de la contraseña (la vuelve a comprobar el servidor):
   * al menos 6 caracteres combinando letras y números.
   */
  static validatePasswordComplexity(password: string): { valid: boolean; error?: string } {
    const p = (password || '').trim();
    if (p.length < 6) {
      return { valid: false, error: 'La contraseña debe tener al menos 6 caracteres.' };
    }
    const hasLetter = /[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]/.test(p);
    const hasNumber = /[0-9]/.test(p);
    if (!hasLetter || !hasNumber) {
      return { valid: false, error: 'La contraseña debe combinar letras y números (ejemplo: infante26, blas2026).' };
    }
    return { valid: true };
  }

  /**
   * Inicia sesión comprobando la contraseña EN EL SERVIDOR.
   * Si el docente aún no tiene contraseña, la que escriba queda fijada (primer acceso).
   */
  static async login(
    emailInput: string,
    passwordInput: string,
    isShared: boolean = true
  ): Promise<{ success: boolean; user?: Profesor; error?: string; primerAcceso?: boolean }> {
    const email = emailInput.trim().toLowerCase();
    if (!this.esCorreoCorporativo(email)) {
      return { success: false, error: 'El correo debe pertenecer al dominio corporativo @g.educaand.es de la Junta de Andalucía.' };
    }
    const clave = passwordInput.trim();
    if (!clave) {
      return { success: false, error: 'Por favor, introduzca su contraseña de acceso.' };
    }
    const r = await llamarApi('login', { email, clave }, 60000);
    if (!r.ok || !r.token || !r.usuario) {
      return { success: false, error: r.error || 'No se ha podido iniciar sesión.' };
    }
    const user = r.usuario as Profesor;
    guardarDatosIniciales(r.data);
    this.guardarToken(r.token, isShared);
    this.persistSession(user, isShared);
    return { success: true, user, primerAcceso: Boolean(r.primerAcceso) };
  }

  /** Cambia la contraseña del docente con sesión iniciada (exige la actual). */
  static async cambiarClave(actual: string, nueva: string): Promise<{ success: boolean; error?: string }> {
    const complejidad = this.validatePasswordComplexity(nueva);
    if (!complejidad.valid) return { success: false, error: complejidad.error };
    const r = await llamarApi('cambiarClave', { token: this.getToken(), actual: actual.trim(), nueva: nueva.trim() });
    return r.ok ? { success: true } : { success: false, error: r.error };
  }

  /**
   * Restablece la contraseña de un docente (solo Jefatura/Convivencia).
   * El docente fijará una nueva, escribiéndola dos veces, en su próximo acceso.
   */
  static async restablecerClave(email: string): Promise<{ success: boolean; error?: string }> {
    const r = await llamarApi('restablecerClave', { token: this.getToken(), email: email.trim().toLowerCase() });
    return r.ok ? { success: true } : { success: false, error: r.error };
  }

  /** Qué docentes han activado ya su cuenta (tienen contraseña). Solo Jefatura/Convivencia. */
  static async estadoClaves(): Promise<Record<string, boolean> | null> {
    const r = await llamarApi('estadoClaves', { token: this.getToken() });
    return r.ok ? (r.estado as Record<string, boolean>) : null;
  }

  /**
   * Comprueba si un correo figura en el claustro cargado en este navegador.
   */
  static isRegisteredInClaustro(email: string): Profesor | null {
    const cleanEmail = email.toLowerCase().trim();
    return StorageService.getProfesores().find((p) => p.email.toLowerCase() === cleanEmail) || null;
  }

  /**
   * Cierra la sesión activa del usuario.
   * Si el cierre fue por inactividad automática (15 min), guarda el motivo para que la
   * pantalla de inicio de sesión pueda informar al profesor amigablemente.
   */
  static logout(reason: 'MANUAL' | 'INACTIVITY' | 'SERVIDOR' | 'SIN_SESION' = 'MANUAL', mensaje?: string): void {
    const token = this.getToken();
    if (token) {
      llamarApi('logout', { token }).catch(() => {});
    }
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(SESSION_TYPE_KEY);
      sessionStorage.removeItem(LAST_ACTIVITY_KEY);

      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(SESSION_TYPE_KEY);
      localStorage.removeItem(LAST_ACTIVITY_KEY);

      if (reason === 'MANUAL') {
        sessionStorage.removeItem(LOGOUT_REASON_KEY);
        sessionStorage.removeItem(LOGOUT_MSG_KEY);
      } else {
        sessionStorage.setItem(LOGOUT_REASON_KEY, reason);
        if (mensaje) sessionStorage.setItem(LOGOUT_MSG_KEY, mensaje);
        else sessionStorage.removeItem(LOGOUT_MSG_KEY);
      }
    } catch {
      // Ignorar excepciones de storage
    }
  }

  /**
   * Lee y consume el motivo del último cierre de sesión (para mostrar aviso al usuario)
   */
  /** Motivo (y mensaje del servidor, si lo hubo) del último cierre de sesión automático. */
  static consumeLogoutReason(): { motivo: 'INACTIVITY' | 'SERVIDOR' | 'SIN_SESION'; mensaje?: string } | null {
    try {
      const reason = sessionStorage.getItem(LOGOUT_REASON_KEY);
      const mensaje = sessionStorage.getItem(LOGOUT_MSG_KEY) || undefined;
      sessionStorage.removeItem(LOGOUT_REASON_KEY);
      sessionStorage.removeItem(LOGOUT_MSG_KEY);
      if (reason === 'INACTIVITY' || reason === 'SERVIDOR' || reason === 'SIN_SESION') return { motivo: reason, mensaje };
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Checks if user has admin/convivencia team privileges (Full access to stats and all data)
   */
  static isAdmin(user: Profesor | null): boolean {
    if (!user) return false;
    return (
      user.rol === 'ROLE_CONVIVENCIA_ADMIN' ||
      user.email.toLowerCase() === 'mgonruz857@g.educaand.es'
    );
  }

  /**
   * Checks if the given view is allowed for this user
   */
  static isViewAllowed(user: Profesor | null, viewId: string): boolean {
    if (!user) return false;
    if (this.isAdmin(user)) return true;

    // Standard teachers without privileges (e.g. pepe@g.educaand.es)
    // Capacity to:
    // 1. Poner infracciones ('imponer')
    // 2. Ver su propio historial de partes puestos ('mis_partes')
    // 3. Ver y atender alumnado en Aula PAC ('pac')
    if (viewId === 'tutoria') return Boolean(user.tutor_de_grupo);
    return viewId === 'imponer' || viewId === 'mis_partes' || viewId === 'pac';
  }

  /**
   * Returns list of view navigation IDs available for this user
   */
  static getAllowedNavItems(user: Profesor | null): { id: string; label: string; description: string }[] {
    const tutoria = user?.tutor_de_grupo
      ? [{ id: 'tutoria', label: 'Mi Tutoría', description: 'Partes y alumnado de mi grupo' }]
      : [];
    if (this.isAdmin(user)) {
      return [
        { id: 'imponer', label: 'Imponer Infracción', description: 'Registro rápido <30s' },
        { id: 'feed', label: 'Feed Diario (T-0)', description: 'Tramitación y citaciones' },
        { id: 'carnet', label: 'Carnet de Puntos', description: 'Saldos, expedientes y restitución' },
        { id: 'pac', label: 'Aula PAC', description: 'Monitor de guardia y custodia' },
        { id: 'analitica', label: 'Estadísticas & ROF', description: 'Analítica global del centro' },
        { id: 'sanciones', label: 'Sanciones', description: 'Expedientes, trámites y parte de sanción' },
        { id: 'etl', label: 'Drive & Carga ETL', description: 'Importación Séneca y backups' },
        ...tutoria,
      ];
    }

    // Pepe / Docente sin privilegios
    return [
      { id: 'imponer', label: 'Imponer Infracción', description: 'Registro rápido <30s de partes' },
      { id: 'mis_partes', label: 'Mis Partes Puestos', description: 'Historial individual y estado de trámite' },
      { id: 'pac', label: 'Aula PAC (Atención)', description: 'Alumnado derivado en guardia' },
      ...tutoria,
    ];
  }
}

