/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { hoyLocal } from '../services/carnetPuntos';
import { 
  Pencil, 
  X, 
  Check, 
  AlertTriangle, 
  Calendar, 
  Clock, 
  MapPin, 
  User, 
  BookOpen, 
  FileText,
  ShieldCheck,
  RotateCcw
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
  LISTA_GRUPOS_OFICIALES,
  LISTA_UBICACIONES_OFICIALES
} from '../types/convivencia';
import { 
  CATALOGO_CONDUCTAS_V0, 
  MEDIDAS_INMEDIATAS_CATALOG,
  medidasInmediatasPermitidas,
  obtenerTipificacionNormativa,
  calcularPuntosInfraccion,
  esGrupoInformatica
} from '../data/rofCatalog';

interface EditarParteModalProps {
  sancion: Sancion;
  alumnos: Alumno[];
  profesores: Profesor[];
  currentUser: Profesor;
  onSave: (
    idSancion: string,
    cambios: Partial<Sancion>,
    motivo: string
  ) => { success: boolean; sancionModificada?: Sancion; alumnoActualizado?: Alumno; error?: string };
  onClose: () => void;
}

export const TRAMOS_HORARIOS_LISTA: TramoHorario[] = [
  '1ª Hora (08:30 - 09:30)',
  '2ª Hora (09:30 - 10:30)',
  '3ª Hora (10:30 - 11:30)',
  'Recreo (11:30 - 12:00)',
  '4ª Hora (12:00 - 13:00)',
  '5ª Hora (13:00 - 14:00)',
  '6ª Hora (14:00 - 15:00)',
];

