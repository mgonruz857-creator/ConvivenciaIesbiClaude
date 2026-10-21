// Copias de seguridad diarias (lunes a viernes 22:00, se conservan 14) y su restauración
const { crearServidor } = await import('./simulador.mts');
const { generarServidorAppsScript } = await import('../../src/services/appsScriptServidor.ts');
let fallos = 0; const ok = (t: string, c: boolean, x = '') => { if (!c) fallos++; console.log(`${c ? 'OK   ' : 'FALLO'} ${t}${x ? ' → ' + x : ''}`); };
const ADMIN = 'mgonruz857@g.educaand.es';
const db = (n: number) => ({ profesores: [{ id_profesor: 'prof-01', email: ADMIN, rol: 'ROLE_CONVIVENCIA_ADMIN', estado: 'ACTIVO' }],
  alumnos: [{ id_alumno: 'a1', nombre: 'L', grupo: '1ESO_A' }], sanciones: Array.from({ length: n }, (_, i) => ({ id_sancion: 's' + i, id_alumno: 'a1', puntos_restados: 1 })), deleted_sanciones: [] });
let tareas: any[] = [];
const ScriptApp = {
  getProjectTriggers: () => tareas.map(t => ({ getHandlerFunction: () => t.f, _t: t })),
  deleteTrigger: (x: any) => { tareas = tareas.filter(t => t !== x._t); },
  newTrigger: (f: string) => { const t: any = { f }; const b: any = { timeBased: () => b, everyDays: (n: number) => (t.cada = n, b), atHour: (h: number) => (t.hora = h, b), inTimezone: (z: string) => (t.zona = z, b), create: () => { tareas.push(t); return t; } }; return b; },
};
const srv = crearServidor(generarServidorAppsScript(), db(100), { extra: { ScriptApp } });
srv.post({ accion: 'estadoCuenta', email: ADMIN });
const copias = () => Object.keys(srv.archivos).filter(k => k.startsWith('COPIAS_SEGURIDAD/COPIA_DIARIA_')).sort();
const ultimoLog = () => (srv.drive.logs || []).slice(-1)[0] || '';
const RealDate = Date;
const fijar = (iso: string) => { const D: any = class extends RealDate { constructor(...a: any[]) { super(...((a.length ? a : [iso]) as [any])); } static now() { return new RealDate(iso).getTime(); } static UTC = RealDate.UTC; }; srv.ctx.Date = D; };
const soltar = () => { srv.ctx.Date = RealDate; };

fijar('2026-10-21T20:05:00Z'); srv.ctx.activarCopiasDiarias(); soltar();
ok('activar crea la tarea diaria de las 22 h (hora de Madrid)', tareas.some(t => t.f === 'copiaSeguridadDiaria' && t.hora === 22 && t.zona === 'Europe/Madrid'));
ok('y hace la primera copia en la subcarpeta COPIAS_SEGURIDAD', JSON.stringify(copias()) === '["COPIAS_SEGURIDAD/COPIA_DIARIA_2026-10-21.json"]', JSON.stringify(copias()));
ok('la copia es idéntica al archivo de datos', srv.archivos['COPIAS_SEGURIDAD/COPIA_DIARIA_2026-10-21.json'] === srv.archivos['DB']);
// 20 días seguidos (la tarea automática solo de lunes a viernes)
for (let i = 1; i <= 20; i++) { fijar(new RealDate(RealDate.UTC(2026, 9, 21 + i, 20, 5)).toISOString()); srv.ctx.copiaSeguridadDiaria({ triggerUid: 'x' }); soltar(); }
const cs = copias();
ok('no hay copias de sábado ni domingo', !cs.some(k => ['2026-10-24', '2026-10-25', '2026-10-31', '2026-11-01'].some(f => k.includes(f))));
ok('se conservan solo las 14 más recientes', cs.length === 14, String(cs.length));
ok('las antiguas van a la papelera (recuperables)', Object.keys(srv.drive.papelera || {}).some(k => k.includes('2026-10-21')));
ok('la más reciente es la del 10/11', cs[cs.length - 1].includes('2026-11-10'), cs[cs.length - 1]);
// archivo vacío: no se copia
const bueno = srv.archivos['DB'];
srv.archivos['DB'] = '';
let error1 = ''; fijar('2026-11-11T21:05:00Z'); try { srv.ctx.copiaSeguridadDiaria({ triggerUid: 'x' }); } catch (e: any) { error1 = e.message; } soltar();
ok('...y la tarea termina con error para que Google avise por correo', error1.startsWith('Copia de seguridad NO realizada'), error1);
ok('si el archivo está vacío NO se hace copia', !copias().some(k => k.includes('2026-11-11')) && ultimoLog().startsWith('NO se hace la copia'), ultimoLog());
// muchos menos partes: no se copia
srv.archivos['DB'] = JSON.stringify(db(60));
fijar('2026-11-12T21:05:00Z'); try { srv.ctx.copiaSeguridadDiaria({ triggerUid: 'x' }); } catch (e) {} soltar();
ok('si faltan muchos partes respecto a la última copia NO se copia', !copias().some(k => k.includes('2026-11-12')) && ultimoLog().includes('tenía 100'), ultimoLog());
fijar('2026-11-12T21:30:00Z'); srv.ctx.copiaSeguridadDiaria(); soltar();
ok('...pero a mano sí (quien la ejecuta ha revisado los datos)', copias().some(k => k.includes('2026-11-12')));
srv.archivos['DB'] = JSON.stringify(db(100));
// pocos partes menos (borrados normales): sí
srv.archivos['DB'] = JSON.stringify(db(97));
fijar('2026-11-13T21:05:00Z'); srv.ctx.copiaSeguridadDiaria({ triggerUid: 'x' }); soltar();
ok('con unos pocos partes borrados sí se copia', copias().some(k => k.includes('2026-11-13')));
// restaurar
srv.ctx.restaurarCopiaDiaria();
ok('restaurar sin fecha no cambia nada y lista las copias', JSON.parse(srv.archivos['DB']).sanciones.length === 97 && (srv.drive.logs || []).some((l: string) => l.startsWith('Escriba la fecha')));
const codigo = generarServidorAppsScript().replace("var FECHA_COPIA_A_RESTAURAR = '';", "var FECHA_COPIA_A_RESTAURAR = '2026-11-10';");
const srv2 = crearServidor(codigo, undefined, { drive: srv.drive, extra: { ScriptApp } });
srv2.ctx.restaurarCopiaDiaria();
ok('restaura la copia elegida', JSON.parse(srv.archivos['DB']).sanciones.length === 100);
ok('y antes guarda el estado que había', Object.keys(srv.archivos).some(k => k.startsWith('COPIAS_SEGURIDAD/COPIA_ANTES_DE_RESTAURAR_') && JSON.parse(srv.archivos[k]).sanciones.length === 97));
ok('la app sigue funcionando', srv2.post({ accion: 'estadoCuenta', email: ADMIN }).ok === true);
srv.ctx.desactivarCopiasDiarias();
ok('desactivar quita la tarea y no borra copias', !tareas.some(t => t.f === 'copiaSeguridadDiaria') && copias().length === 14);
void bueno;
console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTodo correcto'); process.exit(fallos ? 1 : 0);
