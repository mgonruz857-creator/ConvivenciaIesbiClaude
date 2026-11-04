/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  ConductaV0Def, 
  CodigoConductaV0, 
  MedidaInmediataAdoptada,
  InfraccionROFDef 
} from '../types/convivencia';

/**
 * CATÁLOGO OFICIAL DE CONDUCTAS Y PUNTUACIONES · VERSIÓN 0
 * IES Blas Infante · Equipo TDE
 * 
 * Cumple escrupulosamente con el Decreto 327/2010 y normas internas del centro.
 */
export const CATALOGO_CONDUCTAS_V0: Record<CodigoConductaV0, ConductaV0Def> = {
  // ==========================================
  // 1. REGISTROS ACADÉMICOS · Sin pérdida de puntos (0 pts)
  // ==========================================
  'ACA-COPIAR': {
    codigo: 'ACA-COPIAR',
    tipo: 'ACADEMICO',
    titulo: 'Copiar en una prueba',
    puntos: 0,
    puntos_descuento: 0,
    referencia_legal: 'Registro académico',
    origen_norma: 'ACADEMICO',
    descripcion_normativa: 'Uso de material no permitido o comunicación durante examen.',
    tratamiento: 'Registro académico sin descuento en carnet de puntos',
  },
  'ACA-MATERIAL': {
    codigo: 'ACA-MATERIAL',
    tipo: 'ACADEMICO',
    titulo: 'Falta ocasional de material',
    puntos: 0,
    puntos_descuento: 0,
    referencia_legal: 'Registro académico',
    origen_norma: 'ACADEMICO',
    descripcion_normativa: 'No traer el material o libro preceptivo para el desarrollo de la sesión.',
    tratamiento: 'Registro académico sin descuento en carnet de puntos',
  },

  // ==========================================
  // 2. CONDUCTAS LEVES · Art. 34 Decreto 327/2010 y normas del centro
  // ==========================================
  'LEV-PERTURBACION': {
    codigo: 'LEV-PERTURBACION',
    tipo: 'LEVE',
    titulo: 'Perturbación del normal desarrollo de la clase',
    puntos: -2,
    puntos_descuento: 2,
    referencia_legal: 'Art. 34.1.a',
    origen_norma: 'DECRETO_327',
    descripcion_normativa: 'Art. 34.1.a del Decreto 327/2010: Las perturbaciones de la clase que impidan su normal desarrollo.',
  },
  'LEV-COLABORACION': {
    codigo: 'LEV-COLABORACION',
    tipo: 'LEVE',
    titulo: 'Falta de colaboración sistemática',
    puntos: -3,
    puntos_descuento: 3,
    referencia_legal: 'Art. 34.1.b',
    origen_norma: 'DECRETO_327',
    descripcion_normativa: 'Art. 34.1.b del Decreto 327/2010: La falta de colaboración sistemática del alumnado en la realización de las actividades orientadas al desarrollo del currículo.',
  },
  'LEV-ESTUDIAR': {
    codigo: 'LEV-ESTUDIAR',
    tipo: 'LEVE',
    titulo: 'Impedir/dificultar el derecho o deber de estudiar de los demás',
    puntos: -2,
    puntos_descuento: 2,
    referencia_legal: 'Art. 34.1.c',
    origen_norma: 'DECRETO_327',
    descripcion_normativa: 'Art. 34.1.c del Decreto 327/2010: El acto de impedir o dificultar a sus compañeros el ejercicio del derecho o el cumplimiento del deber al estudio.',
  },
  'LEV-INCORRECCION': {
    codigo: 'LEV-INCORRECCION',
    tipo: 'LEVE',
    titulo: 'Incorrección o desconsideración',
    puntos: -3,
    puntos_descuento: 3,
    referencia_legal: 'Art. 34.1.f',
    origen_norma: 'DECRETO_327',
    descripcion_normativa: 'Art. 34.1.f del Decreto 327/2010: La incorrección o desconsideración con los miembros de la comunidad escolar.',
  },
  'LEV-DANOS': {
    codigo: 'LEV-DANOS',
    tipo: 'LEVE',
    titulo: 'Pequeños daños',
    puntos: -3,
    puntos_descuento: 3,
    referencia_legal: 'Art. 34.1.g',
    origen_norma: 'DECRETO_327',
    descripcion_normativa: 'Art. 34.1.g del Decreto 327/2010: Causar pequeños daños en las instalaciones, recursos materiales o documentos del centro.',
  },
  'LEV-PASILLO': {
    codigo: 'LEV-PASILLO',
    tipo: 'LEVE',
    titulo: 'Salir del aula o estar en el pasillo sin autorización',
    puntos: -2,
    puntos_descuento: 2,
    referencia_legal: 'Norma del centro',
    origen_norma: 'PLAN_CONVIVENCIA',
    descripcion_normativa: 'Norma del Plan de Convivencia del IES Blas Infante: Salir del aula o permanecer en pasillos o zonas comunes sin autorización expresa.',
  },

  // ==========================================
  // 3. CONDUCTAS GRAVES · Art. 37 Decreto 327/2010 o normas del centro
  // ==========================================
  'GRA-MOVIL-USO': {
    codigo: 'GRA-MOVIL-USO',
    tipo: 'GRAVE',
    titulo: 'Uso no autorizado del móvil, que entrega y guarda cuando se solicita',
    puntos: -8,
    puntos_descuento: 8,
    referencia_legal: 'Norma del centro',
    origen_norma: 'PLAN_CONVIVENCIA',
    descripcion_normativa: 'Norma del Plan de Convivencia del IES Blas Infante: Uso de teléfonos móviles o dispositivos electrónicos personales en el centro sin permiso educativo expreso, entregando y guardando el dispositivo cuando el profesorado lo solicita.',
  },
  'GRA-MOVIL-ENTREGA': {
    codigo: 'GRA-MOVIL-ENTREGA',
    tipo: 'GRAVE',
    titulo: 'Uso no autorizado del móvil, que NO entrega o guarda cuando se solicita',
    puntos: -10,
    puntos_descuento: 10,
    referencia_legal: 'Norma del centro',
    origen_norma: 'PLAN_CONVIVENCIA',
    descripcion_normativa: 'Norma del Plan de Convivencia del IES Blas Infante: Uso de teléfonos móviles o dispositivos electrónicos personales en el centro sin permiso educativo expreso, negándose a entregar o guardar el dispositivo cuando el profesorado lo solicita.',
  },
  'GRA-AGRESION': {
    codigo: 'GRA-AGRESION',
    tipo: 'GRAVE',
    titulo: 'Agresión física',
    puntos: -10,
    puntos_descuento: 10,
    referencia_legal: 'Art. 37.1.a',
    origen_norma: 'DECRETO_327',
    descripcion_normativa: 'Art. 37.1.a del Decreto 327/2010: La agresión física contra cualquier miembro de la comunidad educativa.',
  },
  'GRA-INJURIAS': {
    codigo: 'GRA-INJURIAS',
    tipo: 'GRAVE',
    titulo: 'Injurias/ofensas',
    puntos: -10,
    puntos_descuento: 10,
    referencia_legal: 'Art. 37.1.b',
    origen_norma: 'DECRETO_327',
    descripcion_normativa: 'Art. 37.1.b del Decreto 327/2010: Las injurias u ofensas contra los miembros de la comunidad educativa.',
  },
  'GRA-ACOSO': {
    codigo: 'GRA-ACOSO',
    tipo: 'GRAVE',
    titulo: 'Acoso escolar',
    puntos: -10,
    puntos_descuento: 10,
    referencia_legal: 'Art. 37.1.c',
    origen_norma: 'DECRETO_327',
    descripcion_normativa: 'Art. 37.1.c del Decreto 327/2010: El acoso escolar o las amenazas contra compañeros/as. Sujeto a valoración y posible protocolo por Jefatura/Dirección.',
    requiere_valoracion_protocolo: true,
  },
  'GRA-SALUD': {
    codigo: 'GRA-SALUD',
    tipo: 'GRAVE',
    titulo: 'Actuaciones perjudiciales para la salud/integridad',
    puntos: -5,
    puntos_descuento: 5,
    puntos_opciones: [5, 10],
    referencia_legal: 'Art. 37.1.d',
    origen_norma: 'DECRETO_327',
    descripcion_normativa: 'Art. 37.1.d del Decreto 327/2010: Las actuaciones perjudiciales para la salud e integridad de los miembros del centro o la incitación a las mismas. Prever asignación manual (-5 o -10) en V0.',
  },
  'GRA-VEJACIONES': {
    codigo: 'GRA-VEJACIONES',
    tipo: 'GRAVE',
    titulo: 'Vejaciones/humillaciones',
    puntos: -10,
    puntos_descuento: 10,
    referencia_legal: 'Art. 37.1.e',
    origen_norma: 'DECRETO_327',
    descripcion_normativa: 'Art. 37.1.e del Decreto 327/2010: Las vejaciones o humillaciones sobre cualquier miembro de la comunidad educativa, particularmente por motivos discriminatorios.',
  },
  'GRA-AMENAZAS': {
    codigo: 'GRA-AMENAZAS',
    tipo: 'GRAVE',
    titulo: 'Amenazas/coacciones',
    puntos: -10,
    puntos_descuento: 10,
    referencia_legal: 'Art. 37.1.f',
    origen_norma: 'DECRETO_327',
    descripcion_normativa: 'Art. 37.1.f del Decreto 327/2010: Las amenazas o coacciones contra cualquier miembro de la comunidad educativa.',
  },
  'GRA-SUPLANTACION': {
    codigo: 'GRA-SUPLANTACION',
    tipo: 'GRAVE',
    titulo: 'Suplantación/falsificación/sustracción documental',
    puntos: -10,
    puntos_descuento: 10,
    referencia_legal: 'Art. 37.1.g',
    origen_norma: 'DECRETO_327',
    descripcion_normativa: 'Art. 37.1.g del Decreto 327/2010: La suplantación de la personalidad, la falsificación o la sustracción de documentos y material académico.',
  },
  'GRA-DANOS': {
    codigo: 'GRA-DANOS',
    tipo: 'GRAVE',
    titulo: 'Daños graves/sustracción',
    puntos: -10,
    puntos_descuento: 10,
    referencia_legal: 'Art. 37.1.h',
    origen_norma: 'DECRETO_327',
    descripcion_normativa: 'Art. 37.1.h del Decreto 327/2010: El deterioro deliberado y grave de dependencias, material del centro o de otros miembros, o su sustracción.',
  },
  'GRA-ACTIVIDADES': {
    codigo: 'GRA-ACTIVIDADES',
    tipo: 'GRAVE',
    titulo: 'Acto dirigido a impedir el normal desarrollo de las actividades del centro',
    puntos: -5,
    puntos_descuento: 5,
    referencia_legal: 'Art. 37.1.j',
    origen_norma: 'DECRETO_327',
    descripcion_normativa: 'Art. 37.1.j del Decreto 327/2010: Los actos dirigidos directamente a impedir el normal desarrollo de las actividades del centro.',
  },
  'GRA-CORRECCIONES': {
    codigo: 'GRA-CORRECCIONES',
    tipo: 'GRAVE',
    titulo: 'Incumplimiento injustificado de correcciones',
    puntos: -10,
    puntos_descuento: 10,
    referencia_legal: 'Art. 37.1.k',
    origen_norma: 'DECRETO_327',
    descripcion_normativa: 'Art. 37.1.k del Decreto 327/2010: El incumplimiento injustificado de las correcciones impuestas.',
  },
};

