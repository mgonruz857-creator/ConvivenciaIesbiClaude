import React, { useMemo, useState } from 'react';
import { FileBarChart2, X, Download, Printer } from 'lucide-react';
import { Alumno, Profesor, Sancion, LISTA_GRUPOS_OFICIALES } from '../types/convivencia';
import { StorageService } from '../services/storageService';
import { AuthService } from '../services/authService';
import { GoogleDriveSyncService } from '../services/googleDriveSyncService';

/**
 * Informe para Jefatura/Convivencia tras pasar a la versión nueva de la app:
 *  - saldo de cada alumno/a en la versión anterior frente al saldo actual (la recuperación
 *    semanal automática hace que muchos recuperen puntos de golpe);
 *  - partes cuyo docente no se reconoce (no aparecerían en "Mis partes" de nadie).
 */

interface Props {
  alumnos: Alumno[];
  sanciones: Sancion[];
  profesores: Profesor[];
  /** Para refrescar la app tras recuperar un parte */
  onCambio?: () => void;
}

const CLAVE_OCULTO = 'sigc_bi_informe_v2_oculto';

const etiquetaGrupo = (g: string) => LISTA_GRUPOS_OFICIALES.find((x) => x.codigo === g)?.etiqueta || g;

function leerOculto(): string {
  try {
    return localStorage.getItem(CLAVE_OCULTO) || '';
  } catch {
    return '';
  }
}

