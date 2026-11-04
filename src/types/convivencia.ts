/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type RoleUsuario = 'ROLE_DOCENTE' | 'ROLE_CONVIVENCIA_ADMIN';

export interface Profesor {
  id_profesor: string;
  email: string; // must be @g.educaand.es
  nombre: string;
  apellidos: string;
  dni: string;
  departamento: string;
  rol: RoleUsuario;
  tutor_de_grupo?: string; // e.g. "1ESO_A"
  tutoria_asignada_por?: 'JEFATURA' | 'DOCENTE'; // quién asignó la tutoría
  estado?: 'ACTIVO' | 'INACTIVO'; // Permite dar de baja profesores que ya no están en el centro
  motivo_baja?: string;
  fecha_baja?: string;
  password_hash?: string; // Hash SHA-256 de contraseña custodiado en Drive
  requiere_cambio_clave?: boolean; // Marca si Jefatura solicita cambio obligatorio de contraseña
  fecha_modificacion_clave?: string; // Marca de tiempo ISO de la última modificación de clave
}

export type GrupoCiclo = 
  | '1_FRIO' | '2_FRIO'
  | '1_INF' | '2_INF'
  | '1_CALOR' | '2_CALOR';

export type GrupoESO =
  | '1ESO_A' | '1ESO_B' | '1ESO_C' | '1ESO_D'
  | '2ESO_A' | '2ESO_B' | '2ESO_C' | '2ESO_D'
  | '3ESO_A' | '3ESO_B' | '3ESO_C' | '3ESO_D'
  | '4ESO_A' | '4ESO_B' | '4ESO_C' | '4ESO_D';

export type GrupoBachillerato =
  | '1BACH_A' | '1BACH_B' | '1BACH_C' | '1BACH_D'
  | '2BACH_A' | '2BACH_B' | '2BACH_C' | '2BACH_D';

export type GrupoEducativo = 
  | GrupoCiclo
  | GrupoESO
  | GrupoBachillerato
  | '1FPB' | '2FPB'; // compatibilidad previa

export interface InfoGrupoDetallada {
  codigo: GrupoEducativo;
  etiqueta: string;
  etapa: 'CICLOS' | 'ESO' | 'BACHILLERATO' | 'FPB';
  descripcion: string;
}

