/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { 
  BarChart3, 
  MapPin, 
  Calendar, 
  TrendingDown, 
  TrendingUp, 
  ShieldAlert, 
  Clock, 
  Users,
  Compass,
  GitCompare,
  ArrowRight,
  Filter,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  FileSpreadsheet,
  FileText,
  Download,
  Loader2,
  X,
  Search,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Info,
  BookOpen,
  School,
  Activity,
  Trophy,
  Award,
  Layers,
  Flame
} from 'lucide-react';
import { 
  Sancion, 
  Alumno, 
  Compensacion,
  CodigoInfraccionROF, 
  TramoHorario, 
  UbicacionCentro 
} from '../types/convivencia';
import { MATRIZ_ROF_CATALOG } from '../data/rofCatalog';
import { 
  getAcademicYearFromDate, 
  AVAILABLE_ACADEMIC_YEARS, 
  HISTORICAL_SANCIONES,
  HISTORICAL_COMPENSACIONES 
} from '../data/historicalData';
import { StorageService } from '../services/storageService';
import { generateMemoriaConvivenciaPdf } from '../utils/pdfGenerator';

interface AnalyticsViewProps {
  sanciones: Sancion[];
  alumnos: Alumno[];
  compensaciones?: Compensacion[];
  onNavigateToCarnet?: (idAlumno?: string) => void;
}

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
const TRAMOS_HEATMAP: TramoHorario[] = [
  '1ª Hora (08:30 - 09:30)',
  '2ª Hora (09:30 - 10:30)',
  '3ª Hora (10:30 - 11:30)',
  'Recreo (11:30 - 12:00)',
  '4ª Hora (12:00 - 13:00)',
  '5ª Hora (13:00 - 14:00)',
  '6ª Hora (14:00 - 15:00)'
];

const UBICACIONES_LIST: string[] = [
  'Aula ordinaria',
  'Pasillos',
  'Patio',
  'Cafetería',
  'Biblioteca',
  'Otros'
];

const MESES_CURSO = [
  { mesIdx: 8, label: 'Sep', full: 'Septiembre' },
  { mesIdx: 9, label: 'Oct', full: 'Octubre' },
  { mesIdx: 10, label: 'Nov', full: 'Noviembre' },
  { mesIdx: 11, label: 'Dic', full: 'Diciembre' },
  { mesIdx: 0, label: 'Ene', full: 'Enero' },
  { mesIdx: 1, label: 'Feb', full: 'Febrero' },
  { mesIdx: 2, label: 'Mar', full: 'Marzo' },
  { mesIdx: 3, label: 'Abr', full: 'Abril' },
  { mesIdx: 4, label: 'May', full: 'Mayo' },
  { mesIdx: 5, label: 'Jun', full: 'Junio' },
];