/**
 * Catálogo de Medidas Inmediatas adoptadas por el profesorado (V0 - Página 3)
 */
export const MEDIDAS_INMEDIATAS_CATALOG: { 
  valor: MedidaInmediataAdoptada; 
  label: string; 
  descripcion: string;
  requierePAC?: boolean;
}[] = [
  { 
    valor: 'AMONESTACION_VERBAL', 
    label: 'Amonestación verbal / advertencia',
    descripcion: 'Llamada de atención directa en el aula.'
  },
  { 
    valor: 'AULA_PAC', 
    label: 'Derivación al Aula PAC',
    descripcion: 'Envío tutelado al aula de permanencia con registro de tarea y reincorporación.',
    requierePAC: true 
  },
  { 
    valor: 'DERIVACION_JEFATURA', 
    label: 'Derivación inmediata a Jefatura',
    descripcion: 'Acompañamiento a Jefatura de Estudios por gravedad o necesidad de intervención.'
  },
  { 
    valor: 'RETIRADA_MOVIL', 
    label: 'Retirada/depósito del móvil o dispositivo',
    descripcion: 'Custodia del dispositivo electrónico según norma del centro.'
  },
  { 
    valor: 'REPARACION_SITUACION', 
    label: 'Reparación inmediata de la situación',
    descripcion: 'Recogida, limpieza o disculpa inmediata en el espacio lectivo.'
  },
];

