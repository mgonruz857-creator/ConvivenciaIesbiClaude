/**
 * Programa del servidor (Google Apps Script) de SIGC-BI, versión 2.
 *
 * Se genera con los datos del entorno (src/config/entorno.ts) y se pega en
 * script.google.com. Novedades frente a la versión 1:
 *  - Toda petición de datos exige una sesión iniciada (token).
 *  - Las contraseñas se comprueban aquí, se guardan con sal y nunca se devuelven.
 *  - Bloqueo de 15 minutos tras 5 intentos fallidos.
 *  - El profesorado sin privilegios solo recibe lo imprescindible y solo puede
 *    crear/modificar sus propios partes y el estado del Aula PAC.
 *  - Ya no se puede guardar mediante GET.
 *  - Las contraseñas antiguas (SHA-256 sin sal de la versión 1) se aceptan una vez
 *    y se convierten automáticamente al nuevo formato.
 *
 * Importante: el código del servidor no usa comillas invertidas ni "${" para poder
 * vivir dentro de esta plantilla.
 */

import { CARPETA_DRIVE_ID, ARCHIVO_DB_DRIVE, ES_ENTORNO_PRUEBAS } from '../config/entorno';

export const ADMIN_INICIAL = 'mgonruz857@g.educaand.es';

const PLANTILLA = String.raw`/**
 * =========================================================================
 * SIGC-BI · Servidor de datos v2 (Google Apps Script)
 * Entorno: __ENTORNO__
 * Carpeta de Drive: __CARPETA_ID__
 * Archivo de datos: __ARCHIVO_DB__
 * =========================================================================
 * Publicación: Implementar > Nueva implementación > Aplicación web
 *   - Ejecutar como: Yo
 *   - Quién tiene acceso: Cualquier persona
 *     (la seguridad la pone este programa: sin sesión iniciada no devuelve datos)
 */

var CARPETA_ID = '__CARPETA_ID__';
var ARCHIVO_DB = '__ARCHIVO_DB__';
var ADMIN_INICIAL = '__ADMIN_INICIAL__';

var DURACION_SESION_SEG = 21600;   // 6 horas (máximo de CacheService), se renueva con el uso
var MAX_INTENTOS = 5;
var BLOQUEO_SEG = 900;             // 15 minutos
var ITERACIONES_HASH_V1 = 400;   // solo para comprobar claves guardadas con la primera versión del servidor
var TROZO_CACHE = 45000;           // caracteres por trozo (límite de 100 KB por valor, con tildes)
// En PRUEBAS se puede crear la base de datos si no existe; en PRODUCCIÓN nunca (si no se encuentra
// el archivo es que algo va mal, y crear uno vacío haría creer que se han perdido los datos)
var PERMITIR_BD_NUEVA = __PERMITIR_BD_NUEVA__;
// Archivos leídos en esta ejecución (para la migración: duplicados con el mismo nombre)
var ARCHIVOS_LEIDOS = [];

// ------------------------------------------------------------------ Emergencia (solo desde el editor)

/**
 * Si el administrador olvida su contraseña: abrir este proyecto en script.google.com,
 * elegir esta función en el desplegable de arriba y pulsar "Ejecutar".
 * En su próximo acceso a la app escribirá dos veces una contraseña nueva.
 * Solo puede ejecutarla quien tenga acceso a este proyecto de Apps Script.
 */
function restablecerClaveAdministrador() {
  asegurarMigracion();
  var email = norm(ADMIN_INICIAL);
  propiedades().deleteProperty('CLAVE_' + email);
  invalidarSesiones(email);
  CacheService.getScriptCache().remove('FALLOS_' + email);
  var db = leerDb();
  if (claveAntigua(db, email)) {
    borrarClaveAntigua(db, email);
    escribirDb(db);
  }
  Logger.log('Contraseña de ' + email + ' restablecida. Fije una nueva en el próximo acceso a la app.');
}

/**
 * Comprobación de los datos (solo cuenta; no modifica nada ni muestra datos personales).
 * Elegir "diagnosticoDatos" en el desplegable de arriba, pulsar "Ejecutar" y mirar el
 * "Registro de ejecución".
 */
function diagnosticoDatos() {
  var db = leerDbDeDrive(true);
  var borrados = {};
  db.deleted_sanciones.forEach(function (id) { borrados[id] = true; });
  var activos = db.sanciones.filter(function (x) { return x && x.id_sancion && !borrados[x.id_sancion]; });
  var sinteticos = activos.filter(function (x) {
    return String(x.id_sancion).indexOf('snc-rec-') === 0 || String(x.id_sancion).indexOf('snc-v2-') === 0 ||
      String(x.descripcion_hechos || '').indexOf('Incidencia registrada según tipificación ROF') === 0;
  }).length;
  var porExp = {}, expRepetidos = 0;
  activos.forEach(function (x) {
    var k = String(x.numero_expediente || '') + '|' + x.id_alumno;
    if (x.numero_expediente) { if (porExp[k]) expRepetidos++; porExp[k] = true; }
  });
  var porMes = {}, porSemana = {};
  activos.forEach(function (x) {
    var f = String(x.fecha || '').substring(0, 10);
    porMes[f.substring(0, 7) || 'sin fecha'] = (porMes[f.substring(0, 7) || 'sin fecha'] || 0) + 1;
    var d = new Date(f + 'T12:00:00');
    if (!isNaN(d.getTime())) {
      var lunes = new Date(d.getTime() - ((d.getDay() + 6) % 7) * 86400000);
      var k2 = Utilities.formatDate(lunes, 'Europe/Madrid', 'yyyy-MM-dd');
      porSemana[k2] = (porSemana[k2] || 0) + 1;
    }
  });
  var saldos = (db.saldos_antes_v2 && db.saldos_antes_v2.saldos) || {};
  var numSaldos = 0, saldosNoNumero = 0, menos10 = 0;
  for (var id in saldos) {
    numSaldos++;
    var v = Number(saldos[id]);
    if (isNaN(v) || saldos[id] === null || saldos[id] === '') saldosNoNumero++;
    else if (v < 10) menos10++;
  }
  var mig = db.migracion_v2 || {};
  var lineas = [
    'Partes en el archivo (todos): ' + db.sanciones.length,
    'Partes activos: ' + activos.length + ' (copias automáticas de la v1 entre ellos: ' + sinteticos + ')',
    'Marcados como borrados (lista de borrados): ' + db.deleted_sanciones.length,
    'Partes borrados por revisar guardados al actualizar: ' + ((mig.partes_marcados_borrados || []).length),
    'Partes que comparten número de expediente con otro del mismo alumno: ' + expRepetidos,
    'Alumnado: ' + db.alumnos.length + ' · Profesorado: ' + db.profesores.length,
    'Saldos anotados de la v1: ' + numSaldos + ' (sin número: ' + saldosNoNumero + ', por debajo de 10: ' + menos10 + ')',
    'Copias de seguridad: ' + ((mig.copias || []).join(', ') || 'ninguna'),
    'Partes por mes: ' + JSON.stringify(porMes),
    'Partes por semana (lunes): ' + JSON.stringify(porSemana),
  ];
  lineas.forEach(function (l) { Logger.log(l); });
  return lineas.join('\n');
}

/**
 * Recuperación de partes perdidos (desde el editor). Lee los archivos de la carpeta cuyo nombre
 * empieza por RECUPERAR_PARTES_ (con una lista "partes") y los pone en el informe de Jefatura como
 * "partes borrados por revisar". NO recupera ninguno: Jefatura decide en la app con «Recuperar».
 * Después renombra cada archivo a PROCESADO_... para no leerlo dos veces.
 */
function prepararPartesParaRevisar() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var db = leerDbDeDrive();
    var activos = {};
    db.sanciones.forEach(function (x) { if (x && x.id_sancion) activos[x.id_sancion] = true; });
    if (!db.migracion_v2) db.migracion_v2 = { fecha: new Date().toISOString(), copias: [] };
    var lista = db.migracion_v2.partes_marcados_borrados || [];
    var ya = {};
    lista.forEach(function (x) { if (x && x.id_sancion) ya[x.id_sancion] = true; });
    var archivos = DriveApp.getFolderById(CARPETA_ID).getFiles();
    var leidos = 0, anadidos = 0, yaActivos = 0;
    var procesados = [];
    while (archivos.hasNext()) {
      var f = archivos.next();
      var nombre = f.getName();
      if (nombre.indexOf('RECUPERAR_PARTES_') !== 0) continue;
      var d = decodificarDb(f.getBlob().getDataAsString());
      leidos++;
      (Array.isArray(d.partes) ? d.partes : []).forEach(function (x) {
        if (!x || !x.id_sancion) return;
        if (activos[x.id_sancion]) { yaActivos++; return; }
        if (ya[x.id_sancion]) return;
        lista.push(x);
        ya[x.id_sancion] = true;
        anadidos++;
      });
      procesados.push(f);
    }
    db.migracion_v2.partes_marcados_borrados = lista;
    if (anadidos) escribirDb(db);
    procesados.forEach(function (f) { f.setName('PROCESADO_' + f.getName()); });
    var r = 'Archivos leídos: ' + leidos + ' · Partes añadidos al informe para revisar: ' + anadidos +
      ' · Ya estaban activos: ' + yaActivos + ' · Total por revisar: ' + lista.length;
    Logger.log(r);
    return r;
  } finally {
    lock.releaseLock();
  }
}

// ------------------------------------------------------------------ Entrada

function doGet(e) {
  return salida({ ok: true, servicio: 'SIGC-BI', version: 2 });
}

function doPost(e) {
  var req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return salida({ ok: false, error: 'Petición no válida.' });
  }
  try {
    asegurarMigracion();
    switch (req.accion) {
      case 'estadoCuenta': return salida(estadoCuenta(req));
      case 'login': return salida(login(req));
      case 'logout': cerrarSesion(req.token); return salida({ ok: true });
      case 'leer': return salida(leer(req));
      case 'guardar': return salida(guardar(req));
      case 'cambiarClave': return salida(cambiarClave(req));
      case 'restablecerClave': return salida(restablecerClave(req));
      case 'estadoClaves': return salida(estadoClaves(req));
      default: return salida({ ok: false, error: 'Acción desconocida.' });
    }
  } catch (err) {
    if (err && err.codigo) return salida({ ok: false, codigo: err.codigo, error: err.message });
    return salida({ ok: false, error: 'Error del servidor: ' + err });
  }
}

function salida(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function fallo(codigo, mensaje) {
  var e = new Error(mensaje);
  e.codigo = codigo;
  throw e;
}

function norm(email) {
  return String(email || '').toLowerCase().trim();
}

// ------------------------------------------------------------------ Base de datos

function vacia() {
  return { profesores: [], alumnos: [], sanciones: [], compensaciones: [], audit_logs: [], expedientes_sancion: [],
           deleted_sanciones: [], deleted_alumnos: [], deleted_profesores: [], deleted_expedientes: [],
           timestamp: new Date().toISOString() };
}

function asegurarListas(db) {
  ['profesores', 'alumnos', 'sanciones', 'compensaciones', 'audit_logs', 'expedientes_sancion',
   'deleted_sanciones', 'deleted_alumnos', 'deleted_profesores', 'deleted_expedientes'].forEach(function (k) {
    if (!Array.isArray(db[k])) db[k] = [];
  });
  return db;
}

function cacheLeer() {
  var cache = CacheService.getScriptCache();
  var n = parseInt(cache.get('DB2_N') || '0', 10);
  if (!n) return null;
  var claves = [];
  for (var i = 0; i < n; i++) claves.push('DB2_' + i);
  var trozos = cache.getAll(claves);
  var texto = '';
  for (var j = 0; j < n; j++) {
    if (trozos['DB2_' + j] === undefined) return null;
    texto += trozos['DB2_' + j];
  }
  return texto;
}

function cacheGuardar(texto) {
  var cache = CacheService.getScriptCache();
  try {
    var valores = {};
    var n = Math.ceil(texto.length / TROZO_CACHE);
    for (var i = 0; i < n; i++) valores['DB2_' + i] = texto.substring(i * TROZO_CACHE, (i + 1) * TROZO_CACHE);
    valores['DB2_N'] = String(n);
    cache.putAll(valores, 1800);
  } catch (e) {
    cache.remove('DB2_N');
  }
}

/** Archivo principal de datos (se recuerda su identificador para no buscarlo en cada petición). */
function archivoDb() {
  var cache = CacheService.getScriptCache();
  var id = cache.get('DB2_ID');
  if (id) {
    try { return DriveApp.getFileById(id); } catch (e) { cache.remove('DB2_ID'); }
  }
  var archivos = DriveApp.getFolderById(CARPETA_ID).getFilesByName(ARCHIVO_DB);
  if (!archivos.hasNext()) return null;
  var f = archivos.next();
  cache.put('DB2_ID', f.getId(), 21600);
  return f;
}

function fechaArchivo(f) {
  try { return String(DriveApp.getFileById(f.getId()).getLastUpdated().getTime()); } catch (e) { return ''; }
}

/**
 * ¿Sigue valiendo la copia en caché? Se comprueba la fecha de modificación del archivo en Drive
 * (como mucho cada 15 s, o siempre si "forzar"), por si alguien lo ha cambiado por fuera de este
 * servidor (otra versión de la app, una restauración manual...). Así nunca se pisa un cambio externo.
 */
function cacheVigente() {
  var cache = CacheService.getScriptCache();
  if (cache.get('DB2_VERIF')) return true;
  var marca = cache.get('DB2_FECHA');
  var f = archivoDb();
  if (!f || !marca) return false;
  if (fechaArchivo(f) !== marca) return false;
  cache.put('DB2_VERIF', '1', 15);
  return true;
}

function anotarFechaCache(f) {
  if (!f) return;
  var cache = CacheService.getScriptCache();
  cache.put('DB2_FECHA', fechaArchivo(f), 1800);
  cache.put('DB2_VERIF', '1', 15);
}

function leerDb(forzarLectura) {
  // Lecturas normales: copia en caché si sigue siendo la del archivo. Guardados (con el bloqueo
  // puesto): siempre del archivo, para no partir nunca de una copia antigua.
  if (!forzarLectura && cacheVigente()) {
    var texto = cacheLeer();
    if (texto) return JSON.parse(texto);
  }
  // La fecha se toma ANTES de leer el contenido: si alguien guarda entre medias, la fecha anotada
  // será la antigua y la siguiente comprobación volverá a leer el archivo.
  var f = archivoDb();
  var fecha = f ? fechaArchivo(f) : '';
  var db = leerDbDeDrive();
  cacheGuardar(JSON.stringify(db));
  var cache = CacheService.getScriptCache();
  if (fecha) {
    cache.put('DB2_FECHA', fecha, 1800);
    cache.put('DB2_VERIF', '1', 15);
  } else {
    cache.remove('DB2_FECHA');
  }
  return db;
}

/**
 * Interpreta el contenido del archivo de datos. Admite los formatos que guardaba la versión 1
 * ("data=..." y "%7B..."). Si no se entiende, se DETIENE todo: nunca se sigue con una base vacía.
 */
function decodificarDb(contenido) {
  var t = String(contenido || '').trim();
  var d = null;
  try {
    if (t.indexOf('data=') === 0) d = JSON.parse(decodeURIComponent(t.substring(5).replace(/\+/g, ' ')));
    else if (t.indexOf('%7B') === 0 || t.indexOf('%7b') === 0) d = JSON.parse(decodeURIComponent(t.replace(/\+/g, ' ')));
    else d = JSON.parse(t);
  } catch (e) {
    d = null;
  }
  if (!d || typeof d !== 'object' || Array.isArray(d)) {
    fallo('BD_ILEGIBLE', 'No se puede leer el archivo de datos de Drive. No se ha modificado nada. Avise al administrador.');
  }
  return asegurarListas(d);
}

/** Lee el archivo de Drive sin usar la caché (si hay varios con el mismo nombre, une su contenido). */
function leerDbDeDrive(sinFiltrarBorrados) {
  var archivos = DriveApp.getFolderById(CARPETA_ID).getFilesByName(ARCHIVO_DB);
  var lista = [];
  while (archivos.hasNext()) {
    var f = archivos.next();
    lista.push({ f: f, d: decodificarDb(f.getBlob().getDataAsString()) });
  }
  ARCHIVOS_LEIDOS = lista.map(function (x) { return x.f; });
  if (!lista.length) {
    if (!PERMITIR_BD_NUEVA) {
      fallo('BD_NO_ENCONTRADA', 'No se encuentra el archivo de datos en la carpeta de Drive. No se ha modificado nada. Avise al administrador.');
    }
    return vacia();
  }
  // Como la versión 1: la base es el archivo con más partes; del resto se añade lo que falte
  lista.sort(function (a, b) { return b.d.sanciones.length - a.d.sanciones.length; });
  var db = lista[0].d;
  CacheService.getScriptCache().put('DB2_ID', lista[0].f.getId(), 21600);
  for (var i = 1; i < lista.length; i++) {
    var d = lista[i].d;
    [['sanciones', 'id_sancion'], ['alumnos', 'id_alumno'], ['compensaciones', 'id_compensacion'],
     ['expedientes_sancion', 'id_expediente'], ['profesores', 'email']].forEach(function (par) {
      var k = par[0], idk = par[1];
      var vistos = {};
      db[k].forEach(function (x) { if (x && x[idk]) vistos[norm(x[idk])] = true; });
      d[k].forEach(function (x) { if (x && x[idk] && !vistos[norm(x[idk])]) { db[k].push(x); vistos[norm(x[idk])] = true; } });
    });
    ['deleted_sanciones', 'deleted_alumnos', 'deleted_profesores', 'deleted_expedientes'].forEach(function (k) {
      db[k] = unirTombstones(db[k], d[k]);
    });
  }
  if (sinFiltrarBorrados) return db;
  var borradas = {};
  db.deleted_sanciones.forEach(function (id) { borradas[id] = true; });
  db.sanciones = db.sanciones.filter(function (s) { return s && s.id_sancion && !borradas[s.id_sancion]; });
  return db;
}

function escribirDb(db) {
  db.timestamp = new Date().toISOString();
  (db.profesores || []).forEach(function (p) { delete p.password_hash; delete p.requiere_cambio_clave; });
  delete db.reset_credenciales_emails;
  var texto = JSON.stringify(db);
  var f = archivoDb();
  if (f) f.setContent(texto);
  else f = DriveApp.getFolderById(CARPETA_ID).createFile(ARCHIVO_DB, texto, MimeType.PLAIN_TEXT);
  cacheGuardar(texto);
  anotarFechaCache(f);
}

// ------------------------------------------------------------------ Paso de la versión 1 a la 2 (una sola vez)

/**
 * La primera vez que se usa este servidor:
 *  1) guarda en la carpeta una COPIA DE SEGURIDAD exacta del archivo de datos;
 *  2) pasa las contraseñas de la versión 1 a un único sitio, respetando los restablecimientos;
 *  3) anota el saldo que cada alumno/a tenía en la versión 1 (para el informe de Jefatura).
 */
function asegurarMigracion() {
  var props = propiedades();
  if (props.getProperty('MIGRACION_V2')) return;
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (props.getProperty('MIGRACION_V2')) return;
    var carpeta = DriveApp.getFolderById(CARPETA_ID);
    var archivos = carpeta.getFilesByName(ARCHIVO_DB);
    var originales = [];
    while (archivos.hasNext()) originales.push(archivos.next().getBlob().getDataAsString());
    if (!originales.length && !PERMITIR_BD_NUEVA) {
      fallo('BD_NO_ENCONTRADA', 'No se encuentra el archivo de datos en la carpeta de Drive. No se ha modificado nada. Avise al administrador.');
    }
    if (originales.length) {
      var db = leerDbDeDrive(true);
      if (!db.migracion_v2) {
        var ahora = new Date();
        var sello = Utilities.formatDate(ahora, 'Europe/Madrid', 'yyyy-MM-dd_HH-mm');
        var copias = [];
        originales.forEach(function (texto, i) {
          var nombre = 'COPIA_SEGURIDAD_ANTES_V2_' + sello + (i ? '_' + (i + 1) : '') + '.json';
          carpeta.createFile(nombre, texto, MimeType.PLAIN_TEXT);
          copias.push(nombre);
        });
        migrarClavesV1(db);
        // Partes que la versión 1 marcó como borrados pero seguían en el archivo (por eso a veces
        // aparecían y otras no). Siguen borrados; se guarda una copia para que Jefatura decida
        // en el informe si recupera alguno.
        var marcados = {};
        db.deleted_sanciones.forEach(function (id) { marcados[id] = true; });
        var borradosPresentes = db.sanciones.filter(function (x) { return x && marcados[x.id_sancion]; });
        db.sanciones = db.sanciones.filter(function (x) { return x && x.id_sancion && !marcados[x.id_sancion]; });
        var saldos = {};
        db.alumnos.forEach(function (a) {
          if (a && a.id_alumno) saldos[a.id_alumno] = Number(a.puntos_actuales);
        });
        db.saldos_antes_v2 = { fecha: ahora.toISOString(), saldos: saldos };
        db.migracion_v2 = { fecha: ahora.toISOString(), copias: copias, partes_marcados_borrados: borradosPresentes };
        var duplicados = ARCHIVOS_LEIDOS.slice();
        escribirDb(db);
        // Si había varios archivos con el mismo nombre, su contenido ya está unido en el principal
        // (y todos tienen copia de seguridad): se renombran para que no se vuelvan a leer
        var principal = archivoDb();
        duplicados.forEach(function (f) {
          if (principal && f.getId() !== principal.getId()) f.setName('DUPLICADO_ANTIGUO_' + sello + '_' + ARCHIVO_DB);
        });
      }
    }
    props.setProperty('MIGRACION_V2', new Date().toISOString());
  } finally {
    lock.releaseLock();
  }
}

/**
 * La versión 1 guardaba el resumen de cada contraseña en dos sitios (credenciales_profesores y
 * profesores[].password_hash) y marcaba los restablecimientos en reset_credenciales_emails o
 * requiere_cambio_clave. Se unifica todo en credenciales_profesores; si los dos sitios no
 * coinciden se aceptan ambos en el primer acceso (luego se guarda solo la contraseña nueva).
 */
function migrarClavesV1(db) {
  var resets = {};
  (db.reset_credenciales_emails || []).forEach(function (e) { resets[norm(e)] = true; });
  var claves = {};
  var origen = db.credenciales_profesores || {};
  for (var k in origen) { if (origen[k] && !resets[norm(k)]) claves[norm(k)] = origen[k]; }
  var alternativas = {};
  (db.profesores || []).forEach(function (p) {
    if (!p || !p.email) return;
    var e = norm(p.email);
    if (resets[e] || p.requiere_cambio_clave === true) { delete claves[e]; return; }
    if (p.password_hash) {
      if (!claves[e]) claves[e] = p.password_hash;
      else if (claves[e] !== p.password_hash) alternativas[e] = p.password_hash;
    }
  });
  db.credenciales_profesores = claves;
  db.credenciales_v1_alternativas = alternativas;
}

// ------------------------------------------------------------------ Profesorado y claves

function buscarProfesor(db, email) {
  var e = norm(email);
  var lista = db.profesores || [];
  for (var i = 0; i < lista.length; i++) {
    if (lista[i] && norm(lista[i].email) === e) return lista[i];
  }
  if (e === norm(ADMIN_INICIAL)) {
    return { id_profesor: 'prof-01', email: e, nombre: 'Administrador', apellidos: '', departamento: 'Convivencia',
             rol: 'ROLE_CONVIVENCIA_ADMIN', estado: 'ACTIVO' };
  }
  return null;
}

function esAdmin(p) {
  return !!p && (p.rol === 'ROLE_CONVIVENCIA_ADMIN' || norm(p.email) === norm(ADMIN_INICIAL));
}

function perfilPublico(p) {
  return { id_profesor: p.id_profesor, email: p.email, nombre: p.nombre, apellidos: p.apellidos,
           departamento: p.departamento, rol: p.rol, tutor_de_grupo: p.tutor_de_grupo,
           tutoria_asignada_por: p.tutoria_asignada_por, estado: p.estado, motivo_baja: p.motivo_baja };
}

function propiedades() { return PropertiesService.getScriptProperties(); }

/**
 * Clave secreta del servidor (se crea sola la primera vez). Se guarda en las propiedades
 * del script, que solo puede ver el propietario del proyecto, igual que las contraseñas.
 */
function secretoServidor() {
  var p = propiedades();
  var s = p.getProperty('SECRETO_SERVIDOR');
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid();
    p.setProperty('SECRETO_SERVIDOR', s);
  }
  return s;
}

/** Cifrado de contraseñas: HMAC-SHA256 con sal propia y secreto del servidor (rápido en Apps Script). */
function hashClave(clave, sal) {
  return Utilities.base64Encode(
    Utilities.computeHmacSha256Signature(sal + '|' + clave, secretoServidor() + sal, Utilities.Charset.UTF_8));
}

/** Formato de la primera versión del servidor v2 (lento): solo para comprobar y convertir. */
function hashClaveLento(clave, sal) {
  var v = sal + '|' + clave;
  for (var i = 0; i < ITERACIONES_HASH_V1; i++) {
    v = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, v + sal, Utilities.Charset.UTF_8));
  }
  return v;
}

function sha256Hex(texto) {
  // Igual que la versión 1 de la app: cada carácter se toma como un byte (charCode & 255)
  var entrada = [];
  for (var i = 0; i < texto.length; i++) { var c = texto.charCodeAt(i) & 255; entrada.push(c > 127 ? c - 256 : c); }
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, entrada);
  return bytes.map(function (b) { var h = (b & 255).toString(16); return h.length === 1 ? '0' + h : h; }).join('');
}

/** Comprueba una contraseña contra lo guardado; si estaba en el formato lento, la convierte. */
function claveCorrecta(email, clave, guardada) {
  if (guardada.v === 3) return hashClave(clave, guardada.sal) === guardada.hash;
  if (hashClaveLento(clave, guardada.sal) !== guardada.hash) return false;
  fijarClave(email, clave);
  return true;
}

function claveGuardada(email) {
  var r = propiedades().getProperty('CLAVE_' + norm(email));
  return r ? JSON.parse(r) : null;
}

function claveAntigua(db, email) {
  var c = db.credenciales_profesores || {};
  for (var k in c) { if (norm(k) === norm(email)) return c[k]; }
  return null;
}

/** Contraseña de la versión 1 correcta: se admite cualquiera de los resúmenes que la v1 tenía guardados. */
function claveAntiguaCorrecta(db, email, clave) {
  var h = sha256Hex(String(clave || '').trim());
  if (h === claveAntigua(db, email)) return true;
  var alt = (db.credenciales_v1_alternativas || {})[norm(email)];
  return !!alt && h === alt;
}

function borrarClaveAntigua(db, email) {
  for (var k in (db.credenciales_profesores || {})) { if (norm(k) === norm(email)) delete db.credenciales_profesores[k]; }
  if (db.credenciales_v1_alternativas) delete db.credenciales_v1_alternativas[norm(email)];
}

function fijarClave(email, clave) {
  var sal = Utilities.getUuid();
  propiedades().setProperty('CLAVE_' + norm(email),
    JSON.stringify({ v: 3, sal: sal, hash: hashClave(clave, sal), fecha: new Date().toISOString() }));
}

function tieneClave(db, email) {
  return !!claveGuardada(email) || !!claveAntigua(db, email);
}

function validarComplejidad(clave) {
  var c = String(clave || '');
  if (c.length < 6) fallo('CLAVE_DEBIL', 'La contraseña debe tener al menos 6 caracteres.');
  if (!/[A-Za-zÁÉÍÓÚáéíóúÑñÜü]/.test(c) || !/[0-9]/.test(c)) {
    fallo('CLAVE_DEBIL', 'La contraseña debe combinar letras y números (por ejemplo: infante26).');
  }
}

// ------------------------------------------------------------------ Sesiones

// Al restablecer una contraseña se cambia la "generación" de sesiones de esa cuenta:
// las sesiones abiertas antes dejan de valer
function generacionSesiones(email) {
  return propiedades().getProperty('GEN_' + norm(email)) || '0';
}

function invalidarSesiones(email) {
  propiedades().setProperty('GEN_' + norm(email), String(new Date().getTime()));
}

function crearSesion(email) {
  var token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put('SES_' + token, norm(email) + '|' + generacionSesiones(email), DURACION_SESION_SEG);
  return token;
}

function cerrarSesion(token) {
  if (token) CacheService.getScriptCache().remove('SES_' + token);
}

function sesion(token, db) {
  if (!token) fallo('NO_AUTH', 'Debe iniciar sesión.');
  var cache = CacheService.getScriptCache();
  var valor = cache.get('SES_' + token);
  if (!valor) fallo('NO_AUTH', 'La sesión ha caducado. Vuelva a iniciar sesión.');
  var partes = String(valor).split('|');
  var email = partes[0];
  if (partes.length > 1 && partes[1] !== generacionSesiones(email)) {
    cerrarSesion(token);
    fallo('NO_AUTH', 'Su contraseña se ha restablecido. Vuelva a iniciar sesión.');
  }
  var p = buscarProfesor(db, email);
  if (!p || p.estado === 'INACTIVO') { cerrarSesion(token); fallo('NO_AUTH', 'Su cuenta ya no tiene acceso.'); }
  cache.put('SES_' + token, valor, DURACION_SESION_SEG);
  return { email: norm(email), prof: p, admin: esAdmin(p) };
}

// ------------------------------------------------------------------ Acciones

function estadoCuenta(req) {
  var db = leerDb();
  var p = buscarProfesor(db, req.email);
  if (!p) return { ok: true, registrado: false };
  // Sin sesión no se revela el motivo de la baja (puede ser un dato personal)
  if (p.estado === 'INACTIVO') return { ok: true, registrado: true, activo: false };
  return { ok: true, registrado: true, activo: true, tieneClave: tieneClave(db, req.email) };
}

function login(req) {
  var email = norm(req.email);
  var cache = CacheService.getScriptCache();
  var clave = String(req.clave || '');
  var intentos = parseInt(cache.get('FALLOS_' + email) || '0', 10);
  if (intentos >= MAX_INTENTOS) {
    fallo('BLOQUEADO', 'Demasiados intentos fallidos. Espere 15 minutos o pida a Jefatura que restablezca su contraseña.');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var db = leerDb(true);
    var p = buscarProfesor(db, email);
    if (!p) fallo('NO_REGISTRADO', 'La cuenta "' + email + '" no figura en el claustro. Debe darla de alta Jefatura de Estudios.');
    if (p.estado === 'INACTIVO') fallo('BAJA', 'La cuenta "' + email + '" está de baja en el centro.');

    var guardada = claveGuardada(email);
    var antigua = claveAntigua(db, email);
    var primerAcceso = false;

    if (guardada) {
      if (!claveCorrecta(email, clave, guardada)) return claveIncorrecta(email, intentos);
    } else if (antigua) {
      // Contraseña de la versión anterior: comprobar y convertir al formato nuevo
      if (!claveAntiguaCorrecta(db, email, clave)) return claveIncorrecta(email, intentos);
      fijarClave(email, clave);
      borrarClaveAntigua(db, email);
      escribirDb(db);
    } else {
      // Primer acceso: el docente fija su contraseña
      validarComplejidad(clave);
      fijarClave(email, clave);
      primerAcceso = true;
    }

    cache.remove('FALLOS_' + email);
    return { ok: true, token: crearSesion(email), usuario: perfilPublico(p), admin: esAdmin(p), primerAcceso: primerAcceso };
  } finally {
    lock.releaseLock();
  }
}

function claveIncorrecta(email, intentosPrevios) {
  var n = intentosPrevios + 1;
  CacheService.getScriptCache().put('FALLOS_' + email, String(n), BLOQUEO_SEG);
  var quedan = MAX_INTENTOS - n;
  fallo('CLAVE_INCORRECTA', quedan > 0
    ? 'Contraseña incorrecta. Le quedan ' + quedan + ' intento(s).'
    : 'Contraseña incorrecta. Cuenta bloqueada 15 minutos.');
}

function cambiarClave(req) {
  var db = leerDb();
  var s = sesion(req.token, db);
  var guardada = claveGuardada(s.email);
  if (!guardada || !claveCorrecta(s.email, String(req.actual || ''), guardada)) {
    fallo('CLAVE_INCORRECTA', 'La contraseña actual no es correcta.');
  }
  validarComplejidad(req.nueva);
  fijarClave(s.email, String(req.nueva));
  return { ok: true };
}

function restablecerClave(req) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return restablecerClaveBloqueado(req);
  } finally {
    lock.releaseLock();
  }
}

function restablecerClaveBloqueado(req) {
  var db = leerDb(true);
  var s = sesion(req.token, db);
  if (!s.admin) fallo('PROHIBIDO', 'Solo Jefatura o Convivencia pueden restablecer contraseñas.');
  var email = norm(req.email);
  propiedades().deleteProperty('CLAVE_' + email);
  invalidarSesiones(email);
  CacheService.getScriptCache().remove('FALLOS_' + email);
  if (claveAntigua(db, email)) {
    borrarClaveAntigua(db, email);
    escribirDb(db);
  }
  registrarAuditoria(db, s.email, 'Docente/' + email, 'Contraseña restablecida: el docente fijará una nueva en su próximo acceso.');
  return { ok: true };
}

function estadoClaves(req) {
  var db = leerDb();
  var s = sesion(req.token, db);
  if (!s.admin) fallo('PROHIBIDO', 'Sin permiso.');
  var estado = {};
  (db.profesores || []).forEach(function (p) { if (p && p.email) estado[norm(p.email)] = tieneClave(db, p.email); });
  return { ok: true, estado: estado };
}

function registrarAuditoria(db, email, entidad, detalles) {
  db.audit_logs.unshift({ id_log: 'log-' + new Date().getTime() + '-' + Math.floor(Math.random() * 1e6),
    timestamp: new Date().toISOString(), usuario_email: email, accion: 'ACTUALIZACION_SISTEMA',
    entidad: entidad, detalles: detalles, hash_integridad: '' });
  db.audit_logs = db.audit_logs.slice(0, 300);
  escribirDb(db);
}

// ------------------------------------------------------------------ Lectura

function sinCredenciales(db) {
  var copia = JSON.parse(JSON.stringify(db));
  delete copia.credenciales_profesores;
  delete copia.credenciales_v1_alternativas;
  delete copia.reset_credenciales_emails;
  copia.profesores = (copia.profesores || []).map(function (p) { delete p.password_hash; return p; });
  return copia;
}

var CAMPOS_PARTE_AJENO = ['id_sancion', 'numero_expediente', 'timestamp', 'fecha', 'hora_incidente', 'tramo_horario',
  'id_alumno', 'id_profesor', 'nombre_profesor', 'codigo_infraccion', 'tipo_conducta', 'puntos_restados',
  'derivado_pac', 'estado_pac', 'estado_tramitacion', 'ubicacion', 'materia'];

function soloCampos(obj, campos) {
  var r = {};
  campos.forEach(function (c) { if (obj[c] !== undefined) r[c] = obj[c]; });
  return r;
}

function esAutor(s, prof) {
  return !!s && !!prof && !!prof.id_profesor && !!s.id_profesor && (s.id_profesor === prof.id_profesor);
}

// Datos de cada alumno/a que recibe cualquier docente (los de su tutoría los recibe completos)
var CAMPOS_ALUMNO_DOCENTE = ['id_alumno', 'nie', 'nombre', 'apellidos', 'grupo', 'puntos_actuales', 'estado',
  'historial_sanciones_count', 'fecha_baja'];

function vistaDocente(db, prof) {
  var todo = sinCredenciales(db);
  // Solo las listas que necesita la app; nada más de la base de datos (configuración, informes...)
  var d = {};
  ['profesores', 'alumnos', 'sanciones', 'compensaciones', 'expedientes_sancion', 'deleted_sanciones',
   'deleted_alumnos', 'deleted_profesores', 'deleted_expedientes'].forEach(function (k) {
    d[k] = Array.isArray(todo[k]) ? todo[k] : [];
  });
  d.timestamp = todo.timestamp;
  // Tutoría: el tutor ve completo todo lo de su grupo (partes, medidas y teléfonos de las familias)
  var grupoTutoria = prof.tutor_de_grupo || '';
  var deMiTutoria = {};
  if (grupoTutoria) {
    d.alumnos.forEach(function (a) { if (a && a.grupo === grupoTutoria) deMiTutoria[a.id_alumno] = true; });
  }
  d.profesores = d.profesores.map(function (p) {
    var c = perfilPublico(p);
    if (norm(p.email) !== norm(prof.email)) delete c.motivo_baja;   // el motivo de la baja de otros no
    return c;
  });
  d.alumnos = d.alumnos.map(function (a) {
    if (deMiTutoria[a.id_alumno]) return a;
    var c = soloCampos(a, CAMPOS_ALUMNO_DOCENTE);
    c.telefono_tutor = ''; c.nombre_tutor = '';
    return c;
  });
  // Aula PAC: el profesorado de guardia ve completos los partes derivados HOY (es lo que muestra
  // la pantalla del Aula PAC); los de días anteriores, como cualquier parte ajeno
  var hoy = Utilities.formatDate(new Date(), 'Europe/Madrid', 'yyyy-MM-dd');
  d.sanciones = d.sanciones.map(function (s) {
    if (esAutor(s, prof) || deMiTutoria[s.id_alumno]) return s;
    if (s.derivado_pac && s.fecha === hoy) {
      var c = JSON.parse(JSON.stringify(s));
      delete c.observaciones_tramitacion; delete c.fecha_comunicacion_familia;
      return c;
    }
    var m = soloCampos(s, CAMPOS_PARTE_AJENO);
    m.descripcion_hechos = '';
    return m;
  });
  d.compensaciones = d.compensaciones.map(function (c) {
    if (deMiTutoria[c.id_alumno]) return c;
    return soloCampos(c, ['id_compensacion', 'timestamp', 'id_alumno', 'puntos_recuperados', 'fecha_completada']);
  });
  // Expedientes de sanción: solo los del alumnado de su tutoría
  d.expedientes_sancion = (d.expedientes_sancion || []).filter(function (e) { return deMiTutoria[e.id_alumno]; });
  d.audit_logs = [];
  return d;
}

function leer(req) {
  var db = leerDb();
  var s = sesion(req.token, db);
  // Lectura incremental: si el cliente ya tiene esta versión, no se reenvía nada
  if (req.desde && db.timestamp && req.desde === db.timestamp) {
    return { ok: true, sinCambios: true, timestamp: db.timestamp };
  }
  return { ok: true, admin: s.admin, usuario: perfilPublico(s.prof), data: s.admin ? sinCredenciales(db) : vistaDocente(db, s.prof) };
}

// ------------------------------------------------------------------ Guardado

function unirTombstones(a, b) {
  var m = {};
  (a || []).forEach(function (x) { if (x) m[x] = true; });
  (b || []).forEach(function (x) { if (x) m[x] = true; });
  return Object.keys(m);
}

function guardar(req) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var db = leerDb(true);
    var s = sesion(req.token, db);
    var entrada = asegurarListas(req.data || {});
    var avisos = [];
    var resultado = s.admin ? fusionAdmin(db, entrada) : fusionDocente(db, entrada, s, avisos);
    escribirDb(resultado);
    return { ok: true, timestamp: resultado.timestamp, avisos: avisos };
  } finally {
    lock.releaseLock();
  }
}

/** Jefatura/Convivencia: lo que envía es la referencia, sin perder lo que otros hayan guardado. */
// Datos que solo gestiona el servidor: nunca se toman de lo que envía la app
var CLAVES_SERVIDOR = ['credenciales_profesores', 'credenciales_v1_alternativas', 'reset_credenciales_emails',
  'migracion_v2', 'saldos_antes_v2'];

/**
 * Lista de lo que la app dice haber cambiado (entrada.cambios). Si existe, de lo demás se conserva
 * la versión del servidor: así un dispositivo con datos de hace unos segundos no deshace lo que
 * otro acaba de guardar. Sin esa lista (app antigua) se toma todo lo enviado, como antes.
 */
function listaCambios(entrada, clave) {
  if (!entrada.cambios || !Array.isArray(entrada.cambios[clave])) return null;
  var m = {};
  entrada.cambios[clave].forEach(function (x) { if (x) { m[x] = true; m[norm(x)] = true; } });
  return m;
}

function fusionAdmin(actual, entrada) {
  var r = entrada;
  var cambiosSanciones = listaCambios(entrada, 'sanciones');
  var cambiosAlumnos = listaCambios(entrada, 'alumnos');
  var cambiosProfesores = listaCambios(entrada, 'profesores');
  var cambiosCompensaciones = listaCambios(entrada, 'compensaciones');
  delete r.cambios;
  // Lo que la app no conoce (otras claves de la base de datos) se conserva tal cual
  for (var k in actual) { if (r[k] === undefined) r[k] = actual[k]; }
  CLAVES_SERVIDOR.forEach(function (k) {
    if (actual[k] !== undefined) r[k] = actual[k]; else delete r[k];
  });
  // Versión del servidor de lo que NO ha cambiado en este dispositivo
  var conservar = function (lista, mapaActual, idDe, cambios) {
    if (!cambios) return lista;
    return lista.map(function (x) {
      if (!x) return x;
      var id = idDe(x);
      if (!cambios[id] && mapaActual[id]) return mapaActual[id];
      return x;
    });
  };
  var indice = function (lista, idDe) {
    var m = {};
    (lista || []).forEach(function (x) { if (x && idDe(x)) m[idDe(x)] = x; });
    return m;
  };
  var idS = function (x) { return x.id_sancion; };
  var idA = function (x) { return x.id_alumno; };
  var idP = function (x) { return norm(x.email); };
  var idC = function (x) { return x.id_compensacion; };
  r.sanciones = conservar(r.sanciones, indice(actual.sanciones, idS), idS, cambiosSanciones);
  r.alumnos = conservar(r.alumnos, indice(actual.alumnos, idA), idA, cambiosAlumnos);
  r.profesores = conservar(r.profesores, indice(actual.profesores, idP), idP, cambiosProfesores);
  r.compensaciones = conservar(r.compensaciones, indice(actual.compensaciones, idC), idC, cambiosCompensaciones);
  r.deleted_sanciones = unirTombstones(actual.deleted_sanciones, entrada.deleted_sanciones);
  r.deleted_alumnos = unirTombstones(actual.deleted_alumnos, entrada.deleted_alumnos);
  r.deleted_profesores = unirTombstones(actual.deleted_profesores, entrada.deleted_profesores);

  var activasEntrada = {};
  r.sanciones.forEach(function (x) {
    // Un parte que llega activo deja de estar borrado solo si este dispositivo lo ha recuperado
    // (si no, sería una copia antigua de un parte que otro acaba de borrar)
    if (x && x.id_sancion && (!cambiosSanciones || cambiosSanciones[x.id_sancion])) activasEntrada[x.id_sancion] = true;
  });
  // Un parte que llega activo no se considera borrado (restaurado)
  r.deleted_sanciones = r.deleted_sanciones.filter(function (id) { return !activasEntrada[id]; });
  var borradas = {};
  r.deleted_sanciones.forEach(function (id) { borradas[id] = true; });
  r.sanciones = r.sanciones.filter(function (x) { return x && x.id_sancion && !borradas[x.id_sancion]; });
  var enEntrada = {};
  r.sanciones.forEach(function (x) { enEntrada[x.id_sancion] = true; });
  actual.sanciones.forEach(function (x) {
    if (x && x.id_sancion && !enEntrada[x.id_sancion] && !borradas[x.id_sancion]) r.sanciones.push(x);
  });

  var comps = {};
  r.compensaciones.forEach(function (c) { if (c && c.id_compensacion) comps[c.id_compensacion] = true; });
  actual.compensaciones.forEach(function (c) { if (c && c.id_compensacion && !comps[c.id_compensacion]) r.compensaciones.push(c); });

  var profBorr = {};
  r.deleted_profesores.forEach(function (x) { profBorr[norm(x)] = true; profBorr[x] = true; });
  var profIds = {}, profEmails = {};
  r.profesores.forEach(function (p) { if (p) { profIds[p.id_profesor] = true; profEmails[norm(p.email)] = true; } });
  actual.profesores.forEach(function (p) {
    if (p && !profBorr[p.id_profesor] && !profBorr[norm(p.email)] && !profIds[p.id_profesor] && !profEmails[norm(p.email)]) r.profesores.push(p);
  });

  var almBorr = {};
  r.deleted_alumnos.forEach(function (x) { almBorr[x] = true; });
  var almIds = {};
  r.alumnos.forEach(function (a) { if (a && a.id_alumno) almIds[a.id_alumno] = true; });
  actual.alumnos.forEach(function (a) { if (a && a.id_alumno && !almBorr[a.id_alumno] && !almIds[a.id_alumno]) r.alumnos.push(a); });
  r.alumnos = r.alumnos.filter(function (a) { return a && !almBorr[a.id_alumno]; });

  // Expedientes de sanción: gana la versión modificada más recientemente; se respetan los borrados
  r.deleted_expedientes = unirTombstones(actual.deleted_expedientes, entrada.deleted_expedientes);
  var expBorr = {};
  r.deleted_expedientes.forEach(function (id) { expBorr[id] = true; });
  var expMapa = {};
  actual.expedientes_sancion.forEach(function (e) { if (e && e.id_expediente) expMapa[e.id_expediente] = e; });
  r.expedientes_sancion.forEach(function (e) {
    if (!e || !e.id_expediente) return;
    var previo = expMapa[e.id_expediente];
    if (!previo || String(e.timestamp || '') >= String(previo.timestamp || '')) expMapa[e.id_expediente] = e;
  });
  r.expedientes_sancion = Object.keys(expMapa)
    .filter(function (id) { return !expBorr[id]; })
    .map(function (id) { return expMapa[id]; });

  var logs = {};
  r.audit_logs.forEach(function (l) { if (l && l.id_log) logs[l.id_log] = true; });
  actual.audit_logs.forEach(function (l) { if (l && l.id_log && !logs[l.id_log]) r.audit_logs.push(l); });
  r.audit_logs.sort(function (a, b) { return String(b.timestamp).localeCompare(String(a.timestamp)); });
  r.audit_logs = r.audit_logs.slice(0, 300);
  return r;
}

var CAMPOS_PAC = ['estado_pac', 'profesor_pac_receptor', 'hora_llegada_pac'];

/**
 * El docente puede cambiar en su perfil su nombre, apellidos, departamento y tutoría.
 * La tutoría solo si el grupo no tiene ya otro tutor activo; queda anotado que la asignó él.
 */
function actualizarPerfilPropio(r, entrada, s, avisos) {
  var cambiosProf = listaCambios(entrada, 'profesores');
  if (cambiosProf && !cambiosProf[s.email]) return;   // no ha tocado su perfil en este envío
  var propio = null;
  (entrada.profesores || []).forEach(function (p) { if (p && norm(p.email) === s.email) propio = p; });
  if (!propio) return;
  var mio = null;
  r.profesores.forEach(function (p) { if (p && norm(p.email) === s.email) mio = p; });
  if (!mio) return;

  ['nombre', 'apellidos', 'departamento'].forEach(function (c) {
    if (typeof propio[c] === 'string' && propio[c].trim()) mio[c] = propio[c].trim();
  });

  var nueva = propio.tutor_de_grupo || '';
  var anterior = mio.tutor_de_grupo || '';
  if (nueva === anterior) return;
  if (nueva) {
    var ocupado = null;
    r.profesores.forEach(function (p) {
      if (p && norm(p.email) !== s.email && p.estado !== 'INACTIVO' && p.tutor_de_grupo === nueva) ocupado = p;
    });
    if (ocupado) {
      avisos.push('El grupo ya tiene tutor/a (' + (ocupado.nombre || '') + ' ' + (ocupado.apellidos || '') + '). Pídaselo a Jefatura.');
      return;
    }
    mio.tutor_de_grupo = nueva;
    mio.tutoria_asignada_por = 'DOCENTE';
  } else {
    delete mio.tutor_de_grupo;
    delete mio.tutoria_asignada_por;
  }
  r.audit_logs.unshift({ id_log: 'log-' + new Date().getTime() + '-' + Math.floor(Math.random() * 1e6),
    timestamp: new Date().toISOString(), usuario_email: s.email, accion: 'ACTUALIZACION_SISTEMA',
    entidad: 'Docente/Tutoria', detalles: 'Tutoría cambiada por el propio docente: ' + (anterior || 'ninguna') + ' -> ' + (nueva || 'ninguna'),
    hash_integridad: '' });
}

/** Profesorado sin privilegios: solo sus partes, el estado del Aula PAC y su propio registro de auditoría. */
function fusionDocente(actual, entrada, s, avisos) {
  var r = actual;
  actualizarPerfilPropio(r, entrada, s, avisos || []);
  var porId = {};
  r.sanciones.forEach(function (x, i) { if (x && x.id_sancion) porId[x.id_sancion] = i; });
  var yaBorradas = {};
  r.deleted_sanciones.forEach(function (id) { yaBorradas[id] = true; });

  var cambios = listaCambios(entrada, 'sanciones');
  var nombrePropio = ((s.prof.nombre || '') + ' ' + (s.prof.apellidos || '')).trim();
  entrada.sanciones.forEach(function (x) {
    if (!x || !x.id_sancion || yaBorradas[x.id_sancion]) return;
    var i = porId[x.id_sancion];
    if (i === undefined) {
      // Parte nuevo: solo si lo firma el propio docente (y con su nombre real)
      if (esAutor(x, s.prof)) {
        if (nombrePropio) x.nombre_profesor = nombrePropio;
        r.sanciones.push(x); porId[x.id_sancion] = r.sanciones.length - 1;
      }
      return;
    }
    // Un parte existente que este dispositivo no ha tocado no se modifica (evita deshacer cambios ajenos)
    if (cambios && !cambios[x.id_sancion]) return;
    var existente = r.sanciones[i];
    if (esAutor(existente, s.prof) && esAutor(x, s.prof)) {
      if (nombrePropio) x.nombre_profesor = nombrePropio;
      r.sanciones[i] = x; // su propio parte: puede modificarlo
    } else if (existente.derivado_pac) {
      CAMPOS_PAC.forEach(function (c) { if (x[c] !== undefined) existente[c] = x[c]; });
    }
  });

  // Borrados: solo de sus propios partes
  (entrada.deleted_sanciones || []).forEach(function (id) {
    var i = porId[id];
    if (i !== undefined && esAutor(r.sanciones[i], s.prof) && !yaBorradas[id]) {
      r.deleted_sanciones.push(id);
      yaBorradas[id] = true;
    }
  });
  r.sanciones = r.sanciones.filter(function (x) { return x && !yaBorradas[x.id_sancion]; });

  var logs = {};
  r.audit_logs.forEach(function (l) { if (l && l.id_log) logs[l.id_log] = true; });
  entrada.audit_logs.forEach(function (l) {
    if (l && l.id_log && !logs[l.id_log] && norm(l.usuario_email) === s.email) r.audit_logs.unshift(l);
  });
  r.audit_logs = r.audit_logs.slice(0, 300);
  return r;
}
`;

/** Código del servidor listo para pegar en script.google.com, configurado para el entorno actual. */
export function generarServidorAppsScript(): string {
  return PLANTILLA
    .split('__CARPETA_ID__').join(CARPETA_DRIVE_ID)
    .split('__ARCHIVO_DB__').join(ARCHIVO_DB_DRIVE)
    .split('__ADMIN_INICIAL__').join(ADMIN_INICIAL)
    .split('__ENTORNO__').join(ES_ENTORNO_PRUEBAS ? 'PRUEBAS (datos ficticios)' : 'PRODUCCIÓN')
    .split('__PERMITIR_BD_NUEVA__').join(ES_ENTORNO_PRUEBAS ? 'true' : 'false');
}
