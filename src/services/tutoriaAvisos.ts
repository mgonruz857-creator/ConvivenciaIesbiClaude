/**
 * Aviso de partes nuevos en la tutoría: el servidor guarda qué partes de su grupo ha visto ya
 * cada tutor/a en «Mi Tutoría» (así el aviso se sincroniza entre dispositivos).
 */
import { llamarApi } from './apiService';
import { AuthService } from './authService';
import { Alumno, Sancion } from '../types/convivencia';

/** Misma clave corta que usa el servidor (final del identificador). */
export const claveVisto = (id: string) => String(id || '').slice(-10);

export interface VistosTutoria { grupo: string; vistos: Set<string>; }

export async function obtenerVistosTutoria(): Promise<VistosTutoria | null> {
  const r = await llamarApi('tutoriaVistos', { token: AuthService.getToken() }, 30000);
  if (!r.ok) return null;
  return { grupo: String(r.grupo || ''), vistos: new Set<string>(Array.isArray(r.vistos) ? r.vistos : []) };
}

export async function marcarTutoriaVista(ids: string[]): Promise<VistosTutoria | null> {
  const r = await llamarApi('marcarTutoriaVista', { token: AuthService.getToken(), ids }, 30000);
  if (!r.ok) return null;
  return { grupo: String(r.grupo || ''), vistos: new Set<string>(Array.isArray(r.vistos) ? r.vistos : []) };
}

/** Partes del grupo (alumnado que no está de baja), como los muestra «Mi Tutoría». */
export function partesDelGrupo(grupo: string, alumnos: Alumno[], sanciones: Sancion[]): Sancion[] {
  if (!grupo) return [];
  const ids = new Set(alumnos.filter((a) => a.grupo === grupo && a.estado !== 'BAJA').map((a) => a.id_alumno));
  return sanciones.filter((s) => ids.has(s.id_alumno));
}
