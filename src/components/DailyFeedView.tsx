/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { hoyLocal } from '../services/carnetPuntos';
import { 
  Filter, 
  Search, 
  Printer, 
  PhoneCall, 
  CheckCircle, 
  AlertCircle, 
  AlertTriangle,
  AlertOctagon,
  FileText, 
  Calendar, 
  Download, 
  ExternalLink,
  Phone,
  Clock,
  BookOpen,
  Users,
  ShieldAlert,
  X,
  ArrowRight,
  TrendingDown,
  Info,
  Trash2,
  Pencil
} from 'lucide-react';
import { Sancion, Alumno, Profesor, EstadoTramitacion, CodigoInfraccionROF, LISTA_GRUPOS_OFICIALES, GrupoEducativo } from '../types/convivencia';
import { MATRIZ_ROF_CATALOG } from '../data/rofCatalog';
import { AuthService } from '../services/authService';
import { EditarParteModal } from './EditarParteModal';

interface DailyFeedViewProps {
  sanciones: Sancion[];
  alumnos: Alumno[];
  profesores?: Profesor[];
  currentUser: Profesor;
  onUpdateTramitacion: (
    idSancion: string,
    nuevoEstado: EstadoTramitacion,
    observaciones: string
  ) => void;
  onPrintSingleParte: (sancion: Sancion) => void;
  onPrintBatchToday: (sanciones: Sancion[]) => void;
  onNavigateToImponer: () => void;
  onNavigateToCarnet?: (idAlumno?: string) => void;
  onNavigateToPAC?: () => void;
  onDeleteParte?: (idSancion: string, motivo: string) => { success: boolean; alumnoActualizado?: Alumno; sancionEliminada?: Sancion; error?: string };
  onEditParte?: (idSancion: string, cambios: Partial<Sancion>, motivo: string) => { success: boolean; sancionModificada?: Sancion; alumnoActualizado?: Alumno; error?: string };
}

type FeedDetailModalType = 'PARTES' | 'PENDIENTES' | 'PAC' | 'PUNTOS' | null;