export const InformeCambioVersion: React.FC<Props> = ({ alumnos, sanciones, profesores, onCambio }) => {
  const snapshot = StorageService.getSaldosAntesV2();
  const [abierto, setAbierto] = useState(false);
  const [oculto, setOculto] = useState(leerOculto());

  const cambios = useMemo(() => {
    if (!snapshot) return [];
    return alumnos
      .filter((a) => a && snapshot.saldos[a.id_alumno] !== undefined && !isNaN(Number(snapshot.saldos[a.id_alumno])))
      .map((a) => {
        const antes = Number(snapshot.saldos[a.id_alumno]);
        const ahora = Number(a.puntos_actuales);
        return { a, antes, ahora, dif: ahora - antes };
      })
      .filter((x) => x.dif !== 0)
      .sort((x, y) => y.dif - x.dif || x.a.grupo.localeCompare(y.a.grupo) || x.a.apellidos.localeCompare(y.a.apellidos));
  }, [snapshot, alumnos]);

  const huerfanos = useMemo(() => {
    const ids = new Set(profesores.map((p) => p.id_profesor));
    return sanciones.filter((s) => s && (!s.id_profesor || !ids.has(s.id_profesor)));
  }, [sanciones, profesores]);

  // Partes que la versión anterior marcó como borrados pero seguían guardados (pendientes de decidir)
  const marcados = useMemo(() => {
    const activos = new Set(sanciones.map((s) => s.id_sancion));
    return StorageService.getPartesMarcadosBorradosV2().filter((s) => !activos.has(s.id_sancion));
  }, [sanciones]);
  const [, refrescar] = useState(0);
  const recuperarTodos = () => {
    if (!window.confirm(`¿Recuperar los ${marcados.length} partes de la lista? Volverán a contar en el carnet de cada alumno/a.`)) return;
    const email = AuthService.getCurrentUser()?.email || '';
    let n = 0;
    marcados.forEach((s) => { if (StorageService.recuperarParteMarcadoBorrado(s.id_sancion, email)) n++; });
    if (n) {
      onCambio?.();
      GoogleDriveSyncService.triggerFastSync(100);
      refrescar((x) => x + 1);
    }
  };
  const recuperar = (s: Sancion) => {
    const nombre = nombreAlumno(s.id_alumno);
    if (!window.confirm(`¿Recuperar el parte del ${s.fecha} de ${nombre}? Volverá a contar en su carnet.`)) return;
    if (StorageService.recuperarParteMarcadoBorrado(s.id_sancion, AuthService.getCurrentUser()?.email || '')) {
      onCambio?.();
      GoogleDriveSyncService.triggerFastSync(100);
      refrescar((n) => n + 1);
    }
  };

  const nombreAlumno = (id: string) => {
    const a = alumnos.find((x) => x.id_alumno === id);
    return a ? `${a.apellidos}, ${a.nombre} (${etiquetaGrupo(a.grupo)})` : id;
  };

  if (!snapshot) return null;
  if (cambios.length === 0 && huerfanos.length === 0 && marcados.length === 0) return null;
  const fechaInforme = snapshot.fecha ? new Date(snapshot.fecha).toLocaleString('es-ES') : '';

  const descargarCsv = () => {
    const q = (t: unknown) => `"${String(t ?? '').replace(/"/g, '""')}"`;
    const filas = [
      ['Grupo', 'Apellidos', 'Nombre', 'Saldo en la versión anterior', 'Saldo actual', 'Diferencia'].map(q).join(';'),
      ...cambios.map((c) => [etiquetaGrupo(c.a.grupo), c.a.apellidos, c.a.nombre, c.antes, c.ahora, c.dif > 0 ? `+${c.dif}` : c.dif].map(q).join(';')),
    ];
    const blob = new Blob(['﻿' + filas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = 'Informe_cambio_de_saldos.csv';
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const imprimir = () => {
    const esc = (t: unknown) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
    const v = window.open('', '_blank');
    if (!v) return;
    v.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Informe de cambio de saldos</title>
      <style>body{font-family:Arial,sans-serif;font-size:12px;margin:24px}table{border-collapse:collapse;width:100%}
      th,td{border:1px solid #999;padding:4px 6px;text-align:left}th{background:#eee}td.n{text-align:center}</style></head><body>
      <h2>Informe de cambio de saldos tras la actualización de la app</h2>
      <p>Saldos de la versión anterior anotados el ${esc(fechaInforme)}. La diferencia se debe sobre todo a la recuperación
      semanal automática (+1 punto por cada 7 días naturales sin partes que resten puntos).</p>
      <table><thead><tr><th>Grupo</th><th>Alumno/a</th><th>Antes</th><th>Ahora</th><th>Diferencia</th></tr></thead><tbody>
      ${cambios.map((c) => `<tr><td>${esc(etiquetaGrupo(c.a.grupo))}</td><td>${esc(c.a.apellidos)}, ${esc(c.a.nombre)}</td>
        <td class="n">${c.antes}</td><td class="n">${c.ahora}</td><td class="n">${c.dif > 0 ? '+' : ''}${c.dif}</td></tr>`).join('')}
      </tbody></table></body></html>`);
    v.document.close();
    v.focus();
    v.print();
  };

  const ocultar = () => {
    try {
      localStorage.setItem(CLAVE_OCULTO, snapshot.fecha);
    } catch {
      /* sin almacenamiento: se oculta solo en esta sesión */
    }
    setOculto(snapshot.fecha);
  };

  return (
    <>
      {oculto !== snapshot.fecha && (
        <div className="w-full bg-indigo-50 border-b border-indigo-200 text-indigo-900 text-sm px-4 py-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <span className="flex items-center gap-2">
            <FileBarChart2 className="w-4 h-4 shrink-0" />
            Actualización de la app: {cambios.length} alumno/a(s) con saldo distinto al de la versión anterior
            {marcados.length > 0 ? ` · ${marcados.length} parte(s) borrado(s) por revisar` : ''}
            {huerfanos.length > 0 ? ` · ${huerfanos.length} parte(s) sin docente reconocido` : ''}.
          </span>
          <span className="flex gap-3">
            <button onClick={() => setAbierto(true)} className="font-semibold underline">Ver informe</button>
            <button onClick={ocultar} className="text-indigo-700/80 underline">Ocultar aviso</button>
          </span>
        </div>
      )}

      {abierto && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-start sm:items-center justify-center p-2 sm:p-6" role="dialog" aria-modal="true">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col">
            <div className="flex items-start justify-between gap-3 p-4 border-b">
              <div>
                <h2 className="font-bold text-slate-900">Informe del cambio de versión</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Saldos de la versión anterior anotados el {fechaInforme}. La diferencia se debe sobre todo a la
                  recuperación semanal automática (+1 punto cada 7 días naturales sin partes que resten puntos).
                </p>
              </div>
              <button onClick={() => setAbierto(false)} aria-label="Cerrar" className="p-1 text-slate-500 hover:text-slate-900">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-4 space-y-6">
              <section>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-slate-800">Saldos que cambian ({cambios.length})</h3>
                  <div className="flex gap-2">
                    <button onClick={descargarCsv} className="flex items-center gap-1 text-xs border rounded px-2 py-1 hover:bg-slate-50">
                      <Download className="w-3.5 h-3.5" /> Descargar (Excel/CSV)
                    </button>
                    <button onClick={imprimir} className="flex items-center gap-1 text-xs border rounded px-2 py-1 hover:bg-slate-50">
                      <Printer className="w-3.5 h-3.5" /> Imprimir
                    </button>
                  </div>
                </div>
                {cambios.length === 0 ? (
                  <p className="text-sm text-slate-500">Ningún saldo ha cambiado.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-slate-500 border-b">
                          <th className="py-1 pr-2">Grupo</th>
                          <th className="py-1 pr-2">Alumno/a</th>
                          <th className="py-1 px-2 text-center">Antes</th>
                          <th className="py-1 px-2 text-center">Ahora</th>
                          <th className="py-1 pl-2 text-center">Diferencia</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cambios.map((c) => (
                          <tr key={c.a.id_alumno} className="border-b last:border-0">
                            <td className="py-1 pr-2 whitespace-nowrap">{etiquetaGrupo(c.a.grupo)}</td>
                            <td className="py-1 pr-2">{c.a.apellidos}, {c.a.nombre}</td>
                            <td className="py-1 px-2 text-center">{c.antes}</td>
                            <td className="py-1 px-2 text-center font-semibold">{c.ahora}</td>
                            <td className={`py-1 pl-2 text-center font-semibold ${c.dif > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                              {c.dif > 0 ? `+${c.dif}` : c.dif}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {marcados.length > 0 && (
                <section>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                    <h3 className="font-semibold text-slate-800">Partes borrados por revisar ({marcados.length})</h3>
                    {marcados.length > 1 && (
                      <button onClick={recuperarTodos} className="text-xs font-semibold border border-indigo-300 text-indigo-800 rounded px-2 py-1 hover:bg-indigo-50">
                        Recuperar todos
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mb-2">
                    La versión anterior tenía estos partes marcados como borrados, pero seguían guardados (por eso a
                    veces aparecían y otras no). Ahora están borrados y no cuentan en el carnet. Si alguno no se
                    borró a propósito, pulse «Recuperar».
                  </p>
                  <ul className="text-sm divide-y border rounded">
                    {marcados.map((s) => (
                      <li key={s.id_sancion} className="px-3 py-1.5 flex flex-wrap items-center justify-between gap-2">
                        <span>
                          {s.fecha} · {nombreAlumno(s.id_alumno)} · {s.codigo_infraccion} ({s.puntos_restados} pt) · Puesto por: {s.nombre_profesor || '—'}
                        </span>
                        <button onClick={() => recuperar(s)} className="text-xs font-semibold border border-indigo-300 text-indigo-800 rounded px-2 py-0.5 hover:bg-indigo-50">
                          Recuperar
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {huerfanos.length > 0 && (
                <section>
                  <h3 className="font-semibold text-slate-800 mb-1">Partes sin docente reconocido ({huerfanos.length})</h3>
                  <p className="text-xs text-slate-500 mb-2">
                    El docente de estos partes no coincide con ninguno del claustro (por ejemplo, porque se le dio de
                    baja y se volvió a dar de alta). Los partes cuentan igual en el carnet, pero no aparecen en
                    "Mis partes" de ningún docente. Avise a Claude o corríjalos editando el parte.
                  </p>
                  <ul className="text-sm divide-y border rounded">
                    {huerfanos.map((s) => (
                      <li key={s.id_sancion} className="px-3 py-1.5">
                        {s.fecha} · {nombreAlumno(s.id_alumno)} · Puesto por: {s.nombre_profesor || '—'}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
