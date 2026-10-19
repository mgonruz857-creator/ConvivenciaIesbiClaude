/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { hoyLocal } from '../services/carnetPuntos';
import { 
  Search, 
  PlusCircle, 
  AlertTriangle, 
  CheckCircle, 
  History, 
  Sparkles,
  HeartHandshake,
  ChevronRight,
  Filter,
  User,
  Calendar,
  RotateCcw,
  Check,
  X,
  FileText,
  ShieldCheck,
  AlertCircle,
  HelpCircle,
  Clock,
  Printer,
  UserMinus,
  UserCheck,
  UserX,
  Pencil,
  Trash2
} from 'lucide-react';
import { 
  Alumno, 
  Sancion, 
  Profesor, 
  GrupoEducativo, 
  MovimientoPuntos,
  LISTA_GRUPOS_OFICIALES,
  ExpedienteSancion
} from '../types/convivencia';
import { TRAMITES_SANCION, MODALIDADES_SANCION, textoConductaArt37 } from '../data/sancionesArt37';
import { generarParteSancionPdf, fechaLarga } from '../utils/parteSancionPdf';
import { StorageService } from '../services/storageService';
import { AuthService } from '../services/authService';
import { GoogleDriveSyncService } from '../services/googleDriveSyncService';
import { esGrupoInformatica } from '../data/rofCatalog';
import { EditarParteModal } from './EditarParteModal';

interface CarnetListViewProps {
  alumnos: Alumno[];
  sanciones: Sancion[];
  profesores?: Profesor[];
  compensaciones?: any[];
  currentUser: Profesor;
  initialFilterEstado?: string;
  initialFilterGrupo?: string;
  focusedAlumnoId?: string | null;
  onClearFocusedAlumno?: () => void;
  onSelectAlumnoForParte: (idAlumno: string) => void;
  onPrintParte?: (sancion: Sancion) => void;
  onDataChanged?: () => void;
  onDeleteParte?: (idSancion: string, motivo: string) => { success: boolean; alumnoActualizado?: Alumno; sancionEliminada?: Sancion; error?: string };
  onEditParte?: (idSancion: string, cambios: Partial<Sancion>, motivo: string) => { success: boolean; sancionModificada?: Sancion; alumnoActualizado?: Alumno; error?: string };
  /** Expedientes de sanción (se muestran en el historial del alumno, solo consulta) */
  expedientes?: ExpedienteSancion[];
  /** Ir a Sanciones con ese expediente resaltado */
  onAbrirExpediente?: (idExpediente: string) => void;
}

// Filtros rápidos oficiales V0 (Página 4)
type FiltroRapidoV0 = 'TODOS' | 'HOY' | 'GRAVES' | 'CERO_PUNTOS' | 'PENDIENTES';

