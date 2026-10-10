/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  Send, 
  Clock, 
  BookOpen, 
  CheckCircle2, 
  AlertTriangle,
  Printer,
  Sparkles,
  Calendar,
  RotateCcw,
  Check,
  User,
  ShieldAlert,
  FileText,
  Smartphone,
  ExternalLink,
  Info,
  MapPin
} from 'lucide-react';
import { 
  Alumno, 
  Profesor, 
  Sancion, 
  CodigoConductaV0,
  TipoConductaV0,
  GrupoEducativo, 
  TramoHorario, 
  UbicacionCentro,
  MedidaInmediataAdoptada,
  ReincorporacionAula,
  LISTA_GRUPOS_OFICIALES,
  LISTA_UBICACIONES_OFICIALES
} from '../types/convivencia';
import { 
  CATALOGO_CONDUCTAS_V0, 
  MEDIDAS_INMEDIATAS_CATALOG,
  obtenerTipificacionNormativa,
  calcularPuntosInfraccion,
  esGrupoInformatica
} from '../data/rofCatalog';
import { AuthService } from '../services/authService';
import { StorageService } from '../services/storageService';
import { EstadoEnvioParte } from './EstadoEnvioParte';

interface FastParteModalProps {
  alumnos: Alumno[];
  profesores?: Profesor[];
  currentUser: Profesor;
  onSubmitSancion: (
    sancionData: Omit<Sancion, 'id_sancion' | 'numero_expediente' | 'url_pdf_drive'>
  ) => { sancion: Sancion; alumnoActualizado: Alumno; saldoCero: boolean; alertaGrave: boolean };
  onPrintParte: (sancion: Sancion) => void;
  onDone: () => void;
  /** Alumno/a ya elegido (por ejemplo, al pulsar «Poner Parte» en su carnet) */
  alumnoInicialId?: string | null;
}

const GRUPOS_ORDEN: GrupoEducativo[] = LISTA_GRUPOS_OFICIALES.map(g => g.codigo);

export const TRAMOS_HORARIOS_LISTA: TramoHorario[] = [
  '1ª Hora (08:30 - 09:30)',
  '2ª Hora (09:30 - 10:30)',
  '3ª Hora (10:30 - 11:30)',
  'Recreo (11:30 - 12:00)',
  '4ª Hora (12:00 - 13:00)',
  '5ª Hora (13:00 - 14:00)',
  '6ª Hora (14:00 - 15:00)',
];