export const LISTA_GRUPOS_OFICIALES: InfoGrupoDetallada[] = [
  // Ciclos Formativos
  { codigo: '1_FRIO', etiqueta: '1º FRÍO', etapa: 'CICLOS', descripcion: '1º Ciclo Formativo Instalaciones Frigoríficas y Climatización' },
  { codigo: '2_FRIO', etiqueta: '2º FRÍO', etapa: 'CICLOS', descripcion: '2º Ciclo Formativo Instalaciones Frigoríficas y Climatización' },
  { codigo: '1_INF', etiqueta: '1º INF (FP Básica)', etapa: 'FPB', descripcion: '1º FP Básica Informática (1º INF)' },
  { codigo: '2_INF', etiqueta: '2º INF (FP Básica)', etapa: 'FPB', descripcion: '2º FP Básica Informática (2º INF)' },
  { codigo: '1_CALOR', etiqueta: '1º CALOR', etapa: 'CICLOS', descripcion: '1º Ciclo Formativo Instalaciones de Producción de Calor' },
  { codigo: '2_CALOR', etiqueta: '2º CALOR', etapa: 'CICLOS', descripcion: '2º Ciclo Formativo Instalaciones de Producción de Calor' },

  // Educación Secundaria Obligatoria (ESO)
  { codigo: '1ESO_A', etiqueta: '1º ESO A', etapa: 'ESO', descripcion: '1º Educación Secundaria Obligatoria A' },
  { codigo: '1ESO_B', etiqueta: '1º ESO B', etapa: 'ESO', descripcion: '1º Educación Secundaria Obligatoria B' },
  { codigo: '1ESO_C', etiqueta: '1º ESO C', etapa: 'ESO', descripcion: '1º Educación Secundaria Obligatoria C' },
  { codigo: '1ESO_D', etiqueta: '1º ESO D', etapa: 'ESO', descripcion: '1º Educación Secundaria Obligatoria D' },

  { codigo: '2ESO_A', etiqueta: '2º ESO A', etapa: 'ESO', descripcion: '2º Educación Secundaria Obligatoria A' },
  { codigo: '2ESO_B', etiqueta: '2º ESO B', etapa: 'ESO', descripcion: '2º Educación Secundaria Obligatoria B' },
  { codigo: '2ESO_C', etiqueta: '2º ESO C', etapa: 'ESO', descripcion: '2º Educación Secundaria Obligatoria C' },
  { codigo: '2ESO_D', etiqueta: '2º ESO D', etapa: 'ESO', descripcion: '2º Educación Secundaria Obligatoria D' },

  { codigo: '3ESO_A', etiqueta: '3º ESO A', etapa: 'ESO', descripcion: '3º Educación Secundaria Obligatoria A' },
  { codigo: '3ESO_B', etiqueta: '3º ESO B', etapa: 'ESO', descripcion: '3º Educación Secundaria Obligatoria B' },
  { codigo: '3ESO_C', etiqueta: '3º ESO C', etapa: 'ESO', descripcion: '3º Educación Secundaria Obligatoria C' },
  { codigo: '3ESO_D', etiqueta: '3º ESO D', etapa: 'ESO', descripcion: '3º Educación Secundaria Obligatoria D' },

  { codigo: '4ESO_A', etiqueta: '4º ESO A', etapa: 'ESO', descripcion: '4º Educación Secundaria Obligatoria A' },
  { codigo: '4ESO_B', etiqueta: '4º ESO B', etapa: 'ESO', descripcion: '4º Educación Secundaria Obligatoria B' },
  { codigo: '4ESO_C', etiqueta: '4º ESO C', etapa: 'ESO', descripcion: '4º Educación Secundaria Obligatoria C' },
  { codigo: '4ESO_D', etiqueta: '4º ESO D', etapa: 'ESO', descripcion: '4º Educación Secundaria Obligatoria D' },

  // Bachillerato
  { codigo: '1BACH_A', etiqueta: '1º BACH A', etapa: 'BACHILLERATO', descripcion: '1º Bachillerato Grupo A' },
  { codigo: '1BACH_B', etiqueta: '1º BACH B', etapa: 'BACHILLERATO', descripcion: '1º Bachillerato Grupo B' },
  { codigo: '1BACH_C', etiqueta: '1º BACH C', etapa: 'BACHILLERATO', descripcion: '1º Bachillerato Grupo C' },
  { codigo: '1BACH_D', etiqueta: '1º BACH D', etapa: 'BACHILLERATO', descripcion: '1º Bachillerato Grupo D' },

  { codigo: '2BACH_A', etiqueta: '2º BACH A', etapa: 'BACHILLERATO', descripcion: '2º Bachillerato Grupo A' },
  { codigo: '2BACH_B', etiqueta: '2º BACH B', etapa: 'BACHILLERATO', descripcion: '2º Bachillerato Grupo B' },
  { codigo: '2BACH_C', etiqueta: '2º BACH C', etapa: 'BACHILLERATO', descripcion: '2º Bachillerato Grupo C' },
  { codigo: '2BACH_D', etiqueta: '2º BACH D', etapa: 'BACHILLERATO', descripcion: '2º Bachillerato Grupo D' },
];

export type EstadoAlumno = 'ACTIVO' | 'ALERTA_PUNTOS' | 'SALDO_CERO' | 'EXPULSADO_CENTRO' | 'BAJA';

export interface Alumno {
  id_alumno: string;
  nie: string; // 7-8 digits + letter or provisional SN-...
  nombre: string;
  apellidos: string;
  grupo: GrupoEducativo;
  puntos_actuales: number; // 0 to 10
  estado: EstadoAlumno;
  telefono_tutor: string;
  nombre_tutor: string;
  historial_sanciones_count?: number;
  motivo_baja?: string;
  fecha_baja?: string;
}

