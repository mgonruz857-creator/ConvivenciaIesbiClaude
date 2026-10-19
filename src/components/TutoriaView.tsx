/**
 * Mi tutoría: el tutor/a de un grupo ve el alumnado de su grupo, su saldo de puntos,
 * el teléfono de las familias y TODOS los partes que se les han puesto (solo lectura).
 */

import React, { useMemo, useState } from 'react';
import { Users, Phone, Printer, ChevronDown, ChevronUp, AlertTriangle, School } from 'lucide-react';
import { Alumno, ExpedienteSancion, Profesor, Sancion, LISTA_GRUPOS_OFICIALES } from '../types/convivencia';
import { TRAMITES_SANCION, MODALIDADES_SANCION, textoConductaArt37 } from '../data/sancionesArt37';
import { fechaLarga } from '../utils/parteSancionPdf';
import { CATALOGO_CONDUCTAS_V0, MATRIZ_ROF_CATALOG } from '../data/rofCatalog';

interface TutoriaViewProps {
  currentUser: Profesor;
  alumnos: Alumno[];
  sanciones: Sancion[];
  expedientes?: ExpedienteSancion[];
  /** Partes que eran nuevos al entrar (se marcan con «Nuevo») */
  nuevosIds?: Set<string>;
  onPrintParte: (sancion: Sancion) => void;
}

const ESTADO_TRAMITACION: Record<string, string> = {
  PENDIENTE_NOTIFICACION: 'Pendiente de notificar',
  NOTIFICADO_TELEFONO: 'Notificado por teléfono',
  PARTE_IMPRESO: 'Parte impreso',
  RESUELTO: 'Resuelto',
};

const ESTADO_PAC: Record<string, string> = {
  EN_TRANSITO: 'De camino al Aula PAC',
  RECIBIDO: 'Recibido en el Aula PAC',
  TAREAS_COMPLETADAS: 'Tareas completadas',
  REFLEXION_ENTREGADA: 'Reflexión entregada',
};

function tituloConducta(codigo: string): string {
  const def: any = (MATRIZ_ROF_CATALOG as any)[codigo] || (CATALOGO_CONDUCTAS_V0 as any)[codigo];
  return def?.titulo || def?.nombre || codigo;
}

function colorSaldo(p: number): string {
  if (p === 0) return 'bg-rose-600 text-white';
  if (p <= 3) return 'bg-amber-500 text-white';
  if (p <= 6) return 'bg-yellow-100 text-yellow-900 border border-yellow-300';
  return 'bg-emerald-100 text-emerald-900 border border-emerald-300';
}

