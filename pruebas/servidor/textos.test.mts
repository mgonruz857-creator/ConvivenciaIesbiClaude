// Recuperación del texto original de partes reconstruidos por la v1, desde versiones de Drive (simuladas)
const { crearServidor } = await import('./simulador.mts');
const { generarServidorAppsScript } = await import('../../src/services/appsScriptServidor.ts');
let fallos = 0; const ok = (t: string, c: boolean, x = '') => { if (!c) fallos++; console.log(`${c ? 'OK   ' : 'FALLO'} ${t}${x ? ' → ' + x : ''}`); };
const ADMIN = 'mgonruz857@g.educaand.es';
const original = (exp: string, al: string, texto: string) => ({ id_sancion: 'snc-' + exp, numero_expediente: exp, id_alumno: al, id_profesor: 'p', puntos_restados: 2, fecha: '2026-10-06', descripcion_hechos: texto });
const reconstruido = (exp: string, al: string) => ({ id_sancion: 'snc-rec-' + exp, numero_expediente: exp, id_alumno: al, id_profesor: 'p', puntos_restados: 2, fecha: '2026-10-06', descripcion_hechos: 'Incidencia registrada según tipificación ROF (LEV). Medida adoptada: X.' });
const actual = { profesores: [{ id_profesor: 'prof-01', email: ADMIN, rol: 'ROLE_CONVIVENCIA_ADMIN', estado: 'ACTIVO' }], alumnos: [],
  sanciones: [reconstruido('E1', 'a1'), reconstruido('E2', 'a2'), reconstruido('E3', 'a3'), original('E9', 'a9', 'normal')], deleted_sanciones: [] };
const versiones: Record<string, any> = {
  r1: { modifiedTime: '2026-10-06T10:00:00Z', d: { sanciones: [original('E1', 'a1', 'Texto real 1')] } },
  r2: { modifiedTime: '2026-10-07T10:00:00Z', d: { sanciones: [original('E1', 'a1', 'Texto real 1 corregido'), original('E2', 'a2', 'Texto real 2'), original('E3', 'otro', 'no es el mismo alumno')] } },
  r3: { modifiedTime: '2026-10-08T10:00:00Z', texto: 'esto no es json' },
};
let llamadas = 0;
const UrlFetchApp = { fetch: (url: string) => {
  llamadas++;
  const m = /revisions\/(\w+)\?alt=media/.exec(url);
  if (m) { const v = versiones[m[1]]; return { getResponseCode: () => 200, getContentText: () => v.texto ?? JSON.stringify(v.d) }; }
  return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ revisions: Object.keys(versiones).map(id => ({ id, modifiedTime: versiones[id].modifiedTime })) }) };
} };
const srv = crearServidor(generarServidorAppsScript(), actual, { extra: { UrlFetchApp, ScriptApp: { getOAuthToken: () => 'tok' } } });
srv.post({ accion: 'estadoCuenta', email: ADMIN });
const antes = srv.archivos['DB'];
srv.ctx.buscarTextosEnVersiones();
ok('el paso 1 no modifica el archivo de datos', srv.archivos['DB'] === antes);
const prog = JSON.parse(srv.archivos['RECUPERACION_TEXTOS_PARTES.json']);
ok('encuentra 2 de 3 textos (el tercero era de otro alumno)', Object.keys(prog.textos).length === 2);
ok('se queda con el texto más reciente', prog.textos['snc-rec-E1'].texto === 'Texto real 1 corregido');
ok('una versión ilegible no detiene la búsqueda', Object.keys(prog.leidas).length === 3);
const n = llamadas; srv.ctx.buscarTextosEnVersiones();
ok('al repetir no vuelve a descargar lo ya leído', llamadas === n + 1);
srv.ctx.aplicarTextosRecuperados();
const db = JSON.parse(srv.archivos['DB']);
const s = (id: string) => db.sanciones.find((x: any) => x.id_sancion === id);
ok('paso 2: textos aplicados', s('snc-rec-E1').descripcion_hechos === 'Texto real 1 corregido' && s('snc-rec-E2').descripcion_hechos === 'Texto real 2');
ok('...el que no se encontró queda igual', s('snc-rec-E3').descripcion_hechos.startsWith('Incidencia registrada'));
ok('...no cambian puntos ni ningún otro parte', s('snc-rec-E1').puntos_restados === 2 && s('snc-E9').descripcion_hechos === 'normal' && db.sanciones.length === 4);
ok('...y queda anotado en el registro', db.audit_logs.some((l: any) => l.entidad === 'Partes/TextosRecuperados'));
srv.ctx.aplicarTextosRecuperados();
ok('aplicarlo dos veces no cambia nada más', JSON.parse(srv.archivos['DB']).sanciones.length === 4);
console.log(fallos ? `\n${fallos} FALLOS` : '\nTodo correcto');