export type TipoConductaV0 = 'ACADEMICO' | 'LEVE' | 'GRAVE';

export type CodigoConductaV0 =
  // REGISTROS ACADÉMICOS (0 pts)
  | 'ACA-COPIAR'
  | 'ACA-MATERIAL'
  // CONDUCTAS LEVES (Art. 34 Decreto 327/2010 y normas centro)
  | 'LEV-PERTURBACION'
  | 'LEV-COLABORACION'
  | 'LEV-ESTUDIAR'
  | 'LEV-INCORRECCION'
  | 'LEV-DANOS'
  | 'LEV-PASILLO'
  // CONDUCTAS GRAVES (Art. 37 Decreto 327/2010 o normas centro)
  | 'GRA-MOVIL-USO'
  | 'GRA-MOVIL-ENTREGA'
  | 'GRA-AGRESION'
  | 'GRA-INJURIAS'
  | 'GRA-ACOSO'
  | 'GRA-SALUD'
  | 'GRA-VEJACIONES'
  | 'GRA-AMENAZAS'
  | 'GRA-SUPLANTACION'
  | 'GRA-DANOS'
  | 'GRA-ACTIVIDADES'
  | 'GRA-CORRECCIONES';

// Backwards compatibility alias for code references
export type CodigoInfraccionROF =
  | CodigoConductaV0
  | 'INF-01'
  | 'INF-02'
  | 'INF-03'
  | 'INF-04'
  | 'INF-05'
  | 'INF-06'
  | 'INF-07'
  | 'INF-08'
  | 'INF-09'
  | 'INF-10'
  | 'INF-GRAVE';

export interface ConductaV0Def {
  codigo: CodigoConductaV0;
  tipo: TipoConductaV0;
  titulo: string;
  puntos: number; // 0, -2, -3, -5, -8, -10
  puntos_descuento: number; // 0, 2, 3, 5, 8, 10
  puntos_opciones?: number[]; // [5, 10] for GRA-SALUD manual selection
  referencia_legal: string; // e.g. 'Art. 34.1.a' or 'Norma del centro'
  origen_norma: 'DECRETO_327' | 'PLAN_CONVIVENCIA' | 'ACADEMICO';
  descripcion_normativa: string;
  tratamiento?: string;
  requiere_valoracion_protocolo?: boolean;
}

export type InfraccionROFDef = ConductaV0Def & {
  puntos_defecto?: number;
  es_grave?: boolean;
};

export type MedidaInmediataAdoptada =
  | 'AMONESTACION_VERBAL'
  | 'AULA_PAC'
  | 'DERIVACION_JEFATURA'
  | 'RETIRADA_MOVIL'
  | 'REPARACION_SITUACION';

export type ReincorporacionAula = 'SI' | 'NO' | 'PENDIENTE';

export interface DerivacionPACDetalle {
  hora_salida: string;
  profesor_deriva: string;
  tarea_pac?: string;
  reincorporacion: ReincorporacionAula;
}

export interface MovimientoPuntos {
  id_movimiento: string;
  id_alumno: string;
  fecha: string;
  tipo: 'PARTE' | 'RECUPERACION_SEMANAL' | 'MEDIDA_RESTAURATIVA' | 'ANULACION_PARTE' | 'COMPENSACION' | 'AJUSTE_MANUAL';
  /** Solo en ajustes manuales: id de la compensación que lo guarda (para poder anularlo). */
  id_compensacion?: string;
  conducta_titulo?: string;
  puntos: number; // e.g. -2, -3, +1, +2
  profesor_nombre: string;
  saldo_anterior: number;
  saldo_resultante: number;
  detalles?: string;
}

export type EstadoTramitacion = 
  | 'PENDIENTE_NOTIFICACION'
  | 'NOTIFICADO_TELEFONO'
  | 'PARTE_IMPRESO'
  | 'RESUELTO';

export type EstadoPAC = 
  | 'NO_APLICA'
  | 'EN_TRANSITO'
  | 'RECIBIDO'
  | 'TAREAS_COMPLETADAS'
  | 'REFLEXION_ENTREGADA';

