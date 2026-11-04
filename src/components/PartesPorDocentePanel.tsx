/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { UserCheck, ChevronDown, ChevronUp, Download } from 'lucide-react';
import { Sancion, Profesor } from '../types/convivencia';
import { hoyLocal } from '../services/carnetPuntos';

export type PeriodoDocentes = 'HOY' | 'SEMANA' | 'MES' | 'CURSO';

export interface FilaDocente {
  clave: string;
  nombre: string;
  departamento: string;
  total: number;
  leves: number;
  graves: number;
  muyGraves: number;
  puntos: number;
  ultimaFecha: string;
}

const fechaLocal = (d: Date): string => {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};

/** Primer día (AAAA-MM-DD) del periodo, o '' para todo el curso. */
export function inicioPeriodo(periodo: PeriodoDocentes, hoy: string = hoyLocal()): string {
  if (periodo === 'CURSO') return '';
  if (periodo === 'HOY') return hoy;
  const [y, m, d] = hoy.split('-').map(Number);
  if (periodo === 'MES') return `${y}-${String(m).padStart(2, '0')}-01`;
  // Semana: desde el lunes de la semana actual
  const fecha = new Date(y, m - 1, d);
  const diasDesdeLunes = (fecha.getDay() + 6) % 7;
  fecha.setDate(fecha.getDate() - diasDesdeLunes);
  return fechaLocal(fecha);
}

/** Clave de agrupación: el identificador del docente o, si falta, su nombre. */
export const claveDocente = (s: Sancion): string =>
  (s.id_profesor || '').trim().toLowerCase() || `nombre:${(s.nombre_profesor || 'sin docente').trim().toLowerCase()}`;

export function recuentoPorDocente(
  sanciones: Sancion[],
  profesores: Profesor[],
  periodo: PeriodoDocentes,
  hoy: string = hoyLocal()
): FilaDocente[] {
  const desde = inicioPeriodo(periodo, hoy);
  const profMap = new Map<string, Profesor>();
  profesores.forEach(p => {
    if (p.id_profesor) profMap.set(p.id_profesor.trim().toLowerCase(), p);
    if (p.email) profMap.set(p.email.trim().toLowerCase(), p);
  });

  const filas = new Map<string, FilaDocente>();
  sanciones.forEach(s => {
    if (desde && (s.fecha < desde || s.fecha > hoy)) return;
    const clave = claveDocente(s);
    let fila = filas.get(clave);
    if (!fila) {
      const prof = profMap.get((s.id_profesor || '').trim().toLowerCase());
      fila = {
        clave,
        nombre: prof ? `${prof.apellidos}, ${prof.nombre}`.replace(/^,\s*/, '') : (s.nombre_profesor || 'Sin docente'),
        departamento: prof?.departamento || '',
        total: 0, leves: 0, graves: 0, muyGraves: 0, puntos: 0, ultimaFecha: '',
      };
      filas.set(clave, fila);
    }
    fila.total += 1;
    fila.puntos += s.puntos_restados || 0;
    if (s.puntos_restados <= 3) fila.leves += 1;
    else if (s.puntos_restados <= 6) fila.graves += 1;
    else fila.muyGraves += 1;
    if (s.fecha > fila.ultimaFecha) fila.ultimaFecha = s.fecha;
  });

  return Array.from(filas.values()).sort(
    (a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, 'es')
  );
}

const ETIQUETAS: Record<PeriodoDocentes, string> = {
  HOY: 'Hoy',
  SEMANA: 'Esta semana',
  MES: 'Este mes',
  CURSO: 'Todo el curso',
};

const formatoFecha = (f: string) => (f ? f.split('-').reverse().join('/') : '');

interface Props {
  sanciones: Sancion[];
  profesores: Profesor[];
  docenteSeleccionado: string;
  onSeleccionarDocente: (clave: string, nombre: string) => void;
}

const FILAS_INICIALES = 8;