/**
 * Mapeo de compatibilidad con vistas previas
 */
export const MATRIZ_ROF_CATALOG: Record<string, InfraccionROFDef> = {
  ...CATALOGO_CONDUCTAS_V0,
  // Alias de compatibilidad para datos históricos
  'INF-01': CATALOGO_CONDUCTAS_V0['LEV-PERTURBACION'],
  'INF-02': CATALOGO_CONDUCTAS_V0['LEV-COLABORACION'],
  'INF-03': CATALOGO_CONDUCTAS_V0['LEV-INCORRECCION'],
  'INF-04': CATALOGO_CONDUCTAS_V0['GRA-MOVIL-USO'],
  'INF-05': CATALOGO_CONDUCTAS_V0['LEV-PASILLO'],
  'INF-06': CATALOGO_CONDUCTAS_V0['LEV-INCORRECCION'],
  'INF-07': CATALOGO_CONDUCTAS_V0['LEV-DANOS'],
  'INF-08': CATALOGO_CONDUCTAS_V0['ACA-COPIAR'],
  'INF-09': CATALOGO_CONDUCTAS_V0['GRA-ACTIVIDADES'],
  'INF-10': CATALOGO_CONDUCTAS_V0['LEV-DANOS'],
  'INF-GRAVE': CATALOGO_CONDUCTAS_V0['GRA-AGRESION'],
};