function fechaLegible(f: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(f || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : f;
}

export const TutoriaView: React.FC<TutoriaViewProps> = ({ currentUser, alumnos, sanciones, expedientes = [], nuevosIds, onPrintParte }) => {
  const grupo = currentUser.tutor_de_grupo || '';
  const etiquetaGrupo = LISTA_GRUPOS_OFICIALES.find((g) => g.codigo === grupo)?.etiqueta || grupo;
  const [alumnoFiltro, setAlumnoFiltro] = useState<string>('');
  const [abierto, setAbierto] = useState<string | null>(null);

  const alumnosGrupo = useMemo(
    () =>
      alumnos
        .filter((a) => a.grupo === grupo && a.estado !== 'BAJA')
        .sort((a, b) => `${a.apellidos} ${a.nombre}`.localeCompare(`${b.apellidos} ${b.nombre}`, 'es')),
    [alumnos, grupo]
  );
  const idsGrupo = useMemo(() => new Set(alumnosGrupo.map((a) => a.id_alumno)), [alumnosGrupo]);
  const alumnoPorId = useMemo(() => new Map(alumnos.map((a) => [a.id_alumno, a])), [alumnos]);

  const partesGrupo = useMemo(
    () =>
      sanciones
        .filter((s) => idsGrupo.has(s.id_alumno))
        .sort((a, b) => `${b.fecha} ${b.hora_incidente || ''}`.localeCompare(`${a.fecha} ${a.hora_incidente || ''}`)),
    [sanciones, idsGrupo]
  );
  const partesPorAlumno = useMemo(() => {
    const m = new Map<string, number>();
    partesGrupo.forEach((s) => m.set(s.id_alumno, (m.get(s.id_alumno) || 0) + 1));
    return m;
  }, [partesGrupo]);

  const expedientesGrupo = useMemo(
    () => expedientes.filter((e) => idsGrupo.has(e.id_alumno)).sort((a, b) => b.fecha_creacion.localeCompare(a.fecha_creacion)),
    [expedientes, idsGrupo]
  );

  const partesVisibles = alumnoFiltro ? partesGrupo.filter((s) => s.id_alumno === alumnoFiltro) : partesGrupo;
  const enAlerta = alumnosGrupo.filter((a) => a.puntos_actuales <= 3).length;
  const pendientesNotificar = partesGrupo.filter((s) => s.estado_tramitacion === 'PENDIENTE_NOTIFICACION').length;
  const nuevos = partesGrupo.filter((s) => nuevosIds?.has(s.id_sancion)).length;

  if (!grupo) {
    return (
      <div className="bg-white border border-sky-100 rounded-2xl p-8 text-center text-slate-600">
        <School className="w-8 h-8 mx-auto text-slate-400 mb-2" />
        No tienes ninguna tutoría asignada. Puedes indicarla en <strong>Mi perfil</strong> o pedírsela a Jefatura de Estudios.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="bg-white border border-sky-100 rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-sky-700" />
              Mi tutoría: {etiquetaGrupo}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Todos los partes de tu grupo, pongan quien los pongan. Solo lectura: para modificar un parte, habla con quien lo puso o con Convivencia.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center shrink-0">
            <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="text-lg font-bold text-slate-900">{alumnosGrupo.length}</div>
              <div className="text-[10px] text-slate-500 font-semibold uppercase">Alumnos</div>
            </div>
            <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="text-lg font-bold text-slate-900">{partesGrupo.length}</div>
              <div className="text-[10px] text-slate-500 font-semibold uppercase">Partes</div>
            </div>
            <div className={`px-3 py-2 rounded-xl border ${enAlerta ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
              <div className={`text-lg font-bold ${enAlerta ? 'text-amber-800' : 'text-slate-900'}`}>{enAlerta}</div>
              <div className="text-[10px] text-slate-500 font-semibold uppercase">≤ 3 puntos</div>
            </div>
          </div>
        </div>
        {nuevos > 0 && (
          <div className="mt-4 p-2.5 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-900 flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded bg-indigo-600 text-white text-[10px] font-bold uppercase shrink-0">Nuevo</span>
            {nuevos === 1 ? 'Hay 1 parte nuevo desde tu última visita (marcado abajo).' : `Hay ${nuevos} partes nuevos desde tu última visita (marcados abajo).`}
          </div>
        )}
        {pendientesNotificar > 0 && (
          <div className="mt-4 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            {pendientesNotificar === 1 ? 'Hay 1 parte pendiente de notificar a la familia.' : `Hay ${pendientesNotificar} partes pendientes de notificar a las familias.`}
          </div>
        )}
      </div>

      {/* Expedientes de sanción del grupo (solo lectura) */}
      {expedientesGrupo.length > 0 && (
        <div className="bg-white border border-sky-100 rounded-2xl shadow-xs">
          <div className="px-5 py-3 border-b border-sky-100 text-sm font-bold text-slate-800">Sanciones de tu grupo ({expedientesGrupo.length})</div>
          <ul className="divide-y divide-slate-100">
            {expedientesGrupo.map((e) => {
              const al = alumnoPorId.get(e.id_alumno);
              const hechos = TRAMITES_SANCION.filter((t) => e.tramites[t.clave]?.hecho).length;
              return (
                <li key={e.id_expediente} className="p-4 text-xs space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">{al ? `${al.apellidos}, ${al.nombre}` : 'Alumno/a'}</span>
                    <span className={`font-bold px-2 py-0.5 rounded-full ${e.completado ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
                      {e.completado ? 'Trámites completados' : `Trámites: ${hechos}/${TRAMITES_SANCION.length}`}
                    </span>
                  </div>
                  <div className="text-slate-600">
                    Del {fechaLarga(e.fecha_desde)} al {fechaLarga(e.fecha_hasta)} · {MODALIDADES_SANCION.find((m) => m.valor === e.modalidad)?.etiqueta}
                  </div>
                  <div className="text-slate-500">Art. 37.{e.conducta_art37}: {textoConductaArt37(e.conducta_art37)}</div>
                  <ul className="text-slate-600 grid sm:grid-cols-2 gap-x-4">
                    {TRAMITES_SANCION.map((t) => (
                      <li key={t.clave}>{e.tramites[t.clave]?.hecho ? '✅' : '⬜'} {t.etiqueta}</li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Alumnado del grupo */}
      <div className="bg-white border border-sky-100 rounded-2xl shadow-xs overflow-hidden">
        <div className="px-5 py-3 border-b border-sky-100 text-sm font-bold text-slate-800">Alumnado del grupo</div>
        {alumnosGrupo.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">No hay alumnado cargado en este grupo.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase">
                <tr>
                  <th className="text-left p-3">Alumno/a</th>
                  <th className="text-center p-3">Puntos</th>
                  <th className="text-center p-3">Partes</th>
                  <th className="text-left p-3">Familia</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {alumnosGrupo.map((a) => {
                  const n = partesPorAlumno.get(a.id_alumno) || 0;
                  const tel = (a.telefono_tutor || '').trim();
                  const telValido = tel && tel !== '600 00 00 00';
                  return (
                    <tr key={a.id_alumno} className="border-t border-slate-100">
                      <td className="p-3 font-semibold text-slate-900">{a.apellidos}, {a.nombre}</td>
                      <td className="p-3 text-center">
                        <span className={`inline-block min-w-8 px-2 py-0.5 rounded-lg font-bold ${colorSaldo(a.puntos_actuales)}`}>{a.puntos_actuales}</span>
                      </td>
                      <td className="p-3 text-center font-semibold text-slate-700">{n}</td>
                      <td className="p-3 text-slate-700">
                        {telValido ? (
                          <a href={`tel:${tel.replace(/\s/g, '')}`} className="inline-flex items-center gap-1 text-sky-700 hover:underline">
                            <Phone className="w-3.5 h-3.5" /> {tel}
                            {a.nombre_tutor && a.nombre_tutor !== 'Tutor Legal' ? <span className="text-slate-500"> ({a.nombre_tutor})</span> : null}
                          </a>
                        ) : (
                          <span className="text-slate-400">Sin teléfono</span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        {n > 0 && (
                          <button
                            type="button"
                            onClick={() => setAlumnoFiltro(alumnoFiltro === a.id_alumno ? '' : a.id_alumno)}
                            className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${alumnoFiltro === a.id_alumno ? 'bg-sky-600 text-white' : 'bg-sky-50 text-sky-800 border border-sky-200 hover:bg-sky-100'}`}
                          >
                            {alumnoFiltro === a.id_alumno ? 'Ver todos' : 'Ver sus partes'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Partes */}
      <div className="bg-white border border-sky-100 rounded-2xl shadow-xs">
        <div className="px-5 py-3 border-b border-sky-100 text-sm font-bold text-slate-800 flex items-center justify-between gap-2">
          <span>
            {alumnoFiltro
              ? `Partes de ${alumnoPorId.get(alumnoFiltro)?.nombre || ''} ${alumnoPorId.get(alumnoFiltro)?.apellidos || ''}`
              : 'Todos los partes del grupo'}{' '}
            ({partesVisibles.length})
          </span>
          {alumnoFiltro && (
            <button type="button" onClick={() => setAlumnoFiltro('')} className="text-xs text-sky-700 hover:underline cursor-pointer">
              Quitar filtro
            </button>
          )}
        </div>
        {partesVisibles.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">No hay partes registrados.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {partesVisibles.map((s) => {
              const al = alumnoPorId.get(s.id_alumno);
              const desplegado = abierto === s.id_sancion;
              return (
                <li key={s.id_sancion} className="p-4">
                  <button
                    type="button"
                    onClick={() => setAbierto(desplegado ? null : s.id_sancion)}
                    className="w-full text-left flex items-start justify-between gap-3 cursor-pointer"
                  >
                    <div className="space-y-0.5">
                      <div className="text-sm font-semibold text-slate-900">
                        {nuevosIds?.has(s.id_sancion) && (
                          <span className="mr-1.5 px-1.5 py-0.5 rounded bg-indigo-600 text-white text-[10px] font-bold uppercase align-middle">Nuevo</span>
                        )}
                        {al ? `${al.apellidos}, ${al.nombre}` : 'Alumno/a'} · <span className="text-slate-700 font-medium">{tituloConducta(s.codigo_infraccion)}</span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {fechaLegible(s.fecha)} {s.hora_incidente ? `· ${s.hora_incidente}` : ''} · Puesto por {s.nombre_profesor || '—'}
                        {s.materia ? ` · ${s.materia}` : ''} · {ESTADO_TRAMITACION[s.estado_tramitacion] || s.estado_tramitacion}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${s.puntos_restados > 0 ? 'bg-rose-50 text-rose-800 border border-rose-200' : 'bg-slate-100 text-slate-600'}`}>
                        {s.puntos_restados > 0 ? `−${s.puntos_restados}` : '0'} pts
                      </span>
                      {desplegado ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </div>
                  </button>
                  {desplegado && (
                    <div className="mt-3 grid gap-2 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <div><strong>Hechos:</strong> {s.descripcion_hechos || '—'}</div>
                      {(s.medida_inmediata_texto || s.medida_inmediata) && (
                        <div><strong>Medida inmediata:</strong> {s.medida_inmediata_texto || s.medida_inmediata}</div>
                      )}
                      {s.ubicacion && <div><strong>Lugar:</strong> {s.ubicacion}</div>}
                      {s.derivado_pac && (
                        <div><strong>Aula PAC:</strong> {ESTADO_PAC[s.estado_pac] || s.estado_pac}{s.tareas_enviadas_pac ? ` · Tareas: ${s.tareas_enviadas_pac}` : ''}</div>
                      )}
                      {s.observaciones_tramitacion && <div><strong>Observaciones de tramitación:</strong> {s.observaciones_tramitacion}</div>}
                      {s.saldo_anterior !== undefined && s.saldo_resultante !== undefined && (
                        <div><strong>Carnet:</strong> {s.saldo_anterior} → {s.saldo_resultante} puntos</div>
                      )}
                      <div className="text-[11px] text-slate-500">Expediente {s.numero_expediente}</div>
                      <div>
                        <button
                          type="button"
                          onClick={() => onPrintParte(s)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg font-semibold cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" /> Imprimir parte
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};