export const DailyFeedView: React.FC<DailyFeedViewProps> = ({
  sanciones,
  alumnos,
  profesores = [],
  currentUser,
  onUpdateTramitacion,
  onPrintSingleParte,
  onPrintBatchToday,
  onNavigateToImponer,
  onNavigateToCarnet,
  onNavigateToPAC,
  onDeleteParte,
  onEditParte,
}) => {
  const today = hoyLocal();
  const isAdmin = AuthService.isAdmin(currentUser);

  // Filters - Default to '' (Todas las fechas) so all sanctions in the JSON are immediately visible
  const [filterDate, setFilterDate] = useState<string>('');
  const [filterGrupo, setFilterGrupo] = useState<string>('TODOS');
  const [filterEstado, setFilterEstado] = useState<string>('TODOS');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Active KPI Detail Modal
  const [activeKpiModal, setActiveKpiModal] = useState<FeedDetailModalType>(null);
  const [modalSearchFilter, setModalSearchFilter] = useState<string>('');

  // Deletion modal state (Equipo de Convivencia / Jefatura)
  const [parteToDelete, setParteToDelete] = useState<{
    sancion: Sancion;
    alumno: Alumno;
  } | null>(null);
  const [deleteMotivo, setDeleteMotivo] = useState<string>('Estimación de alegaciones / Corrección de error');
  const [isDeleting, setIsDeleting] = useState(false);

  // Edit modal state (Equipo de Convivencia / Jefatura / Autor)
  const [parteToEdit, setParteToEdit] = useState<Sancion | null>(null);

  // Telephone notification modal state
  const [activeCallModal, setActiveCallModal] = useState<{
    sancion: Sancion;
    alumno: Alumno;
  } | null>(null);
  const [callNotes, setCallNotes] = useState('');

  // Map of Alumno by ID for quick lookups with resilient matching
  const alumnoMap = useMemo(() => {
    const map = new Map<string, Alumno>();
    alumnos.forEach(a => {
      if (a.id_alumno) {
        map.set(a.id_alumno, a);
        map.set(a.id_alumno.toLowerCase(), a);
        map.set(a.id_alumno.toUpperCase(), a);
      }
      if (a.nie) {
        map.set(a.nie.toUpperCase(), a);
      }
    });
    return map;
  }, [alumnos]);

  const getAlumnoForSancion = (idAlumno?: string): Alumno => {
    if (!idAlumno) {
      return {
        id_alumno: 'SIN_ID',
        nombre: 'Alumno/a',
        apellidos: '(Sin asignar)',
        grupo: '1ESO_A' as GrupoEducativo,
        nie: 'S/N',
        telefono_tutor: '',
        nombre_tutor: '',
        puntos_actuales: 10,
        estado: 'ACTIVO',
      };
    }
    const found = alumnoMap.get(idAlumno) || alumnoMap.get(idAlumno.toLowerCase()) || alumnoMap.get(idAlumno.toUpperCase());
    if (found) return found;

    return {
      id_alumno: idAlumno,
      nombre: 'Alumno/a',
      apellidos: `(${idAlumno})`,
      grupo: '1ESO_A' as GrupoEducativo,
      nie: 'S/N',
      telefono_tutor: '',
      nombre_tutor: '',
      puntos_actuales: 10,
      estado: 'ACTIVO',
    };
  };

  // Sanciones for the active filter date (or all if filterDate is empty)
  const daySancionesList = useMemo(() => {
    return filterDate ? sanciones.filter(s => s.fecha === filterDate) : sanciones;
  }, [sanciones, filterDate]);

  // Filtered sanciones for main feed table
  const filteredSanciones = useMemo(() => {
    return sanciones.filter(s => {
      // Date filter
      if (filterDate && s.fecha !== filterDate) return false;

      const alumno = getAlumnoForSancion(s.id_alumno);

      // Grupo filter
      if (filterGrupo !== 'TODOS' && alumno.grupo !== filterGrupo) return false;

      // Estado filter
      if (filterEstado !== 'TODOS' && s.estado_tramitacion !== filterEstado) return false;

      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const fullName = `${alumno.nombre} ${alumno.apellidos}`.toLowerCase();
        const profName = (s.nombre_profesor || '').toLowerCase();
        const nie = (alumno.nie || '').toLowerCase();
        const rof = (s.codigo_infraccion || '').toLowerCase();
        if (
          !fullName.includes(term) &&
          !profName.includes(term) &&
          !nie.includes(term) &&
          !rof.includes(term)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [sanciones, filterDate, filterGrupo, filterEstado, searchTerm, alumnoMap]);

  // Statistics for the selected day
  const statsDay = useMemo(() => {
    const list = daySancionesList;
    const total = list.length;
    const pendientesList = list.filter(s => s.estado_tramitacion === 'PENDIENTE_NOTIFICACION');
    const pendientes = pendientesList.length;
    const pacList = list.filter(s => s.derivado_pac);
    const pacCount = pacList.length;
    const totalPuntos = list.reduce((acc, curr) => acc + curr.puntos_restados, 0);
    const promedioPuntos = total > 0 ? (totalPuntos / total).toFixed(1) : '0';

    // Severity breakdown
    const leves = list.filter(s => s.puntos_restados <= 3).length;
    const graves = list.filter(s => s.puntos_restados >= 4 && s.puntos_restados <= 6).length;
    const muyGraves = list.filter(s => s.puntos_restados >= 7).length;

    // Time slots breakdown
    const tramosCount: Record<string, number> = {};
    list.forEach(s => {
      const tramo = s.tramo_horario ? s.tramo_horario.split('(')[0].trim() : 'Sin tramo';
      tramosCount[tramo] = (tramosCount[tramo] || 0) + 1;
    });

    // ROF Typology breakdown
    const rofCount: Record<string, { count: number; puntos: number }> = {};
    list.forEach(s => {
      if (!rofCount[s.codigo_infraccion]) {
        rofCount[s.codigo_infraccion] = { count: 0, puntos: 0 };
      }
      rofCount[s.codigo_infraccion].count += 1;
      rofCount[s.codigo_infraccion].puntos += s.puntos_restados;
    });

    return { 
      total, 
      pendientes, 
      pendientesList,
      pacCount, 
      pacList,
      totalPuntos, 
      promedioPuntos,
      leves,
      graves,
      muyGraves,
      tramosCount,
      rofCount
    };
  }, [daySancionesList]);

  // Handle call submit
  const handleConfirmCall = () => {
    if (!activeCallModal) return;
    onUpdateTramitacion(
      activeCallModal.sancion.id_sancion,
      'NOTIFICADO_TELEFONO',
      callNotes || 'Llamada telefónica realizada con el tutor legal. Notificación confirmada.'
    );
    setActiveCallModal(null);
    setCallNotes('');
  };

  const getTramitacionBadge = (estado: EstadoTramitacion) => {
    switch (estado) {
      case 'PENDIENTE_NOTIFICACION':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" />
            Pendiente Llamada
          </span>
        );
      case 'NOTIFICADO_TELEFONO':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
            <Phone className="w-3 h-3 text-amber-600" />
            Llamada Efectuada
          </span>
        );
      case 'PARTE_IMPRESO':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-800 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
            <Printer className="w-3 h-3 text-blue-600" />
            Parte Impreso / Firma
          </span>
        );
      case 'RESUELTO':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-900 bg-sky-100/80 border border-sky-200 px-2 py-0.5 rounded-full">
            <CheckCircle className="w-3 h-3 text-sky-600" />
            Completado
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & KPI Summary */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-sky-800 uppercase tracking-widest">
                IES BLAS INFANTE · TRAMITACIÓN T-0
              </span>
              <span className="text-slate-300">|</span>
              <span className="text-xs text-slate-500 font-mono">
                {filterDate ? `Jornada ${filterDate}` : 'Todas las Fechas'}
              </span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight mt-1">
              Feed Diario de Partes y Convivencia
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Registro inmutable de infracciones, citación con familias y control de derivaciones.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => onPrintBatchToday(filteredSanciones)}
              disabled={filteredSanciones.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-sky-50/80 hover:bg-sky-100 border border-sky-200 text-sky-950 text-xs font-semibold rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-sky-700" />
              <span>Exportar PDF Consolidado ({filteredSanciones.length})</span>
            </button>

            <button
              onClick={onNavigateToImponer}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-xl transition-colors shadow-xs cursor-pointer"
            >
              <span>+ Nuevo Parte (&lt;30s)</span>
            </button>
          </div>
        </div>

        {/* 4 Interactive & Clickable Metric Displays */}
        <div className="pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Resumen de la Jornada
            </span>
            <span className="text-xs text-sky-700 font-semibold">
              Haz clic en cualquier tarjeta para ver el desglose detallado &rarr;
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {/* KPI 1: PARTES DEL DIA */}
            <button
              type="button"
              onClick={() => {
                setModalSearchFilter('');
                setActiveKpiModal('PARTES');
              }}
              className="bg-sky-50/50 hover:bg-sky-50 border border-sky-200 hover:border-sky-400 rounded-xl p-3.5 text-left transition-all group cursor-pointer shadow-2xs hover:shadow-xs"
            >
              <div className="flex items-center justify-between text-slate-600">
                <span className="text-[11px] font-bold uppercase tracking-wider">
                  {filterDate ? 'Partes del Día' : 'Partes Registrados'}
                </span>
                <span className="text-xs text-sky-700 font-semibold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                  Ver detalle &rarr;
                </span>
              </div>
              <div className="text-2xl font-bold font-mono text-slate-900 mt-1 tabular-nums">
                {statsDay.total}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                <span>{filterDate ? `Fecha: ${filterDate}` : 'Todo el curso'}</span>
                <span className="text-sky-800 font-semibold">
                  {statsDay.leves}L · {statsDay.graves}G · {statsDay.muyGraves}MG
                </span>
              </div>
            </button>

            {/* KPI 2: PENDIENTES LLAMADA */}
            <button
              type="button"
              onClick={() => {
                setModalSearchFilter('');
                setActiveKpiModal('PENDIENTES');
              }}
              className="bg-rose-50/70 hover:bg-rose-50 border border-rose-200 hover:border-rose-400 rounded-xl p-3.5 text-left transition-all group cursor-pointer shadow-2xs hover:shadow-xs"
            >
              <div className="flex items-center justify-between text-rose-800">
                <span className="text-[11px] font-bold uppercase tracking-wider">
                  Pendientes Llamada
                </span>
                <span className="text-xs text-rose-700 font-semibold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                  Ver lista &rarr;
                </span>
              </div>
              <div className="text-2xl font-bold font-mono text-rose-700 mt-1 tabular-nums flex items-baseline gap-2">
                <span>{statsDay.pendientes}</span>
                {statsDay.pendientes > 0 && (
                  <span className="text-xs font-bold text-rose-600 animate-pulse">
                    Plazo &lt;24h
                  </span>
                )}
              </div>
              <div className="text-[11px] text-rose-600 mt-1">
                {statsDay.pendientes === 0 
                  ? '✓ Todas notificadas a familia' 
                  : 'Citaciones familiares preceptivas'}
              </div>
            </button>

            {/* KPI 3: DERIVACIONES PAC */}
            <button
              type="button"
              onClick={() => {
                setModalSearchFilter('');
                setActiveKpiModal('PAC');
              }}
              className="bg-amber-50/70 hover:bg-amber-50 border border-amber-200 hover:border-amber-400 rounded-xl p-3.5 text-left transition-all group cursor-pointer shadow-2xs hover:shadow-xs"
            >
              <div className="flex items-center justify-between text-amber-900">
                <span className="text-[11px] font-bold uppercase tracking-wider">
                  Derivaciones PAC
                </span>
                <span className="text-xs text-amber-800 font-semibold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                  Ver estado &rarr;
                </span>
              </div>
              <div className="text-2xl font-bold font-mono text-amber-900 mt-1 tabular-nums">
                {statsDay.pacCount}
              </div>
              <div className="text-[11px] text-amber-700 mt-1">
                Alumnos derivados a convivencia
              </div>
            </button>

            {/* KPI 4: PUNTOS DEDUCIDOS */}
            <button
              type="button"
              onClick={() => {
                setModalSearchFilter('');
                setActiveKpiModal('PUNTOS');
              }}
              className="bg-slate-50 hover:bg-slate-100/80 border border-slate-200 hover:border-slate-400 rounded-xl p-3.5 text-left transition-all group cursor-pointer shadow-2xs hover:shadow-xs"
            >
              <div className="flex items-center justify-between text-slate-700">
                <span className="text-[11px] font-bold uppercase tracking-wider">
                  Puntos Deducidos
                </span>
                <span className="text-xs text-slate-800 font-semibold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                  Ver impacto &rarr;
                </span>
              </div>
              <div className="text-2xl font-bold font-mono text-rose-700 mt-1 tabular-nums">
                -{statsDay.totalPuntos}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Promedio: {statsDay.promedioPuntos} pts/infracción
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs flex-1">
          {/* Date Picker & Quick Mode Toggle */}
          <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setFilterDate('')}
              className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                filterDate === ''
                  ? 'bg-sky-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
              }`}
              title="Mostrar todos los partes de todos los días del curso"
            >
              Todos ({sanciones.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterDate(today)}
              className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                filterDate === today
                  ? 'bg-sky-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
              }`}
              title="Mostrar únicamente los partes de hoy"
            >
              Hoy ({sanciones.filter(s => s.fecha === today).length})
            </button>
            <span className="text-slate-300">|</span>
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="bg-transparent font-mono text-xs focus:outline-none text-slate-800 cursor-pointer"
              title="Filtrar por una fecha concreta"
            />
          </div>

          {/* Group Filter */}
          <select
            value={filterGrupo}
            onChange={(e) => setFilterGrupo(e.target.value)}
            className="bg-slate-100 border border-slate-200 text-slate-800 px-2.5 py-1.5 rounded-lg focus:outline-none text-xs cursor-pointer"
          >
            <option value="TODOS">Todos los Grupos</option>
            {LISTA_GRUPOS_OFICIALES.map(g => (
              <option key={g.codigo} value={g.codigo}>
                {g.etiqueta}
              </option>
            ))}
          </select>

          {/* State Filter */}
          <select
            value={filterEstado}
            onChange={(e) => setFilterEstado(e.target.value)}
            className="bg-slate-100 border border-slate-200 text-slate-800 px-2.5 py-1.5 rounded-lg focus:outline-none text-xs cursor-pointer"
          >
            <option value="TODOS">Todos los Estados</option>
            <option value="PENDIENTE_NOTIFICACION">Pendientes de Notificación</option>
            <option value="NOTIFICADO_TELEFONO">Notificados por Teléfono</option>
            <option value="PARTE_IMPRESO">Parte Impreso</option>
            <option value="RESUELTO">Resueltos</option>
          </select>
        </div>

        {/* Search input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Buscar por alumno, NIE o docente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-100 border border-slate-200 rounded-lg focus:outline-sky-600"
          />
        </div>
      </div>

      {/* Sanciones Feed Table / List */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        {filteredSanciones.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-slate-800">
              {filterDate ? `No hay sanciones registradas para la fecha seleccionada (${filterDate})` : 'No hay sanciones registradas con estos filtros'}
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {filterDate && sanciones.length > 0
                ? `Existen ${sanciones.length} partes registrados en otras fechas del curso escolar.`
                : 'No se han encontrado partes disciplinarios para los criterios de búsqueda actuales.'}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              {filterDate && (
                <button
                  type="button"
                  onClick={() => setFilterDate('')}
                  className="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-semibold hover:bg-slate-900 transition-colors cursor-pointer"
                >
                  Ver todos los partes del curso ({sanciones.length})
                </button>
              )}
              <button
                type="button"
                onClick={onNavigateToImponer}
                className="px-4 py-2 bg-sky-600 text-white rounded-xl text-xs font-semibold hover:bg-sky-700 transition-colors cursor-pointer"
              >
                Registrar nuevo parte ahora
              </button>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredSanciones.map((sancion) => {
              const alumno = getAlumnoForSancion(sancion.id_alumno);
              const rofDef = MATRIZ_ROF_CATALOG[sancion.codigo_infraccion];

              return (
                <div
                  key={sancion.id_sancion}
                  className="p-4 hover:bg-sky-50/30 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  {/* Left: Alumno and Infraction Info */}
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-900">
                        {sancion.numero_expediente}
                      </span>
                      <span className="text-slate-300">·</span>
                      <button
                        type="button"
                        onClick={() => onNavigateToCarnet?.(alumno.id_alumno)}
                        className="text-xs font-bold text-sky-900 hover:underline cursor-pointer"
                      >
                        {alumno.apellidos}, {alumno.nombre}
                      </button>
                      <span className="text-[11px] font-mono text-sky-900 bg-sky-100/70 px-1.5 py-0.5 rounded-md">
                        {alumno.grupo}
                      </span>
                      <span className={`text-[11px] font-mono font-bold px-1.5 py-0.5 rounded ${
                        alumno.puntos_actuales === 0 
                          ? 'bg-rose-100 text-rose-800 border border-rose-200' 
                          : alumno.puntos_actuales <= 3 
                          ? 'bg-amber-100 text-amber-800 border border-amber-200' 
                          : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      }`} title="Saldo de carnet actual del alumno">
                        {alumno.puntos_actuales} / 10 pts
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {sancion.tramo_horario.split('(')[0].trim()} ({sancion.fecha}{sancion.hora_incidente ? ` · ${sancion.hora_incidente}h` : ''})
                      </span>
                      {sancion.registro_diferido && (
                        <span className="text-[10px] font-mono text-amber-800 bg-amber-100/90 border border-amber-200 px-1.5 py-0.5 rounded font-semibold" title={`Ocurrió en ${sancion.tramo_horario.split('(')[0]} y se registró a las ${sancion.hora_registro || ''}h`}>
                          Diferido (Reg: {sancion.hora_registro || ''}h)
                        </span>
                      )}
                      {sancion.derivado_pac && (
                        <button
                          type="button"
                          onClick={onNavigateToPAC}
                          className="text-[10px] font-bold text-amber-800 bg-amber-100/90 px-1.5 py-0.5 rounded flex items-center gap-1 hover:bg-amber-200 transition-colors cursor-pointer"
                        >
                          <BookOpen className="w-3 h-3" />
                          PAC ({sancion.estado_pac})
                        </button>
                      )}
                    </div>

                    {/* Infraction Details */}
                    <div className="flex items-start gap-2 text-xs">
                      <span className={`font-mono font-bold px-1.5 py-0.5 rounded shrink-0 ${
                        sancion.puntos_restados === 0
                          ? 'text-slate-700 bg-slate-100 border border-slate-300'
                          : sancion.puntos_restados >= 5
                          ? 'text-rose-700 bg-rose-50 border border-rose-200'
                          : 'text-amber-800 bg-amber-50 border border-amber-200'
                      }`}>
                        {sancion.puntos_restados === 0 ? '0 pts (Académico)' : `-${sancion.puntos_restados} pts`} ({sancion.codigo_infraccion})
                      </span>
                      <div>
                        <div className="font-medium text-slate-800 flex flex-wrap items-center gap-2">
                          <span>{rofDef ? rofDef.titulo : sancion.codigo_infraccion}</span>
                          {rofDef?.referencia_legal && (
                            <span className="text-[10px] font-mono font-normal text-slate-500 bg-slate-100 px-1 rounded">
                              {rofDef.referencia_legal}
                            </span>
                          )}
                          {sancion.medida_inmediata_texto && (
                            <span className="text-[10px] text-sky-800 bg-sky-50 border border-sky-100 px-1.5 rounded font-normal">
                              Medida: {sancion.medida_inmediata_texto}
                            </span>
                          )}
                        </div>
                        <p className="text-slate-600 text-[11px] mt-0.5">
                          "{sancion.descripcion_hechos}"
                        </p>
                      </div>
                    </div>

                    {/* Meta: Prof, Location, Observations */}
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 pt-1">
                      <span>Docente: <strong className="text-slate-700">{sancion.nombre_profesor}</strong> ({sancion.materia})</span>
                      <span>·</span>
                      <span>Lugar: {sancion.ubicacion}</span>
                      {sancion.observaciones_tramitacion && (
                        <>
                          <span>·</span>
                          <span className="italic text-slate-600 bg-amber-50/50 px-1.5 rounded">
                            Nota: {sancion.observaciones_tramitacion}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Right: Actions and Tramitation Status */}
                  <div className="flex flex-wrap lg:flex-col items-start lg:items-end gap-2.5 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                    <div className="flex items-center gap-2">
                      {getTramitacionBadge(sancion.estado_tramitacion)}
                      <span className="font-mono text-[11px] text-slate-600">
                        Saldo: <strong className={alumno.puntos_actuales <= 3 ? 'text-rose-600 font-bold' : 'text-sky-700 font-bold'}>{alumno.puntos_actuales}</strong>/10
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* Call Phone Button */}
                      <button
                        onClick={() => setActiveCallModal({ sancion, alumno })}
                        title={`Llamar al tutor legal: ${alumno.telefono_tutor} (${alumno.nombre_tutor})`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 hover:border-sky-300 bg-white hover:bg-sky-50 text-slate-700 transition-colors cursor-pointer"
                      >
                        <PhoneCall className="w-3.5 h-3.5 text-slate-600" />
                        <span className="hidden sm:inline">Llamar Familia</span>
                      </button>

                      {/* Print Official Parte PDF */}
                      <button
                        onClick={() => {
                          // Tras la llamada a la familia, imprimir el parte lo pasa a «Parte Impreso / Firma»
                          if (sancion.estado_tramitacion === 'NOTIFICADO_TELEFONO') {
                            onUpdateTramitacion(
                              sancion.id_sancion,
                              'PARTE_IMPRESO',
                              sancion.observaciones_tramitacion || 'Parte impreso para la firma de la familia.'
                            );
                          }
                          onPrintSingleParte(sancion);
                        }}
                        title="Imprimir Parte Oficial de Sanción (Junta de Andalucía)"
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-700 text-white transition-colors cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Imprimir Parte</span>
                      </button>

                      {/* Quick mark as resolved */}
                      {sancion.estado_tramitacion !== 'RESUELTO' && (
                        <button
                          onClick={() => onUpdateTramitacion(sancion.id_sancion, 'RESUELTO', 'Tramitación completada y archivada.')}
                          title="Marcar como resuelto"
                          className="p-1 rounded text-slate-400 hover:text-sky-700 hover:bg-sky-50 transition-colors cursor-pointer"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      )}

                      {/* Edit parte (Convivencia / Admin team only) */}
                      {isAdmin && onEditParte && (
                        <button
                          onClick={() => setParteToEdit(sancion)}
                          title="Modificar Datos / Tipificación del Parte (Equipo de Convivencia)"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-sky-700 hover:bg-sky-50 transition-colors cursor-pointer"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}

                      {/* Delete parte (Convivencia / Admin team only) */}
                      {isAdmin && onDeleteParte && (
                        <button
                          onClick={() => {
                            setParteToDelete({ sancion, alumno });
                            setDeleteMotivo('Estimación de alegaciones / Corrección de error');
                          }}
                          title="Eliminar Parte Oficial (Equipo de Convivencia)"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* KPI DETAIL MODAL 1: PARTES DEL DÍA */}
      {/* ========================================================================= */}
      {activeKpiModal === 'PARTES' && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-sky-50 rounded-t-2xl">
              <div>
                <span className="text-xs font-bold text-sky-800 uppercase tracking-widest">
                  Auditoría del Feed Diario
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-0.5 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-sky-700" />
                  <span>Desglose Detallado de Partes ({statsDay.total} registros · {filterDate || 'Histórico'})</span>
                </h3>
              </div>
              <button
                onClick={() => setActiveKpiModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-sky-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Severity and Time Summary */}
            <div className="p-5 border-b border-slate-100 bg-white grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <div className="text-[11px] font-bold text-emerald-800 uppercase">Leves (1-3 pts)</div>
                <div className="text-xl font-bold font-mono text-emerald-950 mt-1">
                  {statsDay.leves} partes
                </div>
                <div className="text-[10px] text-emerald-700 mt-0.5">Escala de puntos del centro</div>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="text-[11px] font-bold text-amber-800 uppercase">Graves (4-6 pts)</div>
                <div className="text-xl font-bold font-mono text-amber-950 mt-1">
                  {statsDay.graves} partes
                </div>
                <div className="text-[10px] text-amber-700 mt-0.5">Escala de puntos del centro</div>
              </div>

              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl">
                <div className="text-[11px] font-bold text-rose-800 uppercase">Muy Graves (7-10 pts)</div>
                <div className="text-xl font-bold font-mono text-rose-950 mt-1">
                  {statsDay.muyGraves} partes
                </div>
                <div className="text-[10px] text-rose-700 mt-0.5">Escala de puntos del centro</div>
              </div>
            </div>

            {/* Time slot breakdown */}
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-3 text-xs">
              <span className="font-bold text-slate-700">Por tramo lectivo:</span>
              {Object.entries(statsDay.tramosCount).map(([tramo, count]) => (
                <span key={tramo} className="bg-white border border-slate-200 px-2 py-0.5 rounded text-[11px] font-mono text-slate-800">
                  {tramo}: <strong>{count}</strong>
                </span>
              ))}
            </div>

            {/* Search Filter Inside Modal */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Buscar por alumno, materia, docente..."
                  value={modalSearchFilter}
                  onChange={(e) => setModalSearchFilter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            {/* Table of Sanciones */}
            <div className="p-4 overflow-y-auto flex-1">
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs text-left divide-y divide-slate-200">
                  <thead className="bg-slate-50 text-slate-600 font-semibold">
                    <tr>
                      <th className="py-2.5 px-3">Expediente</th>
                      <th className="py-2.5 px-3">Tramo / Hora</th>
                      <th className="py-2.5 px-3">Alumno</th>
                      <th className="py-2.5 px-3">Docente / Materia</th>
                      <th className="py-2.5 px-3">Conducta</th>
                      <th className="py-2.5 px-3 text-center">Puntos</th>
                      <th className="py-2.5 px-3 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {daySancionesList
                      .filter(s => {
                        if (!modalSearchFilter.trim()) return true;
                        const alm = alumnoMap.get(s.id_alumno);
                        const q = modalSearchFilter.toLowerCase();
                        return (
                          s.numero_expediente.toLowerCase().includes(q) ||
                          s.nombre_profesor.toLowerCase().includes(q) ||
                          s.materia.toLowerCase().includes(q) ||
                          (alm && (`${alm.nombre} ${alm.apellidos} ${alm.grupo}`).toLowerCase().includes(q))
                        );
                      })
                      .map(s => {
                        const alm = alumnoMap.get(s.id_alumno);
                        const rofDef = MATRIZ_ROF_CATALOG[s.codigo_infraccion];
                        return (
                          <tr key={s.id_sancion} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3 font-mono font-semibold text-slate-800">
                              {s.numero_expediente}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                              <div>{s.tramo_horario.split('(')[0]}</div>
                              {s.hora_incidente && <div className="text-[10px] text-slate-400">{s.hora_incidente}h</div>}
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-900">
                              {alm ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveKpiModal(null);
                                    onNavigateToCarnet?.(alm.id_alumno);
                                  }}
                                  className="text-left font-bold text-sky-800 hover:underline cursor-pointer"
                                >
                                  {alm.apellidos}, {alm.nombre} ({alm.grupo})
                                </button>
                              ) : s.id_alumno}
                            </td>
                            <td className="py-2.5 px-3 text-slate-700">
                              <div>{s.nombre_profesor}</div>
                              <div className="text-[10px] text-slate-500">{s.materia}</div>
                            </td>
                            <td className="py-2.5 px-3 text-slate-700">
                              <span className="font-mono bg-slate-100 text-slate-800 px-1 py-0.5 rounded text-[10px] font-bold mr-1">
                                {s.codigo_infraccion}
                              </span>
                              <span>{rofDef ? rofDef.titulo : s.codigo_infraccion}</span>
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono font-bold text-rose-700">
                              -{s.puntos_restados}
                            </td>
                            <td className="py-2.5 px-3 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveKpiModal(null);
                                    onPrintSingleParte(s);
                                  }}
                                  className="px-2 py-1 bg-sky-50 text-sky-800 hover:bg-sky-100 font-semibold rounded text-[11px] cursor-pointer"
                                >
                                  Ver Parte
                                </button>
                                {isAdmin && onEditParte && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveKpiModal(null);
                                      setParteToEdit(s);
                                    }}
                                    title="Modificar parte oficial"
                                    className="p-1 text-slate-400 hover:text-sky-700 hover:bg-sky-50 rounded transition-colors cursor-pointer"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {isAdmin && onDeleteParte && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveKpiModal(null);
                                      if (alm) {
                                        setParteToDelete({ sancion: s, alumno: alm });
                                        setDeleteMotivo('Estimación de alegaciones / Corrección de error');
                                      }
                                    }}
                                    title="Eliminar parte oficial"
                                    className="p-1 text-slate-400 hover:text-rose-700 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex items-center justify-between text-xs">
              <span className="text-slate-500">
                Se muestran {daySancionesList.length} partes disciplinarios registrados.
              </span>
              <button
                onClick={() => setActiveKpiModal(null)}
                className="px-4 py-1.5 bg-slate-800 text-white rounded-lg font-semibold hover:bg-slate-900 cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* KPI DETAIL MODAL 2: PENDIENTES LLAMADA */}
      {/* ========================================================================= */}
      {activeKpiModal === 'PENDIENTES' && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-rose-200 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-rose-200 flex items-center justify-between bg-rose-50 rounded-t-2xl">
              <div>
                <span className="text-xs font-bold text-rose-800 uppercase tracking-widest flex items-center gap-1.5">
                  <AlertOctagon className="w-4 h-4 text-rose-700" />
                  <span>Plazo Preceptivo &lt;24 Horas (Decreto 327/2010)</span>
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                  Infracciones Pendientes de Notificación a Familias ({statsDay.pendientes})
                </h3>
              </div>
              <button
                onClick={() => setActiveKpiModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-rose-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Legal Notice */}
            <div className="p-4 bg-rose-50/50 border-b border-rose-100 text-xs text-rose-900 leading-relaxed flex items-start gap-2.5">
              <Info className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
              <div>
                <strong>Obligación de Notificación:</strong> El marco normativo andaluz exige la comunicación inmediata con los tutores legales ante cualquier conducta contraria tipificada. Utiliza el botón de llamada para contactar y certificar la citación.
              </div>
            </div>

            {/* List of Pending Calls */}
            <div className="p-5 overflow-y-auto flex-1 space-y-3">
              {statsDay.pendientesList.length === 0 ? (
                <div className="p-8 text-center bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900">
                  <CheckCircle className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
                  <h4 className="font-bold text-sm">¡Al día! No hay llamadas pendientes</h4>
                  <p className="text-xs text-emerald-700 mt-1">
                    Todas las incidencias registradas en la fecha seleccionada han sido debidamente comunicadas a los tutores legales.
                  </p>
                </div>
              ) : (
                statsDay.pendientesList.map(s => {
                  const alm = alumnoMap.get(s.id_alumno);
                  if (!alm) return null;
                  const rofDef = MATRIZ_ROF_CATALOG[s.codigo_infraccion];

                  return (
                    <div
                      key={s.id_sancion}
                      className="p-4 bg-white border border-rose-200 hover:border-rose-400 rounded-xl shadow-2xs space-y-3 transition-colors"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm">
                              {alm.apellidos}, {alm.nombre}
                            </span>
                            <span className="font-mono text-xs bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                              {alm.grupo}
                            </span>
                            <span className="text-rose-700 font-mono font-bold text-xs">
                              -{s.puntos_restados} pts
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Expediente: <strong className="font-mono">{s.numero_expediente}</strong> · Tramo: {s.tramo_horario.split('(')[0]} · {s.materia}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <a
                            href={`tel:${alm.telefono_tutor.replace(/\s+/g, '')}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            <span>Llamar: {alm.telefono_tutor}</span>
                          </a>

                          <button
                            type="button"
                            onClick={() => {
                              setActiveKpiModal(null);
                              setActiveCallModal({ sancion: s, alumno: alm });
                            }}
                            className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                          >
                            Registrar Llamada
                          </button>
                        </div>
                      </div>

                      <div className="text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200/80">
                        <div className="font-semibold text-slate-800">
                          {rofDef ? rofDef.titulo : s.codigo_infraccion}:
                        </div>
                        <div className="text-slate-600 italic text-[11px] mt-0.5">
                          "{s.descripcion_hechos}"
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          Tutor/a legal registrado: <strong className="text-slate-700">{alm.nombre_tutor}</strong>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex justify-end">
              <button
                onClick={() => setActiveKpiModal(null)}
                className="px-4 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-semibold hover:bg-slate-900 cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* KPI DETAIL MODAL 3: DERIVACIONES PAC */}
      {/* ========================================================================= */}
      {activeKpiModal === 'PAC' && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-amber-200 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-amber-200 flex items-center justify-between bg-amber-50 rounded-t-2xl">
              <div>
                <span className="text-xs font-bold text-amber-800 uppercase tracking-widest flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-amber-700" />
                  <span>Atención Educativa y Custodia en Guardia</span>
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                  Control de Derivaciones al Aula PAC ({statsDay.pacCount} en la jornada)
                </h3>
              </div>
              <button
                onClick={() => setActiveKpiModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-amber-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* List of PAC Derivations */}
            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {statsDay.pacList.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-xl text-slate-600">
                  <BookOpen className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                  <h4 className="font-bold text-sm">Sin derivaciones al Aula PAC</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    No se ha derivado a ningún alumno a la sala de convivencia en la fecha seleccionada.
                  </p>
                </div>
              ) : (
                statsDay.pacList.map(s => {
                  const alm = alumnoMap.get(s.id_alumno);
                  if (!alm) return null;

                  return (
                    <div
                      key={s.id_sancion}
                      className="p-4 bg-white border border-amber-200 rounded-xl shadow-2xs space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm">
                              {alm.apellidos}, {alm.nombre}
                            </span>
                            <span className="font-mono text-xs bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                              {alm.grupo}
                            </span>
                            <span className="text-[11px] font-mono text-slate-500">
                              Exp: {s.numero_expediente}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Derivado por <strong className="text-slate-700">{s.nombre_profesor}</strong> en {s.materia} ({s.tramo_horario.split('(')[0]})
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                            s.estado_pac === 'TAREAS_COMPLETADAS'
                              ? 'bg-emerald-100 text-emerald-800'
                              : s.estado_pac === 'RECIBIDO'
                              ? 'bg-sky-100 text-sky-800'
                              : 'bg-amber-100 text-amber-900'
                          }`}>
                            Estado PAC: {s.estado_pac}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div className="bg-amber-50/60 p-2.5 rounded-lg border border-amber-100">
                          <div className="font-semibold text-amber-950 mb-0.5">
                            Tareas Prescritas para el Aula PAC:
                          </div>
                          <div className="text-slate-700 italic">
                            {s.tareas_enviadas_pac || 'Realizar actividades de la materia y reflexión de conducta.'}
                          </div>
                        </div>

                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                          <div className="font-semibold text-slate-800 mb-0.5">
                            Profesor/a Receptor de Guardia:
                          </div>
                          <div className="text-slate-600">
                            {s.profesor_pac_receptor || 'Profesor de Guardia en Aula PAC'}
                            {s.hora_llegada_pac && ` · Hora llegada: ${s.hora_llegada_pac}h`}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => {
                  setActiveKpiModal(null);
                  onNavigateToPAC?.();
                }}
                className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-950 rounded-lg font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>Ir al Monitor Integral del Aula PAC</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => setActiveKpiModal(null)}
                className="px-4 py-1.5 bg-slate-800 text-white rounded-lg font-semibold hover:bg-slate-900 cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* KPI DETAIL MODAL 4: PUNTOS DEDUCIDOS */}
      {/* ========================================================================= */}
      {activeKpiModal === 'PUNTOS' && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50 rounded-t-2xl">
              <div>
                <span className="text-xs font-bold text-rose-800 uppercase tracking-widest flex items-center gap-1.5">
                  <TrendingDown className="w-4 h-4 text-rose-700" />
                  <span>Impacto Disciplinario en Carnets</span>
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                  Detracción de Puntos en la Jornada (-{statsDay.totalPuntos} puntos en {filterDate || 'Histórico'})
                </h3>
              </div>
              <button
                onClick={() => setActiveKpiModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl">
                  <div className="text-[11px] font-bold text-rose-800 uppercase">Puntos Detraídos</div>
                  <div className="text-2xl font-bold font-mono text-rose-800 mt-1">
                    -{statsDay.totalPuntos}
                  </div>
                  <div className="text-[11px] text-rose-600 mt-0.5">En {statsDay.total} sanciones</div>
                </div>

                <div className="p-3 bg-slate-100 border border-slate-200 rounded-xl">
                  <div className="text-[11px] font-bold text-slate-700 uppercase">Media por Infracción</div>
                  <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
                    {statsDay.promedioPuntos} pts
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Gravedad promedio</div>
                </div>

                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl col-span-2 sm:col-span-1">
                  <div className="text-[11px] font-bold text-amber-800 uppercase">Alumnos Afectados</div>
                  <div className="text-2xl font-bold font-mono text-amber-950 mt-1">
                    {new Set(daySancionesList.map(s => s.id_alumno)).size}
                  </div>
                  <div className="text-[11px] text-amber-700 mt-0.5">Con detracción hoy</div>
                </div>
              </div>

              {/* Students Affected & Resulting Balances */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Alumnado Sancionado y Estado Resultante de su Carnet
                </h4>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs text-left divide-y divide-slate-200">
                    <thead className="bg-slate-50 text-slate-600 font-semibold">
                      <tr>
                        <th className="py-2.5 px-3">Alumno/a</th>
                        <th className="py-2.5 px-3">Grupo</th>
                        <th className="py-2.5 px-3 text-center">Puntos Restados Hoy</th>
                        <th className="py-2.5 px-3 text-center">Saldo Actual en Carnet</th>
                        <th className="py-2.5 px-3 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {daySancionesList.map(s => {
                        const alm = alumnoMap.get(s.id_alumno);
                        if (!alm) return null;
                        const isAlert = alm.puntos_actuales <= 3;
                        const isExpelled = alm.puntos_actuales === 0;

                        return (
                          <tr key={s.id_sancion} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3 font-bold text-slate-900">
                              {alm.apellidos}, {alm.nombre}
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-700">
                              {alm.grupo}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono font-bold text-rose-700">
                              -{s.puntos_restados} pts
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span className={`font-mono font-bold px-2 py-0.5 rounded text-xs ${
                                isExpelled 
                                  ? 'bg-rose-900 text-white' 
                                  : isAlert 
                                  ? 'bg-rose-100 text-rose-800' 
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}>
                                {alm.puntos_actuales} / 10 pts
                              </span>
                              {isExpelled && (
                                <span className="block text-[10px] text-rose-700 font-bold uppercase mt-0.5">
                                  Carnet Agotado
                                </span>
                              )}
                              {isAlert && !isExpelled && (
                                <span className="block text-[10px] text-amber-700 font-semibold mt-0.5">
                                  Riesgo Crítico
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveKpiModal(null);
                                  onNavigateToCarnet?.(alm.id_alumno);
                                }}
                                className="px-2.5 py-1 bg-sky-50 text-sky-800 hover:bg-sky-100 font-bold rounded text-[11px] cursor-pointer"
                              >
                                Ver Carnet &rarr;
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ROF Types Sancionadas Hoy */}
              <div className="space-y-2 pt-2">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Tipología de Infracciones Registradas
                </h4>
                <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100">
                  {Object.entries(statsDay.rofCount).map(([codigo, data]) => {
                    const rofDef = MATRIZ_ROF_CATALOG[codigo as CodigoInfraccionROF];
                    return (
                      <div key={codigo} className="p-2.5 flex items-center justify-between text-xs hover:bg-slate-50">
                        <div className="flex items-center gap-2">
                          <span className="font-mono bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded text-[10px] font-bold">
                            {codigo}
                          </span>
                          <span className="font-medium text-slate-800">{rofDef ? rofDef.titulo : codigo}</span>
                        </div>
                        <div className="font-mono text-right">
                          <span className="font-bold text-slate-900">{data.count} casos</span>
                          <span className="text-rose-700 font-bold ml-2">(-{data.puntos} pts)</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex justify-end">
              <button
                onClick={() => setActiveKpiModal(null)}
                className="px-4 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-semibold hover:bg-slate-900 cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal for Telephone Call Logging (US-03) */}
      {activeCallModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-sky-100 animate-in fade-in zoom-in-95 duration-100 space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-sky-100">
              <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-800 flex items-center justify-center">
                <Phone className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  Registro de Citación Telefónica
                </h3>
                <p className="text-xs text-slate-500">
                  Expediente {activeCallModal.sancion.numero_expediente}
                </p>
              </div>
            </div>

            <div className="bg-sky-50/50 p-3 rounded-xl text-xs space-y-1.5 border border-sky-100">
              <div className="flex justify-between">
                <span className="text-slate-500">Alumno:</span>
                <span className="font-semibold text-slate-800">
                  {activeCallModal.alumno.nombre} {activeCallModal.alumno.apellidos} ({activeCallModal.alumno.grupo})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Tutor/a Legal:</span>
                <span className="font-semibold text-slate-800">{activeCallModal.alumno.nombre_tutor}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Teléfono registrado:</span>
                <a
                  href={`tel:${activeCallModal.alumno.telefono_tutor.replace(/\s+/g, '')}`}
                  className="font-mono font-bold text-sky-700 underline"
                >
                  {activeCallModal.alumno.telefono_tutor}
                </a>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Anotaciones de la conversación telefónica:
              </label>
              <textarea
                rows={3}
                value={callNotes}
                onChange={(e) => setCallNotes(e.target.value)}
                placeholder="Ej. Contactado con el padre a las 11:30h. Se informa del incidente. Muestra colaboración y dialogará en casa..."
                className="w-full text-xs rounded-xl border border-slate-300 p-2.5 focus:outline-sky-600 focus:border-sky-600"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActiveCallModal(null)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmCall}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Guardar y Marcar Notificado
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL DE CONFIRMACIÓN DE ELIMINACIÓN DE PARTE (EQUIPO DE CONVIVENCIA) */}
      {/* ========================================================================= */}
      {parteToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 border border-rose-200 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-rose-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Eliminar Parte de Convivencia
                  </h3>
                  <p className="text-xs text-rose-600 font-semibold">
                    Acción reservada al Equipo de Convivencia / Jefatura
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setParteToDelete(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Incident Summary Card */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Expediente:</span>
                <span className="font-mono font-bold text-slate-900 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                  {parteToDelete.sancion.numero_expediente}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Alumno/a afectado:</span>
                <span className="font-bold text-slate-900">
                  {parteToDelete.alumno.apellidos}, {parteToDelete.alumno.nombre} ({parteToDelete.alumno.grupo})
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Docente emisor:</span>
                <span className="text-slate-700">{parteToDelete.sancion.nombre_profesor}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Conducta tipificada:</span>
                <span className="font-mono text-slate-800 font-semibold">{parteToDelete.sancion.codigo_infraccion}</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-slate-200">
                <span className="text-slate-500">Puntos a restituir al carnet:</span>
                <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  +{parteToDelete.sancion.puntos_restados || 0} puntos
                </span>
              </div>
            </div>

            {/* Educational impact note */}
            <div className="p-3 bg-amber-50/80 border border-amber-200/80 rounded-xl text-xs text-amber-950 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed text-[11px]">
                <strong>Efecto automático:</strong> El saldo de carnet del alumno/a se incrementará en <strong>+{parteToDelete.sancion.puntos_restados || 0} pts</strong> (hasta un máximo de 10) y quedará constancia de la anulación en el registro oficial de auditoría RGPD.
              </div>
            </div>

            {/* Justification input */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Motivo / Justificación de la anulación <span className="text-rose-600">*</span>
              </label>
              <select
                value={deleteMotivo}
                onChange={(e) => setDeleteMotivo(e.target.value)}
                className="w-full text-xs rounded-xl border border-slate-300 p-2 bg-white mb-2 focus:ring-2 focus:ring-rose-500"
              >
                <option value="Estimación de alegaciones / Corrección de error">Estimación de alegaciones / Corrección de error</option>
                <option value="Parte emitido por duplicado o por error involuntario">Parte emitido por duplicado o por error involuntario</option>
                <option value="Resolución de mediación escolar / Acuerdo reparador">Resolución de mediación escolar / Acuerdo reparador</option>
                <option value="Sobreseimiento por Jefatura de Estudios">Sobreseimiento por Jefatura de Estudios</option>
                <option value="OTRO">Otro motivo específico...</option>
              </select>

              {deleteMotivo === 'OTRO' && (
                <input
                  type="text"
                  placeholder="Escriba el motivo detallado de la eliminación..."
                  onChange={(e) => setDeleteMotivo(e.target.value)}
                  className="w-full text-xs rounded-xl border border-slate-300 p-2 focus:ring-2 focus:ring-rose-500"
                />
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setParteToDelete(null)}
                className="px-3 py-2 text-xs text-slate-600 hover:text-slate-800 cursor-pointer rounded-xl hover:bg-slate-100 font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeleting || !deleteMotivo.trim()}
                onClick={() => {
                  if (!onDeleteParte || !parteToDelete) return;
                  setIsDeleting(true);
                  try {
                    const res = onDeleteParte(parteToDelete.sancion.id_sancion, deleteMotivo);
                    if (res && res.success) {
                      setParteToDelete(null);
                    }
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'Eliminando...' : 'Confirmar Eliminación'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {parteToEdit && onEditParte && (
        <EditarParteModal
          sancion={parteToEdit}
          alumnos={alumnos}
          profesores={profesores}
          currentUser={currentUser}
          onSave={onEditParte}
          onClose={() => setParteToEdit(null)}
        />
      )}
    </div>
  );
};
