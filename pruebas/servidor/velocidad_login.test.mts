// Inicio de sesión rápido: una sola petición trae la sesión y los datos; sin leer Drive salvo al escribir
import crypto from 'crypto';
const mk=()=>{const st=new Map<string,string>();return {getItem:(k:string)=>st.get(k)??null,setItem:(k:string,v:string)=>{st.set(k,String(v))},removeItem:(k:string)=>{st.delete(k)},clear:()=>st.clear(),key:()=>null,length:0}};
const g:any=globalThis; g.localStorage=mk(); g.sessionStorage=mk(); g.window=globalThis; g.CustomEvent=class{constructor(public type:string,public o?:any){}}; g.dispatchEvent=()=>true;
const { crearServidor } = await import('./simulador.mts');
const { generarServidorAppsScript } = await import('../../src/services/appsScriptServidor.ts');
const v1 = (t: string) => crypto.createHash('sha256').update(Buffer.from(Array.from(t).map(c => c.charCodeAt(0) & 255))).digest('hex');
let fallos=0; const ok=(t:string,c:boolean,x='')=>{ if(!c) fallos++; console.log(`${c?'OK   ':'FALLO'} ${t}${x?' → '+x:''}`); };
const ADMIN='mgonruz857@g.educaand.es', DOC='doc@g.educaand.es';
const srv = crearServidor(generarServidorAppsScript(), { profesores:[
  {id_profesor:'prof-01',email:ADMIN,nombre:'M',apellidos:'G',rol:'ROLE_CONVIVENCIA_ADMIN',estado:'ACTIVO'},
  {id_profesor:'p-d',email:DOC,nombre:'D',apellidos:'O',rol:'ROLE_DOCENTE',estado:'ACTIVO'}],
  credenciales_profesores:{[DOC]: v1('vieja123')},
  alumnos:[{id_alumno:'al-1',nombre:'L',apellidos:'U',grupo:'1ESO_A',puntos_actuales:10,estado:'ACTIVO',telefono_tutor:'600'}],
  sanciones:[{id_sancion:'s-1',id_alumno:'al-1',id_profesor:'prof-01',puntos_restados:2,fecha:'2026-10-01',descripcion_hechos:'privado'}], compensaciones:[], audit_logs:[] });
// contar lecturas del archivo en Drive
let lecturasDrive = 0;
const gf = srv.ctx.DriveApp.getFolderById;
srv.ctx.DriveApp.getFolderById = () => { const f = gf(); const g2 = f.getFilesByName; f.getFilesByName = (n:string) => { const it = g2(n); return { hasNext: it.hasNext, next: () => { const a = it.next(); const b = a.getBlob; a.getBlob = () => { lecturasDrive++; return b(); }; return a; } }; }; return f; };
const peticiones:string[]=[];
g.fetch = async (_u:string,o:any)=>{ const req=JSON.parse(o.body); peticiones.push(req.accion); return {ok:true,status:200,text:async()=>JSON.stringify(srv.post(req))}; };
const { AuthService: A } = await import('../../src/services/authService.ts') as any;
const { StorageService: S } = await import('../../src/services/storageService.ts') as any;
const { GoogleDriveSyncService: G } = await import('../../src/services/googleDriveSyncService.ts') as any;

srv.post({accion:'estadoCuenta',email:ADMIN}); // migración y caché preparadas
lecturasDrive = 0; peticiones.length = 0;
let r = await A.login(ADMIN,'admin2026',true);
await G.pullFromGoogleDrive({forceRefresh:true});
ok('entrar y cargar los datos: una sola petición al servidor', peticiones.join(',') === 'login', peticiones.join(','));
ok('...sin leer el archivo de Drive (copia en memoria comprobada)', lecturasDrive === 0, String(lecturasDrive));
ok('...y los datos están en la app', S.getSanciones().length === 1 && S.getAlumnos().length === 1);
peticiones.length = 0; await G.pullFromGoogleDrive({forceRefresh:true});
ok('la siguiente comprobación es la de "sin cambios"', peticiones.join(',') === 'leer');

// Docente con contraseña de la v1: sí se escribe, y a partir del archivo real
S.clearMemoryCacheForFreshLogin(); g.sessionStorage.clear(); g.localStorage.clear();
const externo = JSON.parse(srv.archivos['DB']); externo.sanciones.push({id_sancion:'s-ext',id_alumno:'al-1',id_profesor:'prof-01',puntos_restados:1,fecha:'2026-10-02'});
srv.tocarExterno(externo);  // cambio hecho por fuera hace un instante (la caché aún "confía" 15 s)
r = await A.login(DOC,'vieja123',false);
ok('docente entra con su contraseña de la v1', r.success && !r.primerAcceso);
const db = JSON.parse(srv.archivos['DB']);
ok('al convertir su contraseña no se pierde el cambio externo', db.sanciones.some((x:any)=>x.id_sancion==='s-ext'));
ok('...y su contraseña v1 se ha borrado del archivo', !db.credenciales_profesores[DOC]);
await G.pullFromGoogleDrive({forceRefresh:true});
ok('el docente recibe sus datos filtrados (sin teléfonos ni hechos ajenos)', S.getAlumnos()[0].telefono_tutor === '' && S.getSanciones().every((x:any)=>!x.descripcion_hechos));
console.log(fallos?`\n${fallos} FALLOS`:'\nTodo correcto');
