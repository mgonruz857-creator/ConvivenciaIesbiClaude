/**
 * Conductas gravemente perjudiciales para la convivencia (Decreto 327/2010, artículo 37)
 * y textos del parte de sanción, tal como los usa el IES Blas Infante.
 */

import { ClaveTramiteSancion, ModalidadSancion } from '../types/convivencia';

export const CONDUCTAS_ART37: { numero: number; texto: string }[] = [
  { numero: 1, texto: 'La agresión física contra cualquier miembro de la comunidad educativa.' },
  { numero: 2, texto: 'Las injurias y ofensas contra cualquier miembro de la comunidad educativa.' },
  { numero: 3, texto: 'El acoso escolar, entendido como el maltrato psicológico, verbal o físico hacia un alumno o alumna producido por uno o más compañeros y compañeras de forma reiterada a lo largo de un tiempo determinado.' },
  { numero: 4, texto: 'Las actuaciones perjudiciales para la salud y la integridad personal de los miembros de la comunidad educativa del centro, o la incitación a las mismas.' },
  { numero: 5, texto: 'Las vejaciones o humillaciones contra cualquier miembro de la comunidad educativa, particularmente si tienen una componente sexual, racial, religiosa, xenófoba u homófoba, o se realizan contra alumnos o alumnas con necesidades educativas especiales.' },
  { numero: 6, texto: 'Las amenazas o coacciones contra cualquier miembro de la comunidad educativa.' },
  { numero: 7, texto: 'La suplantación de la personalidad en actos de la vida docente y la falsificación o sustracción de documentos académicos.' },
  { numero: 8, texto: 'Las actuaciones que causen graves daños en las instalaciones, recursos materiales o documentos del instituto, o en las pertenencias de los demás miembros de la comunidad educativa, así como la sustracción de las mismas.' },
  { numero: 9, texto: 'La reiteración en un mismo curso escolar de conductas contrarias a las normas de convivencia.' },
  { numero: 10, texto: 'Cualquier acto dirigido directamente a impedir el normal desarrollo de las actividades del centro.' },
  { numero: 11, texto: 'El incumplimiento de las correcciones impuestas, salvo que la comisión de convivencia del instituto considere que este incumplimiento sea debido a causas justificadas.' },
];

export function textoConductaArt37(numero: number): string {
  return CONDUCTAS_ART37.find((c) => c.numero === numero)?.texto || '';
}

export const MODALIDADES_SANCION: { valor: ModalidadSancion; etiqueta: string; textoParte: string }[] = [
  {
    valor: 'AULA_CONVIVENCIA',
    etiqueta: 'Aula de Convivencia o Departamento de Orientación',
    textoParte: 'permanecerá en el aula de Convivencia o en el Departamento de Orientación',
  },
  { valor: 'EXPULSION', etiqueta: 'Expulsión a casa', textoParte: 'será expulsado/a a casa' },
];

export const TRAMITES_SANCION: { clave: ClaveTramiteSancion; etiqueta: string }[] = [
  { clave: 'llamada_familia', etiqueta: 'Llamada a la familia para comunicar la sanción' },
  { clave: 'enviado_direccion', etiqueta: 'Parte de sanción enviado a Dirección para su firma' },
  { clave: 'enviado_familia', etiqueta: 'Parte de sanción firmado por Dirección enviado a la familia' },
  { clave: 'aviso_equipo_docente', etiqueta: 'Equipo docente avisado de la sanción' },
  { clave: 'guardado_seneca', etiqueta: 'Parte de sanción guardado en Séneca' },
];

export const PARRAFO_EXPULSION =
  'Durante la expulsión debe realizar los deberes que le encomiende el equipo educativo y presentarlos a su vuelta. Así mismo, podrá asistir al centro únicamente para la realización de exámenes o pruebas escritas fijadas en los mismos.';

export const AVISO_CUSTODIA =
  'Recordamos que la custodia del alumnado menor de edad, cuando está expulsado del centro, es responsabilidad de sus tutores/as legales. Durante el tiempo que dure la suspensión, deberá realizar las actividades formativas que se determinen para evitar la interrupción de su proceso formativo.';

export const AVISO_RECLAMACION =
  'Ante esta Resolución, el/la alumno/a, así como sus padres, madres o tutores/as legales, podrá presentar en el plazo de dos días lectivos, contados a partir de la fecha en que se comunique el acuerdo de corrección o medida disciplinaria, una reclamación contra la misma, ante quien la impuso.';
