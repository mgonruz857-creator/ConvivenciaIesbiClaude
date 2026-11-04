const mk=()=>{const st=new Map<string,string>();return {getItem:(k:string)=>st.get(k)??null,setItem:(k:string,v:string)=>{st.set(k,String(v))},removeItem:(k:string)=>{st.delete(k)},clear:()=>st.clear(),key:()=>null,length:0}};
const g:any=globalThis; g.localStorage=mk(); g.sessionStorage=mk(); g.window=globalThis; g.CustomEvent=class{constructor(public type:string){}}; g.dispatchEvent=()=>true;
const { crearServidor } = await import('./simulador.mts');
const { generarServidorAppsScript } = await import('/home/claude/convivenciaiesbiclaude/src/services/appsScriptServidor.ts');
const ADMIN='mgonruz857@g.educaand.es', TUT='tutora.prueba@g.educaand.es', DOC='docente.prueba@g.educaand.es';
const srv = crearServidor(generarServidorAppsScript(), { profesores:[
  {id_profesor:'prof-01',email:ADMIN,nombre:'M',apellidos:'G',rol:'ROLE_CONVIVENCIA_ADMIN',estado:'ACTIVO'},
  {id_profesor:'prof-t2',email:TUT,nombre:'Tere',apellidos:'Tutora',rol:'ROLE_DOCENTE',estado:'ACTIVO',tutor_de_grupo:'1ESO_A'},
  {id_profesor:'prof-t3',email:DOC,nombre:'Dani',apellidos:'Docente',rol:'ROLE_DOCENTE',estado:'ACTIVO'}],
  alumnos:[{id_alumno:'a1',nombre:'Lucía',apellidos:'PRUEBA',grupo:'1ESO_A',puntos_actuales:10,estado:'ACTIVO'},
           {id_alumno:'b1',nombre:'Hugo',apellidos:'FICTICIO',grupo:'1ESO_B',puntos_actuales:10,estado:'ACTIVO'}],
  sanciones:[], compensaciones:[], audit_logs:[] });
let caido=false;
g.fetch = async (_u:string,o:any)=>{ if(caido) throw new Error('red'); return {ok:true,status:200,text:async()=>JSON.stringify(srv.post(JSON.parse(o.body)))}; };
const { AuthService: A } = await import('/home/claude/convivenciaiesbiclaude/src/services/authService.ts') as any;
const { StorageService: S } = await import('/home/claude/convivenciaiesbiclaude/src/services/storageService.ts') as any;
const { GoogleDriveSyncService: G } = await import('/home/claude/convivenciaiesbiclaude/src/services/googleDriveSyncService.ts') as any;
let fallos=0; const ok=(t:string,c:boolean,x='')=>{ if(!c) fallos++; console.log(`${c?'OK   ':'FALLO'} ${t}${x?' → '+x:''}`); };
const entrar=async(email:string,clave:string)=>{ A.logout(); S.clearMemoryCacheForFreshLogin(); g.sessionStorage.clear(); g.localStorage.clear(); const r=await A.login(email,clave,true); await G.pullFromGoogleDrive({forceRefresh:true}); return r.user; };
const hoy=new Date().toISOString().split('T')[0];