export const LISTA_CONDUCTAS_V0 = Object.values(CATALOGO_CONDUCTAS_V0);
export const LISTA_CODIGOS_ROF = LISTA_CONDUCTAS_V0;

/**
 * Función auxiliar para obtener la tipificación exacta con precisión jurídica (PDF y actas)
 */
export function obtenerTipificacionNormativa(codigo: string): {
  tipoTexto: string;
  referencia: string;
  textoNormativoCompleto: string;
  esDecreto: boolean;
  esNormaCentro: boolean;
  esAcademico: boolean;
} {
  const def = MATRIZ_ROF_CATALOG[codigo] || CATALOGO_CONDUCTAS_V0[codigo as CodigoConductaV0];
  if (!def) {
    return {
      tipoTexto: 'Conducta registrada',
      referencia: 'Norma interna',
      textoNormativoCompleto: 'Norma interna del centro',
      esDecreto: false,
      esNormaCentro: true,
      esAcademico: false,
    };
  }

  if (def.origen_norma === 'DECRETO_327') {
    const articulo = def.tipo === 'LEVE' ? 'Art. 34' : 'Art. 37';
    return {
      tipoTexto: `Conducta ${def.tipo.toLowerCase()} tipificada en el Decreto 327/2010`,
      referencia: `${def.referencia_legal} (${articulo} Decreto 327/2010)`,
      textoNormativoCompleto: `${def.descripcion_normativa}`,
      esDecreto: true,
      esNormaCentro: false,
      esAcademico: false,
    };
  }

  if (def.origen_norma === 'PLAN_CONVIVENCIA') {
    return {
      tipoTexto: 'Incumplimiento de una norma del Plan de Convivencia del centro',
      referencia: 'Norma del Plan de Convivencia del centro',
      textoNormativoCompleto: `${def.descripcion_normativa}`,
      esDecreto: false,
      esNormaCentro: true,
      esAcademico: false,
    };
  }

  return {
    tipoTexto: 'Registro de incidencia académica (sin pérdida de puntos)',
    referencia: 'Normativa académica del centro',
    textoNormativoCompleto: `${def.descripcion_normativa}`,
    esDecreto: false,
    esNormaCentro: false,
    esAcademico: true,
  };
}

