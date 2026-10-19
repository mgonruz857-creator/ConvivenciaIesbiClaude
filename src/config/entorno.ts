/**
 * Configuración del entorno de datos.
 *
 * Esta copia de la app trabaja contra una base de datos de PRUEBAS
 * (carpeta SIGC_PRUEBAS en el Drive de mgonruz857@g.educaand.es),
 * con alumnado ficticio. Así no se tocan los datos reales del centro.
 *
 * Todo lo que identifica dónde se guardan los datos (programa de Apps Script,
 * cuenta, carpeta y nombre del archivo) está aquí y en ningún otro sitio.
 * Para poner la app en producción, basta con cambiar ENTORNO a 'PRODUCCION'.
 */

export type Entorno = 'PRUEBAS' | 'PRODUCCION';

export const ENTORNO: Entorno = 'PRUEBAS' as Entorno; // 'PRUEBAS' o 'PRODUCCION'

interface ConfigDrive {
  urlApi: string;
  cuenta: string;
  carpetaId: string;
  nombreCarpeta: string;
  archivoDb: string;
  nombreUnidad: string;
  urlApp: string;
}

const CONFIG: Record<Entorno, ConfigDrive> = {
  PRUEBAS: {
    urlApi:
      'https://script.google.com/macros/s/AKfycbxWamqKMoaoRgrflhIj6ocgiHN4uRcCXg6NdiMJEo7WXI0a6dSiuuDbbOy9AubyiuS7/exec',
    cuenta: 'mgonruz857@g.educaand.es',
    carpetaId: '1OeH-dt7zuEeuX-5MLEZ9x2gn24eoGplG',
    nombreCarpeta: 'SIGC_PRUEBAS',
    archivoDb: '00_SIGC_BD_PRUEBAS.json',
    nombreUnidad: 'Entorno de PRUEBAS (datos ficticios)',
    urlApp: 'https://mgonruz857-creator.github.io/ConvivenciaIesbiClaude/',
  },
  PRODUCCION: {
    urlApi:
      'https://script.google.com/macros/s/AKfycbyrmV69dBgcg9WD0mx4tQLWeZtbqSR7odMS87HS5VyOPQL90RNNZMkpp5HHGZ30HimLNQ/exec',
    cuenta: '14007180.aplicaciones@g.educaand.es',
    carpetaId: '1S5zjeSgcfVkL-eoQLsJ9I_ltHAnRrbaS',
    nombreCarpeta: 'CONVIVENCIA_IES_BLAS_INFANTE',
    archivoDb: '00_SIGC_BD_CENTRO_BLAS_INFANTE.json',
    nombreUnidad: 'Unidad Compartida Convivencia - IES Blas Infante',
    urlApp: 'https://convivenciaiesbi.github.io/',
  },
};

const ACTUAL = CONFIG[ENTORNO];

export const ES_ENTORNO_PRUEBAS: boolean = ENTORNO === 'PRUEBAS';
export const URL_API_DRIVE: string = ACTUAL.urlApi;
export const CUENTA_DRIVE: string = ACTUAL.cuenta;
export const CARPETA_DRIVE_ID: string = ACTUAL.carpetaId;
export const NOMBRE_CARPETA_DRIVE: string = ACTUAL.nombreCarpeta;
export const ARCHIVO_DB_DRIVE: string = ACTUAL.archivoDb;
export const NOMBRE_UNIDAD_DRIVE: string = ACTUAL.nombreUnidad;
/** Dirección de la app (para el enlace de los correos). */
export const URL_APP: string = ACTUAL.urlApp;
/** Prefijo para copias de seguridad descargadas (sin la extensión .json). */
export const PREFIJO_BACKUP: string = ARCHIVO_DB_DRIVE.replace(/\.json$/, '');
