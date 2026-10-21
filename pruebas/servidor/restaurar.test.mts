// Archivo de datos vacío (21/10/2026): restaurar la última versión válida y protección al escribir
const { crearServidor } = await import('./simulador.mts');
const { generarServidorAppsScript } = await import('../../src/services/appsScriptServidor.ts');
let fallos = 0; const ok = (t: string, c: boolean, x = '') => { if (!c) fallos++; console.log(`${c ? 'OK   ' : 'FALLO'} ${t}${x ? ' → ' + x : ''}`); };
const ADMIN = 'mgonruz857@g.educaand.es';
const db = (n: number) => ({ profesores: [{ id_profesor: 'prof-01', email: ADMIN, rol: 'ROLE_CONVIVENCIA_ADMIN', estado: 'ACTIVO' }],
  alumnos: [{ id_alumno: 'a1', nombre: 'L', grupo: '1ESO_A' }], sanciones: Array.from({ length: n }, (_, i) => ({ id_sancion: 's' + i, id_alumno: 'a1', puntos_restados: 1 })), deleted_sanciones: [] });
const versiones: any[] = [
  { id: 'r1', modifiedTime: '2026-10-21T12:00:00Z', texto: JSON.stringify(db(70)) },
  { id: 'r2', modifiedTime: '2026-10-21T14:10:00Z', texto: JSON.stringify(db(71)) },
  { id: 'r3', modifiedTime: '2026-10-21T14:19:00Z', texto: '' },
];
const UrlFetchApp = { fetch: (url: string) => {
  const m = /revisions\/(\w+)\?alt=media/.exec(url);
  if (m) { const v = versiones.find(x => x.id === m[1]); return { getResponseCode: () => 200, getContentText: () => v.texto }; }
  return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ revisions: versiones.map(v => ({ id: v.id, modifiedTime: v.modifiedTime, size: String(v.texto.length) })) }) };
} };
const srv = crearServidor(generarServidorAppsScript(), db(71), { extra: { UrlFetchApp, ScriptApp: { getOAuthToken: () => 't' } } });
srv.post({ accion: 'estadoCuenta', email: ADMIN });
// el archivo se queda vacío
srv.tocarExterno({}); srv.archivos['DB'] = ''; for (const k of [...srv.cache.keys()]) if (k.startsWith('DB2')) srv.cache.delete(k);
const r = srv.post({ accion: 'estadoCuenta', email: ADMIN });
ok('con el archivo vacío el servidor se detiene (BD_ILEGIBLE)', r.codigo === 'BD_ILEGIBLE', JSON.stringify(r).slice(0, 80));
srv.ctx.revisarVersionesDatos();
ok('revisar no cambia nada', srv.archivos['DB'] === '');
srv.ctx.restaurarUltimaVersionValida();
const d = JSON.parse(srv.archivos['DB'] || '{}');
ok('restaura la versión válida más reciente (71 partes, no la de 70)', d.sanciones?.length === 71, String(d.sanciones?.length));
ok('guarda una copia de la versión restaurada', Object.keys(srv.archivos).some(k => k.startsWith('COPIA_RESTAURACION_')));
ok('después la app vuelve a funcionar', srv.post({ accion: 'estadoCuenta', email: ADMIN }).ok === true);
const antes = srv.archivos['DB'];
srv.ctx.restaurarUltimaVersionValida();
ok('si el archivo se lee bien, restaurar no hace nada', srv.archivos['DB'] === antes);
// protección al escribir: Drive deja el archivo vacío una vez → se reescribe
const clave = 'Clave-Segura-2026';
srv.post({ accion: 'login', email: ADMIN, clave, clave2: clave });
const lg = srv.post({ accion: 'login', email: ADMIN, clave });
srv.drive.fallosEscritura = 1;
const g = srv.post({ accion: 'guardar', token: lg.token, data: JSON.parse(srv.archivos['DB']) });
ok('si Drive deja el archivo vacío al guardar, se vuelve a escribir', g.ok === true && JSON.parse(srv.archivos['DB']).sanciones.length === 71, JSON.stringify(g).slice(0, 120));
srv.drive.fallosEscritura = 2;
const g2 = srv.post({ accion: 'guardar', token: lg.token, data: JSON.parse(srv.archivos['DB']) });
ok('si vuelve a fallar, da error (la app conserva los cambios para reenviarlos)', g2.ok === false && g2.codigo === 'ESCRITURA_FALLIDA', JSON.stringify(g2).slice(0, 120));
console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTodo correcto'); process.exit(fallos ? 1 : 0);
