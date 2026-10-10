/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { jsPDF } from 'jspdf';
import { Sancion, Alumno } from '../types/convivencia';
import { MATRIZ_ROF_CATALOG, obtenerTipificacionNormativa } from '../data/rofCatalog';

import iesCrestUrl from '../assets/images/logo_rectangular_iesbi.png';
import juntaLogoUrl from '../assets/images/junta_andalucia_logo.jpg';

// Helper to convert an image URL or import to base64 DataURL
const imageCache: Record<string, string> = {};

export async function getBase64Image(url: string): Promise<string> {
  if (imageCache[url]) {
    return imageCache[url];
  }

  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = reader.result as string;
        imageCache[url] = base64data;
        resolve(base64data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn('Could not convert image to base64:', url, err);
    return '';
  }
}

/**
 * Generates an official, legal-grade A4 PDF document for one or more sanctions
 * using pure vector drawing with jsPDF (immune to CSS oklch, canvas taint, or CORS errors).
 */
export async function generateOfficialSancionPdf(
  sanciones: Sancion[],
  alumnos: Alumno[] | Map<string, Alumno>,
  options?: { download?: boolean; customFileName?: string }
): Promise<{ doc: jsPDF; filename: string; blob: Blob }> {
  const alumnoMap = alumnos instanceof Map 
    ? alumnos 
    : new Map(alumnos.map(a => [a.id_alumno, a]));

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Pre-fetch base64 images
  let juntaBase64 = '';
  let iesBase64 = '';
  try {
    [juntaBase64, iesBase64] = await Promise.all([
      getBase64Image(juntaLogoUrl),
      getBase64Image(iesCrestUrl),
    ]);
  } catch (e) {
    console.warn('Failed to load logos for PDF, rendering text fallback:', e);
  }

  sanciones.forEach((sancion, index) => {
    if (index > 0) {
      doc.addPage();
    }

    const alumno = alumnoMap.get(sancion.id_alumno) || {
      id_alumno: sancion.id_alumno,
      nombre: 'Alumno',
      apellidos: 'Desconocido',
      nie: '00000000',
      grupo: '1ESO_A',
      puntos_actuales: 10,
      estado: 'ACTIVO',
      nombre_tutor: 'Tutor Legal',
      telefono_tutor: '600000000',
    } as Alumno;

    const rofDef = MATRIZ_ROF_CATALOG[sancion.codigo_infraccion];

    // Page boundaries
    const pageWidth = 210;
    const pageHeight = 297;
    const marginX = 14;
    const contentWidth = pageWidth - marginX * 2; // 182mm
    let curY = 12;

    // --- 1. Institutional Header ---
    // Junta logo on left
    if (juntaBase64) {
      try {
        doc.addImage(juntaBase64, 'JPEG', marginX, curY - 1, 28, 16);
      } catch (e) {
        console.warn('Could not draw junta logo', e);
      }
    }

    // Texts beside Junta logo
    doc.setTextColor(15, 23, 42); // slate-900
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('JUNTA DE ANDALUCÍA', marginX + 32, curY + 3);

    doc.setTextColor(71, 85, 105); // slate-600
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text('Consejería de Desarrollo Educativo y Formación Profesional', marginX + 32, curY + 7.5);

    doc.setTextColor(3, 105, 161); // sky-700
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('IES BLAS INFANTE · CÓRDOBA (CÓDIGO: 14007180)', marginX + 32, curY + 12);

    // IES Crest on right
    if (iesBase64) {
      try {
        doc.addImage(iesBase64, 'JPEG', pageWidth - marginX - 16, curY - 1, 16, 16);
      } catch (e) {
        console.warn('Could not draw IES crest', e);
      }
    }

    curY += 18;

    // Divider Line
    doc.setDrawColor(3, 105, 161); // sky-700
    doc.setLineWidth(0.8);
    doc.line(marginX, curY, pageWidth - marginX, curY);

    curY += 4;

    // --- 2. Title & Metadata Bar ---
    // Background bar
    doc.setFillColor(241, 245, 249); // slate-100
    doc.setDrawColor(203, 213, 225); // slate-300
    doc.setLineWidth(0.3);
    doc.roundedRect(marginX, curY, contentWidth, 14, 1.5, 1.5, 'FD');

    // Title text
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('BOLETÍN OFICIAL DE SANCIÓN DISCIPLINARIA Y COMUNICACIÓN A FAMILIAS', marginX + 4, curY + 5.5);

    doc.setTextColor(100, 116, 139); // slate-500
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text('Decreto 327/2010 (Reglamento Orgánico de IES) · Plan de Convivencia y Carnet de Puntos', marginX + 4, curY + 10);

    // Expediente & Date (Right aligned in bar)
    doc.setFont('courier', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`EXP: ${sancion.numero_expediente}`, pageWidth - marginX - 4, curY + 5.5, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    const timeDetail = sancion.hora_incidente ? `(${sancion.hora_incidente}h)` : '';
    const deferDetail = sancion.registro_diferido && sancion.hora_registro ? ` [Reg: ${sancion.hora_registro}h]` : '';
    doc.text(`Fecha: ${sancion.fecha} · ${sancion.tramo_horario.split('(')[0]} ${timeDetail}${deferDetail}`, pageWidth - marginX - 4, curY + 10, { align: 'right' });

    curY += 17;

    // --- 3. Section: Student Data (Left) and Teacher Data (Right) ---
    const colWidth = (contentWidth - 4) / 2; // 89mm each

    // Box Left: Alumno
    doc.setFillColor(248, 250, 252); // slate-50
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.roundedRect(marginX, curY, colWidth, 32, 1.5, 1.5, 'FD');

    doc.setTextColor(3, 105, 161);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('1. DATOS DEL ALUMNO / ALUMNA', marginX + 3, curY + 5);

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('Apellidos y Nombre:', marginX + 3, curY + 10);
    doc.setFont('helvetica', 'bold');
    doc.text(`${alumno.apellidos}, ${alumno.nombre}`, marginX + 32, curY + 10);

    doc.setFont('helvetica', 'normal');
    doc.text('Grupo:', marginX + 3, curY + 15);
    doc.setFont('helvetica', 'bold');
    doc.text(alumno.grupo, marginX + 16, curY + 15);

    doc.setFont('helvetica', 'normal');
    doc.text('NIE:', marginX + 45, curY + 15);
    doc.setFont('helvetica', 'bold');
    doc.text(alumno.nie || 'Sin NIE', marginX + 54, curY + 15);

    // Por decisión del centro, el parte no muestra el saldo de puntos del alumno
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'normal');
    doc.text('Tutor Legal / Tel.:', marginX + 3, curY + 20);
    doc.setFont('helvetica', 'bold');
    const tutorTexto = `${alumno.nombre_tutor || 'Tutor Legal'} (${alumno.telefono_tutor || 'No registrado'})`;
    doc.text(tutorTexto.length > 32 ? tutorTexto.substring(0, 30) + '...' : tutorTexto, marginX + 26, curY + 20);

    // Box Right: Profesor / Hecho
    const rightColX = marginX + colWidth + 4;
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(rightColX, curY, colWidth, 32, 1.5, 1.5, 'FD');

    doc.setTextColor(3, 105, 161);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('2. PROFESOR/A QUE EMITE LA SANCIÓN', rightColX + 3, curY + 5);

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('Docente:', rightColX + 3, curY + 10);
    doc.setFont('helvetica', 'bold');
    doc.text(sancion.nombre_profesor, rightColX + 20, curY + 10);

    doc.setFont('helvetica', 'normal');
    doc.text('Materia / Cargo:', rightColX + 3, curY + 15);
    doc.setFont('helvetica', 'bold');
    doc.text(sancion.materia || 'Profesorado Docente', rightColX + 26, curY + 15);

    doc.setFont('helvetica', 'normal');
    doc.text('Lugar del Incidente:', rightColX + 3, curY + 20);
    doc.setFont('helvetica', 'bold');
    doc.text(sancion.ubicacion || 'Aula ordinaria', rightColX + 30, curY + 20);

    doc.setFont('helvetica', 'normal');
    doc.text('Tramo / Sesión:', rightColX + 3, curY + 25);
    doc.setFont('helvetica', 'bold');
    doc.text(`${sancion.tramo_horario.split('(')[0]} ${sancion.hora_incidente ? `a las ${sancion.hora_incidente}h` : ''}`, rightColX + 26, curY + 25);

    curY += 35;

    // --- 3. Section: Tipificación Normativa y Calificación de la Conducta (V0 - Sección 6) ---
    const tipif = obtenerTipificacionNormativa(sancion.codigo_infraccion);

    doc.setFillColor(254, 242, 242); // rose-50
    doc.setDrawColor(254, 202, 202); // rose-200
    doc.roundedRect(marginX, curY, contentWidth, 19.5, 1.5, 1.5, 'FD');

    doc.setTextColor(159, 18, 57); // rose-800
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('3. CONDUCTA REGISTRADA Y TIPIFICACIÓN NORMATIVA (V0)', marginX + 3, curY + 5);

    // Conduct Title
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    const rofTitle = rofDef ? rofDef.titulo : sancion.codigo_infraccion;
    doc.text(rofTitle, marginX + 3, curY + 11);

    // PRECISIÓN JURÍDICA EN EL PDF: Distinguir Decreto 327/2010 vs Plan de Convivencia
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`Fundamento legal: ${tipif.tipoTexto} · [${tipif.referencia}]`, marginX + 3, curY + 16);

    // Por decisión del centro, el parte no muestra puntos (ni los descontados ni los que quedan)

    curY += 22.5;

    // --- 4. Section: Hechos Registrados (Descripción objetiva) ---
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(marginX, curY, contentWidth, 30, 1.5, 1.5, 'FD');

    doc.setTextColor(3, 105, 161);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('4. HECHOS REGISTRADOS (DESCRIPCIÓN OBJETIVA INTRODUCIDA POR EL PROFESORADO)', marginX + 3, curY + 5);

    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const splitHechos = doc.splitTextToSize(sancion.descripcion_hechos || 'Sin observaciones adicionales.', contentWidth - 6);
    doc.text(splitHechos, marginX + 3, curY + 11);

    curY += 33;

    // --- 5. Section: Medida Inmediata Adoptada (V0 - Página 3) ---
    const medidaLabel = sancion.medida_inmediata_texto || 'Amonestación verbal / advertencia';
    doc.setFillColor(254, 252, 232); // amber-50
    doc.setDrawColor(253, 230, 138); // amber-200
    const pacH = sancion.derivado_pac ? 25 : 14;
    doc.roundedRect(marginX, curY, contentWidth, pacH, 1.5, 1.5, 'FD');

    doc.setTextColor(180, 83, 9); // amber-700
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('5. MEDIDA INMEDIATA ADOPTADA', marginX + 3, curY + 5);

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(`Actuación seleccionada: ${medidaLabel}`, marginX + 3, curY + 10);

    if (sancion.derivado_pac) {
      doc.setTextColor(71, 85, 105);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      const salida = sancion.detalle_pac?.hora_salida || sancion.hora_incidente || 'Automática';
      const profesorDeriva = sancion.detalle_pac?.profesor_deriva || sancion.nombre_profesor;
      const reincorp = sancion.detalle_pac?.reincorporacion || 'Sí';
      doc.text(`Hora de salida: ${salida}h · Profesor/a derivador/a: ${profesorDeriva} · ¿Reincorporación al aula?: ${reincorp}`, marginX + 3, curY + 15);
      
      const pacTaskText = sancion.detalle_pac?.tarea_pac || sancion.tareas_enviadas_pac || 'Realizar tareas lectivas de la materia y reflexión conductual.';
      doc.text(`Tarea para realizar en PAC: "${pacTaskText}"`, marginX + 3, curY + 20);
    }

    curY += pacH + 3;

    // --- 6. Información a la Familia y Régimen de Notificación (V0) ---
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(marginX, curY, contentWidth, 9.5, 1.5, 1.5, 'FD');

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    const fechaNotif = sancion.fecha_comunicacion_familia || sancion.fecha;
    doc.text(`6. INFORMACIÓN Y COMUNICACIÓN A LA FAMILIA (FECHA: ${fechaNotif}):`, marginX + 3, curY + 4);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(71, 85, 105);
    const avisoFamilia = 'Los representantes legales pueden contactar con la tutoría o con la Jefatura de Estudios para cualquier aclaración.';
    doc.text(avisoFamilia, marginX + 3, curY + 7.5);

    curY += 12.5;

    // Por decisión del centro, el parte no incluye espacio para firmas

    // --- 9. Document Footer & Verification Bar ---
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(marginX, pageHeight - 12, pageWidth - marginX, pageHeight - 12);

    doc.setTextColor(148, 163, 184);
    doc.setFont('courier', 'normal');
    doc.setFontSize(6);
    doc.text(`SIGC-BI v2.0 · IES BLAS INFANTE · EXP:${sancion.numero_expediente} · HASH-SHA256:${sancion.id_sancion.slice(0, 16)}`, marginX, pageHeight - 8);
    doc.text(`Página ${index + 1} de ${sanciones.length}`, pageWidth - marginX, pageHeight - 8, { align: 'right' });
  });

  // Determine file name
  const filename = options?.customFileName || (
    sanciones.length === 1
      ? `Parte_Disciplinario_${sanciones[0].numero_expediente}_IES_Blas_Infante.pdf`
      : `Boletin_Partes_IES_Blas_Infante_${new Date().toISOString().split('T')[0]}.pdf`
  );

  const blob = doc.output('blob');

  // Trigger download if requested
  if (options?.download !== false) {
    try {
      // 1. Primary browser download
      doc.save(filename);
    } catch (saveError) {
      console.warn('doc.save failed, executing blob fallback download:', saveError);
      // 2. Blob fallback download
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
    }
  }

  return { doc, filename, blob };
}

