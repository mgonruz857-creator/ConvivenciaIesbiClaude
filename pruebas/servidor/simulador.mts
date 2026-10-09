// Simulador mínimo de Google Apps Script para ejecutar el servidor en Node
import vm from 'vm';
import crypto from 'crypto';
import { ARCHIVO_DB_DRIVE } from '/home/claude/convivenciaiesbiclaude/src/config/entorno.ts';

/**
 * archivos: 'DB' es el archivo principal; el resto por su nombre (copias de seguridad...).
 * fechas: fecha de modificación de cada archivo (cambia con setContent o con tocarExterno()).
 * Se puede compartir "drive" entre dos servidores (p. ej. el v1 y el v2 a la vez).
 */
export function crearServidor(codigo: string, archivoInicial?: any, opciones?: { drive?: any; esperaLock?: () => void }) {
  const drive = opciones?.drive || { archivos: {} as Record<string, string>, fechas: {} as Record<string, number>, reloj: 1 };
  const archivos = drive.archivos;
  if (archivoInicial) { archivos['DB'] = JSON.stringify(archivoInicial); drive.fechas['DB'] = drive.reloj++; }
  const clave = (n: string) => (n === ARCHIVO_DB_DRIVE ? 'DB' : n);
  // Varios archivos con el nombre principal: 'DB', 'DB#2', 'DB#3'...
  const delPrincipal = () => Object.keys(archivos).filter(k => k === 'DB' || k.startsWith('DB#'));
  const archivo = (k: string) => ({
    getId: () => 'id-' + k,
    getName: () => (k === 'DB' ? ARCHIVO_DB_DRIVE : k),
    setName: (n: string) => { archivos[n] = archivos[k]; drive.fechas[n] = drive.fechas[k]; delete archivos[k]; delete drive.fechas[k]; k = n; },
    getBlob: () => ({ getDataAsString: () => archivos[k] }),
    setContent: (t: string) => { archivos[k] = t; drive.fechas[k] = drive.reloj++; },
    getLastUpdated: () => new Date(drive.fechas[k] || 0),
  });
  const cache = new Map<string, string>(); const props = new Map<string, string>();
  let llamadasCifrado = 0;
  let lockOcupado = false;
  const ctx: any = {
    JSON, Math, Date, String, Array, Object, parseInt, Number, Error, isNaN,
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t: string) => ({ setMimeType: () => ({ texto: t }) }) },
    CacheService: { getScriptCache: () => ({ get: (k: string) => cache.has(k) ? cache.get(k)! : null, put: (k: string, v: string) => { cache.set(k, v) }, remove: (k: string) => { cache.delete(k) },
      getAll: (ks: string[]) => { const r: any = {}; ks.forEach(k => { if (cache.has(k)) r[k] = cache.get(k) }); return r; }, putAll: (o: any) => { for (const k in o) cache.set(k, o[k]) } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props.get(k) ?? null, setProperty: (k: string, v: string) => { props.set(k, v) }, deleteProperty: (k: string) => { props.delete(k) } }) },
    LockService: { getScriptLock: () => ({
      waitLock: () => { if (lockOcupado) throw new Error('Bloqueo anidado o simultáneo en el simulador'); lockOcupado = true; opciones?.esperaLock?.(); },
      releaseLock: () => { lockOcupado = false; } }) },
    Utilities: { getUuid: () => crypto.randomUUID(), DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (_a: string, t: any) => (llamadasCifrado++, 0) || Array.from(crypto.createHash('sha256').update(typeof t === 'string' ? Buffer.from(t, 'utf8') : Buffer.from(t.map((b: number) => b & 255))).digest()).map(b => b > 127 ? b - 256 : b),
      computeHmacSha256Signature: (v: string, k: string) => (llamadasCifrado++, 0) || Array.from(crypto.createHmac('sha256', Buffer.from(k, 'utf8')).update(v, 'utf8').digest()).map(b => b > 127 ? b - 256 : b),
      base64Encode: (bytes: number[]) => Buffer.from(bytes.map(b => b & 255)).toString('base64'),
      formatDate: (d: Date, _z: string, f: string) => f === 'yyyy-MM-dd' ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(d) : d.toISOString().slice(0, 16).replace('T', '_').replace(':', '-') },
    MimeType: { PLAIN_TEXT: 'text/plain' },
    DriveApp: {
      getFileById: (id: string) => { const k = id.replace(/^id-/, ''); if (archivos[k] === undefined) throw new Error('No existe'); return archivo(k); },
      getFolderById: () => ({
        getFiles: () => { const l = Object.keys(archivos).map(archivo); let i = 0; return { hasNext: () => i < l.length, next: () => l[i++] }; },
        getFilesByName: (n: string) => { const k = clave(n); const ks = k === 'DB' ? delPrincipal() : (archivos[k] !== undefined ? [k] : []); const l = ks.map(archivo); let i = 0; return { hasNext: () => i < l.length, next: () => l[i++] }; },
        createFile: (n: string, t: string) => { let k = clave(n); if (k === 'DB' && archivos['DB'] !== undefined) k = 'DB#' + (delPrincipal().length + 1); archivos[k] = t; drive.fechas[k] = drive.reloj++; return archivo(k); } }) },
    Logger: { log: () => {} },
  };
  vm.createContext(ctx); vm.runInContext(codigo, ctx);
  const post = (obj: any) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(obj) } }).texto);
  /** Simula que alguien (otra versión de la app) modifica el archivo por fuera de este servidor. */
  const tocarExterno = (db: any) => { archivos['DB'] = JSON.stringify(db); drive.fechas['DB'] = drive.reloj++; };
  return { post, archivos, props, cache, ctx, drive, tocarExterno, cifrados: () => llamadasCifrado };
}