/**
 * Determina si un grupo educativo pertenece al ciclo de Informática (1º INF / 2º INF)
 */
export function esGrupoInformatica(grupo?: string): boolean {
  if (!grupo) return false;
  const g = grupo.trim().toUpperCase();
  return (
    g === '1_INF' ||
    g === '2_INF' ||
    g.startsWith('1_INF') ||
    g.startsWith('2_INF') ||
    g === '1 INF' ||
    g === '2 INF' ||
    g.startsWith('1º INF') ||
    g.startsWith('2º INF') ||
    g.startsWith('1-INF') ||
    g.startsWith('2-INF') ||
    g.includes('INFORMATICA') ||
    g.includes('INFORMÁTICA')
  );
}

/**
 * Calcula los puntos oficiales de sanción aplicables según el grupo del alumno:
 * - Para la generalidad de alumnos: se aplica el baremo estándar del ROF.
 * - MODIFICACIÓN REGLAMENTO CICLO INFORMÁTICA (1º INF y 2º INF):
 *   * Conductas LEVES: 4 puntos MÁS que al resto (ej. -2 pasa a -6 pts, -3 pasa a -7 pts).
 *   * Conductas GRAVES: Todas las infracciones graves se sancionan con 10 puntos (pérdida total del carnet / saldo 0).
 *   * Registros ACADÉMICOS: 0 puntos (sin variación).
 */
export function calcularPuntosInfraccion(
  codigoConducta: CodigoConductaV0 | string,
  grupo?: string,
  manualPuntosSalud?: number
): number {
  const def = MATRIZ_ROF_CATALOG[codigoConducta] || CATALOGO_CONDUCTAS_V0[codigoConducta as CodigoConductaV0];
  const esInf = esGrupoInformatica(grupo);

  if (!def) {
    return 0;
  }

  // Registros académicos
  if (def.tipo === 'ACADEMICO' || def.puntos_descuento === 0) {
    return 0;
  }

  // Caso especial manual GRA-SALUD
  if (codigoConducta === 'GRA-SALUD') {
    if (esInf) {
      return 10; // Para 1º INF y 2º INF siempre 10 en graves
    }
    return manualPuntosSalud ?? 5;
  }

  // Conductas GRAVES
  if (def.tipo === 'GRAVE') {
    if (esInf) {
      return 10; // Regla 1º/2º INF: todas las graves castigadas con 10 puntos
    }
    return def.puntos_descuento;
  }

  // Conductas LEVES
  if (def.tipo === 'LEVE') {
    if (esInf) {
      return def.puntos_descuento + 4; // Regla 1º/2º INF: 4 puntos más que al resto
    }
    return def.puntos_descuento;
  }

  return def.puntos_descuento;
}
