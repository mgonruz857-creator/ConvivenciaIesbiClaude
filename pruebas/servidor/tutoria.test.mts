const mk=()=>{const st=new Map<string,string>();return {getItem:(k:string)=>st.get(k)??null,setItem:(k:string,v:string)=>{st.set(k,String(v))},removeItem:(k:string)=>{st.delete(k)},clear:()=>st.clear(),key:()=>null,length:0}};
const g:any=globalThis; g.localStorage=mk(); g.sessionStorage=mk(); g.window=globalThis; g.CustomEvent=class{constructor(public type:string){}}; g.dispatchEvent=()=>true;
const { crearServidor } = await import('./simulador.mts');
const { generarServidorAppsScript } = await import('/home/claude/convivenciaiesbiclaude/src/services/appsScriptServidor.ts');
const ADMIN='mgonruz857@g.educaand.es', TUT='tutora.prueba@g.educaand.es', DOC='docente.prueba@g.educaand.es', OTRA='otra.prueba@g.educaand.es';
const srv = crearServidor(generarServidorAppsScript(), { profesores:[
  {id_profesor:'prof-01',email:ADMIN,nombre:'M',apellidos:'G',rol:'ROLE_CONVIVENCIA_ADMIN',estado:'ACTIVO'},
  {id_profesor:'prof-t2',email:TUT,nombre:'Tere',apellidos:'Tutora',rol:'ROLE_DOCENTE',estado:'ACTIVO',tutor_de_grupo:'1ESO_A',tutoria_asignada_por:'JEFATURA'},
  {id_profesor:'prof-t3',email:DOC,nombre:'Dani',apellidos:'Docente',rol:'ROLE_DOCENTE',estado:'ACTIVO'},
  {id_profesor:'prof-t4',email:OTRA,nombre:'Olga',apellidos:'Otra',rol:'ROLE_DOCENTE',estado:'ACTIVO'}],
  alumnos:[{id_alumno:'a1',nombre:'Lucía',apellidos:'PRUEBA',grupo:'1ESO_A',puntos_actuales:10,estado:'ACTIVO',telefono_tutor:'611111111',nombre_tutor:'Madre de Lucía'},
           {id_alumno:'b1',nombre:'Hugo',apellidos:'FICTICIO',grupo:'1ESO_B',puntos_actuales:10,estado:'ACTIVO',telefono_tutor:'622222222',nombre_tutor:'Padre de Hugo'}],
  sanciones:[], compensaciones:[{id_compensacion:'c1',id_alumno:'a1',puntos_recuperados:1,fecha_completada:'2026-10-07',descripcion_tarea:'Ayuda en biblioteca',nombre_profesor_autoriza:'Jefatura'}], audit_logs:[] });
g.fetch = async (_u:string,o:any)=>({ok:true,status:200,text:async()=>JSON.stringify(srv.post(JSON.parse(o.body)))});
const { AuthService: A } = await import('/home/claude/convivenciaiesbiclaude/src/services/authService.ts') as any;
const { StorageService: S } = await import('/home/claude/convivenciaiesbiclaude/src/services/storageService.ts') as any;
const { GoogleDriveSyncService: G } = await import('/home/claude/convivenciaiesbiclaude/src/services/googleDriveSyncService.ts') as any;
let fallos=0; const ok=(t:string,c:boolean,x='')=>{ if(!c) fallos++; console.log(`${c?'OK   ':'FALLO'} ${t}${x?' → '+x:''}`); };
const entrar=async(email:string,clave:string)=>{ A.logout(); S.clearMemoryCacheForFreshLogin(); g.sessionStorage.clear(); g.localStorage.clear(); const r=await A.login(email,clave,true); await G.pullFromGoogleDrive({forceRefresh:true}); return r.user; };

console.log('== Un docente pone partes a alumnos de 1º ESO A y B');
let yo = await entrar(DOC,'dani2026');
for (const [al,txt] of [['a1','Hechos de Lucía'],['b1','Hechos de Hugo']]) S.imponerSancion({id_alumno:al,puntos_restados:2,codigo_infraccion:'LEV-PERTURBACION',tipo_conducta:'LEVE',fecha:'2026-10-08',hora_incidente:'10:00',nombre_profesor:'Dani',id_profesor:yo.id_profesor,descripcion_hechos:txt,timestamp:new Date().toISOString(),derivado_pac:false,estado_pac:'NO_APLICA',estado_tramitacion:'PENDIENTE_NOTIFICACION',observaciones_tramitacion:'Llamar a la familia'},DOC);
ok('se guardan', (await G.pushToGoogleDrive()).success);
ok('el docente NO tutor no ve el menú "Mi Tutoría"', !A.getAllowedNavItems(yo).some((i:any)=>i.id==='tutoria'));