export const EditarParteModal: React.FC<EditarParteModalProps> = ({
  sancion,
  alumnos,
  profesores,
  currentUser,
  onSave,
  onClose,
}) => {
  const currentAlumno = useMemo(() => {
    return alumnos.find(a => a.id_alumno === sancion.id_alumno);
  }, [alumnos, sancion.id_alumno]);

  // 1. Alumno
  const [selectedAlumnoId, setSelectedAlumnoId] = useState<string>(sancion.id_alumno);
  const [searchAlumno, setSearchAlumno] = useState<string>('');

  const targetAlumno = useMemo(() => {
    return alumnos.find(a => a.id_alumno === selectedAlumnoId) || currentAlumno;
  }, [alumnos, selectedAlumnoId, currentAlumno]);

  // 2. Conducta e Infracción
  const [activeTabTipo, setActiveTabTipo] = useState<TipoConductaV0>(
    sancion.tipo_conducta || 
    (sancion.puntos_restados === 0 ? 'ACADEMICO' : (sancion.puntos_restados >= 4 ? 'GRAVE' : 'LEVE'))
  );
  const [selectedConductaCodigo, setSelectedConductaCodigo] = useState<CodigoConductaV0>(
    (sancion.codigo_infraccion as CodigoConductaV0) || 'LEV-PERTURBACION'
  );

  // 3. Puntos restados con posibilidad de ajuste manual
  const [puntosRestadosInput, setPuntosRestadosInput] = useState<number>(sancion.puntos_restados);

  // 4. Hechos y Detalles
  const [fecha, setFecha] = useState<string>(sancion.fecha || hoyLocal());
  const [horaIncidente, setHoraIncidente] = useState<string>(sancion.hora_incidente || '09:00');
  const [tramoHorario, setTramoHorario] = useState<TramoHorario>(sancion.tramo_horario || '1ª Hora (08:30 - 09:30)');
  const [ubicacion, setUbicacion] = useState<UbicacionCentro>(sancion.ubicacion || 'Aula ordinaria');
  const [materia, setMateria] = useState<string>(sancion.materia || 'Tutoría');
  const [nombreProfesor, setNombreProfesor] = useState<string>(sancion.nombre_profesor || `${currentUser.nombre} ${currentUser.apellidos}`);
  const [descripcionHechos, setDescripcionHechos] = useState<string>(sancion.descripcion_hechos || '');
  const [medidaInmediata, setMedidaInmediata] = useState<MedidaInmediataAdoptada>(sancion.medida_inmediata || 'AMONESTACION_VERBAL');
  const [observacionesTramitacion, setObservacionesTramitacion] = useState<string>(sancion.observaciones_tramitacion || '');

  // 5. Motivo obligatorio de la modificación
  const [motivoModificacion, setMotivoModificacion] = useState<string>('Corrección de tipificación / Estimación de alegaciones');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Alumnos filtrados para selector
  const filteredAlumnos = useMemo(() => {
    if (!searchAlumno.trim()) return [];
    const term = searchAlumno.toLowerCase().trim();
    return alumnos
      .filter(a => a.estado !== 'BAJA')
      .filter(a => 
        a.nombre.toLowerCase().includes(term) || 
        a.apellidos.toLowerCase().includes(term) || 
        a.grupo.toLowerCase().includes(term)
      )
      .slice(0, 8);
  }, [alumnos, searchAlumno]);

  // Lista de conductas según el tipo activo
  const conductasDisponibles = useMemo(() => {
    return Object.values(CATALOGO_CONDUCTAS_V0).filter(c => c.tipo === activeTabTipo);
  }, [activeTabTipo]);

  // Manejar cambio de tipo de conducta
  const handleSelectTipo = (tipo: TipoConductaV0) => {
    setActiveTabTipo(tipo);
    const first = Object.values(CATALOGO_CONDUCTAS_V0).find(c => c.tipo === tipo);
    if (first) {
      setSelectedConductaCodigo(first.codigo);
      const pts = calcularPuntosInfraccion(first.codigo, targetAlumno?.grupo);
      setPuntosRestadosInput(pts);
    }
  };

  // Manejar selección de conducta
  const handleSelectConducta = (codigo: CodigoConductaV0) => {
    setSelectedConductaCodigo(codigo);
    const pts = calcularPuntosInfraccion(codigo, targetAlumno?.grupo);
    setPuntosRestadosInput(pts);
    if (codigo === 'GRA-MOVIL-ENTREGA' && medidaInmediata === 'RETIRADA_MOVIL') {
      setMedidaInmediata('DERIVACION_JEFATURA');
    }
  };

  // Cálculo de simulación de puntos de carnet
  const saldoSimulado = useMemo(() => {
    if (!targetAlumno) return { anterior: 10, resultante: 10 };
    // Saldo base sumando lo que restaba el parte original (si era el mismo alumno) y restando lo nuevo
    const puntosOriginalesParte = (targetAlumno.id_alumno === sancion.id_alumno) ? sancion.puntos_restados : 0;
    const saldoSinEsteParte = Math.min(10, targetAlumno.puntos_actuales + puntosOriginalesParte);
    const nuevoSaldo = Math.max(0, Math.min(10, saldoSinEsteParte - puntosRestadosInput));
    return {
      anterior: targetAlumno.puntos_actuales,
      resultante: nuevoSaldo,
    };
  }, [targetAlumno, sancion, puntosRestadosInput]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!motivoModificacion.trim()) {
      setErrorMsg('Debe indicar un motivo o justificación para la modificación del parte.');
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);

    const medidaObj = MEDIDAS_INMEDIATAS_CATALOG.find(m => m.valor === medidaInmediata);

    const cambios: Partial<Sancion> = {
      id_alumno: selectedAlumnoId,
      fecha,
      hora_incidente: horaIncidente,
      tramo_horario: tramoHorario,
      codigo_infraccion: selectedConductaCodigo,
      tipo_conducta: activeTabTipo,
      puntos_restados: Math.max(0, puntosRestadosInput),
      ubicacion,
      materia,
      nombre_profesor: nombreProfesor,
      descripcion_hechos: descripcionHechos,
      medida_inmediata: medidaInmediata,
      medida_inmediata_texto: medidaObj?.label || 'Amonestación verbal',
      observaciones_tramitacion: observacionesTramitacion,
    };

    try {
      const res = onSave(sancion.id_sancion, cambios, motivoModificacion);
      if (res && !res.success) {
        setErrorMsg(res.error || 'No se pudo guardar la modificación.');
        setIsSaving(false);
      } else {
        onClose();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error inesperado al modificar el parte.');
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-sky-100 overflow-hidden my-auto flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-sky-900 via-slate-800 to-indigo-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-sky-500/20 border border-sky-400/30 rounded-xl">
              <Pencil className="w-4 h-4 text-sky-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base">Modificación Oficial de Parte</h3>
                <span className="font-mono text-xs bg-sky-400/20 text-sky-200 px-2 py-0.5 rounded border border-sky-400/30">
                  {sancion.numero_expediente}
                </span>
              </div>
              <p className="text-[11px] text-sky-200/80">
                Edición con recálculo automático de carnet y trazabilidad RGPD
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-sky-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 flex-1 text-slate-800 text-xs">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 1. Alumno Asignado */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-800 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-sky-700" />
                <span>Alumno/a Afectado/a:</span>
              </label>
              {targetAlumno && (
                <span className="font-mono font-bold text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                  Grupo: {targetAlumno.grupo} · Saldo actual: {targetAlumno.puntos_actuales}/10 pts
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 bg-white border border-slate-300 rounded-xl px-3 py-2 font-semibold text-slate-900 flex items-center justify-between">
                <span>{targetAlumno ? `${targetAlumno.apellidos}, ${targetAlumno.nombre}` : sancion.id_alumno}</span>
                <span className="text-[10px] text-slate-500 font-normal">ID: {selectedAlumnoId}</span>
              </div>
            </div>

            {/* Opcional: Reasignar a otro alumno si hubo error */}
            <div className="space-y-1">
              <input
                type="text"
                value={searchAlumno}
                onChange={(e) => setSearchAlumno(e.target.value)}
                placeholder="🔍 ¿Reasignar a otro alumno/a? Buscar por nombre o apellidos..."
                className="w-full text-xs rounded-lg border border-slate-200 p-2 bg-white text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-sky-500"
              />
              {filteredAlumnos.length > 0 && (
                <div className="bg-white border border-sky-200 rounded-lg shadow-lg max-h-36 overflow-y-auto divide-y divide-slate-100">
                  {filteredAlumnos.map(a => (
                    <button
                      key={a.id_alumno}
                      type="button"
                      onClick={() => {
                        setSelectedAlumnoId(a.id_alumno);
                        setSearchAlumno('');
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-sky-50 flex items-center justify-between text-xs cursor-pointer"
                    >
                      <span className="font-bold text-slate-800">{a.apellidos}, {a.nombre}</span>
                      <span className="text-slate-500 font-mono">{a.grupo} ({a.puntos_actuales} pts)</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 2. Tipo de Conducta y Tipificación */}
          <div className="space-y-2">
            <label className="font-bold text-slate-800 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-sky-700" />
              <span>Categoría y Tipificación ROF:</span>
            </label>
            
            {/* Tabs de tipo */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleSelectTipo('LEVE')}
                className={`py-2 px-3 rounded-xl font-bold border transition-all text-center cursor-pointer ${
                  activeTabTipo === 'LEVE'
                    ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                LEVE (-1 a -3 pts)
              </button>
              <button
                type="button"
                onClick={() => handleSelectTipo('GRAVE')}
                className={`py-2 px-3 rounded-xl font-bold border transition-all text-center cursor-pointer ${
                  activeTabTipo === 'GRAVE'
                    ? 'bg-rose-600 text-white border-rose-700 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                GRAVE (-4 a -10 pts)
              </button>
              <button
                type="button"
                onClick={() => handleSelectTipo('ACADEMICO')}
                className={`py-2 px-3 rounded-xl font-bold border transition-all text-center cursor-pointer ${
                  activeTabTipo === 'ACADEMICO'
                    ? 'bg-slate-700 text-white border-slate-800 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                ACADÉMICO (0 pts)
              </button>
            </div>

            {/* Selector de Conducta */}
            <select
              value={selectedConductaCodigo}
              onChange={(e) => handleSelectConducta(e.target.value as CodigoConductaV0)}
              className="w-full text-xs rounded-xl border border-slate-300 p-2.5 bg-white focus:ring-2 focus:ring-sky-500 font-medium text-slate-800"
            >
              {conductasDisponibles.map(c => (
                <option key={c.codigo} value={c.codigo}>
                  [{c.codigo}] {c.titulo} ({c.tipo === 'ACADEMICO' ? '0 pts' : `-${c.puntos_descuento} pts`})
                </option>
              ))}
            </select>
          </div>

          {/* 3. Puntos y Simulación de Impacto */}
          <div className="p-3.5 bg-sky-50/70 border border-sky-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <label className="font-bold text-sky-900">
                Puntos a detraer en este parte:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={puntosRestadosInput}
                  onChange={(e) => setPuntosRestadosInput(Math.max(0, Math.min(10, parseInt(e.target.value, 10) || 0)))}
                  className="w-20 text-center font-mono font-bold text-sm rounded-lg border border-sky-300 bg-white p-1 text-rose-700 focus:ring-2 focus:ring-sky-500"
                />
                <span className="font-mono font-bold text-rose-700">pts</span>
              </div>
            </div>

            {/* Impacto en vivo */}
            <div className="bg-white p-2.5 rounded-lg border border-sky-100 flex items-center justify-between">
              <span className="text-slate-600 font-medium">Impacto automático en carnet:</span>
              <div className="flex items-center gap-2 font-mono">
                <span className="text-slate-500 line-through">{saldoSimulado.anterior} pts</span>
                <span>→</span>
                <span className={`font-bold px-2 py-0.5 rounded ${
                  saldoSimulado.resultante === 0 
                    ? 'bg-rose-100 text-rose-800' 
                    : saldoSimulado.resultante <= 3 
                    ? 'bg-amber-100 text-amber-800' 
                    : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {saldoSimulado.resultante} / 10 pts
                </span>
                {saldoSimulado.resultante === 0 && (
                  <span className="text-[10px] font-bold text-rose-700 uppercase bg-rose-50 px-1 rounded">
                    Carnet Agotado
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 4. Parámetros del Hecho */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Fecha del Hecho:</label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full text-xs rounded-xl border border-slate-300 p-2 bg-white text-slate-800 font-mono"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Tramo Horario:</label>
              <select
                value={tramoHorario}
                onChange={(e) => setTramoHorario(e.target.value as TramoHorario)}
                className="w-full text-xs rounded-xl border border-slate-300 p-2 bg-white text-slate-800"
              >
                {TRAMOS_HORARIOS_LISTA.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Ubicación:</label>
              <select
                value={ubicacion}
                onChange={(e) => setUbicacion(e.target.value as UbicacionCentro)}
                className="w-full text-xs rounded-xl border border-slate-300 p-2 bg-white text-slate-800"
              >
                {LISTA_UBICACIONES_OFICIALES.map(u => (
                  <option key={u.codigo} value={u.codigo}>{u.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Materia / Asignatura:</label>
              <input
                type="text"
                value={materia}
                onChange={(e) => setMateria(e.target.value)}
                className="w-full text-xs rounded-xl border border-slate-300 p-2 bg-white text-slate-800"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="font-semibold text-slate-700 block mb-1">Profesor/a que registró el parte:</label>
              <input
                type="text"
                value={nombreProfesor}
                onChange={(e) => setNombreProfesor(e.target.value)}
                className="w-full text-xs rounded-xl border border-slate-300 p-2 bg-white text-slate-800"
              />
            </div>
          </div>

          {/* 5. Descripción de los Hechos */}
          <div>
            <label className="font-bold text-slate-800 block mb-1">
              Descripción de los hechos:
            </label>
            <textarea
              value={descripcionHechos}
              onChange={(e) => setDescripcionHechos(e.target.value)}
              rows={3}
              className="w-full text-xs rounded-xl border border-slate-300 p-2.5 bg-white text-slate-800 focus:ring-2 focus:ring-sky-500"
              placeholder="Describa los hechos ocurridos con objetividad..."
            />
          </div>

          {/* 6. Medida Inmediata y Observaciones */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Medida Inmediata Adoptada:</label>
              <select
                value={medidaInmediata}
                onChange={(e) => setMedidaInmediata(e.target.value as MedidaInmediataAdoptada)}
                className="w-full text-xs rounded-xl border border-slate-300 p-2 bg-white text-slate-800"
              >
                {MEDIDAS_INMEDIATAS_CATALOG.filter(m =>
                  // las permitidas para la conducta; si no se cambia la conducta, también la que ya tenía guardada el parte
                  (m.valor === sancion.medida_inmediata && selectedConductaCodigo === sancion.codigo_infraccion) ||
                  medidasInmediatasPermitidas(selectedConductaCodigo).some(p => p.valor === m.valor)
                ).map(m => (
                  <option key={m.valor} value={m.valor}>{m.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Observaciones de Tramitación:</label>
              <input
                type="text"
                value={observacionesTramitacion}
                onChange={(e) => setObservacionesTramitacion(e.target.value)}
                placeholder="Ej: Llamada a familia realizada..."
                className="w-full text-xs rounded-xl border border-slate-300 p-2 bg-white text-slate-800"
              />
            </div>
          </div>

          {/* 7. Motivo de Modificación (Auditoría RGPD) */}
          <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1">
            <label className="font-bold text-amber-900 block">
              Motivo o justificación de la modificación <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              required
              value={motivoModificacion}
              onChange={(e) => setMotivoModificacion(e.target.value)}
              placeholder="Indique el motivo del cambio (estimación de alegaciones, corrección de tipificación, etc.)"
              className="w-full text-xs rounded-lg border border-amber-300 p-2 bg-white text-slate-800 focus:ring-2 focus:ring-amber-500 font-medium"
            />
            <p className="text-[10px] text-amber-700">
              Quedará registrado de forma inmutable en el registro de auditoría RGPD por {currentUser.email}.
            </p>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              disabled={isSaving}
              onClick={onClose}
              className="px-4 py-2 text-xs text-slate-600 hover:text-slate-800 cursor-pointer rounded-xl hover:bg-slate-100 font-semibold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving || !motivoModificacion.trim()}
              className="px-5 py-2.5 bg-sky-700 hover:bg-sky-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-sky-900/10"
            >
              <Check className="w-4 h-4" />
              <span>{isSaving ? 'Guardando...' : 'Guardar Modificación'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
