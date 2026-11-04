// Ajuste manual de puntos (quitar puntos sin parte): cálculo, Drive, otros dispositivos, docente y anulación.
const mk=()=>{const st=new Map<string,string>();return {getItem:(k:string)=>st.get(k)??null,setItem:(k:string,v:string)=>{st.set(k,String(v))},removeItem:(k:string)=>{st.delete(k)},clear:()=>st.clear(),key:()=>null,length:0}};
const g:any=globalThis; g.localStorage=mk(); g.sessionStorage=mk(); g.window=globalThis; g.CustomEvent=class{constructor(public type:string){}}; g.dispatchEvent=()=>true;
const { crearServidor } = await import('./simulador.mts');
const { generarServidorAppsScript } = await import('/home/claude/convivenciaiesbiclaude/src/services/appsScriptServidor.ts');
const { calcularCarnet } = await import('/home/claude/convivenciaiesbiclaude/src/services/carnetPuntos.ts');
const ADMIN='mgonruz857@g.educaand.es', DOC='docente.prueba@g.educaand.es';
let fallos=0; const ok=(t:string,c:boolean,x='')=>{ if(!c) fallos++; console.log(`${c?'OK   ':'FALLO'} ${t}${x?' → '+x:''}`); };

console.log('== Cálculo');
const parte=(id:string,fecha:string,p:number)=>({id_sancion:id,id_alumno:'a1',fecha,hora_incidente:'09:00',timestamp:fecha+'T09:00:00Z',puntos_restados:p,codigo_infraccion:'X',nombre_profesor:'P',descripcion_hechos:''} as any);
const aj=(id:string,fecha:string,p:number,extra:any={})=>({id_compensacion:id,id_alumno:'a1',timestamp:fecha+'T10:00:00',fecha_completada:fecha,puntos_recuperados:-p,nombre_profesor_autoriza:'Jefatura',descripcion_tarea:'motivo',...extra} as any);
// Llega a 0 el 1/10; el 8/10 recupera 1; el 9/10 se le quita con un ajuste
let r = calcularCarnet('a1',[parte('s1','2026-10-01',10)],[],'2026-10-09');
ok('sin ajuste: a los 7 días recupera 1 punto', r.saldo===1);
r = calcularCarnet('a1',[parte('s1','2026-10-01',10)],[aj('j1','2026-10-09',1)],'2026-10-15');
ok('con ajuste el 9/10: vuelve a 0 y el 15/10 sigue a 0 (contador reiniciado)', r.saldo===0, String(r.saldo));
r = calcularCarnet('a1',[parte('s1','2026-10-01',10)],[aj('j1','2026-10-09',1)],'2026-10-16');
ok('...y recupera 1 a los 7 días del ajuste (16/10)', r.saldo===1, String(r.saldo));
ok('el ajuste no cuenta como parte', r.countSanciones===1);
ok('ni como otra "vez a 0"', r.vecesSaldoCero===1, String(r.vecesSaldoCero));
const mov = r.movimientos.find((m:any)=>m.tipo==='AJUSTE_MANUAL');
ok('aparece en el historial con quién y motivo', !!mov && mov.puntos===-1 && mov.profesor_nombre==='Jefatura' && mov.detalles==='motivo' && mov.id_compensacion==='j1');
r = calcularCarnet('a1',[],[aj('j1','2026-10-09',15)],'2026-10-09');
ok('nunca baja de 0', r.saldo===0);
r = calcularCarnet('a1',[parte('s1','2026-10-01',10)],[aj('j1','2026-10-09',1,{anulada:true})],'2026-10-09');
ok('un ajuste anulado no cuenta', r.saldo===1);
r = calcularCarnet('a1',[parte('s1','2026-10-01',10)],[aj('j1','2026-10-09',0)],'2026-10-09');
ok('un ajuste a 0 puntos (anulado, visto por un docente) no cuenta', r.saldo===1);