const getLocalTodayDate = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getLocalCurrentTime = (): string => {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

const deduceTramoFromTime = (timeStr: string): TramoHorario | null => {
  if (!timeStr || !timeStr.includes(':')) return null;
  const [hStr, mStr] = timeStr.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return null;
  const totalMinutes = h * 60 + m;

  if (totalMinutes >= 8 * 60 + 30 && totalMinutes < 9 * 60 + 30) return '1ª Hora (08:30 - 09:30)';
  if (totalMinutes >= 9 * 60 + 30 && totalMinutes < 10 * 60 + 30) return '2ª Hora (09:30 - 10:30)';
  if (totalMinutes >= 10 * 60 + 30 && totalMinutes < 11 * 60 + 30) return '3ª Hora (10:30 - 11:30)';
  if (totalMinutes >= 11 * 60 + 30 && totalMinutes < 12 * 60) return 'Recreo (11:30 - 12:00)';
  if (totalMinutes >= 12 * 60 && totalMinutes < 13 * 60) return '4ª Hora (12:00 - 13:00)';
  if (totalMinutes >= 13 * 60 && totalMinutes < 14 * 60) return '5ª Hora (13:00 - 14:00)';
  if (totalMinutes >= 14 * 60 && totalMinutes <= 15 * 60 + 15) return '6ª Hora (14:00 - 15:00)';
  return null;
};

export const FastParteModal: React.FC<FastParteModalProps> = ({
  alumnos,
  profesores = [],
  currentUser,
  onSubmitSancion,
  onPrintParte,
  onDone,
  alumnoInicialId,
}) => {
  const alumnoInicial = alumnoInicialId ? alumnos.find(a => a.id_alumno === alumnoInicialId) : undefined;
  const isAdmin = AuthService.isAdmin(currentUser);

  // Docente que comunica / emite el parte (configurable si es Administrador / Equipo de Convivencia)
  const [selectedProfesorId, setSelectedProfesorId] = useState<string>(currentUser.id_profesor);
  const selectedProfesor = useMemo(() => {
    return profesores.find(p => p.id_profesor === selectedProfesorId) || currentUser;
  }, [profesores, selectedProfesorId, currentUser]);

  // Lista ordenada de profesores para el selector
  const listaProfesoresOrdenada = useMemo(() => {
    return [...profesores].sort((a, b) => (a.apellidos || '').localeCompare(b.apellidos || ''));
  }, [profesores]);

  // 1. Grupo y Alumno
  const [selectedGrupo, setSelectedGrupo] = useState<GrupoEducativo>(
    (alumnoInicial?.grupo as GrupoEducativo) || (currentUser.tutor_de_grupo as GrupoEducativo) || '1ESO_A'
  );
  const [selectedAlumnoId, setSelectedAlumnoId] = useState<string>(alumnoInicial?.id_alumno || '');
  const [searchAlumnoTerm, setSearchAlumnoTerm] = useState<string>('');

  // 2. Tipo de Conducta (LEVE / GRAVE / ACADÉMICO)
  const [activeTabTipo, setActiveTabTipo] = useState<TipoConductaV0>('LEVE');
  const [selectedConductaCodigo, setSelectedConductaCodigo] = useState<CodigoConductaV0>('LEV-PERTURBACION');
  const [manualPuntosSalud, setManualPuntosSalud] = useState<number>(5); // para GRA-SALUD (5 o 10)

  // 3. Medida Inmediata Adoptada (V0 - Página 3)
  const [medidaInmediata, setMedidaInmediata] = useState<MedidaInmediataAdoptada>('AMONESTACION_VERBAL');
  const [tareaPAC, setTareaPAC] = useState<string>('');
  const [reincorporacionAula, setReincorporacionAula] = useState<ReincorporacionAula>('SI');

  // 4. Campos Automáticos y editables: Hora de clase del hecho vs Momento de registro
  const [fechaIncidente, setFechaIncidente] = useState<string>(getLocalTodayDate());
  const [horaIncidente, setHoraIncidente] = useState<string>(getLocalCurrentTime());
  const [tramoHorario, setTramoHorario] = useState<TramoHorario>(
    deduceTramoFromTime(getLocalCurrentTime()) || '2ª Hora (09:30 - 10:30)'
  );
  const [isDiferido, setIsDiferido] = useState<boolean>(false);
  const [horaActualRegistro] = useState<string>(getLocalCurrentTime());
  const [descripcionHechos, setDescripcionHechos] = useState<string>('');
  const [materia, setMateria] = useState<string>((currentUser.departamento || '').split('/')[0].trim());
  const [ubicacion, setUbicacion] = useState<UbicacionCentro>('Aula ordinaria');
  const [ubicacionOtrosDetalle, setUbicacionOtrosDetalle] = useState<string>('');

  // Cambio de profesor informante
  const handleProfesorChange = (newProfId: string) => {
    setSelectedProfesorId(newProfId);
    const prof = profesores.find(p => p.id_profesor === newProfId);
    if (prof) {
      if (prof.departamento) {
        setMateria(prof.departamento.split('/')[0].trim());
      }
      if (prof.tutor_de_grupo) {
        setSelectedGrupo(prof.tutor_de_grupo as GrupoEducativo);
      }
    }
  };

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdSancion, setCreatedSancion] = useState<Sancion | null>(null);
  const [createdAlumno, setCreatedAlumno] = useState<Alumno | null>(null);

  // Alumnos activos del grupo seleccionado (excluyendo bajas escolares)
  const alumnosGrupo = useMemo(() => {
    return alumnos.filter(a => a.grupo === selectedGrupo && a.estado !== 'BAJA');
  }, [alumnos, selectedGrupo]);

  // Alumno seleccionado
  const selectedAlumno = useMemo(() => {
    return alumnos.find(a => a.id_alumno === selectedAlumnoId);
  }, [alumnos, selectedAlumnoId]);

  // Indicador de régimen especial Informática (1º INF / 2º INF)
  const isInfGroup = useMemo(() => {
    const grp = selectedAlumno ? selectedAlumno.grupo : selectedGrupo;
    return esGrupoInformatica(grp);
  }, [selectedAlumno, selectedGrupo]);

  // Definición de la conducta seleccionada
  const selectedConductaDef = useMemo(() => {
    return CATALOGO_CONDUCTAS_V0[selectedConductaCodigo];
  }, [selectedConductaCodigo]);

  // Puntos a descontar adaptados al grupo escolar (con regla especial 1º INF y 2º INF)
  const puntosDescuento = useMemo(() => {
    const grp = selectedAlumno ? selectedAlumno.grupo : selectedGrupo;
    return calcularPuntosInfraccion(selectedConductaCodigo, grp, manualPuntosSalud);
  }, [selectedConductaCodigo, selectedAlumno, selectedGrupo, manualPuntosSalud]);

  // Puntos actuales del alumno (calculados en tiempo real con todas las sanciones activas)
  const puntosActuales = useMemo(() => {
    if (!selectedAlumno) return 10;
    try {
      return StorageService.calcularSaldoAlumno(selectedAlumno.id_alumno).saldoActual;
    } catch {
      return selectedAlumno.puntos_actuales ?? 10;
    }
  }, [selectedAlumno, alumnos]);

  const puntosResultantes = Math.max(0, puntosActuales - puntosDescuento);

  // Selección de tipo de conducta
  const handleSelectTipo = (tipo: TipoConductaV0) => {
    setActiveTabTipo(tipo);
    if (tipo === 'LEVE') {
      setSelectedConductaCodigo('LEV-PERTURBACION');
    } else if (tipo === 'GRAVE') {
      setSelectedConductaCodigo('GRA-MOVIL-USO');
      setMedidaInmediata('RETIRADA_MOVIL');
    } else {
      setSelectedConductaCodigo('ACA-COPIAR');
      setMedidaInmediata('AMONESTACION_VERBAL');
    }
  };

  // Selección de conducta
  const handleSelectConducta = (cod: CodigoConductaV0) => {
    setSelectedConductaCodigo(cod);
    if (cod === 'GRA-MOVIL-USO' || cod === 'GRA-MOVIL-ENTREGA') {
      setMedidaInmediata('RETIRADA_MOVIL');
    } else if (cod === 'LEV-PASILLO') {
      setMedidaInmediata('AMONESTACION_VERBAL');
    } else if (cod === 'GRA-AGRESION' || cod === 'GRA-AMENAZAS') {
      setMedidaInmediata('DERIVACION_JEFATURA');
    }
  };

  // Sugerencia de hora
  const handleHoraChange = (val: string) => {
    setHoraIncidente(val);
    const deduced = deduceTramoFromTime(val);
    if (deduced) setTramoHorario(deduced);
  };

  // Preset de hechos habituales
  const hechosRapidos: Record<CodigoConductaV0, string> = {
    'ACA-COPIAR': 'Consulta no autorizada de apuntes durante la realización de la prueba escrita individual.',
    'ACA-MATERIAL': 'No aporta cuaderno ni material didáctico por tercera sesión consecutiva.',
    'LEV-PERTURBACION': 'Interrupción repetida de la explicación docente y falta de atención tras llamadas de advertencia.',
    'LEV-COLABORACION': 'Negativa continuada a participar en las actividades lectivas programadas para la sesión.',
    'LEV-ESTUDIAR': 'Molestar reiteradamente a los compañeros impidiendo su concentración y trabajo individual.',
    'LEV-INCORRECCION': 'Respuesta desconsiderada y tono inadecuado al requerimiento efectuado por el profesorado.',
    'LEV-DANOS': 'Deterioro leve intencionado de mobiliario escolar (pintadas en la mesa de clase).',
    'LEV-PASILLO': 'Encontrado/a en pasillos sin justificación ni pase autorizado durante el tramo lectivo.',
    'GRA-MOVIL-USO': 'Uso y manipulación de teléfono móvil en el aula sin autorización docente.',
    'GRA-MOVIL-ENTREGA': 'Negativa explícita a depositar el smartphone ante el requerimiento formal del docente.',
    'GRA-AGRESION': 'Agresión física hacia otro alumno en el recinto escolar.',
    'GRA-INJURIAS': 'Insultos y descalificaciones graves dirigidas hacia un miembro de la comunidad educativa.',
    'GRA-ACOSO': 'Conducta intimidatoria reiterada. Se remite informe a Jefatura para valoración de protocolo.',
    'GRA-SALUD': 'Conducta lesiva con riesgo evidente para la salud e integridad física en dependencias del centro.',
    'GRA-VEJACIONES': 'Trato humillante o vejatorio de carácter discriminatorio hacia un compañero de aula.',
    'GRA-AMENAZAS': 'Amenazas explícitas graves proferidas con intimidación.',
    'GRA-SUPLANTACION': 'Falsificación de firma o sustracción de documentación académica oficial.',
    'GRA-DANOS': 'Destrozo deliberado de equipamiento informático o instalaciones escolares.',
    'GRA-ACTIVIDADES': 'Acción directa orientada a sabotear el desarrollo regular de la actividad docente.',
    'GRA-CORRECCIONES': 'Incumplimiento injustificado y reiterado de las medidas correctoras impuestas previamente.',
  };

  const handleResetForm = () => {
    setCreatedSancion(null);
    setCreatedAlumno(null);
    setSelectedAlumnoId('');
    setDescripcionHechos('');
    setTareaPAC('');
    setMedidaInmediata('AMONESTACION_VERBAL');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAlumno) return;

    setIsSubmitting(true);

    const tipif = obtenerTipificacionNormativa(selectedConductaCodigo);
    const medidaObj = MEDIDAS_INMEDIATAS_CATALOG.find(m => m.valor === medidaInmediata);

    const esPAC = medidaInmediata === 'AULA_PAC';
    const ubicacionFinal = ubicacion === 'Otros' && ubicacionOtrosDetalle.trim()
      ? `Otros: ${ubicacionOtrosDetalle.trim()}`
      : ubicacion;

    try {
      const { sancion, alumnoActualizado } = onSubmitSancion({
        timestamp: new Date().toISOString(),
        fecha: fechaIncidente,
        hora_incidente: horaIncidente,
        tramo_horario: tramoHorario,
        hora_registro: horaActualRegistro,
        registro_diferido: isDiferido,
        id_alumno: selectedAlumno.id_alumno,
        id_profesor: selectedProfesor.id_profesor,
        nombre_profesor: `${selectedProfesor.nombre} ${selectedProfesor.apellidos}`,
        materia,
        codigo_infraccion: selectedConductaCodigo,
        tipo_conducta: activeTabTipo,
        puntos_restados: puntosDescuento,
        saldo_anterior: puntosActuales,
        saldo_resultante: puntosResultantes,
        descripcion_hechos: descripcionHechos || hechosRapidos[selectedConductaCodigo] || 'Sin observaciones.',
        medida_inmediata: medidaInmediata,
        medida_inmediata_texto: medidaObj?.label || 'Amonestación verbal',
        detalle_pac: esPAC ? {
          hora_salida: horaIncidente,
          profesor_deriva: `${selectedProfesor.nombre} ${selectedProfesor.apellidos}`,
          tarea_pac: tareaPAC || 'Tareas de la materia y reflexión conductual',
          reincorporacion: reincorporacionAula,
        } : undefined,
        ubicacion: ubicacionFinal,
        derivado_pac: esPAC,
        tareas_enviadas_pac: esPAC ? tareaPAC : undefined,
        estado_pac: esPAC ? 'EN_TRANSITO' : 'NO_APLICA',
        estado_tramitacion: 'PENDIENTE_NOTIFICACION',
        fecha_comunicacion_familia: fechaIncidente,
      });

      setCreatedSancion(sancion);
      setCreatedAlumno(alumnoActualizado);
    } catch (err: any) {
      console.error('Error al imponer sanción:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // PANTALLA DE ÉXITO TRAS EL ENVÍO (V0 - Generación de PDF y confirmación)
  if (createdSancion && createdAlumno) {
    const tipif = obtenerTipificacionNormativa(createdSancion.codigo_infraccion);
    return (
      <div className="bg-white rounded-2xl border border-sky-100 p-6 shadow-xs space-y-6 animate-in fade-in duration-150">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-sky-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
              Parte de Convivencia Registrado con Éxito
            </h2>
            <p className="text-xs text-slate-500">
              Expediente: <strong className="font-mono text-slate-800">{createdSancion.numero_expediente}</strong> · Sistema V0
            </p>
          </div>
        </div>

        <EstadoEnvioParte idSancion={createdSancion.id_sancion} />

        {/* Resumen del movimiento en carnet */}
        <div className="bg-sky-50/70 border border-sky-200 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <span className="text-slate-500 block text-[11px]">Alumno/a</span>
            <strong className="text-slate-900">{createdAlumno.nombre} {createdAlumno.apellidos}</strong>
            <span className="text-slate-500 block text-[10px]">{createdAlumno.grupo} · {createdAlumno.nie}</span>
          </div>

          <div>
            <span className="text-slate-500 block text-[11px]">Hora de Clase (Incidente)</span>
            <strong className="text-slate-900">{createdSancion.tramo_horario.split('(')[0]}</strong>
            <span className="text-slate-500 block text-[10px]">
              {createdSancion.fecha} a las {createdSancion.hora_incidente || '00:00'}h
              {createdSancion.registro_diferido && (
                <span className="text-amber-800 font-semibold block">Registrado a las {createdSancion.hora_registro || ''}h</span>
              )}
            </span>
          </div>

          <div>
            <span className="text-slate-500 block text-[11px]">Deducción de Puntos</span>
            <strong className="text-rose-700 font-bold text-sm">
              {createdSancion.puntos_restados > 0 ? `-${createdSancion.puntos_restados} pts` : '0 pts (Académico)'}
            </strong>
            <span className="text-slate-500 block text-[10px]">{tipif.tipoTexto}</span>
          </div>

          <div>
            <span className="text-slate-500 block text-[11px]">Saldo Resultante</span>
            <strong className={`font-mono text-sm font-bold ${createdAlumno.puntos_actuales === 0 ? 'text-rose-700' : createdAlumno.puntos_actuales <= 3 ? 'text-amber-700' : 'text-sky-800'}`}>
              {createdAlumno.puntos_actuales} / 10 puntos
            </strong>
            <span className="text-slate-500 block text-[10px]">
              {createdAlumno.puntos_actuales === 0 
                ? '⚠️ Saldo 0: Aviso a Jefatura' 
                : createdAlumno.puntos_actuales <= 3 
                ? 'Alerta de puntos' 
                : 'Estado Ordinario'}
            </span>
          </div>
        </div>

        {/* Notificación sobre precisión jurídica V0 */}
        <div className="bg-white border border-slate-200 rounded-xl p-3 text-xs text-slate-600 space-y-1">
          <div className="font-semibold text-slate-800 flex items-center gap-1.5">
            <Info className="w-4 h-4 text-sky-600" />
            <span>Documentación Oficial Generada</span>
          </div>
          <p className="text-[11px]">
            Conforme a la <strong>V0 del Módulo de Convivencia</strong>, el cálculo de saldo y el histórico se han actualizado automáticamente. La aplicación no impone decisiones de expulsión; el parte queda listo para su consulta o firma en Jefatura de Estudios.
          </p>
        </div>

        {/* Botones de acción: Imprimir / Descargar PDF o Nuevo Parte */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={handleResetForm}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Registrar otro parte</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onPrintParte(createdSancion)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Ver e Imprimir PDF Oficial</span>
            </button>

            <button
              type="button"
              onClick={() => {
                handleResetForm();
                onDone();
              }}
              className="px-4 py-2.5 bg-white border border-sky-200 hover:bg-sky-50 text-sky-900 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              Finalizar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-sky-100 p-5 sm:p-6 shadow-xs space-y-6">
      {/* Encabezado V0 */}
      <div className="border-b border-sky-100 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider bg-sky-100 text-sky-800 px-2 py-0.5 rounded-full">
              Versión 0 · Ágil &lt; 30s
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs font-semibold text-slate-600">IES Blas Infante</span>
          </div>
          <h1 className="text-lg font-bold text-slate-900 mt-1">
            Registro Rápido de Parte de Convivencia
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Flujo simplificado: Alumno/a → Tipo de Conducta → Hechos → Medida Inmediata → Enviar
          </p>
        </div>

        {/* Datos automáticos del docente o selector para Admin */}
        <div className="bg-sky-50/70 border border-sky-100 rounded-xl px-3 py-2 text-right">
          <div className="text-[10px] text-slate-500 uppercase font-mono">Profesor/a Informante</div>
          <div className="text-xs font-bold text-slate-800 truncate max-w-[220px]">
            {selectedProfesor.nombre} {selectedProfesor.apellidos}
          </div>
          <div className="text-[10px] text-sky-700 font-mono truncate max-w-[220px]">
            {materia} {isAdmin && selectedProfesor.id_profesor !== currentUser.id_profesor ? '· (Por Convivencia)' : ''}
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* SELECCIÓN DE PROFESOR/A PARA ADMINISTRACIÓN / CONVIVENCIA */}
        {isAdmin && (
          <div className="p-3.5 bg-gradient-to-r from-sky-50 via-indigo-50/40 to-blue-50 border border-sky-200 rounded-2xl space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <label className="text-xs font-bold text-sky-950 flex items-center gap-1.5">
                <User className="w-4 h-4 text-sky-700" />
                <span>Profesor/a que informa o puso el parte:</span>
              </label>
              <span className="text-[11px] text-sky-800 font-medium">
                {selectedProfesor.id_profesor === currentUser.id_profesor 
                  ? 'Registrando en mi propio nombre' 
                  : `Registrando en nombre de ${selectedProfesor.nombre} ${selectedProfesor.apellidos}`}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <select
                  value={selectedProfesorId}
                  onChange={(e) => handleProfesorChange(e.target.value)}
                  className="w-full text-xs font-semibold rounded-xl border border-sky-300 bg-white p-2.5 text-slate-800 focus:ring-2 focus:ring-sky-500 shadow-2xs"
                >
                  <option value={currentUser.id_profesor}>
                    👤 Yo mismo ({currentUser.nombre} {currentUser.apellidos})
                  </option>
                  <optgroup label="Claustro de Profesores">
                    {listaProfesoresOrdenada
                      .filter(p => p.id_profesor !== currentUser.id_profesor && p.estado !== 'INACTIVO')
                      .map(p => (
                        <option key={p.id_profesor} value={p.id_profesor}>
                          {p.apellidos}, {p.nombre} — {p.departamento} {p.tutor_de_grupo ? `(Tutor ${p.tutor_de_grupo})` : ''}
                        </option>
                      ))}
                  </optgroup>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 bg-white/90 border border-sky-200 rounded-xl px-3 py-1.5 text-slate-700">
                  <div className="text-[10px] text-slate-400 font-mono">Materia / Depto. Asociado</div>
                  <div className="font-bold text-sky-900 truncate text-xs">{materia || 'General'}</div>
                </div>
                {selectedProfesor.tutor_de_grupo && (
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedProfesor.tutor_de_grupo) {
                        setSelectedGrupo(selectedProfesor.tutor_de_grupo as GrupoEducativo);
                      }
                    }}
                    className="text-[11px] bg-sky-100 hover:bg-sky-200 text-sky-800 font-semibold px-2.5 py-2 rounded-xl border border-sky-300 transition-colors cursor-pointer whitespace-nowrap shadow-2xs"
                    title="Cargar grupo de su tutoría"
                  >
                    Cargar grupo {selectedProfesor.tutor_de_grupo}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* PASO 1: SELECCIÓN DE ALUMNO/A Y GRUPO */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-sky-600 text-white inline-flex items-center justify-center text-[11px] font-bold">1</span>
              <span>Identificación del Alumno/a</span>
            </label>
            <span className="text-[11px] text-slate-500">
              {alumnosGrupo.length} alumnos matriculados
            </span>
          </div>

          {/* Selector de Grupo Rápido con categorías */}
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5 p-1.5 bg-slate-100 rounded-xl max-h-36 overflow-y-auto">
              {LISTA_GRUPOS_OFICIALES.map(item => (
                <button
                  key={item.codigo}
                  type="button"
                  onClick={() => {
                    setSelectedGrupo(item.codigo);
                    setSelectedAlumnoId('');
                  }}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-colors cursor-pointer ${
                    selectedGrupo === item.codigo
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'bg-white hover:bg-slate-200 text-slate-700 border border-slate-200/60'
                  }`}
                  title={item.descripcion}
                >
                  {item.etiqueta}
                </button>
              ))}
            </div>
          </div>

          {/* Lista de Alumnos del Grupo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-1 bg-slate-50/50 rounded-xl border border-slate-200">
            {alumnosGrupo.map(al => {
              const isSelected = al.id_alumno === selectedAlumnoId;
              return (
                <button
                  key={al.id_alumno}
                  type="button"
                  onClick={() => setSelectedAlumnoId(al.id_alumno)}
                  className={`text-left p-2 rounded-xl text-xs border transition-all cursor-pointer flex items-center justify-between ${
                    isSelected
                      ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                      : 'bg-white hover:bg-sky-50/60 border-slate-200 text-slate-800'
                  }`}
                >
                  <div className="truncate pr-1">
                    <div className="font-semibold truncate">
                      {al.apellidos}, {al.nombre}
                    </div>
                    <div className={`text-[10px] font-mono ${isSelected ? 'text-sky-100' : 'text-slate-400'}`}>
                      {al.nie}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`text-[11px] font-mono font-bold px-1.5 py-0.5 rounded ${
                      isSelected
                        ? 'bg-white/20 text-white'
                        : al.puntos_actuales === 0
                        ? 'bg-rose-100 text-rose-800'
                        : al.puntos_actuales <= 3
                        ? 'bg-amber-100 text-amber-900'
                        : 'bg-sky-100 text-sky-900'
                    }`}>
                      {al.puntos_actuales} pts
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* PASO 2: TIPO DE CONDUCTA Y SELECCIÓN (V0 - Catálogo oficial) */}
        <div className="space-y-3 pt-2 border-t border-sky-100">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-sky-600 text-white inline-flex items-center justify-center text-[11px] font-bold">2</span>
              <span>Conducta Registrada</span>
            </label>
            <span className="text-[11px] text-slate-500">
              Baremo fijo de puntos según catálogo V0
            </span>
          </div>

          {/* Pestañas de Tipo de Conducta */}
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleSelectTipo('LEVE')}
              className={`p-2.5 rounded-xl border text-xs font-bold text-center transition-all cursor-pointer ${
                activeTabTipo === 'LEVE'
                  ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                  : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
              }`}
            >
              <div>CONDUCTAS LEVES</div>
              <div className={`text-[10px] font-normal ${activeTabTipo === 'LEVE' ? 'text-sky-100' : 'text-slate-400'}`}>
                {isInfGroup ? 'Régimen INF (-6 / -7 pts)' : 'Art. 34 (-2 / -3 pts)'}
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleSelectTipo('GRAVE')}
              className={`p-2.5 rounded-xl border text-xs font-bold text-center transition-all cursor-pointer ${
                activeTabTipo === 'GRAVE'
                  ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                  : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
              }`}
            >
              <div>CONDUCTAS GRAVES</div>
              <div className={`text-[10px] font-normal ${activeTabTipo === 'GRAVE' ? 'text-rose-100' : 'text-slate-400'}`}>
                {isInfGroup ? 'Régimen INF (Siempre -10 pts)' : 'Art. 37 / Móvil (-5 a -10 pts)'}
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleSelectTipo('ACADEMICO')}
              className={`p-2.5 rounded-xl border text-xs font-bold text-center transition-all cursor-pointer ${
                activeTabTipo === 'ACADEMICO'
                  ? 'bg-slate-800 text-white border-slate-800 shadow-xs'
                  : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
              }`}
            >
              <div>REGISTROS ACADÉMICOS</div>
              <div className={`text-[10px] font-normal ${activeTabTipo === 'ACADEMICO' ? 'text-slate-200' : 'text-slate-400'}`}>
                Sin pérdida (0 pts)
              </div>
            </button>
          </div>

          {/* Aviso normativo si pertenece a 1º INF / 2º INF */}
          {isInfGroup && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-xs flex items-start gap-2.5 text-amber-950">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong className="font-bold">Reglamento Específico Ciclo Informática (1º INF / 2º INF):</strong>
                <p className="mt-0.5 text-[11px] text-amber-800 leading-relaxed">
                  Conforme a la normativa del departamento, las faltas <strong>leves detraen +4 puntos adicionales</strong> (baremo estándar + 4), y <strong>todas las faltas graves se penalizan con 10 puntos</strong> (saldo cero).
                </p>
              </div>
            </div>
          )}

          {/* Catálogo de conductas filtrado por tipo */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-56 overflow-y-auto p-1 bg-slate-50/50 rounded-xl border border-slate-200">
            {Object.values(CATALOGO_CONDUCTAS_V0)
              .filter(c => c.tipo === activeTabTipo)
              .map(c => {
                const isSelected = c.codigo === selectedConductaCodigo;
                const ptsCalc = calcularPuntosInfraccion(
                  c.codigo,
                  selectedAlumno ? selectedAlumno.grupo : selectedGrupo,
                  manualPuntosSalud
                );

                return (
                  <button
                    key={c.codigo}
                    type="button"
                    onClick={() => handleSelectConducta(c.codigo)}
                    className={`text-left p-3 rounded-xl border text-xs transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'bg-sky-50 border-sky-500 ring-2 ring-sky-500/20 shadow-xs'
                        : 'bg-white hover:bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-bold text-slate-900 leading-snug">
                        {c.titulo}
                      </div>
                      <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full shrink-0 ${
                        ptsCalc === 0
                          ? 'bg-slate-100 text-slate-700'
                          : ptsCalc >= 8
                          ? 'bg-rose-100 text-rose-800 font-extrabold'
                          : 'bg-amber-100 text-amber-900'
                      }`}>
                        {ptsCalc === 0 ? '0 pts' : `-${ptsCalc} pts`}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 mt-2 font-mono">
                      <span>{c.referencia_legal}</span>
                      <span className="text-[9px] uppercase tracking-wider text-slate-400">
                        {c.origen_norma === 'DECRETO_327' ? 'Decreto 327/2010' : c.origen_norma === 'PLAN_CONVIVENCIA' ? 'Norma de Centro' : 'Académico'}
                      </span>
                    </div>
                  </button>
                );
              })}
          </div>

          {/* Caso especial V0: GRA-SALUD con elección manual entre 5 o 10 puntos */}
          {selectedConductaCodigo === 'GRA-SALUD' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs flex items-center justify-between">
              <span className="font-semibold text-amber-900">
                Puntuación manual para GRA-SALUD (V0):
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setManualPuntosSalud(5)}
                  className={`px-3 py-1 text-xs font-bold rounded-lg cursor-pointer ${
                    manualPuntosSalud === 5
                      ? 'bg-amber-600 text-white'
                      : 'bg-white border border-amber-300 text-amber-900'
                  }`}
                >
                  -5 puntos (Leve afección)
                </button>
                <button
                  type="button"
                  onClick={() => setManualPuntosSalud(10)}
                  className={`px-3 py-1 text-xs font-bold rounded-lg cursor-pointer ${
                    manualPuntosSalud === 10
                      ? 'bg-rose-600 text-white'
                      : 'bg-white border border-rose-300 text-rose-900'
                  }`}
                >
                  -10 puntos (Riesgo grave)
                </button>
              </div>
            </div>
          )}
        </div>

        {/* PASO 3: LUGAR / UBICACIÓN DEL HECHO */}
        <div className="space-y-3 pt-2 border-t border-sky-100">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-sky-600 text-white inline-flex items-center justify-center text-[11px] font-bold">3</span>
              <MapPin className="w-4 h-4 text-sky-700" />
              <span>Lugar / Ubicación del Hecho</span>
            </label>
            <span className="text-[11px] font-mono text-slate-500">
              Ubicación seleccionada: <strong className="text-sky-900">{ubicacion}</strong>
            </span>
          </div>

          {/* Cuadrícula interactiva de 6 ubicaciones requeridas */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {LISTA_UBICACIONES_OFICIALES.map((u) => {
              const isSelected = ubicacion === u.codigo;
              return (
                <button
                  key={u.codigo}
                  type="button"
                  onClick={() => setUbicacion(u.codigo)}
                  className={`p-2.5 rounded-xl border text-xs transition-all text-center cursor-pointer flex flex-col items-center justify-between gap-1.5 ${
                    isSelected
                      ? 'bg-sky-50 border-sky-600 ring-2 ring-sky-600/20 text-sky-950 font-bold shadow-xs'
                      : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <span className="text-xl" role="img" aria-label={u.label}>
                    {u.icono}
                  </span>
                  <div className="font-bold text-xs leading-tight">
                    {u.label}
                  </div>
                  <span className={`text-[10px] ${isSelected ? 'text-sky-700' : 'text-slate-400'}`}>
                    {u.descripcion}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Si se selecciona 'Otros', mostrar campo para especificar */}
          {ubicacion === 'Otros' && (
            <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 animate-in fade-in duration-100 flex flex-col sm:flex-row sm:items-center gap-2 text-xs">
              <label className="font-semibold text-amber-950 shrink-0">
                Especificar espacio u observaciones del lugar (opcional):
              </label>
              <input
                type="text"
                value={ubicacionOtrosDetalle}
                onChange={(e) => setUbicacionOtrosDetalle(e.target.value)}
                placeholder="Ej: Gimnasio, Pistas polideportivas, Aseos planta baja, Taller..."
                className="w-full text-xs rounded-lg border border-amber-300 p-2 bg-white text-slate-800 focus:outline-sky-600"
              />
            </div>
          )}
        </div>

        {/* PASO 4: HORA DE CLASE DEL INCIDENTE Y REGISTRO DIFERIDO */}
        <div className="space-y-3 pt-2 border-t border-sky-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <label className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-sky-600 text-white inline-flex items-center justify-center text-[11px] font-bold">4</span>
              <Clock className="w-4 h-4 text-sky-700" />
              <span>Hora de Clase / Momento en que ocurrió el hecho</span>
            </label>
            
            {/* Toggle para indicar si se pone en una hora diferente (registro diferido) */}
            <label className="inline-flex items-center gap-2 cursor-pointer bg-slate-100 hover:bg-slate-200/80 px-2.5 py-1 rounded-xl transition-colors text-xs">
              <input
                type="checkbox"
                checked={isDiferido}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setIsDiferido(checked);
                  if (!checked) {
                    // Restablecer a la hora actual
                    const now = getLocalCurrentTime();
                    setHoraIncidente(now);
                    const deduced = deduceTramoFromTime(now);
                    if (deduced) setTramoHorario(deduced);
                  }
                }}
                className="rounded text-sky-600 focus:ring-sky-500 w-3.5 h-3.5 cursor-pointer"
              />
              <span className="font-semibold text-slate-800">
                Poner el parte en una hora/sesión diferente a la actual
              </span>
            </label>
          </div>

          {/* Selector de Tramo Horario de Clase */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                <span>Sesión lectiva oficial:</span>
                <span className="font-mono text-sky-800 bg-sky-100 px-2 py-0.5 rounded font-bold">
                  {tramoHorario}
                </span>
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                Momento de registro: <strong>{horaActualRegistro}h</strong>
              </span>
            </div>

            {/* Cuadrícula de tramos de clase para selección directa con un clic */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1.5">
              {TRAMOS_HORARIOS_LISTA.map((t) => {
                const isSelected = tramoHorario === t;
                const isRecreo = t.includes('Recreo');
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setTramoHorario(t);
                      if (isDiferido) {
                        // sugerir la hora inicial del tramo
                        if (t.startsWith('1ª')) setHoraIncidente('08:30');
                        else if (t.startsWith('2ª')) setHoraIncidente('09:30');
                        else if (t.startsWith('3ª')) setHoraIncidente('10:30');
                        else if (t.includes('Recreo')) setHoraIncidente('11:45');
                        else if (t.startsWith('4ª')) setHoraIncidente('12:00');
                        else if (t.startsWith('5ª')) setHoraIncidente('13:00');
                        else if (t.startsWith('6ª')) setHoraIncidente('14:00');
                      }
                    }}
                    className={`p-2 rounded-xl text-xs font-semibold border transition-all text-center cursor-pointer ${
                      isSelected
                        ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                        : isRecreo
                        ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-200'
                        : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    <div className="font-bold leading-tight">
                      {t.split('(')[0].trim()}
                    </div>
                    <div className={`text-[10px] font-mono mt-0.5 ${isSelected ? 'text-sky-100' : 'text-slate-400'}`}>
                      {t.includes('(') ? t.split('(')[1].replace(')', '') : ''}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Controles expandidos cuando el parte es en diferido */}
            {isDiferido && (
              <div className="pt-2 border-t border-slate-200/80 grid grid-cols-1 sm:grid-cols-3 gap-3 animate-in fade-in duration-100">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Fecha en que ocurrió el hecho:
                  </label>
                  <input
                    type="date"
                    value={fechaIncidente}
                    onChange={(e) => setFechaIncidente(e.target.value)}
                    max={getLocalTodayDate()}
                    className="w-full text-xs font-mono rounded-lg border border-slate-300 p-2 bg-white text-slate-800 focus:outline-sky-600"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Hora exacta aproximada del hecho:
                  </label>
                  <input
                    type="time"
                    value={horaIncidente}
                    onChange={(e) => handleHoraChange(e.target.value)}
                    className="w-full text-xs font-mono rounded-lg border border-slate-300 p-2 bg-white text-slate-800 focus:outline-sky-600"
                  />
                </div>

                <div className="bg-sky-50/80 border border-sky-200 rounded-lg p-2.5 flex flex-col justify-center text-[11px] text-sky-950">
                  <span className="font-bold">Registro en diferido:</span>
                  <span className="text-slate-600">
                    Ocurrió durante la <strong>{tramoHorario.split('(')[0]}</strong> ({horaIncidente}h) y se asienta en la plataforma a las <strong>{horaActualRegistro}h</strong>.
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* PASO 5: DESCRIPCIÓN DE LOS HECHOS */}
        <div className="space-y-2 pt-2 border-t border-sky-100">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-sky-600 text-white inline-flex items-center justify-center text-[11px] font-bold">5</span>
              <span>Descripción Objetiva de los Hechos</span>
            </label>
            <button
              type="button"
              onClick={() => {
                const preset = hechosRapidos[selectedConductaCodigo];
                if (preset) setDescripcionHechos(preset);
              }}
              className="text-[11px] font-semibold text-sky-700 hover:text-sky-900 underline cursor-pointer"
            >
              Usar redacción tipo
            </button>
          </div>

          <textarea
            rows={3}
            value={descripcionHechos}
            onChange={(e) => setDescripcionHechos(e.target.value)}
            placeholder={`Describe objetivamente lo sucedido (ej: ${hechosRapidos[selectedConductaCodigo] || 'Hechos observados en el aula...'})`}
            className="w-full text-xs rounded-xl border border-slate-300 p-2.5 bg-slate-50 focus:bg-white focus:outline-sky-600 focus:border-sky-600 text-slate-800"
            required
          />
        </div>

        {/* PASO 6: MEDIDA INMEDIATA ADOPTADA (V0 - Página 3) */}
        <div className="space-y-3 pt-2 border-t border-sky-100">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-sky-600 text-white inline-flex items-center justify-center text-[11px] font-bold">6</span>
              <span>Medida Inmediata Adoptada</span>
            </label>
            <span className="text-[11px] text-slate-500">
              Opciones oficiales V0
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {MEDIDAS_INMEDIATAS_CATALOG.map(m => {
              const isSelected = medidaInmediata === m.valor;
              return (
                <button
                  key={m.valor}
                  type="button"
                  onClick={() => setMedidaInmediata(m.valor)}
                  className={`text-left p-2.5 rounded-xl border text-xs transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-sky-50 border-sky-600 ring-2 ring-sky-600/20 text-sky-950 font-bold shadow-xs'
                      : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                      isSelected ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-300'
                    }`}>
                      {isSelected && <Check className="w-2.5 h-2.5" />}
                    </span>
                    <span>{m.label}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-normal mt-1 pl-5">
                    {m.descripcion}
                  </p>
                </button>
              );
            })}
          </div>

          {/* DETALLES DE DERIVACIÓN AL AULA PAC (SI SE MARCA PAC) */}
          {medidaInmediata === 'AULA_PAC' && (
            <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 space-y-3 text-xs animate-in fade-in duration-100">
              <div className="font-bold text-amber-950 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-600" />
                <span>Protocolo de Derivación al Aula PAC</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-mono text-slate-600 mb-0.5">
                    Hora de salida (automática)
                  </label>
                  <input
                    type="time"
                    value={horaIncidente}
                    onChange={(e) => setHoraIncidente(e.target.value)}
                    className="w-full text-xs font-mono rounded-lg border border-amber-300 p-1.5 bg-white text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-slate-600 mb-0.5">
                    Profesor/a derivador/a
                  </label>
                  <input
                    type="text"
                    disabled
                    value={`${currentUser.nombre} ${currentUser.apellidos}`}
                    className="w-full text-xs rounded-lg border border-slate-200 p-1.5 bg-slate-100 text-slate-600 cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-slate-600 mb-0.5">
                    ¿Se incorpora posteriormente al aula?
                  </label>
                  <select
                    value={reincorporacionAula}
                    onChange={(e) => setReincorporacionAula(e.target.value as ReincorporacionAula)}
                    className="w-full text-xs rounded-lg border border-amber-300 p-1.5 bg-white font-semibold text-slate-800"
                  >
                    <option value="SI">Sí (Retorna antes de fin de hora)</option>
                    <option value="NO">No (Permanece sesión completa)</option>
                    <option value="PENDIENTE">Pendiente de evolución</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono text-slate-600 mb-0.5">
                  Tarea para realizar en PAC (campo breve / opcional):
                </label>
                <input
                  type="text"
                  value={tareaPAC}
                  onChange={(e) => setTareaPAC(e.target.value)}
                  placeholder="Ej: Ficha de lectura tema 4, ejercicios 1 al 5 y reflexión"
                  className="w-full text-xs rounded-lg border border-amber-300 p-2 bg-white text-slate-800"
                />
              </div>
            </div>
          )}
        </div>

        {/* PASO 6: PREVISUALIZACIÓN DE PUNTOS Y DATOS AUTOMÁTICOS */}
        <div className="bg-sky-50/60 border border-sky-100 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-[11px] text-slate-500 font-mono">
              Sesión del hecho: <strong>{tramoHorario}</strong> ({horaIncidente}h) · Fecha: <strong>{fechaIncidente}</strong>
              {isDiferido && <span className="text-amber-800 font-bold ml-1.5 bg-amber-100 px-1 rounded">Diferido (Reg: {horaActualRegistro}h)</span>}
            </div>
            <div className="text-[11px] text-slate-500 font-mono">
              Docente: <strong>{currentUser.nombre} {currentUser.apellidos}</strong> · {materia} ({ubicacion})
            </div>
            <div className="text-xs font-semibold text-slate-800">
              {selectedAlumno ? (
                <span>
                  Alumno: <strong>{selectedAlumno.nombre} {selectedAlumno.apellidos}</strong> · {selectedAlumno.grupo}
                </span>
              ) : (
                <span className="text-amber-700 italic">
                  Selecciona un alumno/a para calcular su carnet de puntos
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <span className="text-[10px] text-slate-400 block font-mono">Saldo resultante:</span>
              <span className={`text-base font-mono font-bold ${puntosResultantes === 0 ? 'text-rose-700' : puntosResultantes <= 3 ? 'text-amber-700' : 'text-sky-800'}`}>
                {puntosActuales} → {puntosResultantes} / 10 pts
              </span>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !selectedAlumno || !descripcionHechos.trim()}
              className="inline-flex items-center gap-2 px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>{isSubmitting ? 'Registrando...' : 'Registrar Parte'}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
