// Resumen diario por correo para tutores (8:30, lunes a viernes): solo grupos con partes nuevos, sin datos del alumnado
const { crearServidor } = await import('./simulador.mts');
const { generarServidorAppsScript } = await import('../../src/services/appsScriptServidor.ts');
let fallos = 0; const ok = (t: string, c: boolean, x = '') => { if (!c) fallos++; console.log(`${c ? 'OK   ' : 'FALLO'} ${t}${x ? ' → ' + x : ''}`); };
const ADMIN = 'mgonruz857@g.educaand.es';
const parte = (id: string, al: string, fecha = '2026-10-16') => ({ id_sancion: id, numero_expediente: id, id_alumno: al, id_profesor: 'prof-01', puntos_restados: 2, fecha, descripcion_hechos: 'Hechos privados de ' + al });
const db = {
  profesores: [
    { id_profesor: 'prof-01', email: ADMIN, rol: 'ROLE_CONVIVENCIA_ADMIN', estado: 'ACTIVO' },
    { id_profesor: 't1', email: 'tutora1@g.educaand.es', nombre: 'Ana', estado: 'ACTIVO', tutor_de_grupo: '3º ESO B' },
    { id_profesor: 't2', email: 'tutor2@g.educaand.es', nombre: 'Luis', estado: 'ACTIVO', tutor_de_grupo: '1º ESO A' },
    { id_profesor: 't3', email: 'baja@g.educaand.es', estado: 'INACTIVO', tutor_de_grupo: '2º ESO C' },
  ],
  alumnos: [{ id_alumno: 'a1', nombre: 'Pepito', apellidos: 'Pérez', grupo: '3º ESO B' }, { id_alumno: 'a2', nombre: 'Juana', grupo: '3º ESO B' },
            { id_alumno: 'a3', nombre: 'Rosa', grupo: '1º ESO A' }, { id_alumno: 'a4', nombre: 'Mario', grupo: '2º ESO C' }],
  sanciones: [parte('viejo', 'a1')], deleted_sanciones: [],
};
const correos: any[] = []; let tareas: any[] = [];
const ScriptApp = {
  getProjectTriggers: () => tareas.map(t => ({ getHandlerFunction: () => t.f, _t: t })),
  deleteTrigger: (x: any) => { tareas = tareas.filter(t => t !== x._t); },
  newTrigger: (f: string) => { const t: any = { f }; const b: any = { timeBased: () => b, at: (d: Date) => (t.at = d, b), everyDays: (n: number) => (t.cada = n, b),
    atHour: (h: number) => (t.hora = h, b), inTimezone: (z: string) => (t.zona = z, b), create: () => { tareas.push(t); return t; } }; return b; },
};
let sinPermiso = false;
const MailApp = { sendEmail: (m: any) => { if (sinPermiso) throw new Error('No tienes permiso para llamar a MailApp.sendEmail. Permisos necesarios: https://www.googleapis.com/auth/script.send_mail'); correos.push(m); } };
const srv = crearServidor(generarServidorAppsScript(), db, { extra: { ScriptApp, MailApp } });
srv.post({ accion: 'estadoCuenta', email: ADMIN });
const antes = srv.archivos['DB'];
srv.ctx.activarResumenDiario();
ok('activar crea la tarea diaria', tareas.some(t => t.f === 'programarResumenDiario' && t.cada === 1 && t.zona === 'Europe/Madrid'));
ok('activar no envía nada ni toca los datos', correos.length === 0 && srv.archivos['DB'] === antes);
// la tarea de las 14:55 (hora de Madrid)
tareas = tareas.filter(t => t.f !== 'enviarResumenTutores');
const RealDate = Date; const fijar = (iso: string) => { (globalThis as any).Date = class extends RealDate { constructor(...a: any[]) { super(...((a.length ? a : [iso]) as [any])); } static now() { return new RealDate(iso).getTime(); } static UTC = RealDate.UTC; }; srv.ctx.Date = (globalThis as any).Date; };
fijar('2026-10-19T04:30:00Z'); srv.ctx.programarResumenDiario();
const t830 = tareas.find(t => t.f === 'enviarResumenTutores');
ok('lunes: programa el envío a las 8:30 hora de Madrid', t830 && t830.at.toISOString() === '2026-10-19T06:30:00.000Z', t830?.at?.toISOString());
fijar('2026-10-19T07:00:00Z'); srv.ctx.programarResumenDiario();
ok('si ya pasaron las 8:30 no programa nada ese día', !tareas.some(t => t.f === 'enviarResumenTutores'));
fijar('2026-10-17T04:30:00Z'); srv.ctx.programarResumenDiario();
ok('sábado: no programa nada', !tareas.some(t => t.f === 'enviarResumenTutores'));
fijar('2026-10-18T04:30:00Z'); srv.ctx.programarResumenDiario();
ok('domingo: no programa nada', !tareas.some(t => t.f === 'enviarResumenTutores'));
fijar('2026-11-02T05:00:00Z'); srv.ctx.programarResumenDiario();
const tInv = tareas.find(t => t.f === 'enviarResumenTutores');
ok('en horario de invierno también a las 8:30 de Madrid', tInv && tInv.at.toISOString() === '2026-11-02T07:30:00.000Z', tInv?.at?.toISOString());
tareas = tareas.filter(t => t.f !== 'enviarResumenTutores');
srv.ctx.Date = RealDate; (globalThis as any).Date = RealDate;
// nuevos partes: 2 en 3º ESO B, 1 en 2º ESO C (tutor inactivo), ninguno en 1º ESO A
const d = JSON.parse(srv.archivos['DB']); d.sanciones.push(parte('n1', 'a1'), parte('n2', 'a2'), parte('n3', 'a4')); srv.tocarExterno(d);
sinPermiso = true; srv.ctx.enviarResumenTutores({ triggerUid: 'x' });
ok('sin permiso de correo no se envía nada', correos.length === 0);
sinPermiso = false; srv.ctx.enviarResumenTutores();
ok('un solo correo (solo la tutoría con partes nuevos y tutor activo)', correos.length === 1, String(correos.length));
const c = correos[0] || {};
ok('en PRUEBAS va al administrador, indicando el destinatario real', c.to === ADMIN && c.subject.includes('tutora1@g.educaand.es'), c.to + ' / ' + c.subject);
ok('número, día y grupo en el correo', c.subject.includes('2 partes nuevos') && c.subject.includes('3º ESO B') && c.body.includes('El viernes 16/10 se registraron 2 partes en su tutoría (3º ESO B).'), c.body.split('\n')[2]);
ok('incluye el enlace a la app', c.body.includes('https://mgonruz857-creator.github.io/ConvivenciaIesbiClaude/') && c.htmlBody.includes('href="https://'));
ok('ningún dato del alumnado (nombres, hechos, puntos)', !/Pepito|Juana|Pérez|Hechos|privados|puntos/i.test(c.body + c.htmlBody + c.subject));
ok('no avisa del parte que ya existía al activar', !c.body.includes('3 partes'));
ok('enviar no modifica el archivo de datos', JSON.parse(srv.archivos['DB']).sanciones.length === 4);
srv.ctx.enviarResumenTutores({ triggerUid: 'x' });
ok('la tarea automática no se repite el mismo día', correos.length === 1);
srv.ctx.enviarResumenTutores();
ok('a mano no reenvía partes ya avisados', correos.length === 1);
// día siguiente: un parte puesto después de las 14:55 del día anterior
srv.props.set('RESUMEN_ULTIMO_DIA', '2026-01-01');
const d2 = JSON.parse(srv.archivos['DB']); d2.sanciones.push(parte('n4', 'a3', '2026-10-19')); srv.tocarExterno(d2);
srv.ctx.enviarResumenTutores();
ok('el parte posterior va en el resumen siguiente, solo a su tutor', correos.length === 2 && correos[1].subject.includes('1 parte nuevo') && correos[1].subject.includes('tutor2@') && correos[1].subject.includes('1º ESO A'));
ok('...y en singular', correos[1].body.includes('El lunes 19/10 se registró 1 parte en su tutoría (1º ESO A).'), correos[1].body.split('\n')[2]);
// varios días (viernes y fin de semana)
srv.props.set('RESUMEN_ULTIMO_DIA', '2026-01-03');
const d3 = JSON.parse(srv.archivos['DB']); d3.sanciones.push(parte('n5', 'a1', '2026-10-17'), parte('n6', 'a2', '2026-10-16')); srv.tocarExterno(d3);
srv.ctx.enviarResumenTutores();
ok('varios días: «Desde el viernes 16/10 se han registrado 2 partes»', correos.length === 3 && correos[2].body.includes('Desde el viernes 16/10 se han registrado 2 partes en su tutoría (3º ESO B).'), correos[2]?.body.split('\n')[2]);
// la tarea automática en fin de semana no envía
const d4 = JSON.parse(srv.archivos['DB']); d4.sanciones.push(parte('n7', 'a1')); srv.tocarExterno(d4);
fijar('2026-10-24T06:30:00Z'); srv.props.set('RESUMEN_ULTIMO_DIA', '2026-01-04');
srv.ctx.enviarResumenTutores({ triggerUid: 'x' });
srv.ctx.Date = RealDate; (globalThis as any).Date = RealDate;
ok('la tarea automática no envía en sábado (queda para el lunes)', correos.length === 3);
srv.ctx.enviarResumenTutores();
ok('...y sale en el siguiente envío', correos.length === 4);
srv.props.set('RESUMEN_ULTIMO_DIA', '2026-01-02');
srv.ctx.enviarResumenTutores();
ok('día sin partes nuevos: no se envía nada', correos.length === 4);
srv.ctx.desactivarResumenDiario();
ok('desactivar quita las tareas', tareas.length === 0);
console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTodo correcto'); process.exit(fallos ? 1 : 0);
