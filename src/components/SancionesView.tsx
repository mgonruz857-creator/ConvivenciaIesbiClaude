/**
 * Sanciones (Jefatura/Convivencia): alumnado que llega a 0 puntos, expedientes de sanción,
 * casillas de trámites y generación del parte de sanción en PDF.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileDown, Pencil, Trash2, Plus, X, Gavel, Circle } from 'lucide-react';
import { Alumno, ExpedienteSancion, Profesor, ClaveTramiteSancion } from '../types/convivencia';
import { StorageService } from '../services/storageService';
import { CONDUCTAS_ART37, MODALIDADES_SANCION, TRAMITES_SANCION, textoConductaArt37 } from '../data/sancionesArt37';
import { generarParteSancionPdf, fechaLarga, etiquetaGrupo } from '../utils/parteSancionPdf';
import { hoyLocal } from '../services/carnetPuntos';

interface SancionesViewProps {
  currentUser: Profesor;
  alumnos: Alumno[];
  expedientes: ExpedienteSancion[];
  onDataChanged: () => void;
  /** Si se llega desde un aviso de 0 puntos: abrir el formulario de ese alumno (o resaltar su expediente). */
  abrirParaAlumno?: string | null;
  onAbrirParaAlumnoAtendido?: () => void;
  /** Si se llega desde el historial del alumno: resaltar ese expediente */
  resaltarExpediente?: string | null;
  onResaltarExpedienteAtendido?: () => void;
}

type Formulario = {
  id_expediente?: string;
  id_alumno: string;
  conducta_art37: number;
  fecha_desde: string;
  fecha_hasta: string;
  dias_acude: string;
  modalidad: ExpedienteSancion['modalidad'];
  fecha_documento: string;
};

const nuevoFormulario = (idAlumno = ''): Formulario => ({
  id_alumno: idAlumno,
  conducta_art37: 0,
  fecha_desde: '',
  fecha_hasta: '',
  dias_acude: '',
  modalidad: 'EXPULSION',
  fecha_documento: hoyLocal(),
});