export const CarnetListView: React.FC<CarnetListViewProps> = ({
  alumnos,
  sanciones,
  profesores = [],
  expedientes = [],
  onAbrirExpediente,
  currentUser,
  initialFilterEstado,
  initialFilterGrupo,
  focusedAlumnoId,
  onClearFocusedAlumno,
  onSelectAlumnoForParte,
  onPrintParte,
  onDataChanged,
  onDeleteParte,
  onEditParte,
}) => {
  const isAdmin = AuthService.isAdmin(currentUser);

  // Deletion modal state (Equipo de Convivencia / Jefatura)
  const [parteToDelete, setParteToDelete] = useState<{
    sancion: Sancion;
    alumno: Alumno;
  } | null>(null);
  const [deleteMotivo, setDeleteMotivo] = useState<string>('Estimación de alegaciones / Corrección de error');
  const [isDeleting, setIsDeleting] = useState(false);

  // Edit modal state (Equipo de Convivencia / Jefatura / Autor)
  const [parteToEdit, setParteToEdit] = useState<Sancion | null>(null);

  // Filtro rápido V0 (Página 4: Partes de hoy | Partes graves | Alumnos con 0 puntos | Pendientes de revisión)
  const [filtroRapido, setFiltroRapido] = useState<FiltroRapidoV0>(() => {
    if (initialFilterEstado === 'EXPULSADO_CENTRO' || initialFilterEstado === 'SALDO_CERO') return 'CERO_PUNTOS';
    if (initialFilterEstado === 'ALERTA_PUNTOS') return 'PENDIENTES';
    return 'TODOS';
  });

  const [filterGrupo, setFilterGrupo] = useState<string>(initialFilterGrupo || 'TODOS');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filtroMatricula, setFiltroMatricula] = useState<'ACTIVOS' | 'TODOS' | 'BAJAS'>('ACTIVOS');

  // Modal para ver la ficha completa del alumno (Saldo actual -> Últimos partes -> Histórico de movimientos)
  const [historyModalAlumno, setHistoryModalAlumno] = useState<Alumno | null>(null);

  // Modal para Medida Educativa / Restaurativa (V0 - Sección 4)
  const [medidaModalAlumno, setMedidaModalAlumno] = useState<Alumno | null>(null);
  const [puntosMedida, setPuntosMedida] = useState<number>(2);
  const [descripcionMedida, setDescripcionMedida] = useState<string>('');

  // Modal para Dar de Baja a un Alumno/a
  const [alumnoABajar, setAlumnoABajar] = useState<Alumno | null>(null);
  const [motivoBajaAlumnoInput, setMotivoBajaAlumnoInput] = useState<string>('Traslado a otro centro educativo');
  const [motivoBajaPersonalizado, setMotivoBajaPersonalizado] = useState<string>('');
  const [bajaActionMsg, setBajaActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal para Eliminar Individualmente a un Alumno/a del Censo
  const [alumnoAEliminar, setAlumnoAEliminar] = useState<Alumno | null>(null);
  const [isDeletingAlumno, setIsDeletingAlumno] = useState(false);

  // Modal para Vaciar / Eliminar Todos los Alumnos del Censo
  const [modalVaciarTodosAlumnos, setModalVaciarTodosAlumnos] = useState(false);
  const [isVaciandoAlumnos, setIsVaciandoAlumnos] = useState(false);

  // Modal para Modificar Datos de un Alumno/a (Nombre, Apellidos, Curso, etc.)
  const [alumnoAEditar, setAlumnoAEditar] = useState<Alumno | null>(null);
  const [editAlmNombre, setEditAlmNombre] = useState<string>('');
  const [editAlmApellidos, setEditAlmApellidos] = useState<string>('');
  const [editAlmGrupo, setEditAlmGrupo] = useState<string>('1ESO_A');
  const [editAlmNie, setEditAlmNie] = useState<string>('');
  const [editAlmTutorLegal, setEditAlmTutorLegal] = useState<string>('');
  const [editAlmTel, setEditAlmTel] = useState<string>('');
  const [editAlmError, setEditAlmError] = useState<string | null>(null);

  // Estado de ejecución de la Recuperación Semanal (V0 - Sección 3)
  const [recuperacionMsg, setRecuperacionMsg] = useState<string | null>(null);
  const [isExecutingWeekly, setIsExecutingWeekly] = useState(false);

  // Sincronizar foco inicial
  useEffect(() => {
    if (focusedAlumnoId) {
      const target = alumnos.find(a => a.id_alumno === focusedAlumnoId);
      if (target) {
        setHistoryModalAlumno(target);
      }
    }
  }, [focusedAlumnoId, alumnos]);

  // Mantener sincronizado el modal de historial si se actualizan los puntos del alumno (por ejemplo al eliminar un parte)
  useEffect(() => {
    if (historyModalAlumno) {
      const target = alumnos.find(a => a.id_alumno === historyModalAlumno.id_alumno);
      if (target && (target.puntos_actuales !== historyModalAlumno.puntos_actuales || target.estado !== historyModalAlumno.estado || target.historial_sanciones_count !== historyModalAlumno.historial_sanciones_count)) {
        setHistoryModalAlumno(target);
      }
    }
  }, [alumnos, historyModalAlumno]);

  const todayStr = hoyLocal();

  // Conteo de activos y bajas
  const countActivos = useMemo(() => alumnos.filter(a => a.estado !== 'BAJA').length, [alumnos]);
  const countBajas = useMemo(() => alumnos.filter(a => a.estado === 'BAJA').length, [alumnos]);

  // Cálculo de conjuntos para los filtros rápidos V0
  const alumnosConCeroPuntosIds = useMemo(() => {
    return new Set(alumnos.filter(a => a.estado !== 'BAJA' && a.puntos_actuales === 0).map(a => a.id_alumno));
  }, [alumnos]);

  const alumnosPendientesRevisionIds = useMemo(() => {
    // Alumnos en alerta (1 a 3 puntos) o con partes pendientes de tramitación
    return new Set(
      alumnos.filter(a => a.estado !== 'BAJA' && a.puntos_actuales > 0 && a.puntos_actuales <= 3).map(a => a.id_alumno)
    );
  }, [alumnos]);

  const alumnosConParteHoyIds = useMemo(() => {
    return new Set(
      sanciones.filter(s => s.fecha === todayStr).map(s => s.id_alumno)
    );
  }, [sanciones, todayStr]);

  const alumnosConParteGraveIds = useMemo(() => {
    return new Set(
      sanciones.filter(s => s.tipo_conducta === 'GRAVE' || s.puntos_restados >= 5).map(s => s.id_alumno)
    );
  }, [sanciones]);

  // Alumnos filtrados
  const filteredAlumnos = useMemo(() => {
    return alumnos.filter(a => {
      // 0. Filtro de estado de matrícula (Activos vs Bajas)
      if (filtroMatricula === 'ACTIVOS' && a.estado === 'BAJA') return false;
      if (filtroMatricula === 'BAJAS' && a.estado !== 'BAJA') return false;

      // 1. Filtro rápido V0
      if (filtroRapido === 'CERO_PUNTOS' && a.puntos_actuales !== 0) return false;
      if (filtroRapido === 'PENDIENTES' && (a.puntos_actuales === 0 || a.puntos_actuales > 3)) return false;
      if (filtroRapido === 'HOY' && !alumnosConParteHoyIds.has(a.id_alumno)) return false;
      if (filtroRapido === 'GRAVES' && !alumnosConParteGraveIds.has(a.id_alumno)) return false;

      // 2. Filtro de grupo
      if (filterGrupo !== 'TODOS' && a.grupo !== filterGrupo) return false;

      // 3. Término de búsqueda
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const fullName = `${a.nombre} ${a.apellidos}`.toLowerCase();
        const nie = (a.nie || '').toLowerCase();
        if (!fullName.includes(term) && !nie.includes(term)) return false;
      }

      return true;
    });
  }, [alumnos, filtroMatricula, filtroRapido, filterGrupo, searchTerm, alumnosConParteHoyIds, alumnosConParteGraveIds]);

  // Métricas generales de saldo (sobre alumnado activo)
  const totalAlumnos = alumnos.length;
  const conCeroPuntos = alumnos.filter(a => a.estado !== 'BAJA' && a.puntos_actuales === 0).length;
  const enAlerta = alumnos.filter(a => a.estado !== 'BAJA' && a.puntos_actuales > 0 && a.puntos_actuales <= 3).length;
  const saldoCompleto = alumnos.filter(a => a.estado !== 'BAJA' && a.puntos_actuales === 10).length;

  // Ejecutar baja de un alumno
  const handleConfirmBajaAlumno = (e: React.FormEvent) => {
    e.preventDefault();
    if (!alumnoABajar) return;

    const motivoFinal = motivoBajaAlumnoInput === 'Otro motivo (especificar)'
      ? (motivoBajaPersonalizado.trim() || 'Baja justificada por secretaría / centro')
      : motivoBajaAlumnoInput;

    const res = StorageService.darDeBajaAlumno(
      alumnoABajar.id_alumno,
      motivoFinal,
      currentUser.email
    );

    if (res.success) {
      setBajaActionMsg({
        type: 'success',
        text: `Alumno/a ${alumnoABajar.nombre} ${alumnoABajar.apellidos} dado de baja correctamente.`
      });
      setAlumnoABajar(null);
      setMotivoBajaPersonalizado('');
      if (historyModalAlumno?.id_alumno === alumnoABajar.id_alumno && res.alumno) {
        setHistoryModalAlumno(res.alumno);
      }
      if (onDataChanged) onDataChanged();
    } else {
      setBajaActionMsg({
        type: 'error',
        text: res.error || 'No se pudo tramitar la baja del alumno.'
      });
    }

    setTimeout(() => setBajaActionMsg(null), 6000);
  };

  // Reactivar a un alumno dado de baja
  const handleReactivarAlumno = (idAlumno: string) => {
    const res = StorageService.reactivarAlumno(idAlumno, currentUser.email);
    if (res.success) {
      setBajaActionMsg({
        type: 'success',
        text: `Alumno/a reactivado con éxito en el censo activo.`
      });
      if (historyModalAlumno?.id_alumno === idAlumno && res.alumno) {
        setHistoryModalAlumno(res.alumno);
      }
      if (onDataChanged) onDataChanged();
    } else {
      setBajaActionMsg({
        type: 'error',
        text: res.error || 'No se pudo reactivar al alumno.'
      });
    }
    setTimeout(() => setBajaActionMsg(null), 6000);
  };

  // Abrir modal de edición de datos de alumno
  const handleAbrirEditarAlumno = (alm: Alumno) => {
    setAlumnoAEditar(alm);
    setEditAlmNombre(alm.nombre);
    setEditAlmApellidos(alm.apellidos);
    setEditAlmGrupo(alm.grupo);
    setEditAlmNie(alm.nie && !alm.nie.startsWith('SN-') ? alm.nie : '');
    setEditAlmTutorLegal(alm.nombre_tutor || '');
    setEditAlmTel(alm.telefono_tutor || '');
    setEditAlmError(null);
  };

  // Guardar modificaciones de alumno
  const handleGuardarEdicionAlumno = (e: React.FormEvent) => {
    e.preventDefault();
    if (!alumnoAEditar) return;
    setEditAlmError(null);

    const res = StorageService.actualizarAlumno(alumnoAEditar.id_alumno, {
      nombre: editAlmNombre.trim(),
      apellidos: editAlmApellidos.trim(),
      grupo: editAlmGrupo as any,
      nie: editAlmNie.trim() || undefined,
      nombre_tutor: editAlmTutorLegal.trim() || undefined,
      telefono_tutor: editAlmTel.trim() || undefined,
    }, currentUser.email);

    if (res.success) {
      setBajaActionMsg({
        type: 'success',
        text: `Datos de ${editAlmNombre.trim()} ${editAlmApellidos.trim()} actualizados correctamente.`
      });
      setAlumnoAEditar(null);
      if (historyModalAlumno?.id_alumno === alumnoAEditar.id_alumno && res.alumno) {
        setHistoryModalAlumno(res.alumno);
      }
      if (onDataChanged) onDataChanged();
      setTimeout(() => setBajaActionMsg(null), 5000);
    } else {
      setEditAlmError(res.error || 'Error al actualizar datos del alumno.');
    }
  };

  // Ejecución de recuperación semanal automática (V0 - Sección 3)
  const handleTriggerWeeklyRecovery = () => {
    setIsExecutingWeekly(true);
    setRecuperacionMsg(null);
    try {
      const res = StorageService.ejecutarRecuperacionSemanal(currentUser.email);
      if (res.recuperados > 0) {
        setRecuperacionMsg(`Saldos actualizados: ${res.recuperados} alumnos han recuperado puntos por la regla semanal automática.`);
      } else {
        setRecuperacionMsg('Saldos al día. La recuperación semanal se aplica automáticamente.');
      }
      if (onDataChanged) onDataChanged();
    } catch (e: any) {
      setRecuperacionMsg('No se pudo ejecutar la comprobación semanal.');
    } finally {
      setIsExecutingWeekly(false);
      setTimeout(() => setRecuperacionMsg(null), 8000);
    }
  };

  // Confirmar Medida Educativa / Restaurativa (V0 - Sección 4)
  const handleConfirmMedidaRestaurativa = (e: React.FormEvent) => {
    e.preventDefault();
    if (!medidaModalAlumno) return;
    if (!Number.isInteger(puntosMedida) || puntosMedida < 1 || puntosMedida > 10) return;

    try {
      StorageService.registrarMedidaRestaurativa(
        medidaModalAlumno.id_alumno,
        puntosMedida,
        descripcionMedida || 'Cumplimiento de tarea formativa supervisada',
        `${currentUser.nombre} ${currentUser.apellidos}`,
        currentUser.email
      );

      setMedidaModalAlumno(null);
      setDescripcionMedida('');
      if (onDataChanged) onDataChanged();
    } catch (err: any) {
      console.error(err);
    }
  };

  // Renderizar los 10 puntos discretos del carnet
  const renderCarnetDots = (puntos: number) => {
    return (
      <div className="flex items-center gap-1">
        {Array.from({ length: 10 }).map((_, index) => {
          const filled = index < puntos;
          let color = 'bg-sky-500';
          if (puntos === 0) color = 'bg-rose-500';
          else if (puntos <= 3) color = 'bg-amber-500';

          return (
            <div
              key={index}
              className={`w-2.5 h-4 rounded-xs transition-all ${
                filled ? color : 'bg-slate-200'
              }`}
              title={`Punto ${index + 1}: ${filled ? 'Activo' : 'Descontado'}`}
            />
          );
        })}
      </div>
    );
  };

  // Sanciones del alumno seleccionado para el modal
  const modalSanciones = useMemo(() => {
    if (!historyModalAlumno) return [];
    return sanciones.filter(s => s.id_alumno === historyModalAlumno.id_alumno);
  }, [historyModalAlumno, sanciones]);

  // Movimientos del alumno seleccionado para el modal (V0 - Sección 1)
  const modalMovimientos = useMemo(() => {
    if (!historyModalAlumno) return [];
    return StorageService.getMovimientosPorAlumno(historyModalAlumno.id_alumno);
  }, [historyModalAlumno, sanciones]);

  return (
    <div className="space-y-6">
      {/* Banner Principal V0 */}
      <div className="bg-white border border-sky-100 rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-sky-100">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Panel de Convivencia y Carnet de Puntos
              </h1>
              <span className="text-[11px] font-mono bg-sky-100 text-sky-800 px-2 py-0.5 rounded-full font-bold">
                Versión 0 · IES Blas Infante
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              Cálculo y seguimiento automatizado del saldo ordinario de 10 puntos e histórico de movimientos.
              Recordatorio: la app no impone expulsiones automáticas ni sustituye la valoración de Jefatura y Dirección.
            </p>
          </div>

          {/* Botón de acción Jefatura: Recuperación semanal automática y Vaciar Censo */}
          {isAdmin && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleTriggerWeeklyRecovery}
                disabled={isExecutingWeekly}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                title="La recuperación semanal (+1 punto cada 7 días sin partes) se aplica sola. Este botón solo actualiza los saldos en pantalla."
              >
                <RotateCcw className={`w-3.5 h-3.5 ${isExecutingWeekly ? 'animate-spin' : ''}`} />
                <span>Actualizar saldos (recuperación automática)</span>
              </button>

              {alumnos.length > 0 && (
                <button
                  type="button"
                  onClick={() => setModalVaciarTodosAlumnos(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  title="Eliminar todos los alumnos del censo para volver a dejar el sistema limpio"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  <span>Vaciar Censo ({alumnos.length})</span>
                </button>
              )}
            </div>
          )}
        </div>

        {recuperacionMsg && (
          <div className="mt-3 p-3 bg-sky-50 border border-sky-200 text-sky-950 rounded-xl text-xs flex items-center gap-2 animate-in fade-in">
            <CheckCircle className="w-4 h-4 text-sky-600 shrink-0" />
            <span>{recuperacionMsg}</span>
          </div>
        )}

        {/* 4 Métricas de Saldos V0 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
          <div className="bg-sky-50/50 border border-sky-100 rounded-xl p-3">
            <div className="text-[11px] text-slate-500 font-mono">Alumnado Total</div>
            <div className="text-xl font-bold font-mono text-slate-900">{totalAlumnos}</div>
            <div className="text-[10px] text-slate-400">10 puntos de inicio</div>
          </div>

          <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-3">
            <div className="text-[11px] text-emerald-800 font-mono">Saldo Completo (10 pts)</div>
            <div className="text-xl font-bold font-mono text-emerald-900">{saldoCompleto}</div>
            <div className="text-[10px] text-emerald-600">Conducta ordinaria</div>
          </div>

          <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-3">
            <div className="text-[11px] text-amber-800 font-mono">En Alerta (1 a 3 pts)</div>
            <div className="text-xl font-bold font-mono text-amber-900">{enAlerta}</div>
            <div className="text-[10px] text-amber-700">Seguimiento educativo</div>
          </div>

          <div className="bg-rose-50/50 border border-rose-100 rounded-xl p-3">
            <div className="text-[11px] text-rose-800 font-mono">Saldo 0 Puntos</div>
            <div className="text-xl font-bold font-mono text-rose-900">{conCeroPuntos}</div>
            <div className="text-[10px] text-rose-700">Aviso para Jefatura</div>
          </div>
        </div>
      </div>

      {/* SECCIÓN 8: PANEL MÍNIMO DE FILTROS RÁPIDOS PARA JEFATURA / CONVIVENCIA */}
      <div className="bg-white border border-sky-100 rounded-2xl p-5 shadow-xs space-y-4">
        {/* Pestañas de Filtros Rápidos y Selector de Matrícula */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-100 pb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFiltroRapido('TODOS')}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                filtroRapido === 'TODOS'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              Todos ({totalAlumnos})
            </button>

            <button
              type="button"
              onClick={() => setFiltroRapido('HOY')}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                filtroRapido === 'HOY'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'bg-sky-50 hover:bg-sky-100 text-sky-900'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Partes de hoy</span>
            </button>

            <button
              type="button"
              onClick={() => setFiltroRapido('GRAVES')}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                filtroRapido === 'GRAVES'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-rose-50 hover:bg-rose-100 text-rose-900'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Partes graves</span>
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={() => setFiltroRapido('CERO_PUNTOS')}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                  filtroRapido === 'CERO_PUNTOS'
                    ? 'bg-rose-700 text-white shadow-xs'
                    : 'bg-rose-100/70 hover:bg-rose-200/80 text-rose-950'
                }`}
              >
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Alumnos con 0 puntos ({conCeroPuntos})</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setFiltroRapido('PENDIENTES')}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                filtroRapido === 'PENDIENTES'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-amber-50 hover:bg-amber-100 text-amber-900'
              }`}
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Pendientes ({enAlerta})</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Estado de Matrícula (Activos vs Bajas) */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl text-xs">
              <button
                type="button"
                onClick={() => setFiltroMatricula('ACTIVOS')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  filtroMatricula === 'ACTIVOS'
                    ? 'bg-white text-emerald-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Activos ({countActivos})
              </button>
              <button
                type="button"
                onClick={() => setFiltroMatricula('BAJAS')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1 ${
                  filtroMatricula === 'BAJAS'
                    ? 'bg-white text-rose-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <UserX className="w-3 h-3 text-rose-600" />
                <span>Bajas ({countBajas})</span>
              </button>
              <button
                type="button"
                onClick={() => setFiltroMatricula('TODOS')}
                className={`px-2 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  filtroMatricula === 'TODOS'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Todo
              </button>
            </div>

            {/* Grupo Educativo Selector */}
            <div className="flex items-center gap-1.5">
              <select
                value={filterGrupo}
                onChange={(e) => setFilterGrupo(e.target.value)}
                className="text-xs font-semibold rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-slate-800"
              >
                <option value="TODOS">Todos los Grupos ({LISTA_GRUPOS_OFICIALES.length})</option>
                
                <optgroup label="── Ciclos Formativos ──">
                  {LISTA_GRUPOS_OFICIALES.filter(g => g.etapa === 'CICLOS').map(g => (
                    <option key={g.codigo} value={g.codigo}>{g.etiqueta} ({g.codigo})</option>
                  ))}
                </optgroup>

                <optgroup label="── E.S.O. ──">
                  {LISTA_GRUPOS_OFICIALES.filter(g => g.etapa === 'ESO').map(g => (
                    <option key={g.codigo} value={g.codigo}>{g.etiqueta}</option>
                  ))}
                </optgroup>

                <optgroup label="── Bachillerato ──">
                  {LISTA_GRUPOS_OFICIALES.filter(g => g.etapa === 'BACHILLERATO').map(g => (
                    <option key={g.codigo} value={g.codigo}>{g.etiqueta}</option>
                  ))}
                </optgroup>
              </select>
            </div>
          </div>
        </div>

        {bajaActionMsg && (
          <div className={`p-3 rounded-xl text-xs flex items-center gap-2 animate-in fade-in ${
            bajaActionMsg.type === 'success' 
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-950' 
              : 'bg-rose-50 border border-rose-200 text-rose-950'
          }`}>
            {bajaActionMsg.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span className="font-medium">{bajaActionMsg.text}</span>
          </div>
        )}

        {/* Buscador de Alumno/a (Nombre, Apellidos o NIE) */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar alumno/a por nombre, apellidos o NIE..."
            className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-sky-600 focus:border-sky-600 text-slate-800"
          />
        </div>

        {/* Lista de Alumnos */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredAlumnos.map(alumno => {
            const isBaja = alumno.estado === 'BAJA';
            const isZero = alumno.puntos_actuales === 0;
            const isAlert = alumno.puntos_actuales > 0 && alumno.puntos_actuales <= 3;

            return (
              <div
                key={alumno.id_alumno}
                className={`p-4 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                  isBaja
                    ? 'bg-slate-100/80 border-slate-300 opacity-90'
                    : isZero
                    ? 'bg-rose-50/40 border-rose-200'
                    : isAlert
                    ? 'bg-amber-50/40 border-amber-200'
                    : 'bg-white border-slate-200 hover:border-sky-200 shadow-2xs'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-900 text-sm truncate">
                          {alumno.apellidos}, {alumno.nombre}
                        </span>
                        {isBaja && (
                          <span className="text-[10px] font-bold bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded-md shrink-0">
                            DE BAJA
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1.5 flex-wrap">
                        <span>{alumno.grupo} · NIE: {alumno.nie || 'Sin NIE'}</span>
                        {esGrupoInformatica(alumno.grupo) && (
                          <span className="text-[9px] font-bold bg-amber-100 text-amber-900 border border-amber-300 px-1 py-0.2 rounded font-sans tracking-tight" title="Régimen específico: Faltas leves (+4 pts) y graves (10 pts)">
                            RÉGIMEN INF
                          </span>
                        )}
                      </div>
                      {isBaja && alumno.motivo_baja && (
                        <div className="text-[10px] text-rose-700 font-medium mt-0.5 truncate max-w-[200px]" title={alumno.motivo_baja}>
                          Motivo: {alumno.motivo_baja} {alumno.fecha_baja ? `(${alumno.fecha_baja})` : ''}
                        </div>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <span className={`text-base font-bold font-mono px-2 py-0.5 rounded-lg ${
                        isBaja
                          ? 'bg-slate-300 text-slate-700'
                          : isZero
                          ? 'bg-rose-600 text-white'
                          : isAlert
                          ? 'bg-amber-500 text-white'
                          : 'bg-sky-100 text-sky-900'
                      }`}>
                        {alumno.puntos_actuales} / 10
                      </span>
                    </div>
                  </div>

                  {/* 10 Dots del carnet */}
                  <div className="pt-2">
                    {renderCarnetDots(alumno.puntos_actuales)}
                  </div>
                </div>

                {/* Acciones y enlace a Ficha Completa */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => setHistoryModalAlumno(alumno)}
                    className="inline-flex items-center gap-1 font-semibold text-sky-700 hover:text-sky-900 cursor-pointer"
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>Ver Historial</span>
                  </button>

                  <div className="flex items-center gap-1.5">
                    {isBaja ? (
                      <button
                        type="button"
                        onClick={() => handleReactivarAlumno(alumno.id_alumno)}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1"
                        title="Reactivar e incorporar alumno al censo activo"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Reactivar</span>
                      </button>
                    ) : (
                      <>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => {
                              setMedidaModalAlumno(alumno);
                              setPuntosMedida(2);
                            }}
                            className="px-2 py-1 bg-sky-50 hover:bg-sky-100 text-sky-800 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
                            title="Registrar medida educativa/restaurativa cumplida (+X pts)"
                          >
                            + Restaurar
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => onSelectAlumnoForParte(alumno.id_alumno)}
                          className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
                        >
                          Poner Parte
                        </button>

                        <button
                          type="button"
                          onClick={() => handleAbrirEditarAlumno(alumno)}
                          className="p-1 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors cursor-pointer"
                          title="Modificar datos del alumno/a (Nombre, Apellidos, Curso/Grupo, NIE, etc.)"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setAlumnoABajar(alumno);
                            setMotivoBajaAlumnoInput('Traslado a otro centro educativo');
                            setMotivoBajaPersonalizado('');
                          }}
                          className="p-1 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                          title="Dar de baja a este alumno/a (baja administrativa)"
                        >
                          <UserMinus className="w-3.5 h-3.5" />
                        </button>

                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => setAlumnoAEliminar(alumno)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Eliminar definitivamente este alumno/a del censo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredAlumnos.length === 0 && (
          <div className="p-8 text-center text-xs text-slate-500">
            No se han encontrado alumnos con los criterios seleccionados.
          </div>
        )}
      </div>

      {/* MODAL FICHA DEL ALUMNO (SALDO ACTUAL → ÚLTIMOS PARTES → HISTÓRICO DE MOVIMIENTOS) */}
      {historyModalAlumno && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-6 border border-sky-100 max-h-[90vh] flex flex-col space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-sky-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {historyModalAlumno.nombre} {historyModalAlumno.apellidos}
                </h2>
                <p className="text-xs text-slate-500 font-mono flex items-center gap-1.5 flex-wrap mt-0.5">
                  <span>{historyModalAlumno.grupo} · NIE: {historyModalAlumno.nie || 'Sin NIE'} · Tutor legal: {historyModalAlumno.nombre_tutor} ({historyModalAlumno.telefono_tutor})</span>
                  {esGrupoInformatica(historyModalAlumno.grupo) && (
                    <span className="text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded font-sans tracking-tight">
                      RÉGIMEN CICLO INFORMÁTICA (Leves +4 pts, Graves 10 pts)
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setHistoryModalAlumno(null);
                  if (onClearFocusedAlumno) onClearFocusedAlumno();
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Saldo actual y dots */}
            <div className="bg-sky-50/70 border border-sky-200 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-500 block font-mono">Saldo Ordinario V0</span>
                <span className={`text-2xl font-bold font-mono ${
                  historyModalAlumno.puntos_actuales === 0
                    ? 'text-rose-700'
                    : historyModalAlumno.puntos_actuales <= 3
                    ? 'text-amber-700'
                    : 'text-sky-900'
                }`}>
                  {historyModalAlumno.puntos_actuales} / 10 puntos
                </span>
                <span className="text-[10px] text-slate-500 block">
                  {historyModalAlumno.puntos_actuales === 0 
                    ? (isAdmin ? '⚠️ Saldo 0: Notificado a Jefatura de Estudios' : 'Saldo 0 puntos agotado')
                    : historyModalAlumno.puntos_actuales <= 3 
                    ? 'Alerta temprana' 
                    : 'Conducta ordinaria'}
                </span>
              </div>

              <div>
                {renderCarnetDots(historyModalAlumno.puntos_actuales)}
              </div>
            </div>

            {/* Partes Disciplinarios Activos del Alumno */}
            {(() => {
              const cleanAlmId = (historyModalAlumno.id_alumno || '').toLowerCase().trim();
              const alumnoSanciones = sanciones.filter(s => (s.id_alumno || '').toLowerCase().trim() === cleanAlmId);
              if (alumnoSanciones.length === 0) return null;
              return (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-rose-600" />
                      <span>Partes Disciplinarios Registrados ({alumnoSanciones.length})</span>
                    </span>
                    <span className="text-[10px] text-slate-500 font-normal">Expedientes activos</span>
                  </h3>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {alumnoSanciones.map(s => (
                      <div
                        key={s.id_sancion}
                        className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/80 hover:bg-slate-100/80 flex items-center justify-between text-xs transition-colors"
                      >
                        <div className="space-y-0.5 min-w-0 pr-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-900 bg-white px-1.5 py-0.2 rounded border border-slate-200 text-[11px]">
                              {s.numero_expediente}
                            </span>
                            <span className="font-mono text-rose-700 font-bold bg-rose-50 px-1.5 py-0.2 rounded text-[11px]">
                              -{s.puntos_restados} pts
                            </span>
                            <span className="text-slate-500 text-[10px] font-mono">{s.fecha}</span>
                          </div>
                          <div className="font-semibold text-slate-800 text-[11px] truncate">
                            {s.codigo_infraccion} · {s.nombre_profesor} ({s.materia})
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {onPrintParte && (
                            <button
                              type="button"
                              onClick={() => onPrintParte(s)}
                              title="Imprimir Parte Oficial"
                              className="p-1.5 text-slate-500 hover:text-sky-700 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-colors cursor-pointer"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {isAdmin && onEditParte && (
                            <button
                              type="button"
                              onClick={() => setParteToEdit(s)}
                              title="Modificar datos o tipificación de este parte"
                              className="p-1.5 text-slate-400 hover:text-sky-700 hover:bg-sky-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {isAdmin && onDeleteParte && (
                            <button
                              type="button"
                              onClick={() => {
                                setParteToDelete({ sancion: s, alumno: historyModalAlumno });
                                setDeleteMotivo('Estimación de alegaciones / Corrección de error');
                              }}
                              title="Eliminar este parte de convivencia"
                              className="p-1.5 text-slate-400 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Expedientes de sanción del alumno (solo consulta; se gestionan en «Sanciones») */}
            {(() => {
              const exps = expedientes
                .filter((e) => e.id_alumno === historyModalAlumno.id_alumno)
                .sort((a, b) => (b.fecha_desde || '').localeCompare(a.fecha_desde || '') || (b.fecha_creacion || '').localeCompare(a.fecha_creacion || ''));
              return (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-sky-700" />
                    <span>Expedientes de sanción ({exps.length})</span>
                  </h3>
                  {exps.length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-1">Sin expedientes de sanción.</p>
                  ) : (
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {exps.map((e) => {
                        const hechos = TRAMITES_SANCION.filter((t) => e.tramites?.[t.clave]?.hecho).length;
                        const modalidad = MODALIDADES_SANCION.find((m) => m.valor === e.modalidad)?.etiqueta || e.modalidad;
                        return (
                          <div key={e.id_expediente} className={`p-3 rounded-xl border text-xs space-y-1.5 ${e.completado ? 'bg-emerald-50/40 border-emerald-200' : 'bg-amber-50/40 border-amber-200'}`}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-semibold text-slate-900">Del {fechaLarga(e.fecha_desde)} al {fechaLarga(e.fecha_hasta)}</span>
                              <span className={`font-bold px-2 py-0.5 rounded-full ${e.completado ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
                                {e.completado ? 'Trámites completados' : `Trámites: ${hechos}/${TRAMITES_SANCION.length}`}
                              </span>
                            </div>
                            <div className="text-slate-600">
                              {modalidad}{e.dias_acude ? ` · Acude: ${e.dias_acude}` : ''}
                            </div>
                            <div className="text-slate-500">Art. 37.{e.conducta_art37}: {textoConductaArt37(e.conducta_art37)}</div>
                            <ul className="text-slate-600 grid sm:grid-cols-2 gap-x-4">
                              {TRAMITES_SANCION.map((t) => (
                                <li key={t.clave}>{e.tramites?.[t.clave]?.hecho ? '✅' : '⬜'} {t.etiqueta}</li>
                              ))}
                            </ul>
                            <div className="flex flex-wrap gap-2 pt-1">
                              {onAbrirExpediente && (
                                <button
                                  type="button"
                                  onClick={() => onAbrirExpediente(e.id_expediente)}
                                  className="px-2.5 py-1 bg-white border border-sky-200 text-sky-800 hover:bg-sky-50 rounded-lg font-semibold cursor-pointer"
                                >
                                  Abrir en Sanciones →
                                </button>
                              )}
                              {e.completado && (
                                <button
                                  type="button"
                                  onClick={() => { generarParteSancionPdf(e, historyModalAlumno).catch(() => {}); }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg font-semibold cursor-pointer"
                                >
                                  <Printer className="w-3.5 h-3.5" /> Parte de sanción (PDF)
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Histórico Completo de Movimientos (V0 - Sección 1: fecha, alumno/a, conducta, puntos descontados o recuperados, profesor/a y saldo resultante) */}
            <div className="space-y-2 flex-1 overflow-y-auto">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-sky-700" />
                <span>Histórico Oficial de Movimientos</span>
              </h3>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {modalMovimientos.length > 0 ? (
                  modalMovimientos.map(mov => {
                    const isPositive = mov.puntos > 0;
                    return (
                      <div
                        key={mov.id_movimiento}
                        className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                          isPositive
                            ? 'bg-emerald-50/50 border-emerald-200'
                            : 'bg-rose-50/40 border-rose-200'
                        }`}
                      >
                        <div className="space-y-0.5">
                          <div className="font-semibold text-slate-900">
                            {mov.conducta_titulo || mov.tipo}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {mov.fecha} · Registrado por: {mov.profesor_nombre}
                          </div>
                          {mov.detalles && (
                            <p className="text-[11px] text-slate-600 italic">
                              "{mov.detalles}"
                            </p>
                          )}
                        </div>

                        <div className="text-right shrink-0">
                          <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded ${
                            isPositive
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}>
                            {isPositive ? `+${mov.puntos}` : mov.puntos} pts
                          </span>
                          <div className="text-[10px] font-mono text-slate-500 mt-1">
                            Saldo: {mov.saldo_anterior} → <strong>{mov.saldo_resultante}</strong>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-xs text-slate-400 italic py-2">
                    Sin movimientos registrados todavía. Saldo inicial: 10 puntos plenos.
                  </p>
                )}
              </div>
            </div>

            {/* Acciones en Modal */}
            <div className="pt-3 border-t border-sky-100 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {historyModalAlumno.estado === 'BAJA' ? (
                  <button
                    type="button"
                    onClick={() => handleReactivarAlumno(historyModalAlumno.id_alumno)}
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <UserCheck className="w-4 h-4" />
                    <span>Reactivar Alumno/a</span>
                  </button>
                ) : (
                  <>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => {
                          setMedidaModalAlumno(historyModalAlumno);
                          setPuntosMedida(2);
                        }}
                        className="px-3 py-2 bg-sky-50 hover:bg-sky-100 text-sky-800 rounded-xl text-xs font-semibold cursor-pointer"
                      >
                        Registrar Medida Educativa (+X pts)
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleAbrirEditarAlumno(historyModalAlumno)}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                      title="Modificar datos del alumno/a (Nombre, Apellidos, Grupo, etc.)"
                    >
                      <Pencil className="w-3.5 h-3.5 text-sky-700" />
                      <span>Modificar Datos</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setAlumnoABajar(historyModalAlumno);
                        setMotivoBajaAlumnoInput('Traslado a otro centro educativo');
                        setMotivoBajaPersonalizado('');
                      }}
                      className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <UserMinus className="w-3.5 h-3.5" />
                      <span>Dar de Baja</span>
                    </button>

                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => {
                          const targetAlm = historyModalAlumno;
                          setHistoryModalAlumno(null);
                          setAlumnoAEliminar(targetAlm);
                        }}
                        className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer"
                        title="Eliminar definitivamente a este alumno/a del censo"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-600" />
                        <span>Eliminar Alumno</span>
                      </button>
                    )}
                  </>
                )}
              </div>

              {historyModalAlumno.estado !== 'BAJA' && (
                <button
                  type="button"
                  onClick={() => {
                    const id = historyModalAlumno.id_alumno;
                    setHistoryModalAlumno(null);
                    onSelectAlumnoForParte(id);
                  }}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold cursor-pointer shadow-xs"
                >
                  Imponer Nuevo Parte
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL PARA MEDIDA EDUCATIVA / RESTAURATIVA (V0 - SECCIÓN 4) */}
      {medidaModalAlumno && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-sky-100 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-sky-100 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Medida Educativa / Restaurativa Cumplida
                </h2>
                <p className="text-xs text-slate-500 font-mono">
                  {medidaModalAlumno.nombre} {medidaModalAlumno.apellidos} ({medidaModalAlumno.grupo})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMedidaModalAlumno(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmMedidaRestaurativa} className="space-y-4 text-xs">
              <div>
                <label htmlFor="puntos-medida" className="block font-semibold text-slate-700 mb-1">
                  Puntos a restituir (de 1 a 10):
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    id="puntos-medida"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={10}
                    step={1}
                    required
                    autoFocus
                    value={Number.isFinite(puntosMedida) && puntosMedida > 0 ? puntosMedida : ''}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      setPuntosMedida(Number.isFinite(v) ? Math.max(1, Math.min(10, v)) : NaN);
                    }}
                    className="w-24 rounded-xl border border-slate-300 px-3 py-2 text-base font-mono font-bold text-center bg-white focus:border-sky-600 focus:ring-1 focus:ring-sky-600"
                  />
                  <span className="text-slate-500">puntos</span>
                  {medidaModalAlumno.puntos_actuales < 10 && (
                    <button
                      type="button"
                      onClick={() => setPuntosMedida(10 - medidaModalAlumno.puntos_actuales)}
                      className="ml-auto px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer"
                      title="Devolver exactamente los puntos que le faltan para llegar a 10"
                    >
                      Completar hasta 10 (+{10 - medidaModalAlumno.puntos_actuales})
                    </button>
                  )}
                </div>
                {Number.isFinite(puntosMedida) && medidaModalAlumno.puntos_actuales + puntosMedida > 10 && (
                  <p className="mt-1.5 text-[11px] text-amber-800">
                    El carnet no puede pasar de 10: se sumarán {Math.max(0, 10 - medidaModalAlumno.puntos_actuales)} punto(s).
                  </p>
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Descripción de la medida cumplida:
                </label>
                <textarea
                  rows={3}
                  value={descripcionMedida}
                  onChange={(e) => setDescripcionMedida(e.target.value)}
                  placeholder="Ej: Adecuación y limpieza de dependencias durante los recreos / Apoyo en biblioteca escolar"
                  className="w-full rounded-xl border border-slate-300 p-2 bg-slate-50 text-xs focus:bg-white"
                  required
                />
              </div>

              <div className="bg-sky-50 p-3 rounded-xl text-[11px] text-sky-950 font-mono">
                Saldo: {medidaModalAlumno.puntos_actuales} → <strong>{Math.min(10, medidaModalAlumno.puntos_actuales + (Number.isFinite(puntosMedida) ? puntosMedida : 0))} / 10 pts</strong>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setMedidaModalAlumno(null)}
                  className="px-3 py-2 bg-slate-100 text-slate-700 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-sky-600 text-white font-bold rounded-xl shadow-xs cursor-pointer hover:bg-sky-700"
                >
                  Registrar Restitución
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL PARA DAR DE BAJA A UN ALUMNO/A */}
      {alumnoABajar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-rose-100 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-rose-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                  <UserMinus className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Tramitar Baja de Alumno/a
                  </h2>
                  <p className="text-xs text-slate-500 font-mono">
                    {alumnoABajar.apellidos}, {alumnoABajar.nombre} ({alumnoABajar.grupo})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAlumnoABajar(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmBajaAlumno} className="space-y-4 text-xs">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-950 text-[11px] space-y-1">
                <div className="font-bold flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                  <span>Efectos de la baja en el sistema:</span>
                </div>
                <p>
                  El alumno no aparecerá en las búsquedas activas para imponer nuevos partes ni en el censo activo del aula. El historial previo, partes y diligencias quedarán <strong>preservados intactos</strong> para trazabilidad y memoria legal.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Motivo de la baja escolar:
                </label>
                <select
                  value={motivoBajaAlumnoInput}
                  onChange={(e) => setMotivoBajaAlumnoInput(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 bg-white text-xs text-slate-800 focus:outline-sky-600"
                  required
                >
                  <option value="Traslado a otro centro educativo">Traslado a otro centro educativo</option>
                  <option value="Cambio de residencia / localidad">Cambio de residencia / localidad</option>
                  <option value="Baja voluntaria / Fin de escolarización">Baja voluntaria / Fin de escolarización</option>
                  <option value="Baja por incorporación al mercado laboral">Baja por incorporación al mercado laboral</option>
                  <option value="Abandono escolar o anulación de matrícula">Abandono escolar o anulación de matrícula</option>
                  <option value="Cambio de ciclo formativo / etapa">Cambio de ciclo formativo / etapa</option>
                  <option value="Otro motivo (especificar)">Otro motivo (especificar)...</option>
                </select>
              </div>

              {motivoBajaAlumnoInput === 'Otro motivo (especificar)' && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Especificar motivo detallado:
                  </label>
                  <input
                    type="text"
                    value={motivoBajaPersonalizado}
                    onChange={(e) => setMotivoBajaPersonalizado(e.target.value)}
                    placeholder="Indique el motivo de secretaría..."
                    className="w-full rounded-xl border border-slate-300 p-2 bg-white text-xs text-slate-800"
                    required
                  />
                </div>
              )}

              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-[11px] text-slate-600 flex items-center justify-between">
                <span>Fecha de efectividad:</span>
                <span className="font-mono font-bold text-slate-900">{todayStr}</span>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAlumnoABajar(null)}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl cursor-pointer font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <UserMinus className="w-3.5 h-3.5" />
                  <span>Confirmar Baja</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* MODAL PARA MODIFICAR DATOS DEL ALUMNO/A */}
      {alumnoAEditar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 border border-sky-100 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-sky-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-sky-100 text-sky-800 flex items-center justify-center shrink-0">
                  <Pencil className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Modificar Datos de Alumno/a
                  </h2>
                  <p className="text-xs text-slate-500 font-mono">
                    ID: {alumnoAEditar.id_alumno}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAlumnoAEditar(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editAlmError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-semibold">
                {editAlmError}
              </div>
            )}

            <form onSubmit={handleGuardarEdicionAlumno} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nombre: *</label>
                  <input
                    type="text"
                    required
                    value={editAlmNombre}
                    onChange={(e) => setEditAlmNombre(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 p-2.5 bg-white text-xs text-slate-800 focus:outline-sky-600 font-medium"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Apellidos: *</label>
                  <input
                    type="text"
                    required
                    value={editAlmApellidos}
                    onChange={(e) => setEditAlmApellidos(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 p-2.5 bg-white text-xs text-slate-800 focus:outline-sky-600 font-medium"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Curso / Grupo Educativo: *</label>
                  <select
                    value={editAlmGrupo}
                    onChange={(e) => setEditAlmGrupo(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 p-2.5 bg-white text-xs text-slate-800 focus:outline-sky-600 font-bold"
                  >
                    <optgroup label="── Ciclos Formativos ──">
                      {LISTA_GRUPOS_OFICIALES.filter(g => g.etapa === 'CICLOS').map(g => (
                        <option key={g.codigo} value={g.codigo}>{g.etiqueta} ({g.codigo})</option>
                      ))}
                    </optgroup>
                    <optgroup label="── E.S.O. ──">
                      {LISTA_GRUPOS_OFICIALES.filter(g => g.etapa === 'ESO').map(g => (
                        <option key={g.codigo} value={g.codigo}>{g.etiqueta}</option>
                      ))}
                    </optgroup>
                    <optgroup label="── Bachillerato ──">
                      {LISTA_GRUPOS_OFICIALES.filter(g => g.etapa === 'BACHILLERATO').map(g => (
                        <option key={g.codigo} value={g.codigo}>{g.etiqueta}</option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">NIE (Opcional):</label>
                  <input
                    type="text"
                    value={editAlmNie}
                    onChange={(e) => setEditAlmNie(e.target.value)}
                    placeholder="Ej: 12345678A"
                    className="w-full rounded-xl border border-slate-300 p-2.5 bg-white text-xs text-slate-800 font-mono focus:outline-sky-600"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tutor/a Legal:</label>
                  <input
                    type="text"
                    value={editAlmTutorLegal}
                    onChange={(e) => setEditAlmTutorLegal(e.target.value)}
                    placeholder="Nombre del padre/madre/tutor"
                    className="w-full rounded-xl border border-slate-300 p-2.5 bg-white text-xs text-slate-800 focus:outline-sky-600"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Teléfono Contacto:</label>
                  <input
                    type="tel"
                    value={editAlmTel}
                    onChange={(e) => setEditAlmTel(e.target.value)}
                    placeholder="Ej: 600112233"
                    className="w-full rounded-xl border border-slate-300 p-2.5 bg-white text-xs text-slate-800 font-mono focus:outline-sky-600"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAlumnoAEditar(null)}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl cursor-pointer font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Guardar Cambios</span>
                </button>
              </div>
            </form>
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
                      if (historyModalAlumno && res.alumnoActualizado) {
                        setHistoryModalAlumno(res.alumnoActualizado);
                      }
                      if (onDataChanged) onDataChanged();
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
      {/* MODAL ELIMINAR INDIVIDUALMENTE A UN ALUMNO/A */}
      {alumnoAEliminar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-rose-100 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-rose-700">
              <div className="p-2.5 bg-rose-100 rounded-xl">
                <Trash2 className="w-5 h-5 text-rose-700" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  ¿Eliminar este alumno/a del censo?
                </h3>
                <p className="text-xs text-slate-500">
                  Acción irreversible para depuración de censo
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
              <div className="font-bold text-slate-900 text-sm">
                {alumnoAEliminar.apellidos}, {alumnoAEliminar.nombre}
              </div>
              <div className="text-slate-600 font-mono text-[11px]">
                Grupo: {alumnoAEliminar.grupo} · NIE: {alumnoAEliminar.nie || 'Sin NIE'}
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              El alumno/a se eliminará por completo del sistema, de los listados activos y de la base de datos de Google Drive.
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isDeletingAlumno}
                onClick={() => setAlumnoAEliminar(null)}
                className="px-3.5 py-2 text-xs text-slate-600 hover:text-slate-800 cursor-pointer rounded-xl hover:bg-slate-100 font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeletingAlumno}
                onClick={async () => {
                  setIsDeletingAlumno(true);
                  try {
                    const res = StorageService.eliminarAlumnoDefinitivamente(alumnoAEliminar.id_alumno, currentUser.email);
                    if (res.success) {
                      setAlumnoAEliminar(null);
                      setBajaActionMsg({
                        type: 'success',
                        text: `Alumno/a ${alumnoAEliminar.nombre} ${alumnoAEliminar.apellidos} eliminado definitivamente del sistema.`
                      });
                      if (onDataChanged) onDataChanged();
                      GoogleDriveSyncService.pushToGoogleDrive().catch(() => {});
                      setTimeout(() => setBajaActionMsg(null), 5000);
                    } else {
                      setBajaActionMsg({
                        type: 'error',
                        text: res.error || 'Error al eliminar el alumno.'
                      });
                    }
                  } finally {
                    setIsDeletingAlumno(false);
                  }
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeletingAlumno ? 'Eliminando...' : 'Eliminar Alumno/a'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL VACIAR TODOS LOS ALUMNOS DEL CENSO */}
      {modalVaciarTodosAlumnos && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-rose-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-rose-700">
              <div className="p-2.5 bg-rose-100 rounded-xl">
                <AlertTriangle className="w-6 h-6 text-rose-700" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  ¿Vaciar y eliminar todos los alumnos?
                </h3>
                <p className="text-xs text-rose-600 font-semibold">
                  Se eliminarán los {alumnos.length} alumnos del censo
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Esta acción eliminará todos los alumnos añadidos y dejará el censo del <strong>IES Blas Infante</strong> completamente vacío a cero, listo para realizar una nueva importación oficial limpia desde Séneca o archivo ODS/Excel.
            </p>

            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-950 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="text-[11px] leading-relaxed">
                <strong>Atención:</strong> Las cuentas del claustro de profesores y sus contraseñas <strong>NO</strong> se borrarán. Solo se limpian los alumnos y partes registrados.
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isVaciandoAlumnos}
                onClick={() => setModalVaciarTodosAlumnos(false)}
                className="px-3.5 py-2 text-xs text-slate-600 hover:text-slate-800 cursor-pointer rounded-xl hover:bg-slate-100 font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isVaciandoAlumnos}
                onClick={async () => {
                  setIsVaciandoAlumnos(true);
                  try {
                    StorageService.vaciarAlumnosYSanciones(currentUser.email);
                    setModalVaciarTodosAlumnos(false);
                    setBajaActionMsg({
                      type: 'success',
                      text: '¡Censo de alumnos vaciado por completo con éxito! El sistema ha quedado a 0 alumnos.'
                    });
                    if (onDataChanged) onDataChanged();
                    GoogleDriveSyncService.pushToGoogleDrive().catch(() => {});
                    setTimeout(() => setBajaActionMsg(null), 6000);
                  } finally {
                    setIsVaciandoAlumnos(false);
                  }
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isVaciandoAlumnos ? 'Vaciando...' : `Confirmar Borrado de ${alumnos.length} Alumnos`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL MODIFICAR PARTE */}
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