console.log('== La tutora de 1º ESO A');
yo = await entrar(TUT,'tere2026');
ok('tiene el menú "Mi Tutoría"', A.getAllowedNavItems(yo).some((i:any)=>i.id==='tutoria') && A.isViewAllowed(yo,'tutoria'));
const sLucia=S.getSanciones().find((s:any)=>s.id_alumno==='a1'), sHugo=S.getSanciones().find((s:any)=>s.id_alumno==='b1');
ok('ve completo el parte de su alumna (hechos y observaciones)', sLucia.descripcion_hechos==='Hechos de Lucía' && sLucia.observaciones_tramitacion==='Llamar a la familia');
ok('NO ve los hechos del parte de otro grupo', sHugo.descripcion_hechos==='');
ok('ve el teléfono de la familia de su grupo', S.getAlumnos().find((a:any)=>a.id_alumno==='a1').telefono_tutor==='611111111');
ok('NO ve el teléfono de otro grupo', S.getAlumnos().find((a:any)=>a.id_alumno==='b1').telefono_tutor==='');
ok('ve las medidas restaurativas de su grupo', S.getCompensaciones().find((c:any)=>c.id_compensacion==='c1')?.descripcion_tarea==='Ayuda en biblioteca');
// −2 el día 8 y +1 por cada 7 días sin partes desde entonces (la prueba depende de la fecha de hoy)
const semanas=Math.floor((Date.now()-new Date('2026-10-08T12:00:00').getTime())/(7*864e5)), esperado=Math.min(10,8+Math.max(0,semanas));
ok('el saldo de su alumna es correcto (medida del día 7 con carnet lleno, luego −2, y recuperación semanal)', S.getAlumnos().find((a:any)=>a.id_alumno==='a1').puntos_actuales===esperado, String(S.getAlumnos().find((a:any)=>a.id_alumno==='a1').puntos_actuales)+' / '+esperado);
S.modificarSancion(sLucia.id_sancion,{puntos_restados:0,descripcion_hechos:'cambiado por la tutora'},TUT,'intento');
await G.pushToGoogleDrive();
const tras=JSON.parse(srv.archivos['DB']).sanciones.find((s:any)=>s.id_sancion===sLucia.id_sancion);
ok('NO puede modificar el parte que puso otro docente', tras.puntos_restados===2 && tras.descripcion_hechos==='Hechos de Lucía');

console.log('== Asignación de tutoría desde el perfil');
yo = await entrar(OTRA,'olga2026');
let r = S.actualizarPerfilPropioDocente(OTRA,{nombre:'Olga',apellidos:'Otra',departamento:'Lengua',tutor_de_grupo:'1ESO_A'});
ok('no puede declararse tutora de un grupo que ya tiene tutora', !r.success, r.error);
r = S.actualizarPerfilPropioDocente(OTRA,{nombre:'Olga',apellidos:'Otra',departamento:'Lengua',tutor_de_grupo:'1ESO_B'});
let envio = await G.pushToGoogleDrive();
const olga=JSON.parse(srv.archivos['DB']).profesores.find((p:any)=>p.email===OTRA);
ok('sí puede declararse tutora de un grupo libre', r.success && olga.tutor_de_grupo==='1ESO_B' && !(envio.avisos||[]).length);
ok('...y queda marcado "indicada por el docente"', olga.tutoria_asignada_por==='DOCENTE');
ok('...se guarda también su cambio de departamento', olga.departamento==='Lengua');
ok('...y queda en la auditoría', JSON.parse(srv.archivos['DB']).audit_logs.some((l:any)=>/Tutoría cambiada/.test(l.detalles)));
await G.pullFromGoogleDrive({forceRefresh:true});
ok('ahora ve los hechos de Hugo (su nuevo grupo)', S.getSanciones().find((s:any)=>s.id_alumno==='b1').descripcion_hechos==='Hechos de Hugo');
// Intento saltándose la app: enviar directamente al servidor una tutoría ocupada
const datos = srv.post({accion:'leer', token:A.getToken()}).data; datos.profesores.find((p:any)=>p.email===OTRA).tutor_de_grupo='1ESO_A';
const res = srv.post({accion:'guardar', token:A.getToken(), data:datos});
ok('el servidor también rechaza una tutoría ocupada (aunque se salten la app)', JSON.parse(srv.archivos['DB']).profesores.find((p:any)=>p.email===OTRA).tutor_de_grupo==='1ESO_B' && res.avisos.length===1, res.avisos[0]);
const dani = JSON.parse(srv.archivos['DB']).profesores.find((p:any)=>p.email===DOC);
datos.profesores.find((p:any)=>p.email===DOC).tutor_de_grupo='2ESO_C';
srv.post({accion:'guardar', token:A.getToken(), data:datos});
ok('un docente no puede cambiar la tutoría de OTRO docente', !JSON.parse(srv.archivos['DB']).profesores.find((p:any)=>p.email===DOC).tutor_de_grupo);

console.log('== Jefatura');
yo = await entrar(ADMIN,'admin2026');
ok('Jefatura ve quién asignó cada tutoría', S.getProfesores().find((p:any)=>p.email===OTRA).tutoria_asignada_por==='DOCENTE');
S.actualizarProfesor(S.getProfesores().find((p:any)=>p.email===OTRA).id_profesor,{tutor_de_grupo:'2ESO_A'},ADMIN);
await G.pushToGoogleDrive();
const olga2=JSON.parse(srv.archivos['DB']).profesores.find((p:any)=>p.email===OTRA);
ok('Jefatura puede cambiarla y queda como asignada por Jefatura', olga2.tutor_de_grupo==='2ESO_A' && olga2.tutoria_asignada_por==='JEFATURA');
console.log(fallos?`\n${fallos} FALLOS`:'\nTodo correcto');