export type TramoHorario = 
  | '1ª Hora (08:30 - 09:30)'
  | '2ª Hora (09:30 - 10:30)'
  | '3ª Hora (10:30 - 11:30)'
  | 'Recreo (11:30 - 12:00)'
  | '4ª Hora (12:00 - 13:00)'
  | '5ª Hora (13:00 - 14:00)'
  | '6ª Hora (14:00 - 15:00)';

export type UbicacionCentro = 
  | 'Aula ordinaria'
  | 'Guardia'
  | 'Pasillos'
  | 'Patio'
  | 'Cafetería'
  | 'Biblioteca'
  | 'Otros'
  | 'Edificio A (Pasillos/Aseos)'
  | 'Edificio B'
  | 'Patio central de recreo'
  | 'Cafetería escolar'
  | 'Gimnasio / Pistas deportivas'
  | string;

export const LISTA_UBICACIONES_OFICIALES: { codigo: string; label: string; icono: string; descripcion: string }[] = [
  { codigo: 'Aula ordinaria', label: 'Aula ordinaria', icono: '🏫', descripcion: 'Clase o aula de docencia' },
  { codigo: 'Guardia', label: 'Guardia', icono: '🛡️', descripcion: 'Servicio de guardia (grupo sin su profesor)' },
  { codigo: 'Pasillos', label: 'Pasillos', icono: '🚶', descripcion: 'Pasillos, escaleras o distribuidores' },
  { codigo: 'Patio', label: 'Patio', icono: '🌳', descripcion: 'Patios y zonas exteriores de recreo' },
  { codigo: 'Cafetería', label: 'Cafetería', icono: '☕', descripcion: 'Cafetería y comedor escolar' },
  { codigo: 'Biblioteca', label: 'Biblioteca', icono: '📚', descripcion: 'Biblioteca y salas de estudio' },
  { codigo: 'Otros', label: 'Otros', icono: '📍', descripcion: 'Aseos, gimnasio, talleres u otros espacios' },
];

export interface Sancion {
  id_sancion: string;
  numero_expediente: string;
  timestamp: string; // ISO format
  fecha: string; // YYYY-MM-DD
  hora_incidente?: string; // HH:mm exact time of the incident
  tramo_horario: TramoHorario; // hora lectiva de clase donde ocurrió el hecho
  hora_registro?: string; // HH:mm exact time when the parte is submitted in the app
  registro_diferido?: boolean; // true si el parte se registra con posterioridad al hecho
  id_alumno: string;
  id_profesor: string;
  nombre_profesor: string;
  materia: string;
  codigo_infraccion: CodigoInfraccionROF;
  tipo_conducta?: TipoConductaV0;
  puntos_restados: number;
  saldo_anterior?: number;
  saldo_resultante?: number;
  descripcion_hechos: string;
  medida_inmediata?: MedidaInmediataAdoptada;
  medida_inmediata_texto?: string;
  detalle_pac?: DerivacionPACDetalle;
  ubicacion: UbicacionCentro;
  derivado_pac: boolean;
  tareas_enviadas_pac?: string;
  estado_pac: EstadoPAC;
  hora_llegada_pac?: string;
  profesor_pac_receptor?: string;
  estado_tramitacion: EstadoTramitacion;
  observaciones_tramitacion?: string;
  url_pdf_drive: string;
  fecha_comunicacion_familia?: string;
}