type DetailModalType = 'INFRACCIONES' | 'PUNTOS' | 'PAC' | 'CUMPLIMIENTO' | null;

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ 
  sanciones, 
  alumnos, 
  compensaciones = [],
  onNavigateToCarnet 
}) => {
  // Available Academic Years (dynamic + archived + baseline)
  const availableYears = useMemo(() => {
    return StorageService.getCursosDisponibles();
  }, []);

  const currentCourseId = useMemo(() => {
    return StorageService.getCursoActual();
  }, []);

  // Mode: Single Year or Interannual Comparison
  const [isCompareMode, setIsCompareMode] = useState<boolean>(false);
  const [selectedYear, setSelectedYear] = useState<string>(() => StorageService.getCursoActual());
  const [compareYearB, setCompareYearB] = useState<string>(() => {
    const others = StorageService.getCursosDisponibles().filter(c => c.id !== StorageService.getCursoActual());
    return others.length > 0 ? others[0].id : '';
  });

  // Heatmap Metric
  const [selectedMetric, setSelectedMetric] = useState<'count' | 'points'>('count');

  // Detail Modals for 4 KPIs
  const [activeModal, setActiveModal] = useState<DetailModalType>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);

  // Search & filter state inside detail modal
  const [modalSearchTerm, setModalSearchTerm] = useState<string>('');
  const [modalFilterGravedad, setModalFilterGravedad] = useState<string>('TODAS');

  // Map of Alumnos
  const alumnoMap = useMemo(() => {
    return new Map(alumnos.map(a => [a.id_alumno, a]));
  }, [alumnos]);

  // Combine live sanctions with archived real courses (all fictitious mock past years removed)
  const allSancionesCombined = useMemo(() => {
    const liveIds = new Set(sanciones.map(s => s.id_sancion));
    const merged = [...sanciones];

    // Sanciones de cursos archivados reales por el centro
    const archivedSanciones = StorageService.getHistoricoSancionesTodosLosCursos();
    archivedSanciones.forEach(as => {
      if (!liveIds.has(as.id_sancion)) {
        liveIds.add(as.id_sancion);
        merged.push(as);
      }
    });

    return merged;
  }, [sanciones]);

  // Combine live compensaciones with archived real courses
  const allCompensacionesCombined = useMemo(() => {
    const liveIds = new Set(compensaciones.map(c => c.id_compensacion));
    const merged = [...compensaciones];

    const archivedComps = StorageService.getHistoricoCompensacionesTodosLosCursos();
    archivedComps.forEach(ac => {
      if (!liveIds.has(ac.id_compensacion)) {
        liveIds.add(ac.id_compensacion);
        merged.push(ac);
      }
    });

    return merged;
  }, [compensaciones]);

  // Filter dataset for Year A
  const datasetYearA = useMemo(() => {
    if (selectedYear === currentCourseId) {
      // Para el curso actual activo, mostrar el 100% de los partes activos en el sistema
      return sanciones;
    }
    return allSancionesCombined.filter(s => getAcademicYearFromDate(s.fecha) === selectedYear);
  }, [allSancionesCombined, sanciones, selectedYear, currentCourseId]);

  // Filter dataset for Year B (when comparing)
  const datasetYearB = useMemo(() => {
    return allSancionesCombined.filter(s => getAcademicYearFromDate(s.fecha) === compareYearB);
  }, [allSancionesCombined, compareYearB]);

  // Compensaciones for Year A
  const compensacionesYearA = useMemo(() => {
    return allCompensacionesCombined.filter(c => getAcademicYearFromDate(c.fecha_completada) === selectedYear);
  }, [allCompensacionesCombined, selectedYear]);

  // Compensaciones for Year B
  const compensacionesYearB = useMemo(() => {
    return allCompensacionesCombined.filter(c => getAcademicYearFromDate(c.fecha_completada) === compareYearB);
  }, [allCompensacionesCombined, compareYearB]);

  // --- STATS CALCULATOR HELPER ---
  const calculateYearStats = (sancionesList: Sancion[], compensacionesList: Compensacion[]) => {
    const totalPartes = sancionesList.length;
    const totalPuntosPerdidos = sancionesList.reduce((acc, s) => acc + s.puntos_restados, 0);
    const puntosRestituidos = compensacionesList.reduce((acc, c) => acc + c.puntos_recuperados, 0);
    const pacDerivados = sancionesList.filter(s => s.derivado_pac).length;
    const pacCompletados = sancionesList.filter(s => s.derivado_pac && s.estado_pac === 'TAREAS_COMPLETADAS').length;
    const pacTasaComparecencia = pacDerivados > 0 ? Math.round((pacCompletados / pacDerivados) * 100) : 100;

    // Severity Breakdown (Decreto 327/2010)
    const leves = sancionesList.filter(s => s.puntos_restados >= 1 && s.puntos_restados <= 3).length;
    const graves = sancionesList.filter(s => s.puntos_restados >= 4 && s.puntos_restados <= 6).length;
    const muyGraves = sancionesList.filter(s => s.puntos_restados >= 7).length;

    // Students affected in this academic year
    const uniqueStudentIds = new Set(sancionesList.map(s => s.id_alumno));
    const totalAlumnosAfectados = uniqueStudentIds.size;
    const totalCensoAlumnos = Math.max(1, alumnos.length);
    
    // Recidivism breakdown
    const studentPartesCount: Record<string, number> = {};
    sancionesList.forEach(s => {
      studentPartesCount[s.id_alumno] = (studentPartesCount[s.id_alumno] || 0) + 1;
    });

    let count1Parte = 0;
    let count2a3Partes = 0;
    let countMasDe3Partes = 0;

    Object.values(studentPartesCount).forEach(cnt => {
      if (cnt === 1) count1Parte++;
      else if (cnt >= 2 && cnt <= 3) count2a3Partes++;
      else if (cnt > 3) countMasDe3Partes++;
    });

    const count0Partes = Math.max(0, totalCensoAlumnos - totalAlumnosAfectados);
    const ratioCumplimiento = Math.round((count0Partes / totalCensoAlumnos) * 100);

    return {
      totalPartes,
      totalPuntosPerdidos,
      puntosRestituidos,
      saldoNetoPuntos: Math.max(0, totalPuntosPerdidos - puntosRestituidos),
      promedioPuntosPorParte: totalPartes > 0 ? (totalPuntosPerdidos / totalPartes).toFixed(1) : '0',
      pacDerivados,
      pacRatioSobreTotal: totalPartes > 0 ? Math.round((pacDerivados / totalPartes) * 100) : 0,
      pacTasaComparecencia,
      leves,
      graves,
      muyGraves,
      totalAlumnosAfectados,
      totalCensoAlumnos,
      count0Partes,
      count1Parte,
      count2a3Partes,
      countMasDe3Partes,
      ratioCumplimiento,
    };
  };

  const statsA = useMemo(() => calculateYearStats(datasetYearA, compensacionesYearA), [datasetYearA, compensacionesYearA, alumnos]);
  const statsB = useMemo(() => calculateYearStats(datasetYearB, compensacionesYearB), [datasetYearB, compensacionesYearB, alumnos]);

  // Delta helpers for interannual comparison
  const computeDelta = (valA: number, valB: number, invertSentiment = false): { diff: number; pct: number; text: string; isGood: boolean } => {
    if (valB === 0) return { diff: 0, pct: 0, text: 'N/D', isGood: true };
    const diff = valA - valB;
    const pct = Math.round((diff / valB) * 100);
    const isReduction = diff < 0;
    // For infractions, reduction is good. For compliance ratio, increase is good.
    const isGood = invertSentiment ? !isReduction : isReduction;
    const sign = diff > 0 ? '+' : '';
    return {
      diff,
      pct,
      text: `${sign}${pct}%`,
      isGood,
    };
  };

  const deltaInfracciones = computeDelta(statsA.totalPartes, statsB.totalPartes);
  const deltaPuntos = computeDelta(statsA.totalPuntosPerdidos, statsB.totalPuntosPerdidos);
  const deltaPAC = computeDelta(statsA.pacDerivados, statsB.pacDerivados);
  const deltaCumplimiento = computeDelta(statsA.ratioCumplimiento, statsB.ratioCumplimiento, true);

  // Month-by-month evolution dataset (Septiembre a Junio)
  const monthlyData = useMemo(() => {
    return MESES_CURSO.map(mDef => {
      // Count Year A
      const countA = datasetYearA.filter(s => {
        const d = new Date(s.fecha);
        return d.getMonth() === mDef.mesIdx;
      }).length;

      const pacA = datasetYearA.filter(s => {
        const d = new Date(s.fecha);
        return d.getMonth() === mDef.mesIdx && s.derivado_pac;
      }).length;

      // Count Year B
      const countB = datasetYearB.filter(s => {
        const d = new Date(s.fecha);
        return d.getMonth() === mDef.mesIdx;
      }).length;

      return {
        mes: mDef.label,
        nombreCompleto: mDef.full,
        countA,
        pacA,
        countB,
      };
    });
  }, [datasetYearA, datasetYearB]);

  const maxMonthlyCount = useMemo(() => {
    let max = 1;
    monthlyData.forEach(d => {
      if (d.countA > max) max = d.countA;
      if (d.countB > max) max = d.countB;
    });
    return max;
  }, [monthlyData]);

  // Heatmap: Day of Week vs Tramo Horario for Year A
  const heatmapData = useMemo(() => {
    const grid: Record<string, Record<string, number>> = {};
    TRAMOS_HEATMAP.forEach(tramo => {
      grid[tramo] = {};
      DIAS_SEMANA.forEach(dia => {
        grid[tramo][dia] = 0;
      });
    });

    datasetYearA.forEach(s => {
      const d = new Date(s.timestamp || s.fecha);
      const dayIdx = d.getDay(); // 0 is Sun, 1 is Mon, 5 is Fri
      const dayName = DIAS_SEMANA[Math.max(0, Math.min(4, dayIdx === 0 ? 0 : dayIdx - 1))];
      const tramo = s.tramo_horario || '2ª Hora (09:15 - 10:15)';
      if (grid[tramo] && grid[tramo][dayName] !== undefined) {
        grid[tramo][dayName] += selectedMetric === 'count' ? 1 : s.puntos_restados;
      }
    });

    let maxVal = 1;
    TRAMOS_HEATMAP.forEach(t => {
      DIAS_SEMANA.forEach(d => {
        if (grid[t][d] > maxVal) maxVal = grid[t][d];
      });
    });

    return { grid, maxVal };
  }, [datasetYearA, selectedMetric]);

  // Breakdown by Educational Level (Cursos)
  const nivelBreakdown = useMemo(() => {
    const baseLevels = [
      '1º ESO',
      '2º ESO',
      '3º ESO',
      '4º ESO',
      'FP Básica (1º y 2º INF)',
      '1º Bachillerato',
      '2º Bachillerato',
      'Ciclos (Frío / Calor)'
    ];
    const countsA: Record<string, number> = {};
    const countsB: Record<string, number> = {};
    baseLevels.forEach(l => {
      countsA[l] = 0;
      countsB[l] = 0;
    });

    const classifyGroupToLevel = (rawGrp: string): string | null => {
      const grp = (rawGrp || '').trim().toUpperCase();
      if (grp.startsWith('1ESO') || grp.startsWith('1º ESO') || grp.startsWith('1-ESO') || grp.startsWith('1 ESO')) return '1º ESO';
      if (grp.startsWith('2ESO') || grp.startsWith('2º ESO') || grp.startsWith('2-ESO') || grp.startsWith('2 ESO')) return '2º ESO';
      if (grp.startsWith('3ESO') || grp.startsWith('3º ESO') || grp.startsWith('3-ESO') || grp.startsWith('3 ESO')) return '3º ESO';
      if (grp.startsWith('4ESO') || grp.startsWith('4º ESO') || grp.startsWith('4-ESO') || grp.startsWith('4 ESO')) return '4º ESO';
      if (
        grp === '1_INF' ||
        grp === '2_INF' ||
        grp.includes('INF') ||
        grp.includes('FPB') ||
        grp.includes('BASICA')
      ) {
        return 'FP Básica (1º y 2º INF)';
      }
      if (grp.startsWith('1BACH') || grp.startsWith('1º BACH') || grp.startsWith('1-BACH') || grp.startsWith('1 BACH')) return '1º Bachillerato';
      if (grp.startsWith('2BACH') || grp.startsWith('2º BACH') || grp.startsWith('2-BACH') || grp.startsWith('2 BACH')) return '2º Bachillerato';
      if (grp.includes('FRIO') || grp.includes('CALOR')) return 'Ciclos (Frío / Calor)';
      return null;
    };

    datasetYearA.forEach(s => {
      const alm = alumnoMap.get(s.id_alumno);
      const grp = alm ? alm.grupo : '';
      const lvl = classifyGroupToLevel(grp);
      if (lvl) countsA[lvl]++;
    });

    datasetYearB.forEach(s => {
      const alm = alumnoMap.get(s.id_alumno);
      const grp = alm ? alm.grupo : '';
      const lvl = classifyGroupToLevel(grp);
      if (lvl) countsB[lvl]++;
    });

    // Mostrar siempre 1º-4º ESO y FP Básica (1º y 2º INF), y además Bachillerato/Ciclos si tienen partes registrados
    const coreSet = new Set(['1º ESO', '2º ESO', '3º ESO', '4º ESO', 'FP Básica (1º y 2º INF)']);
    const visibleLevels = baseLevels.filter(lvl => coreSet.has(lvl) || countsA[lvl] > 0 || countsB[lvl] > 0);

    return visibleLevels.map(lvl => ({
      nivel: lvl,
      countA: countsA[lvl],
      pctA: statsA.totalPartes > 0 ? Math.round((countsA[lvl] / statsA.totalPartes) * 100) : 0,
      countB: countsB[lvl],
      pctB: statsB.totalPartes > 0 ? Math.round((countsB[lvl] / statsB.totalPartes) * 100) : 0,
    }));
  }, [datasetYearA, datasetYearB, alumnoMap, statsA.totalPartes, statsB.totalPartes]);

  // Ranking detallado de partes por curso y grupo específico
  const rankingCursosBreakdown = useMemo(() => {
    const cursosMap: Record<string, {
      nombreCurso: string;
      totalPartes: number;
      totalPuntosRestados: number;
      alumnosConParte: Set<string>;
      partesGravesMuyGraves: number;
      derivacionesPAC: number;
      gruposDesglose: Record<string, { partes: number; puntos: number; alumnos: Set<string> }>;
    }> = {};

    const normalizeCurso = (rawGrupo: string): { cursoKey: string; cursoLabel: string; grupoName: string } => {
      const g = (rawGrupo || 'Sin Grupo').trim().toUpperCase();
      if (g.startsWith('1ESO') || g.startsWith('1º ESO') || g.startsWith('1-ESO') || g.startsWith('1 ESO')) {
        return { cursoKey: '1º ESO', cursoLabel: '1º de E.S.O.', grupoName: g };
      }
      if (g.startsWith('2ESO') || g.startsWith('2º ESO') || g.startsWith('2-ESO') || g.startsWith('2 ESO')) {
        return { cursoKey: '2º ESO', cursoLabel: '2º de E.S.O.', grupoName: g };
      }
      if (g.startsWith('3ESO') || g.startsWith('3º ESO') || g.startsWith('3-ESO') || g.startsWith('3 ESO')) {
        return { cursoKey: '3º ESO', cursoLabel: '3º de E.S.O.', grupoName: g };
      }
      if (g.startsWith('4ESO') || g.startsWith('4º ESO') || g.startsWith('4-ESO') || g.startsWith('4 ESO')) {
        return { cursoKey: '4º ESO', cursoLabel: '4º de E.S.O.', grupoName: g };
      }
      if (
        g === '1_INF' ||
        g.startsWith('1_INF') ||
        g.startsWith('1º INF') ||
        g.startsWith('1 INF') ||
        g.startsWith('1INF') ||
        g.startsWith('1FPB') ||
        g.startsWith('1º FPB') ||
        g.startsWith('1 FPB')
      ) {
        return { cursoKey: '1º INF (FP Básica)', cursoLabel: '1º FP Básica Informática (1º INF)', grupoName: g };
      }
      if (
        g === '2_INF' ||
        g.startsWith('2_INF') ||
        g.startsWith('2º INF') ||
        g.startsWith('2 INF') ||
        g.startsWith('2INF') ||
        g.startsWith('2FPB') ||
        g.startsWith('2º FPB') ||
        g.startsWith('2 FPB')
      ) {
        return { cursoKey: '2º INF (FP Básica)', cursoLabel: '2º FP Básica Informática (2º INF)', grupoName: g };
      }
      if (g.includes('INF') || g.includes('FPB')) {
        return { cursoKey: 'FP Básica (INF)', cursoLabel: 'FP Básica Informática (1º / 2º INF)', grupoName: g };
      }
      if (g.startsWith('1BACH') || g.startsWith('1º BACH') || g.startsWith('1-BACH')) {
        return { cursoKey: '1º Bachillerato', cursoLabel: '1º de Bachillerato', grupoName: g };
      }
      if (g.startsWith('2BACH') || g.startsWith('2º BACH') || g.startsWith('2-BACH')) {
        return { cursoKey: '2º Bachillerato', cursoLabel: '2º de Bachillerato', grupoName: g };
      }
      if (g.includes('FRIO')) {
        return { cursoKey: g.startsWith('2') ? '2º Frío' : '1º Frío', cursoLabel: `${g.startsWith('2') ? '2º' : '1º'} Ciclo Frío y Climatización`, grupoName: g };
      }
      if (g.includes('CALOR')) {
        return { cursoKey: g.startsWith('2') ? '2º Calor' : '1º Calor', cursoLabel: `${g.startsWith('2') ? '2º' : '1º'} Ciclo Producción de Calor`, grupoName: g };
      }
      return { cursoKey: g || 'Otros', cursoLabel: g || 'Otros Grupos', grupoName: g || 'Sin grupo' };
    };

    datasetYearA.forEach(s => {
      const alm = alumnoMap.get(s.id_alumno);
      const rawGrupo = alm ? alm.grupo : 'Sin grupo';
      const { cursoKey, cursoLabel, grupoName } = normalizeCurso(rawGrupo);

      if (!cursosMap[cursoKey]) {
        cursosMap[cursoKey] = {
          nombreCurso: cursoLabel,
          totalPartes: 0,
          totalPuntosRestados: 0,
          alumnosConParte: new Set(),
          partesGravesMuyGraves: 0,
          derivacionesPAC: 0,
          gruposDesglose: {},
        };
      }

      const curso = cursosMap[cursoKey];
      curso.totalPartes += 1;
      curso.totalPuntosRestados += (s.puntos_restados || 0);
      if (s.id_alumno) curso.alumnosConParte.add(s.id_alumno);
      if ((s.puntos_restados || 0) >= 4 || s.tipo_conducta === 'GRAVE') {
        curso.partesGravesMuyGraves += 1;
      }
      if (s.derivado_pac) {
        curso.derivacionesPAC += 1;
      }

      if (!curso.gruposDesglose[grupoName]) {
        curso.gruposDesglose[grupoName] = { partes: 0, puntos: 0, alumnos: new Set() };
      }
      curso.gruposDesglose[grupoName].partes += 1;
      curso.gruposDesglose[grupoName].puntos += (s.puntos_restados || 0);
      if (s.id_alumno) curso.gruposDesglose[grupoName].alumnos.add(s.id_alumno);
    });

    const ranking = Object.entries(cursosMap).map(([key, data]) => {
      const pctSobreTotal = statsA.totalPartes > 0 ? Math.round((data.totalPartes / statsA.totalPartes) * 100) : 0;
      const gruposSorted = Object.entries(data.gruposDesglose)
        .map(([gName, gData]) => ({
          grupo: gName,
          partes: gData.partes,
          puntos: gData.puntos,
          alumnosCount: gData.alumnos.size,
          pct: data.totalPartes > 0 ? Math.round((gData.partes / data.totalPartes) * 100) : 0,
        }))
        .sort((a, b) => b.partes - a.partes);

      return {
        cursoKey: key,
        nombreCurso: data.nombreCurso,
        totalPartes: data.totalPartes,
        totalPuntosRestados: data.totalPuntosRestados,
        alumnosAfectadosCount: data.alumnosConParte.size,
        partesGravesMuyGraves: data.partesGravesMuyGraves,
        derivacionesPAC: data.derivacionesPAC,
        pctSobreTotal,
        gruposDesglose: gruposSorted,
      };
    });

    // Ordenar de mayor a menor número de partes
    return ranking.sort((a, b) => b.totalPartes - a.totalPartes);
  }, [datasetYearA, alumnoMap, statsA.totalPartes]);

  // Subject / Context Breakdown
  const materiasBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    datasetYearA.forEach(s => {
      const mat = s.materia || 'Otras actividades';
      counts[mat] = (counts[mat] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [datasetYearA]);

  // ROF Typology Breakdown
  const rofBreakdown = useMemo(() => {
    const counts: Record<string, { count: number; puntos: number }> = {};
    datasetYearA.forEach(s => {
      if (!counts[s.codigo_infraccion]) {
        counts[s.codigo_infraccion] = { count: 0, puntos: 0 };
      }
      counts[s.codigo_infraccion].count += 1;
      counts[s.codigo_infraccion].puntos += s.puntos_restados;
    });
    return Object.entries(counts).sort((a, b) => b[1].count - a[1].count);
  }, [datasetYearA]);

  // Location Breakdown
  const locationBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    UBICACIONES_LIST.forEach(u => (counts[u] = 0));
    datasetYearA.forEach(s => {
      const rawLoc = s.ubicacion || 'Aula ordinaria';
      const clean = rawLoc.toLowerCase();
      let key = 'Otros';

      if (clean.includes('aula') || clean.includes('clase')) {
        key = 'Aula ordinaria';
      } else if (clean.includes('pasillo') || clean.includes('edificio a') || clean.includes('aseo')) {
        key = 'Pasillos';
      } else if (clean.includes('patio')) {
        key = 'Patio';
      } else if (clean.includes('cafeter') || clean.includes('comedor')) {
        key = 'Cafetería';
      } else if (clean.includes('biblioteca')) {
        key = 'Biblioteca';
      } else {
        key = 'Otros';
      }

      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [datasetYearA]);

  // Export CSV Helper
  const handleExportCsv = () => {
    const headers = ['Expediente', 'Fecha', 'Tramo', 'Alumno', 'Grupo', 'Profesor', 'Materia', 'ROF', 'Puntos', 'Derivado_PAC', 'Estado_Tramitacion'];
    const rows = datasetYearA.map(s => {
      const alm = alumnoMap.get(s.id_alumno);
      return [
        s.numero_expediente,
        s.fecha,
        `"${s.tramo_horario}"`,
        `"${alm ? `${alm.apellidos}, ${alm.nombre}` : s.id_alumno}"`,
        alm ? alm.grupo : '',
        `"${s.nombre_profesor}"`,
        `"${s.materia || ''}"`,
        s.codigo_infraccion,
        s.puntos_restados,
        s.derivado_pac ? 'SI' : 'NO',
        s.estado_tramitacion || 'PENDIENTE',
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Estadisticas_Convivencia_${selectedYear.replace('/', '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export PDF (Memoria Oficial del Centro) Helper
  const handleExportPdf = async () => {
    if (isGeneratingPdf) return;
    try {
      setIsGeneratingPdf(true);
      await generateMemoriaConvivenciaPdf({
        academicYear: selectedYear,
        totalPartes: statsA.totalPartes,
        totalPuntosPerdidos: statsA.totalPuntosPerdidos,
        puntosRestituidos: statsA.puntosRestituidos,
        saldoNetoPuntos: statsA.saldoNetoPuntos,
        pacDerivados: statsA.pacDerivados,
        pacTasaComparecencia: statsA.pacTasaComparecencia,
        leves: statsA.leves,
        graves: statsA.graves,
        muyGraves: statsA.muyGraves,
        totalAlumnosAfectados: statsA.totalAlumnosAfectados,
        totalCensoAlumnos: statsA.totalCensoAlumnos,
        count0Partes: statsA.count0Partes,
        ratioCumplimiento: statsA.ratioCumplimiento,
        monthlyCounts: monthlyData.map(m => ({ mes: m.mes, count: m.countA, pac: m.pacA })),
        topUbicaciones: locationBreakdown,
        topNiveles: nivelBreakdown.map(n => ({ nivel: n.nivel, count: n.countA, pct: n.pctA })),
        topRof: rofBreakdown.slice(0, 6).map(r => ({ codigo: r[0], count: r[1].count, puntos: r[1].puntos })),
        topMaterias: materiasBreakdown,
        sancionesList: datasetYearA,
      }, alumnos);
    } catch (err) {
      console.error('Error al generar PDF de la Memoria:', err);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className="space-y-6 overflow-x-clip">
      {/* 1. Header with Academic Year Controls & Comparison Switch */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-sky-800 uppercase tracking-widest">
                IES BLAS INFANTE · JEFATURA DE ESTUDIOS
              </span>
              <span className="text-slate-300">|</span>
              <span className="text-xs text-slate-500 font-mono">Decreto 327/2010</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1 flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-sky-700" />
              <span>Analítica de Convivencia y Memoria del Centro</span>
            </h1>
            <p className="text-xs text-slate-600 mt-1">
              Indicadores oficiales de disciplina escolar, radiografía del carnet de puntos, mapa térmico y comparativa interanual.
            </p>
          </div>

          {/* Academic Year Selection, Export PDF & CSV Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Mode switch */}
            {availableYears.length > 1 ? (
              <button
                onClick={() => setIsCompareMode(!isCompareMode)}
                className={`px-3 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition-all cursor-pointer border ${
                  isCompareMode
                    ? 'bg-sky-50 text-sky-900 border-sky-300 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <GitCompare className="w-4 h-4 text-sky-600" />
                <span>{isCompareMode ? 'Modo Comparativa' : 'Comparar Cursos'}</span>
              </button>
            ) : (
              <div 
                className="px-2.5 py-1.5 text-[11px] font-medium text-slate-500 bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-1.5"
                title="La comparativa interanual se activará automáticamente en cuanto abras un nuevo curso escolar (ej. 2027/2028) desde Administración."
              >
                <Info className="w-3.5 h-3.5 text-slate-400" />
                <span>Curso único activo (datos reales)</span>
              </div>
            )}

            {/* Year Selector A */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg p-1 text-xs">
              <span className="px-2 font-bold text-slate-600">Curso:</span>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="bg-white border border-slate-300 rounded-md px-2.5 py-1 text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-sky-500 cursor-pointer"
              >
                {availableYears.map(y => (
                  <option key={y.id} value={y.id}>
                    {y.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Year Selector B (when comparing) */}
            {isCompareMode && availableYears.filter(y => y.id !== selectedYear).length > 0 && (
              <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg p-1 text-xs animate-in fade-in duration-200">
                <span className="px-2 font-bold text-amber-900">vs Curso:</span>
                <select
                  value={compareYearB}
                  onChange={(e) => setCompareYearB(e.target.value)}
                  className="bg-white border border-amber-300 rounded-md px-2.5 py-1 text-xs font-bold text-amber-950 focus:outline-hidden focus:ring-2 focus:ring-amber-500 cursor-pointer"
                >
                  {availableYears.filter(y => y.id !== selectedYear).map(y => (
                    <option key={y.id} value={y.id}>
                      {y.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Export PDF Button (Memoria Oficial) */}
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={isGeneratingPdf}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-sky-700 hover:bg-sky-800 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
              title="Descargar Memoria Oficial de Convivencia en formato PDF"
            >
              {isGeneratingPdf ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileText className="w-3.5 h-3.5" />
              )}
              <span>{isGeneratingPdf ? 'Generando PDF...' : 'Descargar PDF (Memoria)'}</span>
            </button>

            {/* Export CSV Button */}
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
              title="Descargar datos estadísticos en CSV / Hoja de Cálculo"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Descargar CSV</span>
            </button>
          </div>
        </div>

        {/* 2. THE 4 PRIMARY INTERACTIVE KPI CARDS */}
        <div className="pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>Indicadores Clave del Curso {selectedYear}</span>
              <span className="text-slate-300">·</span>
              <span className="text-sky-700 font-semibold normal-case">Haz clic en cualquier tarjeta para ver el desglose detallado</span>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* KPI 1: TOTAL INFRACCIONES */}
            <button
              type="button"
              onClick={() => {
                setModalFilterGravedad('TODAS');
                setModalSearchTerm('');
                setActiveModal('INFRACCIONES');
              }}
              className="bg-slate-50 hover:bg-slate-100/90 border border-slate-200 hover:border-sky-400 rounded-xl p-4 text-left transition-all group cursor-pointer shadow-2xs hover:shadow-xs relative"
            >
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-[11px] font-bold uppercase tracking-wider">
                  Total Infracciones
                </span>
                <span className="text-xs text-sky-600 font-semibold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                  Detalle &rarr;
                </span>
              </div>

              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-bold font-mono text-slate-900 tabular-nums">
                  {statsA.totalPartes}
                </span>
                <span className="text-xs text-slate-500">partes registrados</span>
              </div>

              {/* Sub-metric or Delta */}
              {isCompareMode ? (
                <div className="mt-2.5 pt-2 border-t border-slate-200/70 flex items-center justify-between text-xs">
                  <span className="text-slate-500">vs {compareYearB}: {statsB.totalPartes}</span>
                  <span className={`font-bold flex items-center gap-0.5 ${deltaInfracciones.isGood ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {deltaInfracciones.diff < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />}
                    <span>{deltaInfracciones.text}</span>
                  </span>
                </div>
              ) : (
                <div className="mt-2.5 pt-2 border-t border-slate-200/70 flex items-center gap-2 text-[11px] text-slate-600">
                  <span className="text-emerald-700 font-semibold">{statsA.leves} leves</span>
                  <span>·</span>
                  <span className="text-amber-700 font-semibold">{statsA.graves} graves</span>
                  <span>·</span>
                  <span className="text-rose-700 font-semibold">{statsA.muyGraves} m. graves</span>
                </div>
              )}
            </button>

            {/* KPI 2: PUNTOS DEDUCIDOS */}
            <button
              type="button"
              onClick={() => {
                setModalSearchTerm('');
                setActiveModal('PUNTOS');
              }}
              className="bg-rose-50/70 hover:bg-rose-50 border border-rose-200 hover:border-rose-400 rounded-xl p-4 text-left transition-all group cursor-pointer shadow-2xs hover:shadow-xs"
            >
              <div className="flex items-center justify-between text-rose-800">
                <span className="text-[11px] font-bold uppercase tracking-wider">
                  Puntos Deducidos
                </span>
                <span className="text-xs text-rose-700 font-semibold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                  Detalle &rarr;
                </span>
              </div>

              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-bold font-mono text-rose-800 tabular-nums">
                  -{statsA.totalPuntosPerdidos}
                </span>
                <span className="text-xs text-rose-600">pts en carnets</span>
              </div>

              {/* Sub-metric or Delta */}
              {isCompareMode ? (
                <div className="mt-2.5 pt-2 border-t border-rose-200/70 flex items-center justify-between text-xs">
                  <span className="text-rose-700">vs {compareYearB}: -{statsB.totalPuntosPerdidos}</span>
                  <span className={`font-bold flex items-center gap-0.5 ${deltaPuntos.isGood ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {deltaPuntos.diff < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />}
                    <span>{deltaPuntos.text}</span>
                  </span>
                </div>
              ) : (
                <div className="mt-2.5 pt-2 border-t border-rose-200/70 flex items-center justify-between text-[11px] text-rose-800">
                  <span>Promedio: {statsA.promedioPuntosPorParte} pts/parte</span>
                  <span className="text-emerald-700 font-bold">+{statsA.puntosRestituidos} rest.</span>
                </div>
              )}
            </button>

            {/* KPI 3: DERIVACIONES A PAC */}
            <button
              type="button"
              onClick={() => {
                setModalSearchTerm('');
                setActiveModal('PAC');
              }}
              className="bg-amber-50/70 hover:bg-amber-50 border border-amber-200 hover:border-amber-400 rounded-xl p-4 text-left transition-all group cursor-pointer shadow-2xs hover:shadow-xs"
            >
              <div className="flex items-center justify-between text-amber-900">
                <span className="text-[11px] font-bold uppercase tracking-wider">
                  Derivaciones a PAC
                </span>
                <span className="text-xs text-amber-800 font-semibold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                  Detalle &rarr;
                </span>
              </div>

              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-bold font-mono text-amber-900 tabular-nums">
                  {statsA.pacDerivados}
                </span>
                <span className="text-xs text-amber-700">alumnos derivados</span>
              </div>

              {/* Sub-metric or Delta */}
              {isCompareMode ? (
                <div className="mt-2.5 pt-2 border-t border-amber-200/70 flex items-center justify-between text-xs">
                  <span className="text-amber-800">vs {compareYearB}: {statsB.pacDerivados}</span>
                  <span className={`font-bold flex items-center gap-0.5 ${deltaPAC.isGood ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {deltaPAC.diff < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />}
                    <span>{deltaPAC.text}</span>
                  </span>
                </div>
              ) : (
                <div className="mt-2.5 pt-2 border-t border-amber-200/70 flex items-center justify-between text-[11px] text-amber-800">
                  <span>{statsA.pacRatioSobreTotal}% de los partes</span>
                  <span className="text-emerald-700 font-bold">{statsA.pacTasaComparecencia}% efectiva</span>
                </div>
              )}
            </button>

            {/* KPI 4: RATIO DE CUMPLIMIENTO */}
            <button
              type="button"
              onClick={() => {
                setModalSearchTerm('');
                setActiveModal('CUMPLIMIENTO');
              }}
              className="bg-sky-50/80 hover:bg-sky-50 border border-sky-200 hover:border-sky-400 rounded-xl p-4 text-left transition-all group cursor-pointer shadow-2xs hover:shadow-xs"
            >
              <div className="flex items-center justify-between text-sky-900">
                <span className="text-[11px] font-bold uppercase tracking-wider">
                  Ratio de Cumplimiento
                </span>
                <span className="text-xs text-sky-700 font-semibold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                  Detalle &rarr;
                </span>
              </div>

              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-bold font-mono text-sky-950 tabular-nums">
                  {statsA.ratioCumplimiento}%
                </span>
                <span className="text-xs text-sky-700">conducta positiva</span>
              </div>

              {/* Sub-metric or Delta */}
              {isCompareMode ? (
                <div className="mt-2.5 pt-2 border-t border-sky-200/70 flex items-center justify-between text-xs">
                  <span className="text-sky-800">vs {compareYearB}: {statsB.ratioCumplimiento}%</span>
                  <span className={`font-bold flex items-center gap-0.5 ${deltaCumplimiento.isGood ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {deltaCumplimiento.diff > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                    <span>{deltaCumplimiento.text}</span>
                  </span>
                </div>
              ) : (
                <div className="mt-2.5 pt-2 border-t border-sky-200/70 flex items-center justify-between text-[11px] text-sky-800">
                  <span>{statsA.count0Partes} alumnos limpios</span>
                  <span className="text-slate-600 font-medium">{statsA.totalAlumnosAfectados} con parte</span>
                </div>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 3. COMPARATIVE EXECUTIVE INSIGHT BANNER (If comparison mode active) */}
      {isCompareMode && (
        <div className="bg-gradient-to-r from-sky-900 to-slate-900 text-white rounded-xl p-5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-300">
                <Sparkles className="w-4 h-4" />
                <span>Dictamen Comparativo Interanual Oficial ({selectedYear} vs {compareYearB})</span>
              </div>
              <p className="text-xs text-slate-200 mt-1 max-w-4xl leading-relaxed">
                {deltaInfracciones.diff <= 0 ? (
                  <>
                    Se consolida una <strong>reducción del {Math.abs(deltaInfracciones.pct)}% en la conflictividad escolar</strong> con respecto al curso anterior, habiéndose detraído un {Math.abs(deltaPuntos.pct)}% menos de puntos y disminuyendo la presión sobre el Aula PAC en un {Math.abs(deltaPAC.pct)}%. El modelo preventivo del Carnet de Convivencia muestra una eficacia pedagógica positiva en el centro.
                  </>
                ) : (
                  <>
                    Se observa un <strong>incremento del {deltaInfracciones.pct}% en el registro de incidencias</strong> con respecto al curso {compareYearB}. Jefatura de Estudios recomienda reforzar la guardia de pasillos y activar protocolos tempranos de mediación con las familias de 1º y 2º de ESO.
                  </>
                )}
              </p>
            </div>
            <div className="text-right shrink-0 bg-white/10 px-3 py-2 rounded-lg border border-white/10">
              <div className="text-[10px] text-sky-200 uppercase font-bold">Variación Neta</div>
              <div className="text-lg font-bold font-mono text-white">
                {deltaInfracciones.diff > 0 ? `+${deltaInfracciones.diff}` : deltaInfracciones.diff} partes
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. VISUAL CHARTS SECTION: EVOLUCIÓN MENSUAL & EMBUDO DE CONVIVENCIA */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart A: Evolución Mensual (Mes a Mes) */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Calendar className="w-4 h-4 text-sky-700" />
                <span>Evolución Temporal del Curso (Mes a Mes)</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Distribución estacional de infracciones de Septiembre a Junio.
              </p>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-sky-600 inline-block" />
                <span className="text-slate-700 font-medium">{selectedYear}</span>
              </div>
              {isCompareMode && (
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-amber-400 inline-block" />
                  <span className="text-slate-700 font-medium">{compareYearB}</span>
                </div>
              )}
            </div>
          </div>

          {/* Bar Chart Bars */}
          <div className="pt-2">
            <div className="grid grid-cols-10 gap-2 items-end h-48 border-b border-slate-200 pb-2">
              {monthlyData.map(item => {
                const heightPctA = maxMonthlyCount > 0 ? Math.round((item.countA / maxMonthlyCount) * 100) : 0;
                const heightPctB = maxMonthlyCount > 0 ? Math.round((item.countB / maxMonthlyCount) * 100) : 0;

                return (
                  <div key={item.mes} className="flex flex-col items-center justify-end h-full group relative">
                    {/* Tooltip on hover */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-12 z-20 pointer-events-none bg-slate-900 text-white text-[10px] py-1 px-2 rounded shadow-md whitespace-nowrap">
                      <div>{item.nombreCompleto}</div>
                      <div>{selectedYear}: {item.countA} partes ({item.pacA} PAC)</div>
                      {isCompareMode && <div>{compareYearB}: {item.countB} partes</div>}
                    </div>

                    <div className="w-full flex items-end justify-center gap-1 h-full">
                      {/* Bar Year A */}
                      <div
                        className="w-full max-w-[14px] bg-sky-600 hover:bg-sky-700 rounded-t-sm transition-all relative flex flex-col justify-between"
                        style={{ height: `${Math.max(4, heightPctA)}%` }}
                      >
                        {item.countA > 0 && (
                          <span className="text-[9px] font-mono text-white text-center font-bold block pt-0.5">
                            {item.countA}
                          </span>
                        )}
                      </div>

                      {/* Bar Year B (if compare mode) */}
                      {isCompareMode && (
                        <div
                          className="w-full max-w-[14px] bg-amber-400 hover:bg-amber-500 rounded-t-sm transition-all flex flex-col justify-between"
                          style={{ height: `${Math.max(4, heightPctB)}%` }}
                        >
                          {item.countB > 0 && (
                            <span className="text-[9px] font-mono text-amber-950 text-center font-bold block pt-0.5">
                              {item.countB}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <span className="text-[11px] font-semibold text-slate-600 mt-2">
                      {item.mes}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 font-mono">
              <span>Inicio del curso</span>
              <span>1ª Evaluación</span>
              <span>2ª Evaluación</span>
              <span>Fin de curso</span>
            </div>
          </div>
        </div>

        {/* Chart B: El Embudo de Convivencia (Ratio de Reincidencia) */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Users className="w-4 h-4 text-sky-700" />
              <span>El Embudo de Convivencia</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Concentración de la conflictividad y tasa de reincidencia en el centro.
            </p>
          </div>

          <div className="space-y-3 my-auto">
            {/* 0 Partes */}
            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-800 mb-1">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span>Sin infracciones (0 partes)</span>
                </span>
                <span className="font-mono text-slate-700">
                  {statsA.count0Partes} ({statsA.ratioCumplimiento}%)
                </span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${statsA.ratioCumplimiento}%` }}
                />
              </div>
            </div>

            {/* 1 Parte ocasional */}
            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-800 mb-1">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
                  <span>Incidencia aislada (1 parte)</span>
                </span>
                <span className="font-mono text-slate-700">
                  {statsA.count1Parte} ({Math.round((statsA.count1Parte / statsA.totalCensoAlumnos) * 100)}%)
                </span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-sky-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.round((statsA.count1Parte / statsA.totalCensoAlumnos) * 100)}%` }}
                />
              </div>
            </div>

            {/* 2-3 Partes (Seguimiento tutorial) */}
            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-800 mb-1">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span>Reincidencia leve (2-3 partes)</span>
                </span>
                <span className="font-mono text-slate-700">
                  {statsA.count2a3Partes} ({Math.round((statsA.count2a3Partes / statsA.totalCensoAlumnos) * 100)}%)
                </span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-amber-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.round((statsA.count2a3Partes / statsA.totalCensoAlumnos) * 100)}%` }}
                />
              </div>
            </div>

            {/* >3 Partes (Crónicos) */}
            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-800 mb-1">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-600" />
                  <span>Reincidentes crónicos (&gt;3 partes)</span>
                </span>
                <span className="font-mono text-rose-700 font-bold">
                  {statsA.countMasDe3Partes} ({Math.round((statsA.countMasDe3Partes / statsA.totalCensoAlumnos) * 100)}%)
                </span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-rose-600 rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(4, Math.round((statsA.countMasDe3Partes / statsA.totalCensoAlumnos) * 100))}%` }}
                />
              </div>
            </div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 leading-snug">
            <strong>Dato clave para inspección:</strong> Más del {statsA.ratioCumplimiento}% del alumnado no ha recibido ninguna amonestación en todo el curso escolar.
          </div>
        </div>
      </div>

      {/* 5. RANKING DE PARTES POR CURSO Y GRUPO (NUEVA ESTADÍSTICA OFICIAL) */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-sky-800 uppercase tracking-widest">
                ANÁLISIS DE CONFLICTIVIDAD POR NIVELES
              </span>
              <span className="text-slate-300">·</span>
              <span className="text-xs text-slate-500 font-mono">Curso {selectedYear}</span>
            </div>
            <h2 className="text-base font-bold text-slate-900 mt-0.5 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-500" />
              <span>Ranking Oficial de Partes e Incidencias por Curso</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Clasificación ordenada de mayor a menor número de partes por curso escolar, con desglose por grupos y presión sobre Aula PAC.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-amber-50/70 border border-amber-200 text-amber-900 px-3 py-1.5 rounded-xl text-xs font-semibold">
            <Flame className="w-4 h-4 text-amber-600" />
            <span>
              Curso con mayor incidencia: <strong>{rankingCursosBreakdown.length > 0 ? rankingCursosBreakdown[0].nombreCurso : 'Sin datos'}</strong>
            </span>
          </div>
        </div>

        {rankingCursosBreakdown.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-xs">
            No constan partes registrados en el curso escolar seleccionado ({selectedYear}).
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
            {rankingCursosBreakdown.map((item, index) => {
              const pos = index + 1;
              const isPodium1 = pos === 1;
              const isPodium2 = pos === 2;
              const isPodium3 = pos === 3;

              return (
                <div
                  key={item.cursoKey}
                  className={`rounded-xl p-4 border transition-all relative overflow-hidden flex flex-col justify-between ${
                    isPodium1
                      ? 'bg-gradient-to-b from-rose-50/60 via-white to-rose-50/20 border-rose-200 ring-1 ring-rose-300 shadow-xs'
                      : isPodium2
                      ? 'bg-gradient-to-b from-amber-50/50 via-white to-amber-50/10 border-amber-200'
                      : isPodium3
                      ? 'bg-gradient-to-b from-sky-50/40 via-white to-sky-50/10 border-sky-200'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  {/* Badge Posición en Ranking */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-6 h-6 rounded-lg font-mono text-xs font-bold flex items-center justify-center ${
                          isPodium1
                            ? 'bg-rose-600 text-white shadow-xs'
                            : isPodium2
                            ? 'bg-amber-500 text-white shadow-xs'
                            : isPodium3
                            ? 'bg-sky-600 text-white'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        #{pos}
                      </span>
                      <div>
                        <div className="font-bold text-slate-900 text-sm leading-snug">
                          {item.nombreCurso}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {item.alumnosAfectadosCount} alumnos apercibidos
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xl font-bold font-mono text-slate-900 tabular-nums">
                        {item.totalPartes}
                      </div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase">
                        {item.pctSobreTotal}% del total
                      </div>
                    </div>
                  </div>

                  {/* Barra visual de peso */}
                  <div className="my-3 space-y-1">
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          isPodium1
                            ? 'bg-rose-600'
                            : isPodium2
                            ? 'bg-amber-500'
                            : isPodium3
                            ? 'bg-sky-600'
                            : 'bg-slate-400'
                        }`}
                        style={{ width: `${Math.max(6, item.pctSobreTotal)}%` }}
                      />
                    </div>
                  </div>

                  {/* Sub-KPIs de curso */}
                  <div className="grid grid-cols-3 gap-1 py-2 border-t border-slate-100 text-center">
                    <div className="p-1 rounded bg-slate-50">
                      <div className="text-[9px] font-bold text-slate-500 uppercase">Puntos</div>
                      <div className="text-xs font-bold font-mono text-rose-700">-{item.totalPuntosRestados}</div>
                    </div>
                    <div className="p-1 rounded bg-slate-50">
                      <div className="text-[9px] font-bold text-slate-500 uppercase">Graves</div>
                      <div className="text-xs font-bold font-mono text-amber-800">{item.partesGravesMuyGraves}</div>
                    </div>
                    <div className="p-1 rounded bg-slate-50">
                      <div className="text-[9px] font-bold text-slate-500 uppercase">PAC</div>
                      <div className="text-xs font-bold font-mono text-sky-800">{item.derivacionesPAC}</div>
                    </div>
                  </div>

                  {/* Desglose de Grupos específicos */}
                  {item.gruposDesglose.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-100 space-y-1">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                        <span>Desglose por Grupos</span>
                        <span>Partes</span>
                      </div>
                      <div className="space-y-1 max-h-24 overflow-y-auto pr-0.5">
                        {item.gruposDesglose.map((g) => (
                          <div
                            key={g.grupo}
                            className="flex items-center justify-between text-xs py-0.5 px-1.5 rounded bg-slate-50/80 hover:bg-slate-100 transition-colors font-medium text-slate-700"
                          >
                            <span className="font-mono font-bold text-slate-800">{g.grupo}</span>
                            <span className="font-mono text-slate-600 text-[11px] tabular-nums">
                              <strong>{g.partes}</strong> <span className="text-[10px] text-slate-400">({g.alumnosCount} al.)</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 6. VISUAL CHARTS SECTION: NIVELES EDUCATIVOS Y MATERIAS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Distribución por Niveles Educativos */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <School className="w-4 h-4 text-sky-700" />
              <span>Distribución por Niveles Educativos</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Comparativa de volumen de partes según etapa escolar.
            </p>
          </div>

          <div className="space-y-3">
            {nivelBreakdown.map(item => (
              <div key={item.nivel} className="space-y-1">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-800">{item.nivel}</span>
                  <span className="font-mono text-slate-600">
                    {item.countA} partes ({item.pctA}%)
                    {isCompareMode && (
                      <span className="text-amber-800 ml-2">vs {item.countB} en {compareYearB}</span>
                    )}
                  </span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
                  <div 
                    className="h-full bg-sky-600 rounded-full"
                    style={{ width: `${Math.min(100, item.pctA * 2)}%` }}
                  />
                  {isCompareMode && (
                    <div 
                      className="h-full bg-amber-400 opacity-60 ml-0.5 rounded-full"
                      style={{ width: `${Math.min(100, item.pctB * 2)}%` }}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Distribución por Materias y Contextos */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-sky-700" />
              <span>Materias y Contextos con Mayor Incidencia</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Identificación de asignaturas y momentos de guardia con más partes.
            </p>
          </div>

          <div className="space-y-2.5">
            {materiasBreakdown.map(([materia, count]) => {
              const pct = statsA.totalPartes > 0 ? Math.round((count / statsA.totalPartes) * 100) : 0;
              return (
                <div key={materia} className="space-y-1">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-slate-800 font-semibold">{materia}</span>
                    <span className="font-mono text-slate-600 tabular-nums">
                      {count} partes ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-sky-700"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 6. HEATMAP: DÍA DE LA SEMANA VS HORA LECTIVA */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-sky-700" />
              <span>Mapa Térmico Temporal (Días de la Semana vs Tramos Lectivos)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Identificación de horas críticas (cambios de clase, antes del recreo, últimas horas lectivas).
            </p>
          </div>

          {/* Metric Selector & Scale Legend */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg text-xs font-semibold">
              <button
                onClick={() => setSelectedMetric('count')}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  selectedMetric === 'count'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Nº Partes
              </button>
              <button
                onClick={() => setSelectedMetric('points')}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  selectedMetric === 'points'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Puntos
              </button>
            </div>

            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono">
              <span>Baja</span>
              <span className="w-3 h-3 rounded-xs bg-sky-100 border border-sky-200" />
              <span className="w-3 h-3 rounded-xs bg-amber-200" />
              <span className="w-3 h-3 rounded-xs bg-amber-400" />
              <span className="w-3 h-3 rounded-xs bg-rose-500" />
              <span>Crítica</span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="py-2.5 px-3 font-semibold text-slate-600 w-48">
                  Tramo Horario
                </th>
                {DIAS_SEMANA.map((dia) => (
                  <th key={dia} className="py-2.5 px-3 font-semibold text-slate-700 text-center">
                    {dia}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {TRAMOS_HEATMAP.map((tramo) => {
                const isRecreo = tramo.includes('Recreo');
                return (
                  <tr key={tramo} className={isRecreo ? 'bg-slate-50/70 font-semibold' : ''}>
                    <td className="py-2.5 px-3 font-mono text-slate-700 text-[11px]">
                      {tramo}
                    </td>
                    {DIAS_SEMANA.map((dia) => {
                      const val = heatmapData.grid[tramo][dia] || 0;
                      let cellClass = 'bg-white text-slate-300';
                      if (val > 0) {
                        const ratio = val / Math.max(1, heatmapData.maxVal);
                        if (ratio >= 0.7) cellClass = 'bg-rose-500 text-white font-bold shadow-xs';
                        else if (ratio >= 0.4) cellClass = 'bg-amber-300 text-slate-900 font-bold';
                        else if (ratio >= 0.2) cellClass = 'bg-amber-100 text-amber-900 font-semibold';
                        else cellClass = 'bg-sky-100 text-sky-900 font-semibold';
                      }

                      return (
                        <td key={dia} className="p-1 text-center">
                          <div
                            className={`py-2 px-2 rounded-lg font-mono text-xs tabular-nums transition-all ${cellClass}`}
                            title={`${val} ${selectedMetric === 'count' ? 'partes' : 'puntos'} registrados en ${dia} durante ${tramo}`}
                          >
                            {val}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 7. ZONAS DEL CENTRO Y TIPOLOGÍA ROF */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Zonas del Centro */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <MapPin className="w-4 h-4 text-sky-700" />
              <span>Distribución por Zonas del Centro</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Puntos calientes para la asignación estratégica de guardias docentes.
            </p>
          </div>

          <div className="space-y-2.5">
            {locationBreakdown.map(([loc, count]) => {
              const pct = statsA.totalPartes > 0 ? Math.round((count / statsA.totalPartes) * 100) : 0;
              return (
                <div key={loc} className="space-y-1">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-slate-800">{loc}</span>
                    <span className="font-mono text-slate-600 tabular-nums">
                      {count} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        loc.includes('Pasillo') || loc.includes('Patio')
                          ? 'bg-amber-500'
                          : 'bg-sky-600'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tipología ROF más Frecuente */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-sky-700" />
              <span>Infracciones ROF más Frecuentes</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Tipologías de conducta contraria y puntos detraídos según catálogo oficial.
            </p>
          </div>

          <div className="space-y-2">
            {rofBreakdown.slice(0, 6).map(([codigo, data]) => {
              const rofDef = MATRIZ_ROF_CATALOG[codigo as CodigoInfraccionROF];
              return (
                <div
                  key={codigo}
                  className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-xs"
                >
                  <div className="truncate mr-3">
                    <div className="font-bold text-slate-800 flex items-center gap-1.5">
                      <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200 text-[10px]">
                        {codigo}
                      </span>
                      <span className="truncate">{rofDef ? rofDef.titulo : codigo}</span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="font-mono font-bold text-slate-900 tabular-nums">
                      {data.count} casos
                    </span>
                    <div className="font-mono text-[10px] text-rose-600 font-semibold">
                      -{data.puntos} pts
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* DETAIL MODAL 1: TOTAL INFRACCIONES */}
      {/* ========================================================================= */}
      {activeModal === 'INFRACCIONES' && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50 rounded-t-2xl">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-sky-800 uppercase tracking-widest">
                    Auditoría Detallada
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className="text-xs text-slate-600 font-mono">Curso {selectedYear}</span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 mt-0.5 flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-sky-700" />
                  <span>Desglose Completo de Infracciones Registradas ({datasetYearA.length})</span>
                </h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Severity Cards Summary inside modal */}
            <div className="p-5 border-b border-slate-100 bg-white grid grid-cols-3 gap-3">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                <div className="text-[11px] font-bold text-emerald-800 uppercase">Leves (1-3 pts)</div>
                <div className="text-xl font-bold font-mono text-emerald-950 mt-1">
                  {statsA.leves} <span className="text-xs font-normal text-emerald-700">({statsA.totalPartes > 0 ? Math.round((statsA.leves / statsA.totalPartes) * 100) : 0}%)</span>
                </div>
                <div className="text-[10px] text-emerald-700 mt-0.5">Escala de puntos del centro</div>
              </div>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="text-[11px] font-bold text-amber-800 uppercase">Graves (4-6 pts)</div>
                <div className="text-xl font-bold font-mono text-amber-950 mt-1">
                  {statsA.graves} <span className="text-xs font-normal text-amber-700">({statsA.totalPartes > 0 ? Math.round((statsA.graves / statsA.totalPartes) * 100) : 0}%)</span>
                </div>
                <div className="text-[10px] text-amber-700 mt-0.5">Escala de puntos del centro</div>
              </div>
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg">
                <div className="text-[11px] font-bold text-rose-800 uppercase">Muy Graves (7-10 pts)</div>
                <div className="text-xl font-bold font-mono text-rose-950 mt-1">
                  {statsA.muyGraves} <span className="text-xs font-normal text-rose-700">({statsA.totalPartes > 0 ? Math.round((statsA.muyGraves / statsA.totalPartes) * 100) : 0}%)</span>
                </div>
                <div className="text-[10px] text-rose-700 mt-0.5">Escala de puntos del centro</div>
              </div>
            </div>

            {/* Filter toolbar inside modal */}
            <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Buscar por alumno, docente, materia o hecho..."
                  value={modalSearchTerm}
                  onChange={(e) => setModalSearchTerm(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="flex items-center gap-1.5 text-xs">
                <span className="font-semibold text-slate-600">Gravedad:</span>
                <select
                  value={modalFilterGravedad}
                  onChange={(e) => setModalFilterGravedad(e.target.value)}
                  className="bg-white border border-slate-300 rounded-md px-2.5 py-1 text-xs font-semibold text-slate-800 focus:outline-hidden cursor-pointer"
                >
                  <option value="TODAS">Todas las gravedades</option>
                  <option value="LEVE">Solo Leves (1-3 pts)</option>
                  <option value="GRAVE">Solo Graves (4-6 pts)</option>
                  <option value="MUY_GRAVE">Solo Muy Graves (7-10 pts)</option>
                </select>
              </div>
            </div>

            {/* List of Sanciones Table */}
            <div className="p-4 overflow-y-auto flex-1">
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs text-left divide-y divide-slate-200">
                  <thead className="bg-slate-50 text-slate-600 font-semibold">
                    <tr>
                      <th className="py-2.5 px-3">Expediente</th>
                      <th className="py-2.5 px-3">Fecha y Tramo</th>
                      <th className="py-2.5 px-3">Alumno / Grupo</th>
                      <th className="py-2.5 px-3">Profesor / Materia</th>
                      <th className="py-2.5 px-3">Infracción ROF</th>
                      <th className="py-2.5 px-3 text-center">Puntos</th>
                      <th className="py-2.5 px-3 text-center">PAC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {datasetYearA
                      .filter(s => {
                        const alm = alumnoMap.get(s.id_alumno);
                        const q = modalSearchTerm.toLowerCase();
                        const matchesSearch = 
                          !modalSearchTerm ||
                          s.numero_expediente.toLowerCase().includes(q) ||
                          s.nombre_profesor.toLowerCase().includes(q) ||
                          (s.materia || '').toLowerCase().includes(q) ||
                          (s.descripcion_hechos || '').toLowerCase().includes(q) ||
                          (alm && (`${alm.nombre} ${alm.apellidos} ${alm.grupo}`).toLowerCase().includes(q));

                        let matchesGravedad = true;
                        if (modalFilterGravedad === 'LEVE') matchesGravedad = s.puntos_restados <= 3;
                        if (modalFilterGravedad === 'GRAVE') matchesGravedad = s.puntos_restados >= 4 && s.puntos_restados <= 6;
                        if (modalFilterGravedad === 'MUY_GRAVE') matchesGravedad = s.puntos_restados >= 7;

                        return matchesSearch && matchesGravedad;
                      })
                      .map(s => {
                        const alm = alumnoMap.get(s.id_alumno);
                        const rofDef = MATRIZ_ROF_CATALOG[s.codigo_infraccion];
                        return (
                          <tr key={s.id_sancion} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-2.5 px-3 font-mono font-semibold text-slate-700 whitespace-nowrap">
                              {s.numero_expediente}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                              <div className="font-semibold text-slate-800">{s.fecha}</div>
                              <div className="text-[10px] text-slate-500">{s.tramo_horario.split('(')[0]}</div>
                            </td>
                            <td className="py-2.5 px-3">
                              {alm ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveModal(null);
                                    onNavigateToCarnet?.(alm.id_alumno);
                                  }}
                                  className="text-left font-bold text-sky-800 hover:underline cursor-pointer"
                                >
                                  {alm.apellidos}, {alm.nombre} ({alm.grupo})
                                </button>
                              ) : (
                                <span className="font-mono text-slate-500">{s.id_alumno}</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-slate-700">
                              <div className="font-medium">{s.nombre_profesor}</div>
                              <div className="text-[10px] text-slate-500">{s.materia || 'Docente'}</div>
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="font-mono bg-slate-100 text-slate-700 px-1 py-0.5 rounded text-[10px] font-bold mr-1.5">
                                {s.codigo_infraccion}
                              </span>
                              <span className="text-slate-800">{rofDef ? rofDef.titulo : s.codigo_infraccion}</span>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span className="font-mono font-bold text-rose-700 text-xs">
                                -{s.puntos_restados}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {s.derivado_pac ? (
                                <span className="px-1.5 py-0.5 bg-amber-100 text-amber-900 rounded text-[10px] font-bold">
                                  PAC
                                </span>
                              ) : (
                                <span className="text-slate-400 text-[10px]">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex items-center justify-between text-xs">
              <span className="text-slate-500">
                Mostrando datos validados para el curso escolar {selectedYear}
              </span>
              <button
                onClick={() => setActiveModal(null)}
                className="px-4 py-1.5 bg-slate-800 text-white rounded-lg font-semibold hover:bg-slate-900 transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DETAIL MODAL 2: PUNTOS DEDUCIDOS */}
      {/* ========================================================================= */}
      {activeModal === 'PUNTOS' && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-rose-50 rounded-t-2xl">
              <div>
                <span className="text-xs font-bold text-rose-800 uppercase tracking-widest">
                  Balance Disciplinario
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                  Impacto Global en el Carnet de Puntos ({selectedYear})
                </h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-rose-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5 overflow-y-auto flex-1">
              {/* Point Balance Metric Row */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl">
                  <div className="text-[11px] font-bold text-rose-800 uppercase">Puntos Detraídos</div>
                  <div className="text-2xl font-bold font-mono text-rose-800 mt-1">
                    -{statsA.totalPuntosPerdidos}
                  </div>
                  <div className="text-[11px] text-rose-600 mt-0.5">
                    Promedio {statsA.promedioPuntosPorParte} pts/parte
                  </div>
                </div>

                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <div className="text-[11px] font-bold text-emerald-800 uppercase">Puntos Restituidos</div>
                  <div className="text-2xl font-bold font-mono text-emerald-800 mt-1">
                    +{statsA.puntosRestituidos}
                  </div>
                  <div className="text-[11px] text-emerald-600 mt-0.5">
                    Por mediación/reparación
                  </div>
                </div>

                <div className="p-3.5 bg-slate-100 border border-slate-300 rounded-xl">
                  <div className="text-[11px] font-bold text-slate-700 uppercase">Saldo Neto Detraído</div>
                  <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
                    -{statsA.saldoNetoPuntos}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Impacto definitivo en censo
                  </div>
                </div>
              </div>

              {/* Top ROF Infractions by Points */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Conductas con Mayor Coste Punitivo para el Alumnado
                </h4>
                <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100">
                  {rofBreakdown.slice(0, 5).map(([codigo, data]) => {
                    const rofDef = MATRIZ_ROF_CATALOG[codigo as CodigoInfraccionROF];
                    return (
                      <div key={codigo} className="p-3 flex items-center justify-between text-xs hover:bg-slate-50">
                        <div>
                          <div className="font-bold text-slate-800 flex items-center gap-2">
                            <span className="font-mono bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded text-[11px]">
                              {codigo}
                            </span>
                            <span>{rofDef ? rofDef.titulo : codigo}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {data.count} amonestaciones registradas · Baremo: -{rofDef ? rofDef.puntos_defecto : 3} pts
                          </div>
                        </div>
                        <div className="text-right font-mono font-bold text-rose-700 text-sm">
                          -{data.puntos} pts
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex justify-end">
              <button
                onClick={() => setActiveModal(null)}
                className="px-4 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-semibold hover:bg-slate-900 cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DETAIL MODAL 3: AULA PAC */}
      {/* ========================================================================= */}
      {activeModal === 'PAC' && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-amber-50 rounded-t-2xl">
              <div>
                <span className="text-xs font-bold text-amber-800 uppercase tracking-widest">
                  Monitor Aula de Convivencia (PAC)
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                  Estadística Oficial del Aula de Custodia y Atención ({selectedYear})
                </h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-amber-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="text-[11px] font-bold text-amber-800 uppercase">Derivaciones Totales</div>
                  <div className="text-2xl font-bold font-mono text-amber-900 mt-1">
                    {statsA.pacDerivados}
                  </div>
                  <div className="text-[11px] text-amber-700 mt-0.5">
                    {statsA.pacRatioSobreTotal}% de todos los partes
                  </div>
                </div>

                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <div className="text-[11px] font-bold text-emerald-800 uppercase">Efectividad de Llegada</div>
                  <div className="text-2xl font-bold font-mono text-emerald-800 mt-1">
                    {statsA.pacTasaComparecencia}%
                  </div>
                  <div className="text-[11px] text-emerald-600 mt-0.5">
                    Alumnos recepcionados con éxito
                  </div>
                </div>

                <div className="p-3.5 bg-sky-50 border border-sky-200 rounded-xl">
                  <div className="text-[11px] font-bold text-sky-800 uppercase">Tareas Prescritas</div>
                  <div className="text-2xl font-bold font-mono text-sky-900 mt-1">
                    100%
                  </div>
                  <div className="text-[11px] text-sky-700 mt-0.5">
                    Con asignación lectiva por docente
                  </div>
                </div>
              </div>

              {/* Table of PAC Derivations */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs text-left divide-y divide-slate-200">
                  <thead className="bg-slate-50 text-slate-600 font-semibold">
                    <tr>
                      <th className="py-2 px-3">Fecha y Hora</th>
                      <th className="py-2 px-3">Alumno</th>
                      <th className="py-2 px-3">Profesor Derivante</th>
                      <th className="py-2 px-3">Tareas Prescritas</th>
                      <th className="py-2 px-3 text-center">Estado PAC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {datasetYearA
                      .filter(s => s.derivado_pac)
                      .map(s => {
                        const alm = alumnoMap.get(s.id_alumno);
                        return (
                          <tr key={s.id_sancion} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <div className="font-bold text-slate-800">{s.fecha}</div>
                              <div className="text-[10px] text-slate-500">{s.tramo_horario.split('(')[0]}</div>
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-900">
                              {alm ? `${alm.apellidos}, ${alm.nombre} (${alm.grupo})` : s.id_alumno}
                            </td>
                            <td className="py-2.5 px-3 text-slate-700">
                              {s.nombre_profesor}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 italic">
                              {s.tareas_enviadas_pac || 'Realizar tareas académicas de la materia y ficha de convivencia.'}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded text-[10px]">
                                {s.estado_pac || 'COMPLETADO'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex justify-end">
              <button
                onClick={() => setActiveModal(null)}
                className="px-4 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-semibold hover:bg-slate-900 cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DETAIL MODAL 4: RATIO DE CUMPLIMIENTO & ESTADO DEL CENSO */}
      {/* ========================================================================= */}
      {activeModal === 'CUMPLIMIENTO' && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-sky-50 rounded-t-2xl">
              <div>
                <span className="text-xs font-bold text-sky-800 uppercase tracking-widest">
                  Censo y Cumplimiento
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                  Radiografía del Carnet de Puntos y Alumnado en Riesgo ({selectedYear})
                </h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-sky-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5 overflow-y-auto flex-1">
              {/* The 4 Tiers of Point Balance in the School */}
              <div className="grid grid-cols-4 gap-3">
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <div className="text-[11px] font-bold text-emerald-800 uppercase">Tramo Seguro</div>
                  <div className="text-xl font-bold font-mono text-emerald-950 mt-1">
                    {alumnos.filter(a => a.puntos_actuales >= 7).length} alm.
                  </div>
                  <div className="text-[10px] text-emerald-700 mt-0.5">7 a 10 puntos</div>
                </div>

                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="text-[11px] font-bold text-amber-800 uppercase">Advertencia</div>
                  <div className="text-xl font-bold font-mono text-amber-950 mt-1">
                    {alumnos.filter(a => a.puntos_actuales >= 4 && a.puntos_actuales <= 6).length} alm.
                  </div>
                  <div className="text-[10px] text-amber-700 mt-0.5">4 a 6 puntos</div>
                </div>

                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl">
                  <div className="text-[11px] font-bold text-rose-800 uppercase">Tramo Crítico</div>
                  <div className="text-xl font-bold font-mono text-rose-950 mt-1">
                    {alumnos.filter(a => a.puntos_actuales >= 1 && a.puntos_actuales <= 3).length} alm.
                  </div>
                  <div className="text-[10px] text-rose-700 mt-0.5">1 a 3 puntos (Alerta)</div>
                </div>

                <div className="p-3 bg-rose-900 text-white rounded-xl">
                  <div className="text-[11px] font-bold text-rose-200 uppercase">Carnet Agotado</div>
                  <div className="text-xl font-bold font-mono text-white mt-1">
                    {alumnos.filter(a => a.puntos_actuales === 0).length} alm.
                  </div>
                  <div className="text-[10px] text-rose-300 mt-0.5">0 pts (Expulsión)</div>
                </div>
              </div>

              {/* Table of At-Risk Students */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Alumnado en Situación de Alerta o Carnet Agotado (Atención Prioritaria)
                </h4>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs text-left divide-y divide-slate-200">
                    <thead className="bg-slate-50 text-slate-600 font-semibold">
                      <tr>
                        <th className="py-2.5 px-3">Alumno/a</th>
                        <th className="py-2.5 px-3">Grupo</th>
                        <th className="py-2.5 px-3">NIE</th>
                        <th className="py-2.5 px-3">Tutor Legal</th>
                        <th className="py-2.5 px-3 text-center">Saldo Actual</th>
                        <th className="py-2.5 px-3 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {alumnos
                        .filter(a => a.puntos_actuales <= 3)
                        .map(a => (
                          <tr key={a.id_alumno} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3 font-bold text-slate-900">
                              {a.apellidos}, {a.nombre}
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-700">
                              {a.grupo}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-500">
                              {a.nie}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600">
                              {a.nombre_tutor} ({a.telefono_tutor})
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span className={`font-mono font-bold px-2 py-0.5 rounded text-xs ${
                                a.puntos_actuales === 0 
                                  ? 'bg-rose-900 text-white' 
                                  : 'bg-rose-100 text-rose-800'
                              }`}>
                                {a.puntos_actuales} / 10 pts
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveModal(null);
                                  onNavigateToCarnet?.(a.id_alumno);
                                }}
                                className="px-2 py-1 bg-sky-50 text-sky-800 hover:bg-sky-100 font-bold rounded text-[11px] cursor-pointer"
                              >
                                Ver Carnet &rarr;
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex justify-end">
              <button
                onClick={() => setActiveModal(null)}
                className="px-4 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-semibold hover:bg-slate-900 cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