export interface MemoriaStatsData {
  academicYear: string;
  totalPartes: number;
  totalPuntosPerdidos: number;
  puntosRestituidos: number;
  saldoNetoPuntos: number;
  pacDerivados: number;
  pacTasaComparecencia: number;
  leves: number;
  graves: number;
  muyGraves: number;
  totalAlumnosAfectados: number;
  totalCensoAlumnos: number;
  count0Partes: number;
  ratioCumplimiento: number;
  monthlyCounts: Array<{ mes: string; count: number; pac: number }>;
  topUbicaciones: Array<[string, number]>;
  topNiveles?: Array<{ nivel: string; count: number; pct: number }>;
  topRof?: Array<{ codigo: string; count: number; puntos: number }>;
  topMaterias?: Array<[string, number]>;
  sancionesList: Sancion[];
}

/**
 * Genera el documento oficial en PDF de la Memoria de Convivencia y Analítica del Centro (IES Blas Infante)
 * según el marco del Decreto 327/2010 y el ROF del centro, con infografías vectoriales, gráficos de barras y tablas.
 */
export async function generateMemoriaConvivenciaPdf(
  stats: MemoriaStatsData,
  alumnos: Alumno[] | Map<string, Alumno>,
  options?: { download?: boolean; customFileName?: string }
): Promise<{ doc: jsPDF; filename: string; blob: Blob }> {
  const alumnoMap = alumnos instanceof Map 
    ? alumnos 
    : new Map(alumnos.map(a => [a.id_alumno, a]));

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Pre-fetch base64 images
  let juntaBase64 = '';
  let iesBase64 = '';
  try {
    [juntaBase64, iesBase64] = await Promise.all([
      getBase64Image(juntaLogoUrl),
      getBase64Image(iesCrestUrl),
    ]);
  } catch (e) {
    console.warn('Failed to load logos for Memoria PDF:', e);
  }

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2; // 182mm

  const drawHeader = (pageNum: number, title: string, subtitle?: string) => {
    let curY = 10;
    if (juntaBase64) {
      try {
        doc.addImage(juntaBase64, 'JPEG', marginX, curY, 26, 14);
      } catch (e) {
        console.warn('Could not draw junta logo', e);
      }
    }

    doc.setTextColor(15, 23, 42); // slate-900
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text('JUNTA DE ANDALUCÍA', marginX + 29, curY + 3.5);

    doc.setTextColor(71, 85, 105); // slate-600
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text('Consejería de Desarrollo Educativo y Formación Profesional', marginX + 29, curY + 7.5);

    doc.setTextColor(3, 105, 161); // sky-700
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('IES BLAS INFANTE · CÓRDOBA (CÓDIGO: 14007180)', marginX + 29, curY + 11.5);

    if (iesBase64) {
      try {
        doc.addImage(iesBase64, 'JPEG', pageWidth - marginX - 15, curY, 15, 15);
      } catch (e) {
        console.warn('Could not draw IES crest', e);
      }
    }

    curY += 16;
    doc.setDrawColor(3, 105, 161);
    doc.setLineWidth(0.6);
    doc.line(marginX, curY, pageWidth - marginX, curY);

    curY += 4;
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(186, 230, 253);
    doc.setLineWidth(0.4);
    doc.roundedRect(marginX, curY, contentWidth, 12, 1.2, 1.2, 'FD');

    doc.setTextColor(12, 74, 110);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(title, marginX + 3.5, curY + 4.8);

    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(subtitle || `Curso Académico: ${stats.academicYear} · Marco Legal: Decreto 327/2010 · ROF IES Blas Infante`, marginX + 3.5, curY + 9.5);

    return curY + 15;
  };

  const drawFooter = (pageNum: number) => {
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(marginX, pageHeight - 10, pageWidth - marginX, pageHeight - 10);
    doc.setFont('courier', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(148, 163, 184);
    doc.text(`SIGC-BI v2.0 · MEMORIA ANUAL CONVIVENCIA · CURSO ${stats.academicYear} · IES BLAS INFANTE (14007180)`, marginX, pageHeight - 6.5);
    // El total se rellena al final (el anexo puede ocupar varias páginas)
    doc.text(`Página ${pageNum} de {total_paginas}`, pageWidth - marginX - 4, pageHeight - 6.5, { align: 'right' });
  };

  // ==========================================
  // --- PÁGINA 1: RESUMEN EJECUTIVO & GRÁFICOS ---
  // ==========================================
  let curY = drawHeader(1, 'MEMORIA ANUAL DE CONVIVENCIA Y EVALUACIÓN DEL PLAN DE CENTRO');

  // 1. INDICADORES GLOBALES (4 KPI Cards con gráficos de progreso)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text('1. INDICADORES GLOBALES DE CLIMA ESCOLAR Y CARNET POR PUNTOS', marginX, curY);
  curY += 3;

  const cardW = (contentWidth - 6) / 4;
  const cardH = 22;

  // Card 1: Total Partes
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, curY, cardW, cardH, 1, 1, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('TOTAL INFRACCIONES', marginX + 3, curY + 4.5);
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(String(stats.totalPartes), marginX + 3, curY + 11.5);
  doc.setFontSize(6);
  doc.setTextColor(100, 116, 139);
  doc.text(`${stats.totalAlumnosAfectados} alumnos con partes`, marginX + 3, curY + 16);
  // Barra gráfica inferior
  doc.setFillColor(224, 231, 255);
  doc.rect(marginX + 3, curY + 18, cardW - 6, 2, 'F');
  doc.setFillColor(79, 70, 229);
  const fracAlm = Math.min(1, stats.totalAlumnosAfectados / Math.max(1, stats.totalCensoAlumnos));
  doc.rect(marginX + 3, curY + 18, (cardW - 6) * fracAlm, 2, 'F');

  // Card 2: Puntos Detraídos vs Restituidos
  const c2X = marginX + cardW + 2;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(c2X, curY, cardW, cardH, 1, 1, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('BALANCE DE PUNTOS', c2X + 3, curY + 4.5);
  doc.setFontSize(13);
  doc.setTextColor(185, 28, 28);
  doc.text(`-${stats.totalPuntosPerdidos}`, c2X + 3, curY + 11.5);
  doc.setFontSize(6);
  doc.setTextColor(4, 120, 87);
  doc.text(`+${stats.puntosRestituidos} pts compensados`, c2X + 3, curY + 16);
  // Barra gráfica de recuperación
  doc.setFillColor(254, 226, 226);
  doc.rect(c2X + 3, curY + 18, cardW - 6, 2, 'F');
  doc.setFillColor(16, 185, 129);
  const ratioComp = Math.min(1, stats.puntosRestituidos / Math.max(1, stats.totalPuntosPerdidos));
  doc.rect(c2X + 3, curY + 18, (cardW - 6) * ratioComp, 2, 'F');

  // Card 3: Aula PAC
  const c3X = marginX + (cardW + 2) * 2;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(c3X, curY, cardW, cardH, 1, 1, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('DERIVACIONES AULA PAC', c3X + 3, curY + 4.5);
  doc.setFontSize(13);
  doc.setTextColor(3, 105, 161);
  doc.text(String(stats.pacDerivados), c3X + 3, curY + 11.5);
  doc.setFontSize(6);
  doc.setTextColor(100, 116, 139);
  doc.text(`${stats.pacTasaComparecencia}% comparecencia`, c3X + 3, curY + 16);
  // Barra gráfica PAC
  doc.setFillColor(224, 242, 254);
  doc.rect(c3X + 3, curY + 18, cardW - 6, 2, 'F');
  doc.setFillColor(2, 132, 199);
  doc.rect(c3X + 3, curY + 18, (cardW - 6) * (stats.pacTasaComparecencia / 100), 2, 'F');

  // Card 4: Alumnado con Carnet Intacto
  const c4X = marginX + (cardW + 2) * 3;
  doc.setFillColor(240, 253, 244);
  doc.setDrawColor(187, 247, 208);
  doc.roundedRect(c4X, curY, cardW, cardH, 1, 1, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(22, 101, 52);
  doc.text('ALUMNADO SIN PARTES', c4X + 3, curY + 4.5);
  doc.setFontSize(13);
  doc.setTextColor(21, 128, 61);
  doc.text(`${stats.ratioCumplimiento}%`, c4X + 3, curY + 11.5);
  doc.setFontSize(6);
  doc.setTextColor(22, 101, 52);
  doc.text(`${stats.count0Partes} de ${stats.totalCensoAlumnos} alumnos`, c4X + 3, curY + 16);
  // Barra gráfica Ratio
  doc.setFillColor(220, 252, 231);
  doc.rect(c4X + 3, curY + 18, cardW - 6, 2, 'F');
  doc.setFillColor(34, 197, 94);
  doc.rect(c4X + 3, curY + 18, (cardW - 6) * (stats.ratioCumplimiento / 100), 2, 'F');

  curY += cardH + 5;

  // 2. TIPIFICACIÓN DE CONDUCTAS CONTRARIAS (DECRETO 327/2010)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text('2. TIPIFICACIÓN Y GRAVEDAD DE CONDUCTAS (DECRETO 327/2010)', marginX, curY);
  curY += 3;

  const totalSanc = Math.max(1, stats.totalPartes);
  const pctLeves = Math.round((stats.leves / totalSanc) * 100);
  const pctGraves = Math.round((stats.graves / totalSanc) * 100);
  const pctMuyGraves = Math.round((stats.muyGraves / totalSanc) * 100);

  const colW3 = (contentWidth - 4) / 3;
  const colH3 = 24;

  // Leves (1-3 pts)
  doc.setFillColor(254, 243, 199);
  doc.setDrawColor(251, 191, 36);
  doc.roundedRect(marginX, curY, colW3, colH3, 1, 1, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(146, 64, 14);
  doc.text('Conductas Leves (1-3 pts)', marginX + 3, curY + 4.5);
  doc.setFontSize(11);
  doc.text(`${stats.leves} partes (${pctLeves}%)`, marginX + 3, curY + 10.5);
  // Progress bar Leves
  doc.setFillColor(253, 230, 138);
  doc.rect(marginX + 3, curY + 12.5, colW3 - 6, 2, 'F');
  doc.setFillColor(217, 119, 6);
  doc.rect(marginX + 3, curY + 12.5, (colW3 - 6) * (pctLeves / 100), 2, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(120, 53, 15);
  doc.text('Detracción: 1 a 3 puntos | Corrección: Profesor/Tutor', marginX + 3, curY + 18);
  doc.text('Medida: Tareas pedagógicas y apercibimiento', marginX + 3, curY + 21.5);

  // Graves (Art. 34)
  const gX = marginX + colW3 + 2;
  doc.setFillColor(254, 226, 226);
  doc.setDrawColor(248, 113, 113);
  doc.roundedRect(gX, curY, colW3, colH3, 1, 1, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(153, 27, 27);
  doc.text('Conductas Graves (4-6 pts)', gX + 3, curY + 4.5);
  doc.setFontSize(11);
  doc.text(`${stats.graves} partes (${pctGraves}%)`, gX + 3, curY + 10.5);
  // Progress bar Graves
  doc.setFillColor(254, 202, 202);
  doc.rect(gX + 3, curY + 12.5, colW3 - 6, 2, 'F');
  doc.setFillColor(220, 38, 38);
  doc.rect(gX + 3, curY + 12.5, (colW3 - 6) * (pctGraves / 100), 2, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(127, 29, 29);
  doc.text('Detracción: 4 a 6 puntos | Corrección: Jefatura / PAC', gX + 3, curY + 18);
  doc.text('Medida: Comparecencia PAC y privación recreo', gX + 3, curY + 21.5);

  // Muy Graves (Art. 35)
  const mgX = marginX + (colW3 + 2) * 2;
  doc.setFillColor(243, 232, 255);
  doc.setDrawColor(192, 132, 252);
  doc.roundedRect(mgX, curY, colW3, colH3, 1, 1, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(107, 33, 168);
  doc.text('Muy Graves (7-10 pts)', mgX + 3, curY + 4.5);
  doc.setFontSize(11);
  doc.text(`${stats.muyGraves} partes (${pctMuyGraves}%)`, mgX + 3, curY + 10.5);
  // Progress bar Muy Graves
  doc.setFillColor(233, 213, 255);
  doc.rect(mgX + 3, curY + 12.5, colW3 - 6, 2, 'F');
  doc.setFillColor(147, 51, 234);
  doc.rect(mgX + 3, curY + 12.5, (colW3 - 6) * (pctMuyGraves / 100), 2, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(88, 28, 135);
  doc.text('Detracción: 7+ pts / Saldo Cero | Comisión Convivencia', mgX + 3, curY + 18);
  doc.text('Medida: Suspensión asistencia / Expte. disciplinario', mgX + 3, curY + 21.5);

  curY += colH3 + 5;

  // 3. GRÁFICO VECTORIAL DE EVOLUCIÓN MENSUAL DEL CURSO
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text('3. EVOLUCIÓN TEMPORAL MENSUAL DEL CURSO ESCOLAR (GRÁFICO DE BARRAS)', marginX, curY);
  curY += 3;

  const chartBoxH = 48;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(marginX, curY, contentWidth, chartBoxH, 1, 1, 'FD');

  // Legend
  doc.setFillColor(2, 132, 199); // Sky
  doc.rect(marginX + contentWidth - 62, curY + 3, 3.5, 3.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(51, 65, 85);
  doc.text('Partes Registrados', marginX + contentWidth - 57, curY + 5.5);

  doc.setFillColor(245, 158, 11); // Amber PAC
  doc.rect(marginX + contentWidth - 28, curY + 3, 3.5, 3.5, 'F');
  doc.text('Aula PAC', marginX + contentWidth - 23, curY + 5.5);

  // Chart coordinates
  const chartX = marginX + 12;
  const chartY = curY + 9;
  const chartW = contentWidth - 20;
  const chartH = 28;
  const bottomY = chartY + chartH;

  // Max value calculation
  let maxCount = 1;
  stats.monthlyCounts.forEach(m => {
    if (m.count > maxCount) maxCount = m.count;
    if (m.pac > maxCount) maxCount = m.pac;
  });
  maxCount = Math.max(5, Math.ceil(maxCount * 1.15));

  // Grid lines
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  for (let g = 0; g <= 4; g++) {
    const gy = bottomY - (chartH * g) / 4;
    doc.line(chartX, gy, chartX + chartW, gy);
    const val = Math.round((maxCount * g) / 4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(148, 163, 184);
    doc.text(String(val), chartX - 2, gy + 1, { align: 'right' });
  }

  // Draw bars
  const numMonths = Math.min(10, stats.monthlyCounts.length);
  const slotW = chartW / Math.max(1, numMonths);
  const barW = Math.min(6, slotW * 0.35);

  stats.monthlyCounts.slice(0, 10).forEach((m, idx) => {
    const slotCenterX = chartX + idx * slotW + slotW / 2;
    const b1H = (m.count / maxCount) * chartH;
    const b2H = (m.pac / maxCount) * chartH;

    // Bar 1 (Total Partes)
    if (b1H > 0) {
      doc.setFillColor(2, 132, 199);
      doc.rect(slotCenterX - barW - 0.5, bottomY - b1H, barW, b1H, 'F');
      // Label top
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.5);
      doc.setTextColor(2, 132, 199);
      doc.text(String(m.count), slotCenterX - barW / 2 - 0.5, bottomY - b1H - 1, { align: 'center' });
    }

    // Bar 2 (Aula PAC)
    if (b2H > 0) {
      doc.setFillColor(245, 158, 11);
      doc.rect(slotCenterX + 0.5, bottomY - b2H, barW, b2H, 'F');
      // Label top
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.5);
      doc.setTextColor(180, 83, 9);
      doc.text(String(m.pac), slotCenterX + barW / 2 + 0.5, bottomY - b2H - 1, { align: 'center' });
    }

    // Month Label
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(71, 85, 105);
    const shortMes = m.mes.length > 3 ? m.mes.slice(0, 3) : m.mes;
    doc.text(shortMes, slotCenterX, bottomY + 4, { align: 'center' });
  });

  // Axis lines
  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.4);
  doc.line(chartX, chartY, chartX, bottomY);
  doc.line(chartX, bottomY, chartX + chartW, bottomY);

  curY += chartBoxH + 5;

  // 4. COMPARATIVA POR TRIMESTRES Y MOMENTOS CLAVE
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text('4. DISTRIBUCIÓN TRIMESTRAL Y DILIGENCIA PREVENTIVA', marginX, curY);
  curY += 3;

  const t1 = stats.monthlyCounts.slice(0, 3).reduce((acc, c) => acc + c.count, 0);
  const t2 = stats.monthlyCounts.slice(3, 7).reduce((acc, c) => acc + c.count, 0);
  const t3 = stats.monthlyCounts.slice(7).reduce((acc, c) => acc + c.count, 0);

  const trimW = (contentWidth - 4) / 3;
  const trimH = 14;

  const drawTrimBox = (x: number, title: string, count: number, subtitle: string) => {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(x, curY, trimW, trimH, 1, 1, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(71, 85, 105);
    doc.text(title, x + 3, curY + 4);
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(`${count} partes`, x + 3, curY + 9);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(100, 116, 139);
    doc.text(subtitle, x + 3, curY + 12);
  };

  drawTrimBox(marginX, '1er Trimestre (Sep - Dic)', t1, 'Adaptación e inicio de curso');
  drawTrimBox(marginX + trimW + 2, '2º Trimestre (Ene - Mar)', t2, 'Consolidación académica');
  drawTrimBox(marginX + (trimW + 2) * 2, '3er Trimestre (Abr - Jun)', t3, 'Evaluación y cierre');

  drawFooter(1);

  // =========================================================================
  // --- PÁGINA 2: ANÁLISIS DE ESPACIOS, NIVELES Y MEDIDAS RESTAURATIVAS ---
  // =========================================================================
  doc.addPage();
  curY = drawHeader(2, 'ANÁLISIS DE ESPACIOS, NIVELES EDUCATIVOS Y MEDIDAS RESTAURATIVAS');

  // 5. DISTRIBUCIÓN POR ESPACIOS Y UBICACIONES DEL CENTRO (Gráfico horizontal de barras)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text('5. DISTRIBUCIÓN POR ESPACIOS Y LUGARES DEL CENTRO (INFOGRAFÍA)', marginX, curY);
  curY += 3;

  const ubicBoxW = contentWidth;
  const ubicBoxH = 46;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(marginX, curY, ubicBoxW, ubicBoxH, 1, 1, 'FD');

  const maxUbic = Math.max(1, ...stats.topUbicaciones.map(u => u[1]));
  const totalUbicCount = Math.max(1, stats.topUbicaciones.reduce((acc, u) => acc + u[1], 0));

  let uY = curY + 5;
  stats.topUbicaciones.slice(0, 6).forEach((u, idx) => {
    const label = u[0];
    const count = u[1];
    const pct = Math.round((count / totalUbicCount) * 100);
    const barWidth = (contentWidth - 65) * (count / maxUbic);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(51, 65, 85);
    doc.text(label, marginX + 3, uY + 3.5);

    // Track background
    doc.setFillColor(226, 232, 240);
    doc.roundedRect(marginX + 38, uY + 0.8, contentWidth - 65, 4, 0.8, 0.8, 'F');

    // Filled bar with specific color based on index
    const colors = [
      [2, 132, 199],  // Sky
      [14, 165, 233], // Sky light
      [245, 158, 11], // Amber
      [239, 68, 68],  // Red
      [168, 85, 247], // Purple
      [100, 116, 139] // Slate
    ];
    const c = colors[idx % colors.length];
    doc.setFillColor(c[0], c[1], c[2]);
    doc.roundedRect(marginX + 38, uY + 0.8, Math.max(2, barWidth), 4, 0.8, 0.8, 'F');

    // Number and percentage
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`${count} (${pct}%)`, marginX + contentWidth - 4, uY + 3.5, { align: 'right' });

    uY += 6.5;
  });

  curY += ubicBoxH + 5;

  // 6. DISTRIBUCIÓN POR NIVEL EDUCATIVO Y CONDUCTAS DEL ROF (2 Columnas)
  const halfW = (contentWidth - 4) / 2;

  // Columna Izquierda: Niveles Educativos
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text('6. INCIDENCIAS POR NIVEL EDUCATIVO', marginX, curY);

  // Columna Derecha: Tipologías ROF
  doc.text('7. CONDUCTAS MÁS RECURRENTES (ROF)', marginX + halfW + 4, curY);
  curY += 3;

  const colBoxH = 44;

  // Box Izquierda: Niveles
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(marginX, curY, halfW, colBoxH, 1, 1, 'FD');

  let nY = curY + 5;
  const niveles = stats.topNiveles || [
    { nivel: '1º ESO', count: 0, pct: 0 },
    { nivel: '2º ESO', count: 0, pct: 0 },
    { nivel: '3º ESO', count: 0, pct: 0 },
    { nivel: '4º ESO', count: 0, pct: 0 },
    { nivel: 'FP Básica (1º y 2º INF)', count: 0, pct: 0 },
  ];

  const maxNivel = Math.max(1, ...niveles.map(n => n.count));
  niveles.slice(0, 5).forEach(n => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.setTextColor(51, 65, 85);
    const shortNivel = n.nivel.includes('FP Básica') ? 'FP Básica (INF)' : n.nivel;
    doc.text(shortNivel, marginX + 2.5, nY + 3.5);

    // Track
    doc.setFillColor(226, 232, 240);
    doc.roundedRect(marginX + 24, nY + 0.8, halfW - 42, 3.5, 0.5, 0.5, 'F');

    // Fill
    doc.setFillColor(3, 105, 161);
    const bW = (halfW - 42) * (n.count / maxNivel);
    doc.roundedRect(marginX + 24, nY + 0.8, Math.max(1, bW), 3.5, 0.5, 0.5, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(15, 23, 42);
    doc.text(`${n.count} (${n.pct}%)`, marginX + halfW - 3, nY + 3.5, { align: 'right' });

    nY += 7;
  });

  // Box Derecha: Conductas ROF
  const rX = marginX + halfW + 4;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(rX, curY, halfW, colBoxH, 1, 1, 'FD');

  let rY = curY + 4.5;
  // Solo datos reales (nunca cifras de ejemplo en un documento oficial)
  const rofList = stats.topRof || [];

  rofList.slice(0, 5).forEach((r) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(15, 23, 42);
    const cLabel = r.codigo.length > 28 ? r.codigo.slice(0, 26) + '...' : r.codigo;
    doc.text(cLabel, rX + 3, rY + 3);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`${r.count} casos (-${r.puntos} pts)`, rX + halfW - 3, rY + 3, { align: 'right' });

    rY += 6.8;
  });

  curY += colBoxH + 5;

  // 8. VALORACIÓN PEDAGÓGICA Y MEDIDAS RESTAURATIVAS
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text('8. VALORACIÓN PEDAGÓGICA Y PROPUESTAS DE MEJORA', marginX, curY);
  curY += 3;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(marginX, curY, contentWidth, 24, 1, 1, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(51, 65, 85);
  const conclusionesText = 
    `1. Clima Escolar General: El ${stats.ratioCumplimiento}% del alumnado ha mantenido su saldo íntegro de carnet por puntos sin registrar incidencias.\n` +
    `2. Enfoque Restaurativo: Se han restituido +${stats.puntosRestituidos} puntos mediante compromisos pedagógicos y tareas a la comunidad escolar.\n` +
    `3. Aula de Convivencia (PAC): Se han derivado ${stats.pacDerivados} expedientes con una tasa de comparecencia efectiva del ${stats.pacTasaComparecencia}%.\n` +
    `4. Propuestas de mejora: a completar por el Equipo de Convivencia.`;

  doc.text(conclusionesText, marginX + 3.5, curY + 4.8);
  curY += 28;

  // 9. DILIGENCIA OFICIAL DE APROBACIÓN Y FIRMAS
  const sigW = contentWidth / 2 - 4;
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.3);

  doc.line(marginX, curY + 12, marginX + sigW, curY + 12);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(51, 65, 85);
  doc.text('Vº Bº Jefatura de Estudios / Convivencia', marginX + sigW / 2, curY + 16, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.text('IES Blas Infante (Córdoba)', marginX + sigW / 2, curY + 20, { align: 'center' });

  const sig2X = marginX + sigW + 8;
  doc.line(sig2X, curY + 12, sig2X + sigW, curY + 12);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('Secretaría / Registro Oficial del Centro', sig2X + sigW / 2, curY + 16, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.text(`Fecha de emisión: ${new Date().toLocaleDateString('es-ES')}`, sig2X + sigW / 2, curY + 20, { align: 'center' });

  drawFooter(2);

  // =========================================================================
  // --- PÁGINA 3: ANEXO OFICIAL DE EXPEDIENTES DISCIPLINARIOS Y TRAZABILIDAD ---
  // =========================================================================
  if (stats.sancionesList.length > 0) {
    // Anexo con TODOS los partes (tantas páginas como hagan falta)
    let pagina = 3;
    const cabeceraTabla = () => {
      doc.setFillColor(3, 105, 161);
      doc.setDrawColor(3, 105, 161);
      doc.rect(marginX, curY, contentWidth, 5.5, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(255, 255, 255);
      doc.text('Expediente', marginX + 2, curY + 3.8);
      doc.text('Fecha', marginX + 23, curY + 3.8);
      doc.text('Alumno/a', marginX + 41, curY + 3.8);
      doc.text('Grupo', marginX + 86, curY + 3.8);
      doc.text('Profesor/a', marginX + 104, curY + 3.8);
      doc.text('Lugar', marginX + 140, curY + 3.8);
      doc.text('Pts', marginX + 158, curY + 3.8);
      doc.text('PAC', marginX + 166, curY + 3.8);
      doc.text('Estado', marginX + 174, curY + 3.8);
      curY += 5.5;
    };
    const ESTADOS: Record<string, string> = {
      PENDIENTE_NOTIFICACION: 'Pend. llamada',
      NOTIFICADO_TELEFONO: 'Llamada',
      PARTE_IMPRESO: 'Impreso',
      RESUELTO: 'Completado',
    };

    doc.addPage();
    curY = drawHeader(pagina, 'ANEXO OFICIAL: REGISTRO DE EXPEDIENTES Y TRAZABILIDAD DISCIPLINARIA');
    cabeceraTabla();

    stats.sancionesList.forEach((s, idx) => {
      if (curY > pageHeight - 18) {
        drawFooter(pagina);
        pagina++;
        doc.addPage();
        curY = drawHeader(pagina, 'ANEXO OFICIAL (continuación)');
        cabeceraTabla();
      }
      const isAlt = idx % 2 === 1;
      if (isAlt) {
        doc.setFillColor(248, 250, 252);
        doc.rect(marginX, curY, contentWidth, 5.2, 'F');
      }
      const alm = alumnoMap.get(s.id_alumno);
      const alumnoNombre = alm ? `${alm.apellidos}, ${alm.nombre}` : s.id_alumno;
      const almTrunc = alumnoNombre.length > 22 ? alumnoNombre.slice(0, 20) + '...' : alumnoNombre;
      const nombreProf = s.nombre_profesor || '';
      const profTrunc = nombreProf.length > 18 ? nombreProf.slice(0, 16) + '...' : nombreProf;
      const locTrunc = (s.ubicacion || 'Aula').length > 11 ? (s.ubicacion || 'Aula').slice(0, 9) + '..' : (s.ubicacion || 'Aula');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.8);
      doc.setTextColor(15, 23, 42);

      doc.text(s.numero_expediente || '', marginX + 2, curY + 3.6);
      doc.text(s.fecha || '', marginX + 23, curY + 3.6);
      doc.text(almTrunc, marginX + 41, curY + 3.6);
      doc.text(alm ? alm.grupo : '-', marginX + 86, curY + 3.6);
      doc.text(profTrunc, marginX + 104, curY + 3.6);
      doc.text(locTrunc, marginX + 140, curY + 3.6);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(s.puntos_restados >= 5 ? 185 : 71, s.puntos_restados >= 5 ? 28 : 85, s.puntos_restados >= 5 ? 28 : 105);
      doc.text(`-${s.puntos_restados}`, marginX + 158, curY + 3.6);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(15, 23, 42);
      doc.text(s.derivado_pac ? 'SÍ' : 'NO', marginX + 166, curY + 3.6);
      doc.text(ESTADOS[s.estado_tramitacion || ''] || s.estado_tramitacion || '-', marginX + 174, curY + 3.6);

      curY += 5.2;
    });

    drawFooter(pagina);
  }

  doc.putTotalPages('{total_paginas}');

  // Download logic
  const filename = options?.customFileName || `Memoria_Convivencia_IES_Blas_Infante_${stats.academicYear.replace('/', '_')}.pdf`;
  const blob = doc.output('blob');

  if (options?.download !== false) {
    try {
      doc.save(filename);
    } catch (saveError) {
      console.warn('doc.save failed, executing blob fallback download:', saveError);
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
    }
  }

  return { doc, filename, blob };
}