export const PartesPorDocentePanel: React.FC<Props> = ({
  sanciones,
  profesores,
  docenteSeleccionado,
  onSeleccionarDocente,
}) => {
  const [periodo, setPeriodo] = useState<PeriodoDocentes>('CURSO');
  const [verTodos, setVerTodos] = useState(false);

  const filas = useMemo(
    () => recuentoPorDocente(sanciones, profesores, periodo),
    [sanciones, profesores, periodo]
  );
  const totalPartes = filas.reduce((acc, f) => acc + f.total, 0);
  const maximo = filas.length > 0 ? filas[0].total : 0;
  const visibles = verTodos ? filas : filas.slice(0, FILAS_INICIALES);

  const exportarCsv = () => {
    const cab = ['Docente', 'Departamento', 'Partes', 'Leves', 'Graves', 'Muy graves', 'Puntos restados', 'Último parte'];
    const lineas = filas.map(f => [
      f.nombre, f.departamento, f.total, f.leves, f.graves, f.muyGraves, f.puntos, formatoFecha(f.ultimaFecha),
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'));
    const csv = '﻿' + [cab.join(';'), ...lineas].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `partes_por_docente_${ETIQUETAS[periodo].toLowerCase().replace(/ /g, '_')}_${hoyLocal()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs" data-testid="partes-por-docente">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-sky-700" />
          <div>
            <h2 className="text-sm font-bold text-slate-900">Partes por docente</h2>
            <p className="text-[11px] text-slate-500">
              {totalPartes} {totalPartes === 1 ? 'parte' : 'partes'} de {filas.length}{' '}
              {filas.length === 1 ? 'docente' : 'docentes'} · {ETIQUETAS[periodo].toLowerCase()}.
              Pulsa un docente para ver sus partes abajo.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 px-1.5 py-1 rounded-lg border border-slate-200">
            {(Object.keys(ETIQUETAS) as PeriodoDocentes[]).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriodo(p)}
                className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                  periodo === p
                    ? 'bg-sky-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                }`}
              >
                {ETIQUETAS[p]}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={exportarCsv}
            disabled={filas.length === 0}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-semibold rounded-lg disabled:opacity-50 cursor-pointer"
            title="Descargar el recuento en formato CSV (Excel / Calc)"
          >
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
        </div>
      </div>

      {filas.length === 0 ? (
        <p className="text-xs text-slate-500 pt-3">No hay partes en este periodo.</p>
      ) : (
        <div className="pt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[11px] text-slate-500 uppercase tracking-wider text-left">
                <th className="py-1.5 pr-2 font-bold">Docente</th>
                <th className="py-1.5 px-2 font-bold text-right">Partes</th>
                <th className="py-1.5 px-2 font-bold w-1/4 hidden sm:table-cell"></th>
                <th className="py-1.5 px-2 font-bold text-center" title="Leves · Graves · Muy graves">L · G · MG</th>
                <th className="py-1.5 px-2 font-bold text-right hidden md:table-cell">Puntos</th>
                <th className="py-1.5 pl-2 font-bold text-right hidden md:table-cell">Último</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibles.map(f => {
                const activo = docenteSeleccionado === f.clave;
                return (
                  <tr
                    key={f.clave}
                    onClick={() => onSeleccionarDocente(activo ? '' : f.clave, f.nombre)}
                    className={`cursor-pointer transition-colors ${activo ? 'bg-sky-100/70' : 'hover:bg-sky-50/50'}`}
                    title={activo ? 'Quitar el filtro de este docente' : 'Ver los partes de este docente'}
                  >
                    <td className="py-1.5 pr-2">
                      <div className="font-semibold text-slate-900">{f.nombre}</div>
                      {f.departamento && <div className="text-[11px] text-slate-500">{f.departamento}</div>}
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono font-bold text-slate-900 tabular-nums">{f.total}</td>
                    <td className="py-1.5 px-2 hidden sm:table-cell">
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-sky-500 rounded-full"
                          style={{ width: `${maximo ? (f.total / maximo) * 100 : 0}%` }}
                        />
                      </div>
                    </td>
                    <td className="py-1.5 px-2 text-center font-mono text-slate-700 whitespace-nowrap">
                      {f.leves} · {f.graves} · {f.muyGraves}
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono text-rose-700 hidden md:table-cell">
                      {f.puntos > 0 ? `-${f.puntos}` : '0'}
                    </td>
                    <td className="py-1.5 pl-2 text-right font-mono text-slate-500 hidden md:table-cell">
                      {formatoFecha(f.ultimaFecha)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filas.length > FILAS_INICIALES && (
            <button
              type="button"
              onClick={() => setVerTodos(v => !v)}
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 hover:underline cursor-pointer"
            >
              {verTodos ? (
                <><ChevronUp className="w-3.5 h-3.5" /> Ver menos</>
              ) : (
                <><ChevronDown className="w-3.5 h-3.5" /> Ver los {filas.length} docentes</>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
