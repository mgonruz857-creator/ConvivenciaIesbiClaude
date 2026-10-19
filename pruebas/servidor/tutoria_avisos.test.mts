const mk=()=>{const st=new Map<string,string>();return {getItem:(k:string)=>st.get(k)??null,setItem:(k:string,v:string)=>{st.set(k,String(v))},removeItem:(k:string)=>{st.delete(k)},clear:()=>st.clear(),key:()=>null,length:0}};
const g:any=globalThis; g.localStorage=mk(); g.sessionStorage=mk(); g.window=globalThis; g.CustomEvent=class{constructor(public type:string){}}; g.dispatchEvent=()=>true;
// Aviso de partes nuevos en la tutoría: lo visto se guarda en el servidor por tutor/a
const { crearServidor } = await import('./simulador.mts');
const { generarServidorAppsScript } = await import('/home/claude/convivenciaiesbiclaude/src/services/appsScriptServidor.ts');
const ADMIN='mgonruz857@g.educaand.es', TUT='tutora.prueba@g.educaand.es', DOC='docente.prueba@g.educaand.es';
const parte=(id:string,al:string)=>({id_sancion:id,numero_expediente:id,id_alumno:al,id_profesor:'prof-t3',nombre_profesor:'Dani',puntos_restados:1,fecha:'2026-10-19',descripcion_hechos:'x'});
const srv = crearServidor(generarServidorAppsScript(), { profesores:[
  {id_profesor:'prof-01',email:ADMIN,nombre:'M',rol:'ROLE_CONVIVENCIA_ADMIN',estado:'ACTIVO'},
  {id_profesor:'prof-t2',email:TUT,nombre:'Tere',rol:'ROLE_DOCENTE',estado:'ACTIVO',tutor_de_grupo:'1ESO_A'},
  {id_profesor:'prof-t3',email:DOC,nombre:'Dani',rol:'ROLE_DOCENTE',estado:'ACTIVO'}],
  alumnos:[{id_alumno:'a1',nombre:'L',grupo:'1ESO_A',estado:'ACTIVO'},{id_alumno:'a2',nombre:'B',grupo:'1ESO_A',estado:'BAJA'},{id_alumno:'b1',nombre:'H',grupo:'1ESO_B',estado:'ACTIVO'}],
  sanciones:[parte('snc-viejo-0000000001','a1')], deleted_sanciones:[], audit_logs:[] });
g.fetch = async (_u:string,o:any)=>({ok:true,status:200,text:async()=>JSON.stringify(srv.post(JSON.parse(o.body)))});
const { AuthService: A } = await import('/home/claude/convivenciaiesbiclaude/src/services/authService.ts') as any;
const { StorageService: S } = await import('/home/claude/convivenciaiesbiclaude/src/services/storageService.ts') as any;
const T = await import('/home/claude/convivenciaiesbiclaude/src/services/tutoriaAvisos.ts') as any;
let fallos=0; const ok=(t:string,c:boolean,x='')=>{ if(!c) fallos++; console.log(`${c?'OK   ':'FALLO'} ${t}${x?' → '+x:''}`); };
const entrar=async(email:string,clave:string)=>{ A.logout(); S.clearMemoryCacheForFreshLogin(); g.sessionStorage.clear(); g.localStorage.clear(); const r=await A.login(email,clave,true); return r.user; };
const limpiarCacheDb=()=>{ for (const k of [...srv.cache.keys()]) if (!k.startsWith('SES_')) srv.cache.delete(k); };
const nuevos=(v:any)=>{ const db=JSON.parse(srv.archivos['DB']); return T.partesDelGrupo('1ESO_A', db.alumnos, db.sanciones).filter((s:any)=>!v.vistos.has(T.claveVisto(s.id_sancion))).map((s:any)=>s.id_sancion); };
const anadir=(...ps:any[])=>{ const db=JSON.parse(srv.archivos['DB']); db.sanciones.push(...ps); srv.tocarExterno(db); limpiarCacheDb(); };

await entrar(TUT,'tere2026');
let v = await T.obtenerVistosTutoria();
ok('primera vez: los partes que ya existen cuentan como vistos (sin aviso)', v && v.grupo==='1ESO_A' && nuevos(v).length===0);
anadir(parte('snc-nuevo-0000000002','a1'), parte('snc-otro-g-0000000003','b1'), parte('snc-baja-00000000004','a2'));
const tok=A.getToken();
v = await T.obtenerVistosTutoria();
ok('parte nuevo de su grupo → aviso (no cuenta otro grupo ni alumnado de baja)', JSON.stringify(nuevos(v))==='["snc-nuevo-0000000002"]', JSON.stringify(nuevos(v)));
await T.marcarTutoriaVista(['snc-nuevo-0000000002','snc-otro-g-0000000003']);
// otro dispositivo (nueva sesión)
await entrar(TUT,'tere2026');
v = await T.obtenerVistosTutoria();
ok('visto en Mi Tutoría → ya no hay aviso, también en otro dispositivo', nuevos(v).length===0);
ok('no guarda como vistos partes de otros grupos', !v.vistos.has(T.claveVisto('snc-otro-g-0000000003')));
// un docente sin tutoría
await entrar(DOC,'dani2026');
v = await T.obtenerVistosTutoria();
ok('docente sin tutoría: sin aviso', v && v.grupo==='' && v.vistos.size===0);
// sin sesión
A.logout(); g.sessionStorage.clear(); g.localStorage.clear();
ok('sin sesión no responde', (await T.obtenerVistosTutoria())===null);
// cambio de grupo: no avisa del histórico del grupo nuevo
const db=JSON.parse(srv.archivos['DB']); db.profesores[1].tutor_de_grupo='1ESO_B'; srv.tocarExterno(db); limpiarCacheDb();
await entrar(TUT,'tere2026');
v = await T.obtenerVistosTutoria();
const dbB=JSON.parse(srv.archivos['DB']);
ok('si cambia de grupo, lo que ya había en el nuevo grupo cuenta como visto', v.grupo==='1ESO_B' && T.partesDelGrupo('1ESO_B', dbB.alumnos, dbB.sanciones).every((s:any)=>v.vistos.has(T.claveVisto(s.id_sancion))));
console.log(fallos?`\n${fallos} FALLO(S)`:'\nTodo correcto'); process.exit(fallos?1:0);