console.log('== Jefatura');
let yo = await entrar(ADMIN,'admin2026');
ok('el menú tiene "Sanciones"', A.getAllowedNavItems(yo).some((i:any)=>i.id==='sanciones'));
for (const al of ['a1','b1']) S.imponerSancion({id_alumno:al,puntos_restados:10,codigo_infraccion:'GRA-AGRESION',tipo_conducta:'GRAVE',fecha:hoy,hora_incidente:'09:00',nombre_profesor:'M',id_profesor:'prof-01',descripcion_hechos:'x',timestamp:new Date().toISOString(),derivado_pac:false,estado_pac:'NO_APLICA'},ADMIN);
ok('aviso: 2 alumnos a 0 puntos sin expediente', S.getAlumnosPendientesDeExpediente().length===2);
const e1 = S.crearExpediente({id_alumno:'a1',conducta_art37:1,fecha_desde:'2026-10-13',fecha_hasta:'2026-10-23',dias_acude:'viernes 16 de octubre',modalidad:'EXPULSION',fecha_documento:hoy},ADMIN);
const e2 = S.crearExpediente({id_alumno:'b1',conducta_art37:6,fecha_desde:'2026-10-14',fecha_hasta:'2026-10-15',dias_acude:'',modalidad:'AULA_CONVIVENCIA',fecha_documento:hoy},ADMIN);
ok('al abrir los expedientes desaparece el aviso', S.getAlumnosPendientesDeExpediente().length===0);
S.marcarTramite(e1.id_expediente,'llamada_familia',true,ADMIN);
let x = S.getExpedientes().find((e:any)=>e.id_expediente===e1.id_expediente);
ok('marcar una casilla guarda quién y cuándo (1/5)', x.tramites.llamada_familia.hecho && x.tramites.llamada_familia.por===ADMIN && !!x.tramites.llamada_familia.fecha && !x.completado);
['enviado_direccion','enviado_familia','aviso_equipo_docente'].forEach(k=>S.marcarTramite(e1.id_expediente,k,true,ADMIN));
x = S.getExpedientes().find((e:any)=>e.id_expediente===e1.id_expediente);
ok('con 4 de 5 (falta Séneca) sigue pendiente', !x.completado && !x.tramites.guardado_seneca.hecho);
S.marcarTramite(e1.id_expediente,'guardado_seneca',true,ADMIN);
x = S.getExpedientes().find((e:any)=>e.id_expediente===e1.id_expediente);
ok('al marcar las 5, el expediente queda completado', x.completado && !!x.fecha_completado);
S.marcarTramite(e1.id_expediente,'aviso_equipo_docente',false,ADMIN);
ok('desmarcar una vuelve a "pendiente"', !S.getExpedientes().find((e:any)=>e.id_expediente===e1.id_expediente).completado);
S.completarExpediente(e2.id_expediente,ADMIN);
x = S.getExpedientes().find((e:any)=>e.id_expediente===e2.id_expediente);
ok('botón "todos completados" marca las 5 casillas', x.completado && Object.keys(x.tramites).length===5 && Object.values(x.tramites).every((t:any)=>t.hecho));
{ // expediente antiguo (anterior a la casilla de Séneca): 4 trámites sin 'guardado_seneca'
  const viejo = { ...S.crearExpediente({id_alumno:'a1',conducta_art37:2,fecha_desde:'2026-10-01',fecha_hasta:'2026-10-02',dias_acude:'',modalidad:'AULA_CONVIVENCIA',fecha_documento:hoy},ADMIN) };
  const t = { ...viejo.tramites }; delete t.guardado_seneca; viejo.tramites = t;
  S.saveExpedientes(S.getExpedientes().map((e:any)=>e.id_expediente===viejo.id_expediente?viejo:e));
  ['llamada_familia','enviado_direccion','enviado_familia','aviso_equipo_docente'].forEach(k=>S.marcarTramite(viejo.id_expediente,k,true,ADMIN));
  ok('expediente antiguo: sin la casilla de Séneca no se da por completado', !S.getExpedientes().find((e:any)=>e.id_expediente===viejo.id_expediente).completado);
  S.completarExpediente(viejo.id_expediente,ADMIN);
  const v = S.getExpedientes().find((e:any)=>e.id_expediente===viejo.id_expediente);
  ok('expediente antiguo: "todos completados" añade también Séneca', v.completado && v.tramites.guardado_seneca?.hecho);
  S.eliminarExpediente(viejo.id_expediente,ADMIN);
}
caido=true; let p = await G.pushToGoogleDrive(); ok('sin red: no se da por guardado', !p.success);
const cola = JSON.parse(g.localStorage.getItem('sigc_bi_cola_pendiente_v1')||'{}');
ok('sin red: los expedientes quedan guardados en el navegador', (cola.expedientes||[]).length===2);
caido=false; p = await G.pushToGoogleDrive(); ok('con red: se guardan en Drive', p.success && JSON.parse(srv.archivos['DB']).expedientes_sancion.length===2);