function fechaHoraCorta(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export const SancionesView: React.FC<SancionesViewProps> = ({
  currentUser,
  alumnos,
  expedientes,
  onDataChanged,
  resaltarExpediente,
  onResaltarExpedienteAtendido,
  abrirParaAlumno,
  onAbrirParaAlumnoAtendido,
}) => {
  const [formulario, setFormulario] = useState<Formulario | null>(null);
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [aEliminar, setAEliminar] = useState<ExpedienteSancion | null>(null);
  const [mostrarCompletados, setMostrarCompletados] = useState(true);
  const [generando, setGenerando] = useState<string | null>(null);

  const [resaltado, setResaltado] = useState<string | null>(null);

  // Llegada desde el aviso de 0 puntos
  useEffect(() => {
    if (!abrirParaAlumno) return;
    const abierto = expedientes.find((e) => e.id_alumno === abrirParaAlumno && !e.completado);
    if (abierto) {
      setResaltado(abierto.id_expediente);
      setTimeout(() => document.getElementById(`exp-${abierto.id_expediente}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
      setTimeout(() => setResaltado(null), 4000);
    } else {
      setErrorForm(null);
      setFormulario(nuevoFormulario(abrirParaAlumno));
    }
    onAbrirParaAlumnoAtendido?.();
  }, [abrirParaAlumno]);

  // Llegada desde el historial del alumno (Carnet): mostrar y resaltar ese expediente
  useEffect(() => {
    if (!resaltarExpediente) return;
    setMostrarCompletados(true);
    setResaltado(resaltarExpediente);
    setTimeout(() => document.getElementById(`exp-${resaltarExpediente}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
    setTimeout(() => setResaltado(null), 4000);
    onResaltarExpedienteAtendido?.();
  }, [resaltarExpediente]);

  const alumnoPorId = useMemo(() => new Map(alumnos.map((a) => [a.id_alumno, a])), [alumnos]);
  const pendientes = useMemo(() => StorageService.getAlumnosPendientesDeExpediente(), [alumnos, expedientes]);
  const enTramite = expedientes.filter((e) => !e.completado);
  const completados = expedientes.filter((e) => e.completado);
  const alumnosOrdenados = useMemo(
    () => [...alumnos].filter((a) => a.estado !== 'BAJA').sort((a, b) => `${a.apellidos} ${a.nombre}`.localeCompare(`${b.apellidos} ${b.nombre}`, 'es')),
    [alumnos]
  );

  const nombreAlumno = (id: string) => {
    const a = alumnoPorId.get(id);
    return a ? `${a.apellidos}, ${a.nombre}` : 'Alumno/a';
  };

  const guardarFormulario = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formulario) return;
    const f = formulario;
    if (!f.id_alumno) return setErrorForm('Elija el alumno o alumna.');
    if (!f.conducta_art37) return setErrorForm('Elija la conducta del artículo 37.');
    if (!f.fecha_desde || !f.fecha_hasta) return setErrorForm('Indique las fechas de inicio y fin de la sanción.');
    if (f.fecha_hasta < f.fecha_desde) return setErrorForm('La fecha final no puede ser anterior a la inicial.');
    if (!f.fecha_documento) return setErrorForm('Indique la fecha del documento.');
    const datos = {
      id_alumno: f.id_alumno,
      conducta_art37: f.conducta_art37,
      fecha_desde: f.fecha_desde,
      fecha_hasta: f.fecha_hasta,
      dias_acude: f.dias_acude.trim(),
      modalidad: f.modalidad,
      fecha_documento: f.fecha_documento,
    };
    if (f.id_expediente) StorageService.actualizarExpediente(f.id_expediente, datos, currentUser.email);
    else StorageService.crearExpediente(datos, currentUser.email);
    setFormulario(null);
    setErrorForm(null);
    onDataChanged();
  };

  const generarPdf = async (exp: ExpedienteSancion) => {
    const alumno = alumnoPorId.get(exp.id_alumno);
    if (!alumno) return;
    setGenerando(exp.id_expediente);
    try {
      await generarParteSancionPdf(exp, alumno);
    } finally {
      setGenerando(null);
    }
  };

  const tarjeta = (exp: ExpedienteSancion) => {
    const alumno = alumnoPorId.get(exp.id_alumno);
    const hechos = TRAMITES_SANCION.filter((t) => exp.tramites[t.clave]?.hecho).length;
    const modalidad = MODALIDADES_SANCION.find((m) => m.valor === exp.modalidad)?.etiqueta;
    return (
      <div key={exp.id_expediente} id={`exp-${exp.id_expediente}`} className={`border rounded-2xl p-4 space-y-3 transition-shadow ${exp.completado ? 'bg-emerald-50/40 border-emerald-200' : 'bg-white border-amber-200'} ${resaltado === exp.id_expediente ? 'ring-4 ring-sky-300' : ''}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="text-sm font-bold text-slate-900">
              {nombreAlumno(exp.id_alumno)} <span className="font-medium text-slate-500">· {alumno ? etiquetaGrupo(alumno.grupo) : ''}</span>
            </div>
            <div className="text-xs text-slate-600 mt-0.5">
              Del {fechaLarga(exp.fecha_desde)} al {fechaLarga(exp.fecha_hasta)} · {modalidad}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Art. 37.{exp.conducta_art37}: {textoConductaArt37(exp.conducta_art37)}
            </div>
          </div>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${exp.completado ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
            {exp.completado ? 'Trámites completados' : `Trámites: ${hechos}/${TRAMITES_SANCION.length}`}
          </span>
        </div>

        <ul className="grid gap-1.5">
          {TRAMITES_SANCION.map((t) => {
            const tr = exp.tramites[t.clave];
            return (
              <li key={t.clave}>
                <label className="flex items-start gap-2.5 text-xs cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="mt-0.5 w-4 h-4 accent-emerald-600 cursor-pointer"
                    checked={Boolean(tr?.hecho)}
                    onChange={(e) => {
                      StorageService.marcarTramite(exp.id_expediente, t.clave as ClaveTramiteSancion, e.target.checked, currentUser.email);
                      onDataChanged();
                    }}
                  />
                  <span className={tr?.hecho ? 'text-slate-500 line-through decoration-slate-300' : 'text-slate-800 font-medium'}>{t.etiqueta}</span>
                  {tr?.hecho && (
                    <span className="ml-auto text-[10px] text-slate-400 shrink-0">
                      {fechaHoraCorta(tr.fecha)} · {(tr.por || '').split('@')[0]}
                    </span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>

        {!exp.completado && (
          <p className="text-[11px] text-slate-500">El parte de sanción en PDF se podrá generar cuando estén marcados los cuatro trámites.</p>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" onClick={() => exp.completado && generarPdf(exp)}
            disabled={!exp.completado || generando === exp.id_expediente}
            title={exp.completado ? 'Descargar el parte de sanción' : 'Disponible cuando estén marcados los cuatro trámites'}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 disabled:text-slate-600 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold cursor-pointer">
            <FileDown className="w-3.5 h-3.5" /> {generando === exp.id_expediente ? 'Generando…' : 'Generar parte de sanción (PDF)'}
          </button>
          {!exp.completado && (
            <button type="button" onClick={() => { StorageService.completarExpediente(exp.id_expediente, currentUser.email); onDataChanged(); }}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer">
              <CheckCircle2 className="w-3.5 h-3.5" /> Marcar todos los trámites como completados
            </button>
          )}
          <button type="button" onClick={() => { setErrorForm(null); setFormulario({ ...exp }); }}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold cursor-pointer">
            <Pencil className="w-3.5 h-3.5" /> Editar datos
          </button>
          <button type="button" onClick={() => setAEliminar(exp)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-semibold cursor-pointer">
            <Trash2 className="w-3.5 h-3.5" /> Eliminar
          </button>
        </div>
      </div>
    );
  };

  const campo = 'w-full rounded-xl border border-slate-300 px-3 py-2 text-xs bg-white focus:border-sky-600 focus:ring-1 focus:ring-sky-600';

  return (
    <div className="space-y-6">
      <div className="bg-white border border-sky-100 rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2"><Gavel className="w-5 h-5 text-sky-700" /> Sanciones</h2>
          <p className="text-xs text-slate-500 mt-0.5">Expedientes de sanción (Decreto 327/2010, art. 37), trámites y parte de sanción para la familia.</p>
        </div>
        <button type="button" onClick={() => { setErrorForm(null); setFormulario(nuevoFormulario()); }}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold cursor-pointer shrink-0">
          <Plus className="w-4 h-4" /> Nuevo expediente
        </button>
      </div>

      {/* Alumnado a 0 puntos sin expediente */}
      {pendientes.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 space-y-2">
          <div className="text-sm font-bold text-rose-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            {pendientes.length === 1 ? '1 alumno/a ha llegado a 0 puntos y no tiene expediente de sanción' : `${pendientes.length} alumnos/as han llegado a 0 puntos y no tienen expediente de sanción`}
          </div>
          <p className="text-xs text-rose-800">
            Pulse <strong>Abrir expediente</strong>, rellene los datos de la sanción y guarde: el expediente aparecerá en "En trámite" con las cuatro casillas de trámites.
          </p>
          <ul className="divide-y divide-rose-100">
            {pendientes.map((a) => (
              <li key={a.id_alumno} className="flex items-center justify-between gap-2 py-2">
                <span className="text-xs text-rose-950 font-semibold">{a.apellidos}, {a.nombre} <span className="font-normal text-rose-700">· {etiquetaGrupo(a.grupo)}</span></span>
                <button type="button" onClick={() => { setErrorForm(null); setFormulario(nuevoFormulario(a.id_alumno)); }}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold cursor-pointer">
                  Abrir expediente
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* En trámite */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold text-slate-800">En trámite ({enTramite.length})</h3>
        {enTramite.length === 0 ? (
          <p className="text-xs text-slate-500 bg-white border border-slate-200 rounded-2xl p-4">No hay expedientes con trámites pendientes.</p>
        ) : (
          enTramite.map(tarjeta)
        )}
      </section>

      {/* Completados */}
      <section className="space-y-3">
        <button type="button" onClick={() => setMostrarCompletados((v) => !v)} className="text-sm font-bold text-slate-800 flex items-center gap-1.5 cursor-pointer">
          {mostrarCompletados ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Circle className="w-4 h-4 text-slate-400" />}
          Completados ({completados.length}) <span className="text-xs font-normal text-sky-700">{mostrarCompletados ? 'ocultar' : 'mostrar'}</span>
        </button>
        {mostrarCompletados && completados.map(tarjeta)}
      </section>

      {/* Formulario de expediente */}
      {formulario && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <form onSubmit={guardarFormulario} className="bg-white rounded-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">{formulario.id_expediente ? 'Editar expediente de sanción' : 'Nuevo expediente de sanción'}</h3>
              <button type="button" onClick={() => setFormulario(null)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer" aria-label="Cerrar"><X className="w-5 h-5" /></button>
            </div>

            <label className="block space-y-1">
              <span className="font-semibold text-slate-700">Alumno/a</span>
              <select className={campo} value={formulario.id_alumno} disabled={Boolean(formulario.id_expediente)}
                onChange={(e) => setFormulario({ ...formulario, id_alumno: e.target.value })}>
                <option value="">— Elija alumno/a —</option>
                {alumnosOrdenados.map((a) => (
                  <option key={a.id_alumno} value={a.id_alumno}>{a.apellidos}, {a.nombre} · {etiquetaGrupo(a.grupo)}{a.puntos_actuales === 0 ? ' · 0 puntos' : ''}</option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="font-semibold text-slate-700">Conducta (Decreto 327/2010, art. 37)</span>
              <select className={campo} value={formulario.conducta_art37}
                onChange={(e) => setFormulario({ ...formulario, conducta_art37: parseInt(e.target.value, 10) })}>
                <option value={0}>— Elija la conducta —</option>
                {CONDUCTAS_ART37.map((c) => (
                  <option key={c.numero} value={c.numero}>{c.numero}. {c.texto}</option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="font-semibold text-slate-700">Desde el</span>
                <input type="date" className={campo} value={formulario.fecha_desde} onChange={(e) => setFormulario({ ...formulario, fecha_desde: e.target.value })} />
              </label>
              <label className="block space-y-1">
                <span className="font-semibold text-slate-700">Hasta el</span>
                <input type="date" className={campo} value={formulario.fecha_hasta} onChange={(e) => setFormulario({ ...formulario, fecha_hasta: e.target.value })} />
              </label>
            </div>

            <label className="block space-y-1">
              <span className="font-semibold text-slate-700">Acudiendo al centro el (opcional)</span>
              <input type="text" className={campo} placeholder="Ej.: viernes 16 de octubre y miércoles 21 de octubre"
                value={formulario.dias_acude} onChange={(e) => setFormulario({ ...formulario, dias_acude: e.target.value })} />
              <span className="text-[11px] text-slate-500">Si se deja vacío, esa parte no aparece en el documento.</span>
            </label>

            <label className="block space-y-1">
              <span className="font-semibold text-slate-700">Durante la sanción</span>
              <select className={campo} value={formulario.modalidad}
                onChange={(e) => setFormulario({ ...formulario, modalidad: e.target.value as ExpedienteSancion['modalidad'] })}>
                {MODALIDADES_SANCION.map((m) => (
                  <option key={m.valor} value={m.valor}>{m.textoParte.charAt(0).toUpperCase() + m.textoParte.slice(1)}</option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="font-semibold text-slate-700">Fecha del documento (Córdoba, a …)</span>
              <input type="date" className={campo} value={formulario.fecha_documento} onChange={(e) => setFormulario({ ...formulario, fecha_documento: e.target.value })} />
            </label>

            {errorForm && <p className="text-rose-700 font-semibold">{errorForm}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setFormulario(null)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl font-semibold cursor-pointer">Cancelar</button>
              <button type="submit" className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-bold cursor-pointer">
                {formulario.id_expediente ? 'Guardar cambios' : 'Abrir expediente'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Confirmar eliminación */}
      {aEliminar && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4 text-sm">
            <p className="text-slate-800">
              ¿Eliminar el expediente de sanción de <strong>{nombreAlumno(aEliminar.id_alumno)}</strong>? No se puede deshacer.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setAEliminar(null)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-semibold cursor-pointer">Cancelar</button>
              <button type="button" onClick={() => { StorageService.eliminarExpediente(aEliminar.id_expediente, currentUser.email); setAEliminar(null); onDataChanged(); }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold cursor-pointer">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
