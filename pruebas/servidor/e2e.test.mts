const HOY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
import { readFileSync } from 'fs';
const mk=()=>{const st=new Map<string,string>();return {getItem:(k:string)=>st.get(k)??null,setItem:(k:string,v:string)=>{st.set(k,String(v))},removeItem:(k:string)=>{st.delete(k)},clear:()=>st.clear(),key:()=>null,length:0,_st:st}};
const g:any=globalThis; g.localStorage=mk(); g.sessionStorage=mk();
const eventos:string[]=[]; g.window=globalThis; g.CustomEvent=class{constructor(public type:string,public o:any){}}; g.dispatchEvent=(e:any)=>{eventos.push(e.type); return true;};
const { crearServidor } = await import('./simulador.mts');
const { generarServidorAppsScript } = await import('/home/claude/convivenciaiesbiclaude/src/services/appsScriptServidor.ts');
const srv = crearServidor(generarServidorAppsScript());   // Drive de pruebas vacío
let caido=false;
g.fetch = async (_u:string, o:any) => { if (caido) throw new Error('red'); return { ok:true, status:200, text: async()=> JSON.stringify(srv.post(JSON.parse(o.body))) }; };
const { AuthService: A } = await import('/home/claude/convivenciaiesbiclaude/src/services/authService.ts') as any;
const { StorageService: S } = await import('/home/claude/convivenciaiesbiclaude/src/services/storageService.ts') as any;
const { GoogleDriveSyncService: G } = await import('/home/claude/convivenciaiesbiclaude/src/services/googleDriveSyncService.ts') as any;
const { parsearArchivoODSoExcel } = await import('/home/claude/convivenciaiesbiclaude/src/services/odsImportService.ts');
let fallos=0; const ok=(t:string,c:boolean,x='')=>{ if(!c) fallos++; console.log(`${c?'OK   ':'FALLO'} ${t}${x?' → '+x:''}`); };
const ADMIN='mgonruz857@g.educaand.es', DOC='docente.prueba@g.educaand.es';
const navegador=(nombre:string)=>{ S.clearMemoryCacheForFreshLogin(); g.sessionStorage.clear(); g.localStorage.clear(); };

console.log('== Jefatura (primer acceso en Drive vacío)');
navegador('jefatura');
ok('sin sesión no se descarga nada', !(await G.pullFromGoogleDrive({forceRefresh:true})).success);
let est = await A.consultarCuenta(ADMIN); ok('el administrador aparece pendiente de primer acceso', est.registrado && est.tieneClave===false);
let r = await A.login(ADMIN,'admin2026',true); ok('primer acceso del administrador', r.success && r.primerAcceso);
ok('el navegador no guarda contraseñas', ![...g.localStorage._st.values(), ...g.sessionStorage._st.values()].some((v:string)=>v.includes('admin2026')||v.includes('hash')));
const b=readFileSync('/home/claude/convivenciaiesbiclaude/pruebas/datos/Alumnado_FICTICIO_pruebas.xlsx');
S.importarAlumnosDesdeFilas(parsearArchivoODSoExcel(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)).filas, ADMIN);
S.crearProfesor({email:DOC,nombre:'Ana',apellidos:'Docente',departamento:'Lengua',rol:'ROLE_DOCENTE',estado:'ACTIVO',dni:''}, ADMIN);
let p = await G.pushToGoogleDrive(); ok('guarda en Drive y el servidor lo confirma', p.success, p.message);
const enDrive=JSON.parse(srv.archivos['DB']); ok('Drive tiene los 87 alumnos y el nuevo docente', enDrive.alumnos.length===87 && enDrive.profesores.some((x:any)=>x.email===DOC));

console.log('== Fallo de red al guardar');
const id0=S.getAlumnos()[0].id_alumno;
S.imponerSancion({id_alumno:id0,puntos_restados:3,codigo_infraccion:'LEV-X',tipo_conducta:'LEVE',fecha:HOY,hora_incidente:'10:00',nombre_profesor:'Miguel',id_profesor:'prof-01',descripcion_hechos:'admin',timestamp:new Date().toISOString(),derivado_pac:true,estado_pac:'PENDIENTE'},ADMIN);
caido=true; p = await G.pushToGoogleDrive(); ok('sin red, la app NO dice "guardado"', !p.success, p.message);
ok('el parte sigue pendiente de subir', S.getPendingSyncSancionIds().length===1);
caido=false; p = await G.pushToGoogleDrive(); ok('al volver la red se guarda', p.success && JSON.parse(srv.archivos['DB']).sanciones.length===1);

console.log('== Docente en otro navegador');
navegador('docente');
est = await A.consultarCuenta(DOC); ok('docente dado de alta, sin contraseña aún', est.registrado && est.tieneClave===false);
r = await A.login(DOC,'lengua2026',false); ok('primer acceso del docente', r.success && r.primerAcceso && !A.isAdmin(r.user));
await G.pullFromGoogleDrive({forceRefresh:true});
const alumnosDoc=S.getAlumnos(); ok('ve el alumnado para poner partes', alumnosDoc.length===87);
const parteAjeno=S.getSanciones().find((x:any)=>x.descripcion_hechos==='admin');
ok('ve el parte del Aula PAC', !!parteAjeno);
const alA=alumnosDoc.find((a:any)=>a.id_alumno===id0); ok('el saldo del alumno es correcto también para el docente', alA.puntos_actuales===7, String(alA.puntos_actuales));
const yo=r.user;
S.imponerSancion({id_alumno:alumnosDoc[1].id_alumno,puntos_restados:2,codigo_infraccion:'LEV-Y',tipo_conducta:'LEVE',fecha:HOY,hora_incidente:'11:00',nombre_profesor:'Ana',id_profesor:yo.id_profesor,descripcion_hechos:'del docente',timestamp:new Date().toISOString(),derivado_pac:false,estado_pac:'NO_APLICA'},DOC);
S.actualizarEstadoPAC(parteAjeno.id_sancion,'TAREAS_COMPLETADAS','Ana',DOC);
p = await G.pushToGoogleDrive(); ok('el docente guarda su parte', p.success, p.message);
const db2=JSON.parse(srv.archivos['DB']);
ok('Drive tiene su parte', db2.sanciones.some((x:any)=>x.descripcion_hechos==='del docente'));
ok('...y el estado PAC actualizado', db2.sanciones.find((x:any)=>x.id_sancion===parteAjeno.id_sancion).estado_pac==='TAREAS_COMPLETADAS');
ok('...sin haber estropeado el parte de Jefatura', db2.sanciones.find((x:any)=>x.id_sancion===parteAjeno.id_sancion).descripcion_hechos==='admin');
ok('...ni teléfonos de familias ni alumnado', db2.alumnos.length===87);

console.log('== Sesión caducada / baja');
srv.cache.clear();   // el servidor olvida las sesiones (p. ej. tras 6 horas sin uso)
eventos.length=0; const lr = await G.pullFromGoogleDrive({forceRefresh:true});
ok('con la sesión caducada la app avisa para volver a entrar', !lr.success && eventos.includes('sigc-sesion-caducada'));
console.log(fallos?`\n${fallos} FALLOS`:'\nTodo correcto');