console.log('== Con el servidor');
const hoy=new Date(); const f=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const hace8=new Date(hoy.getTime()-8*86400000);
const srv = crearServidor(generarServidorAppsScript(), { profesores:[
  {id_profesor:'prof-01',email:ADMIN,nombre:'M',apellidos:'G',rol:'ROLE_CONVIVENCIA_ADMIN',estado:'ACTIVO'},
  {id_profesor:'prof-t3',email:DOC,nombre:'Dani',apellidos:'Docente',rol:'ROLE_DOCENTE',estado:'ACTIVO'}],
  alumnos:[{id_alumno:'a1',nombre:'Lucía',apellidos:'PRUEBA',grupo:'1ESO_A',puntos_actuales:10,estado:'ACTIVO'}],
  sanciones:[{...parte('s1',f(hace8),10),id_profesor:'prof-01',derivado_pac:false,estado_pac:'NO_APLICA',estado_tramitacion:'PENDIENTE_NOTIFICACION',ubicacion:'Aula ordinaria',materia:'',tramo_horario:'1ª Hora (08:30 - 09:30)',url_pdf_drive:''}],
  compensaciones:[], audit_logs:[] });
g.fetch = async (_u:string,o:any)=>({ok:true,status:200,text:async()=>JSON.stringify(srv.post(JSON.parse(o.body)))});
const { AuthService: A } = await import('/home/claude/convivenciaiesbiclaude/src/services/authService.ts') as any;
const { StorageService: S } = await import('/home/claude/convivenciaiesbiclaude/src/services/storageService.ts') as any;
const { GoogleDriveSyncService: G } = await import('/home/claude/convivenciaiesbiclaude/src/services/googleDriveSyncService.ts') as any;
const entrar=async(email:string,clave:string)=>{ A.logout(); S.clearMemoryCacheForFreshLogin(); g.sessionStorage.clear(); g.localStorage.clear(); const r=await A.login(email,clave,true); await G.pullFromGoogleDrive({forceRefresh:true}); return r.user; };
const saldo=()=>S.getAlumnos().find((a:any)=>a.id_alumno==='a1').puntos_actuales;

await entrar(ADMIN,'admin2026'); S.recalcularPuntosAlumnos();
ok('Jefatura: a los 8 días del parte tiene 1 punto', saldo()===1, String(saldo()));
let t=false; try { S.registrarAjustePuntos('a1',1,'  ','M G',ADMIN); } catch { t=true; }
ok('sin motivo no se registra', t && saldo()===1);
const res = S.registrarAjustePuntos('a1',1,'Pendiente de sanción','M G',ADMIN);
ok('quitar 1 punto: saldo 0', res.nuevoSaldo===0 && saldo()===0);
ok('queda en la auditoría', S.getAuditLogs().some((l:any)=>l.accion==='AJUSTE_PUNTOS' && /Pendiente de sanción/.test(l.detalles)));
let p = await G.pushToGoogleDrive();
ok('se guarda en Drive', p.success && JSON.parse(srv.archivos['DB']).compensaciones.some((c:any)=>c.puntos_recuperados===-1));

await entrar(ADMIN,'admin2026'); S.recalcularPuntosAlumnos();
ok('otro ordenador de Jefatura: saldo 0', saldo()===0);
await entrar(DOC,'dani2026'); S.recalcularPuntosAlumnos();
ok('docente sin privilegios: también ve saldo 0', saldo()===0, String(saldo()));
ok('...sin el motivo', !S.getCompensaciones().some((c:any)=>c.descripcion_tarea));

await entrar(ADMIN,'admin2026'); S.recalcularPuntosAlumnos();
const idAj = S.getCompensaciones().find((c:any)=>c.puntos_recuperados<0).id_compensacion;
S.anularAjustePuntos(idAj,'Alumna equivocada',ADMIN);
ok('anular: recupera el punto', saldo()===1);
p = await G.pushToGoogleDrive();
const enDrive = JSON.parse(srv.archivos['DB']).compensaciones.find((c:any)=>c.id_compensacion===idAj);
ok('la anulación se guarda (quién, motivo) sin borrar el ajuste', p.success && enDrive.anulada && enDrive.anulada_por===ADMIN && enDrive.puntos_ajuste_original===-1);
await entrar(DOC,'dani2026'); S.recalcularPuntosAlumnos();
ok('docente: tras anular, vuelve a 1', saldo()===1, String(saldo()));

console.log(fallos? `\n${fallos} FALLO(S)` : '\nTodo correcto');
process.exit(fallos?1:0);