console.log('== Otro ordenador de Jefatura');
yo = await entrar(ADMIN,'admin2026');
ok('ve los 2 expedientes con sus casillas', S.getExpedientes().length===2 && S.getExpedientes().find((e:any)=>e.id_expediente===e1.id_expediente).tramites.llamada_familia.hecho);
S.eliminarExpediente(e2.id_expediente,ADMIN); await G.pushToGoogleDrive();
ok('eliminar un expediente lo borra de Drive', JSON.parse(srv.archivos['DB']).expedientes_sancion.length===1);
ok('...y el alumno vuelve a aparecer en el aviso de 0 puntos', S.getAlumnosPendientesDeExpediente().some((a:any)=>a.id_alumno==='b1'));
{ // alumna con expediente ya abierto que vuelve a 0 por un ajuste manual de puntos (sin parte)
  const al = S.getAlumnos().find((a:any)=>a.id_alumno==='a1');
  const viejo = S.getExpedientes().find((e:any)=>e.id_alumno==='a1');
  S.saveExpedientes(S.getExpedientes().map((e:any)=>e.id_expediente===viejo.id_expediente?{...e,fecha_creacion:'2026-01-10T10:00:00.000Z'}:e));
  S.saveSanciones(S.getSanciones().map((x:any)=>x.id_alumno==='a1'?{...x,fecha:'2026-01-09'}:x));
  S.recalcularPuntosAlumnos('a1');
  if (S.getAlumnos().find((a:any)=>a.id_alumno==='a1').puntos_actuales>0) S.registrarAjustePuntos('a1',10,'prueba ajuste','M G',ADMIN);
  ok('ajuste manual que deja a 0 (con expediente anterior): sale en el aviso rojo', S.getAlumnos().find((a:any)=>a.id_alumno==='a1').puntos_actuales===0 && S.getAlumnosPendientesDeExpediente().some((a:any)=>a.id_alumno==='a1'));
  // expediente abierto HOY y, después, otro hecho que quita puntos el mismo día
  const nuevo = S.crearExpediente({id_alumno:'a1',conducta_art37:1,fecha_desde:hoy,fecha_hasta:hoy,dias_acude:'',modalidad:'AULA_CONVIVENCIA',fecha_documento:hoy},ADMIN);
  ok('tras abrir el expediente hoy, deja de salir en el aviso', !S.getAlumnosPendientesDeExpediente().some((a:any)=>a.id_alumno==='a1'));
  S.saveExpedientes(S.getExpedientes().map((e:any)=>e.id_expediente===nuevo.id_expediente?{...e,fecha_creacion:new Date(Date.now()-60000).toISOString()}:e));
  S.registrarAjustePuntos('a1',1,'otro hecho hoy','M G',ADMIN);
  ok('mismo día, hecho registrado DESPUÉS del expediente: vuelve a salir', S.getAlumnosPendientesDeExpediente().some((a:any)=>a.id_alumno==='a1'));
  S.eliminarExpediente(nuevo.id_expediente,ADMIN);
  S.saveExpedientes(S.getExpedientes().map((e:any)=>e.id_expediente===viejo.id_expediente?viejo:e));
  void al;
}

console.log('== Tutora de 1º ESO A y docente sin tutoría');
yo = await entrar(TUT,'tere2026');
ok('la tutora ve el expediente de su alumna', S.getExpedientes().length===1 && S.getExpedientes()[0].id_alumno==='a1');
const intento = S.getExpedientes()[0]; S.completarExpediente(intento.id_expediente,TUT); await G.pushToGoogleDrive();
ok('la tutora NO puede cambiar los trámites', !JSON.parse(srv.archivos['DB']).expedientes_sancion[0].completado);
ok('la tutora no tiene el menú "Sanciones"', !A.getAllowedNavItems(yo).some((i:any)=>i.id==='sanciones') && !A.isViewAllowed(yo,'sanciones'));
yo = await entrar(DOC,'dani2026');
ok('un docente sin tutoría no ve ningún expediente', S.getExpedientes().length===0);
console.log(fallos?`\n${fallos} FALLOS`:'\nTodo correcto');