export interface Compensacion {
  id_compensacion: string;
  timestamp: string;
  id_alumno: string;
  id_profesor_autoriza: string;
  nombre_profesor_autoriza: string;
  puntos_recuperados: number;
  tipo_tarea: 
    | 'Limpieza y adecuación de instalaciones'
    | 'Reparación de desperfectos materiales'
    | 'Servicio de apoyo en Biblioteca escolar'
    | 'Taller de resolución pacífica y mediación'
    | 'Ayuda lectiva a compañeros'
    | 'Ajuste manual de puntos';
  descripcion_tarea: string;
  fecha_completada: string;
  /**
   * Ajuste manual de puntos (Jefatura/Convivencia, sin parte): se guarda como compensación con
   * puntos_recuperados NEGATIVO (el signo es lo que llega también al profesorado sin privilegios).
   * Resta puntos y reinicia el contador de recuperación semanal, como un parte.
   */
  anulada?: boolean;
  anulada_por?: string;
  fecha_anulacion?: string;
  motivo_anulacion?: string;
  /** Puntos que tenía el ajuste antes de anularse (al anularlo, puntos_recuperados pasa a 0). */
  puntos_ajuste_original?: number;
}

/** Trámite de un expediente de sanción: quién lo marcó y cuándo. */
export interface TramiteSancion {
  hecho: boolean;
  fecha?: string; // ISO
  por?: string; // correo de quien lo marcó
}

export type ClaveTramiteSancion = 'llamada_familia' | 'enviado_direccion' | 'enviado_familia' | 'aviso_equipo_docente' | 'guardado_seneca';

export type ModalidadSancion = 'AULA_CONVIVENCIA' | 'EXPULSION';

/** Expediente de sanción (alumnado que llega a 0 puntos u otras sanciones de Dirección). */
export interface ExpedienteSancion {
  id_expediente: string;
  id_alumno: string;
  fecha_creacion: string; // ISO
  creado_por: string; // correo
  timestamp: string; // ISO de la última modificación
  conducta_art37: number; // 1..11 (Decreto 327/2010, art. 37)
  fecha_desde: string; // YYYY-MM-DD
  fecha_hasta: string; // YYYY-MM-DD
  dias_acude: string; // texto libre: días en que acude al centro
  modalidad: ModalidadSancion;
  fecha_documento: string; // YYYY-MM-DD
  /** Los expedientes anteriores al 04/11/2026 no tienen 'guardado_seneca' (cuenta como no marcado). */
  tramites: Partial<Record<ClaveTramiteSancion, TramiteSancion>>;
  completado: boolean;
  fecha_completado?: string;
}

export interface AuditLog {
  id_log: string;
  timestamp: string;
  usuario_email: string;
  accion: 'CREAR_PARTE' | 'MODIFICAR_PARTE' | 'ACTUALIZAR_TRAMITACION' | 'COMPENSAR_PUNTOS' | 'RECEPCION_PAC' | 'IMPORTACION_MASIVA' | 'ACTUALIZACION_SISTEMA' | 'ELIMINAR_PARTE' | 'AJUSTE_PUNTOS' | 'ANULAR_AJUSTE_PUNTOS';
  entidad: string;
  detalles: string;
  hash_integridad: string;
}

export interface DriveSyncStatus {
  lastSync: string;
  pendingCount: number;
  isOnline: boolean;
  driveFolderId: string;
  sheetId: string;
  isSyncing: boolean;
}

export interface UnidadInstitucionalConfig {
  email: string;
  nombreUnidad: string;
  esModoPruebas: boolean;
  centroEducativo: string;
  codigoCentro: string;
  fechaConfiguracion: string;
  observaciones: string;
  folderId?: string; // ID único de la carpeta en Google Drive
}

export interface CursoAcademicoArchivo {
  id_curso: string; // e.g. "2026/2027"
  nombre: string; // e.g. "Curso Escolar 2026/2027"
  fecha_inicio: string; // ISO string
  fecha_cierre?: string; // ISO string
  activo: boolean;
  cerrado_por?: string;
  total_alumnos: number;
  total_sanciones: number;
  total_compensaciones: number;
  alumnos_archivo?: Alumno[];
  sanciones_archivo?: Sancion[];
  compensaciones_archivo?: Compensacion[];
  movimientos_archivo?: MovimientoPuntos[];
}

export interface InfoCursoAcademico {
  id: string; // e.g. "2026/2027"
  label: string;
  isCurrent: boolean;
  totalAlumnos?: number;
  totalSanciones?: number;
  fechaCierre?: string;
}
