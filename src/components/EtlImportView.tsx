import React, { useState, useMemo, useEffect } from 'react';
import { 
  Upload, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle, 
  Download, 
  Database, 
  Cloud, 
  HardDrive, 
  ShieldCheck,
  RefreshCw,
  Clock,
  Lock,
  Users,
  GraduationCap,
  FileCheck2,
  Table,
  UserMinus,
  UserCheck,
  UserX,
  Search,
  Plus,
  Pencil,
  Trash2,
  Calendar,
  History,
  Archive,
  School,
  X,
  KeyRound,
  Mail,
  Sparkles,
  Wand2,
  CopyCheck
} from 'lucide-react';
import { Alumno, Profesor, AuditLog, LISTA_GRUPOS_OFICIALES } from '../types/convivencia';
import { StorageService, normalizarNombreComparacion } from '../services/storageService';
import { AuthService } from '../services/authService';
import { GoogleDriveSyncService } from '../services/googleDriveSyncService';
import { 
  parsearArchivoODSoExcel, 
  parsearProfesoresODSoExcel,
  separarApellidosYNombre, 
  normalizarGrupoEducativo, 
  AlumnoImportRow,
  ProfesorImportRow 
} from '../services/odsImportService';
import { CUENTA_DRIVE, CARPETA_DRIVE_ID, ARCHIVO_DB_DRIVE, PREFIJO_BACKUP, NOMBRE_UNIDAD_DRIVE } from '../config/entorno';

interface EtlImportViewProps {
  currentUser: Profesor;
  onImportCompleted: () => void;
  auditLogs: AuditLog[];
  profesores?: Profesor[];
  alumnos?: Alumno[];
}

export const EtlImportView: React.FC<EtlImportViewProps> = ({
  currentUser,
  onImportCompleted,
  auditLogs,
  profesores = [],
  alumnos = [],
}) => {
  const [activeImportTab, setActiveImportTab] = useState<'alumnos' | 'profesores' | 'gestion_profesores' | 'gestion_alumnos' | 'cursos'>('alumnos');
  const [csvContent, setCsvContent] = useState<string>('');
  const [odsLoadedRows, setOdsLoadedRows] = useState<AlumnoImportRow[] | null>(null);
  const [odsLoadedProfesores, setOdsLoadedProfesores] = useState<ProfesorImportRow[] | null>(null);
  const [loadedFileName, setLoadedFileName] = useState<string>('');
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [importStatus, setImportStatus] = useState<{
    success?: boolean;
    totalProcessed?: number;
    nuevos?: number;
    actualizados?: number;
    errores?: string[];
  } | null>(null);

  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [modalVaciarOpen, setModalVaciarOpen] = useState(false);

  // Academic year management state
  const [modalNuevoCursoOpen, setModalNuevoCursoOpen] = useState(false);
  const [nuevoCursoInput, setNuevoCursoInput] = useState(() => {
    const actual = StorageService.getCursoActual();
    const match = actual.match(/^(\d{4})\/(\d{4})$/);
    if (match) {
      const y1 = parseInt(match[1], 10) + 1;
      const y2 = parseInt(match[2], 10) + 1;
      return `${y1}/${y2}`;
    }
    return '2027/2028';
  });
  const [limpiarAlumnosNuevoCurso, setLimpiarAlumnosNuevoCurso] = useState(true);

  // Feedback message banner for management actions
  const [actionFeedbackMsg, setActionFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Teacher management state (dar de baja, reactivar, alta manual)
  const [searchTermProfesor, setSearchTermProfesor] = useState<string>('');
  const [filtroEstadoProfesor, setFiltroEstadoProfesor] = useState<'TODOS' | 'ACTIVO' | 'INACTIVO'>('TODOS');
  const [profesorABajar, setProfesorABajar] = useState<Profesor | null>(null);
  const [motivoBajaInput, setMotivoBajaInput] = useState<string>('');
  const [modalAltaOpen, setModalAltaOpen] = useState<boolean>(false);
  const [nuevoProfNombre, setNuevoProfNombre] = useState<string>('');
  const [nuevoProfApellidos, setNuevoProfApellidos] = useState<string>('');
  const [nuevoProfEmail, setNuevoProfEmail] = useState<string>('');
  const [nuevoProfDpto, setNuevoProfDpto] = useState<string>('');
  const [nuevoProfRol, setNuevoProfRol] = useState<Profesor['rol']>('ROLE_DOCENTE');
  const [nuevoProfTutor, setNuevoProfTutor] = useState<string>('');
  const [altaError, setAltaError] = useState<string | null>(null);

  // Teacher edit state
  const [profesorAEditar, setProfesorAEditar] = useState<Profesor | null>(null);
  const [editProfNombre, setEditProfNombre] = useState<string>('');
  const [editProfApellidos, setEditProfApellidos] = useState<string>('');
  const [editProfEmail, setEditProfEmail] = useState<string>('');
  const [editProfDpto, setEditProfDpto] = useState<string>('');
  const [editProfRol, setEditProfRol] = useState<Profesor['rol']>('ROLE_DOCENTE');
  const [editProfTutor, setEditProfTutor] = useState<string>('');
  const [editProfError, setEditProfError] = useState<string | null>(null);

  // Teacher password management state (restablecimiento y asignación manual por Jefatura)
  const [profesorParaGestionarClave, setProfesorParaGestionarClave] = useState<Profesor | null>(null);
  // Qué docentes han activado su cuenta (según el servidor)
  const [clavesActivadas, setClavesActivadas] = useState<Record<string, boolean> | null>(null);
  useEffect(() => {
    AuthService.estadoClaves().then(setClavesActivadas).catch(() => {});
  }, [profesores.length]);
  const [claveModalFeedback, setClaveModalFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Student management state in ETL (dar de baja, reactivar, alta manual, modificar)
  const [searchTermAlumno, setSearchTermAlumno] = useState<string>('');
  const [filtroGrupoAlumno, setFiltroGrupoAlumno] = useState<string>('TODOS');
  const [filtroEstadoAlumno, setFiltroEstadoAlumno] = useState<'TODOS' | 'ACTIVO' | 'BAJA'>('TODOS');
  const [alumnoABajarETL, setAlumnoABajarETL] = useState<Alumno | null>(null);
  const [motivoBajaAlumnoETL, setMotivoBajaAlumnoETL] = useState<string>('Traslado a otro centro educativo');
  const [modalAltaAlumnoOpen, setModalAltaAlumnoOpen] = useState<boolean>(false);
  const [nuevoAlmNombre, setNuevoAlmNombre] = useState<string>('');
  const [nuevoAlmApellidos, setNuevoAlmApellidos] = useState<string>('');
  const [nuevoAlmGrupo, setNuevoAlmGrupo] = useState<string>('1ESO_A');
  const [nuevoAlmNie, setNuevoAlmNie] = useState<string>('');
  const [nuevoAlmTutorLegal, setNuevoAlmTutorLegal] = useState<string>('');
  const [nuevoAlmTel, setNuevoAlmTel] = useState<string>('');
  const [altaAlumnoError, setAltaAlumnoError] = useState<string | null>(null);

  // Student edit state
  const [alumnoAEditarETL, setAlumnoAEditarETL] = useState<Alumno | null>(null);
  const [editAlmNombreETL, setEditAlmNombreETL] = useState<string>('');
  const [editAlmApellidosETL, setEditAlmApellidosETL] = useState<string>('');
  const [editAlmGrupoETL, setEditAlmGrupoETL] = useState<string>('1ESO_A');
  const [editAlmNieETL, setEditAlmNieETL] = useState<string>('');
  const [editAlmTutorLegalETL, setEditAlmTutorLegalETL] = useState<string>('');
  const [editAlmTelETL, setEditAlmTelETL] = useState<string>('');
  const [editAlmErrorETL, setEditAlmErrorETL] = useState<string | null>(null);

  // Sample CSV data for Students (2 Columns)
  const sampleAlumnosCsv = `Apellidos y Nombre,Curso
Romero Prieto Adriana,1º ESO A
Gómez Soler Mateo,1º FRIO
Márquez Cruz Valeria,2º INF
León Roldán Gonzalo,1º BACH A
Sánchez Benítez Lucía,1º CALOR
El Amrani Youssef,4º ESO D`;

  // Sample CSV data for Teachers (Estructura: Apellidos (coma) Nombre, Correo corporativo, Rol)
  const sampleProfesoresCsv = `"Apellidos, Nombre",Correo Corporativo,Rol
"García Moreno, Laura",tu_usuario@g.educaand.es,Docente
"Navarro Jiménez, Antonio",antonio.navarro@g.educaand.es,Docente
"Sánchez Romero, María",maria.sanchez@g.educaand.es,Convivencia`;

  const processFile = async (file: File) => {
    setLoadedFileName(file.name);
    setImportStatus(null);
    const fileNameLower = file.name.toLowerCase();

    if (fileNameLower.endsWith('.ods') || fileNameLower.endsWith('.xlsx') || fileNameLower.endsWith('.xls')) {
      try {
        const buffer = await file.arrayBuffer();

        if (activeImportTab === 'profesores') {
          const { filas, errores } = parsearProfesoresODSoExcel(buffer);
          if (filas.length === 0) {
            throw new Error('No se detectaron profesores válidos en la hoja. Asegúrate de que contiene: "Apellidos (coma) Nombre", "Correo Corporativo" y "Rol".');
          }
          setOdsLoadedProfesores(filas);
          setOdsLoadedRows(null);
          const preview = filas.slice(0, 10).map(f => `${f.apellidos}, ${f.nombre} ➔ ${f.email} [${f.rol}]`).join('\n') +
            (filas.length > 10 ? `\n... y ${filas.length - 10} docentes más.` : '');
          setCsvContent(preview);

          if (errores.length > 0) {
            setImportStatus({
              success: true,
              totalProcessed: filas.length,
              errores: errores.slice(0, 5)
            });
          }
        } else {
          const { filas, errores } = parsearArchivoODSoExcel(buffer);
          if (filas.length === 0) {
            throw new Error('No se detectaron alumnos válidos en la hoja. Asegúrate de que contiene las 2 columnas: "Apellidos y Nombre" y "Curso".');
          }
          setOdsLoadedRows(filas);
          setOdsLoadedProfesores(null);
          // Generar previsualización de texto
          const preview = filas.slice(0, 10).map(f => `${f.apellidos}, ${f.nombre} ➔ ${f.grupo}`).join('\n') + 
            (filas.length > 10 ? `\n... y ${filas.length - 10} alumnos más.` : '');
          setCsvContent(preview);

          if (errores.length > 0) {
            setImportStatus({
              success: true,
              totalProcessed: filas.length,
              errores: errores.slice(0, 5)
            });
          }
        }
      } catch (err: any) {
        setOdsLoadedRows(null);
        setOdsLoadedProfesores(null);
        setImportStatus({
          success: false,
          errores: [err.message || 'Error al procesar el archivo ODS/Excel.']
        });
      }
    } else {
      // Texto o CSV plano
      setOdsLoadedRows(null);
      setOdsLoadedProfesores(null);
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setCsvContent(text);
      };
      reader.readAsText(file);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleRunImport = () => {
    try {
      if (activeImportTab === 'alumnos') {
        if (odsLoadedRows && odsLoadedRows.length > 0) {
          // Importar directo desde filas ODS/Excel (2 columnas: Apellidos Nombre y Curso)
          const result = StorageService.importarAlumnosDesdeFilas(odsLoadedRows, currentUser.email);
          setImportStatus({
            success: true,
            totalProcessed: result.totalProcessed,
            nuevos: result.nuevos,
            actualizados: result.actualizados,
            errores: result.errores,
          });
        } else if (csvContent.trim()) {
          // Verificar si el texto pegado es en formato 2 columnas o estándar
          const lines = csvContent.split(/\r?\n/).filter(l => l.trim().length > 0);
          const firstLine = (lines[0] || '').toLowerCase();
          const separator = firstLine.includes(';') ? ';' : (firstLine.includes('\t') ? '\t' : ',');
          const colsFirst = firstLine.split(separator).length;

          if (colsFirst <= 2 && lines.length > 1) {
            // Procesar líneas en formato 2 columnas: "Apellidos Nombre, Curso"
            const filas: AlumnoImportRow[] = [];
            
            let start = 0;
            if (firstLine.includes('apellido') || firstLine.includes('nombre') || firstLine.includes('alumno')) {
              start = 1;
            }

            for (let i = start; i < lines.length; i++) {
              const parts = lines[i].split(separator).map(s => s.trim().replace(/^["']|["']$/g, ''));
              if (parts.length >= 2) {
                const parsed = separarApellidosYNombre(parts[0]);
                filas.push({
                  nombre: parsed.nombre || 'Sin nombre',
                  apellidos: parsed.apellidos,
                  grupo: normalizarGrupoEducativo(parts[1])
                });
              }
            }

            const result = StorageService.importarAlumnosDesdeFilas(filas, currentUser.email);
            setImportStatus({
              success: true,
              totalProcessed: result.totalProcessed,
              nuevos: result.nuevos,
              actualizados: result.actualizados,
              errores: result.errores,
            });
          } else {
            const result = StorageService.importarAlumnadoCsv(csvContent, currentUser.email);
            setImportStatus({
              success: true,
              totalProcessed: result.totalProcessed,
              nuevos: result.nuevos,
              actualizados: result.actualizados,
              errores: result.errores,
            });
          }
        }
      } else {
        // Pestaña Profesores
        if (odsLoadedProfesores && odsLoadedProfesores.length > 0) {
          const result = StorageService.importarProfesoresDesdeFilas(odsLoadedProfesores, currentUser.email);
          setImportStatus({
            success: true,
            totalProcessed: result.totalProcessed,
            nuevos: result.nuevos,
            actualizados: result.actualizados,
            errores: result.errores,
          });
        } else {
          const result = StorageService.importProfesoresFromCsv(csvContent, currentUser.email);
          setImportStatus({
            success: true,
            totalProcessed: result.totalProcessed,
            nuevos: result.nuevos,
            actualizados: result.actualizados,
            errores: result.errores,
          });
        }
      }
      onImportCompleted();
      // Guardar e impulsar inmediatamente a Google Drive corporativo para que no sea sobrescrito por pulls de otros clientes
      GoogleDriveSyncService.pushToGoogleDrive().catch(() => {});
    } catch (err: any) {
      setImportStatus({
        success: false,
        errores: [err.message || 'Error desconocido durante la importación.'],
      });
    }
  };

  const handleDownloadSample = () => {
    const isAlum = activeImportTab === 'alumnos';
    const content = isAlum ? sampleAlumnosCsv : sampleProfesoresCsv;
    const filename = isAlum
      ? 'plantilla_alumnado_2_columnas_ods.csv'
      : 'plantilla_profesores_apellidos_nombre_correo_rol.csv';

    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCreateSnapshot = () => {
    setIsBackingUp(true);
    setBackupMessage(null);
    setTimeout(() => {
      try {
        const id = StorageService.crearSnapshotBackup(currentUser.email);
        const payload = GoogleDriveSyncService.getFullDatabasePayload();
        const jsonStr = JSON.stringify(payload, null, 2);
        const filename = `${PREFIJO_BACKUP}_SNAPSHOT_${new Date().toISOString().split('T')[0]}.json`;

        // Descarga de archivo automática
        const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.setAttribute('download', filename);
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 2000);

        setIsBackingUp(false);
        setBackupMessage(`✅ Instantánea descargada con éxito como "${filename}" (${id}). Contiene ${payload.alumnos.length} alumnos, ${payload.sanciones.length} partes disciplinarios y claustro.`);
        onImportCompleted();
      } catch (err: any) {
        setIsBackingUp(false);
        setBackupMessage(`⚠️ Error al generar copia: ${err.message || err}`);
      }
    }, 400);
  };

  const handleConfirmarVaciar = () => {
    StorageService.vaciarAlumnosYSanciones(currentUser.email);
    setModalVaciarOpen(false);
    setActionFeedbackMsg({
      type: 'success',
      text: 'Se han eliminado correctamente todos los alumnos y partes generados. El censo ha quedado listo para la ingesta oficial.'
    });
    onImportCompleted();
    setTimeout(() => setActionFeedbackMsg(null), 6000);
  };

  const handleCrearNuevoCurso = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoCursoInput.trim()) return;

    const res = StorageService.crearNuevoCursoEscolar(nuevoCursoInput.trim(), {
      limpiarAlumnosParaNuevoODS: limpiarAlumnosNuevoCurso,
      usuarioOperador: currentUser.email,
    });

    if (res.success) {
      setModalNuevoCursoOpen(false);
      setActionFeedbackMsg({
        type: 'success',
        text: `¡Apertura oficial del curso ${res.nuevoCurso} completada con éxito! El curso escolar previo (${res.cursoAnteriorArchivado}) ha sido sellado y archivado de forma inmutable para consultas y comparativas interanuales.`
      });
      onImportCompleted();
      setTimeout(() => setActionFeedbackMsg(null), 9000);
    } else {
      alert(res.error || 'Error al tramitar la apertura del nuevo curso escolar.');
    }
  };

  const handleLoadSampleInEditor = () => {
    setOdsLoadedRows(null);
    setOdsLoadedProfesores(null);
    setLoadedFileName('');
    setCsvContent(activeImportTab === 'alumnos' ? sampleAlumnosCsv : sampleProfesoresCsv);
  };

  const handleConfirmarBajaProfesor = () => {
    if (!profesorABajar) return;
    const res = StorageService.darDeBajaProfesor(
      profesorABajar.id_profesor,
      motivoBajaInput.trim(),
      currentUser.email
    );
    if (res.success) {
      setProfesorABajar(null);
      setMotivoBajaInput('');
      onImportCompleted();
      GoogleDriveSyncService.pushToGoogleDrive().catch(console.warn);
    } else {
      alert(res.error || 'Error al tramitar la baja del docente.');
    }
  };

  const handleReactivarProfesor = (prof: Profesor) => {
    if (window.confirm(`¿Deseas reactivar al docente ${prof.nombre} ${prof.apellidos} (${prof.email}) para el curso escolar actual?`)) {
      const res = StorageService.reactivarProfesor(prof.id_profesor, currentUser.email);
      if (res.success) {
        onImportCompleted();
        GoogleDriveSyncService.pushToGoogleDrive().catch(console.warn);
      } else {
        alert(res.error || 'Error al reactivar docente.');
      }
    }
  };

  const handleEliminarProfesorPermanente = (prof: Profesor) => {
    if (window.confirm(`¿Estás seguro de que deseas ELIMINAR DE FORMA PERMANENTE al docente ${prof.nombre} ${prof.apellidos} (${prof.email}) del claustro? Esta acción es irreversible.`)) {
      const res = StorageService.eliminarProfesorPermanente(prof.id_profesor, currentUser.email);
      if (res.success) {
        setActionFeedbackMsg({
          type: 'success',
          text: `Docente ${prof.nombre} ${prof.apellidos} eliminado de forma permanente del sistema.`
        });
        onImportCompleted();
        GoogleDriveSyncService.pushToGoogleDrive().catch(console.warn);
        setTimeout(() => setActionFeedbackMsg(null), 5000);
      } else {
        alert(res.error || 'Error al eliminar al docente.');
      }
    }
  };

  const handleEliminarTodosInactivos = () => {
    const inactivos = (profesores || []).filter(p => p.estado === 'INACTIVO');
    if (inactivos.length === 0) return;

    if (window.confirm(`¿Deseas ELIMINAR DE FORMA PERMANENTE a los ${inactivos.length} docentes dados de baja? Esta acción es definitiva.`)) {
      const { totalEliminados } = StorageService.eliminarProfesoresInactivosPermanente(currentUser.email);
      setActionFeedbackMsg({
        type: 'success',
        text: `Se han eliminado permanentemente ${totalEliminados} docentes dados de baja.`
      });
      onImportCompleted();
      setTimeout(() => setActionFeedbackMsg(null), 5000);
    }
  };

  const handleCrearNuevoProfesor = async (e: React.FormEvent) => {
    e.preventDefault();
    setAltaError(null);

    if (!nuevoProfNombre.trim() || !nuevoProfApellidos.trim() || !nuevoProfEmail.trim()) {
      setAltaError('Nombre, apellidos y correo electrónico institucional son obligatorios.');
      return;
    }

    if (!nuevoProfEmail.toLowerCase().endsWith('@g.educaand.es')) {
      setAltaError('El correo debe pertenecer al dominio corporativo @g.educaand.es');
      return;
    }

    const res = StorageService.crearProfesor({
      nombre: nuevoProfNombre.trim(),
      apellidos: nuevoProfApellidos.trim(),
      email: nuevoProfEmail.trim().toLowerCase(),
      dni: `DNI-${Math.floor(10000000 + Math.random() * 90000000)}X`,
      departamento: nuevoProfDpto.trim() || 'Claustro Docente',
      rol: nuevoProfRol,
      tutor_de_grupo: nuevoProfTutor || undefined,
      tutoria_asignada_por: nuevoProfTutor ? 'JEFATURA' : undefined,
    }, currentUser.email);

    if (res.success) {
      setModalAltaOpen(false);
      setNuevoProfNombre('');
      setNuevoProfApellidos('');
      setNuevoProfEmail('');
      setNuevoProfDpto('');
      setNuevoProfRol('ROLE_DOCENTE');
      setNuevoProfTutor('');
      setActionFeedbackMsg({
        type: 'success',
        text: `Docente ${res.profesor?.nombre} ${res.profesor?.apellidos} dado de alta y sincronizado en Google Drive con éxito.`
      });
      onImportCompleted();
      setTimeout(() => setActionFeedbackMsg(null), 5000);
      try {
        await GoogleDriveSyncService.pushToGoogleDrive();
      } catch (e) {
        console.warn('Error sincronizando nuevo docente en Drive:', e);
      }
    } else {
      setAltaError(res.error || 'Error al crear el docente.');
    }
  };

  // Abrir modal de edición de docente
  const handleAbrirEditarProfesor = (prof: Profesor) => {
    setProfesorAEditar(prof);
    setEditProfNombre(prof.nombre);
    setEditProfApellidos(prof.apellidos);
    setEditProfEmail(prof.email);
    setEditProfDpto(prof.departamento || '');
    setEditProfRol(prof.rol || 'ROLE_DOCENTE');
    setEditProfTutor(prof.tutor_de_grupo || '');
    setEditProfError(null);
  };

  // Guardar edición de docente
  const handleGuardarEdicionProfesor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profesorAEditar) return;
    setEditProfError(null);

    const res = StorageService.actualizarProfesor(profesorAEditar.id_profesor, {
      nombre: editProfNombre.trim(),
      apellidos: editProfApellidos.trim(),
      email: editProfEmail.trim().toLowerCase(),
      departamento: editProfDpto.trim(),
      rol: editProfRol,
      tutor_de_grupo: editProfTutor || undefined,
    }, currentUser.email);

    if (res.success) {
      setActionFeedbackMsg({
        type: 'success',
        text: `Docente ${editProfNombre.trim()} ${editProfApellidos.trim()} actualizado y sincronizado en Google Drive con éxito.`
      });
      setProfesorAEditar(null);
      onImportCompleted();
      setTimeout(() => setActionFeedbackMsg(null), 5000);
      try {
        await GoogleDriveSyncService.pushToGoogleDrive();
      } catch (e) {
        console.warn('Error sincronizando edición de docente en Drive:', e);
      }
    } else {
      setEditProfError(res.error || 'Error al actualizar docente.');
    }
  };

  // Abrir modal de gestión de contraseña de docente
  const handleAbrirGestionClave = (prof: Profesor) => {
    setProfesorParaGestionarClave(prof);
    setClaveModalFeedback(null);
  };

  // Restablecer contraseña (en el servidor): el docente fijará una nueva en su próximo acceso
  const handleRestablecerClaveProfesor = async () => {
    if (!profesorParaGestionarClave) return;
    const res = await AuthService.restablecerClave(profesorParaGestionarClave.email);
    if (res.success) {
      setClavesActivadas((prev) => (prev ? { ...prev, [profesorParaGestionarClave.email.toLowerCase().trim()]: false } : prev));
      setClaveModalFeedback({
        type: 'success',
        text: `Contraseña restablecida para ${profesorParaGestionarClave.nombre} ${profesorParaGestionarClave.apellidos}. En su próximo acceso escribirá dos veces una nueva contraseña.`
      });
    } else {
      setClaveModalFeedback({
        type: 'error',
        text: res.error || 'Error al restablecer la contraseña del docente.'
      });
    }
  };


  // Abrir modal de edición de alumno en ETL
  const handleAbrirEditarAlumnoETL = (alm: Alumno) => {
    setAlumnoAEditarETL(alm);
    setEditAlmNombreETL(alm.nombre);
    setEditAlmApellidosETL(alm.apellidos);
    setEditAlmGrupoETL(alm.grupo);
    setEditAlmNieETL(alm.nie && !alm.nie.startsWith('SN-') ? alm.nie : '');
    setEditAlmTutorLegalETL(alm.nombre_tutor || '');
    setEditAlmTelETL(alm.telefono_tutor || '');
    setEditAlmErrorETL(null);
  };

  // Guardar edición de alumno en ETL
  const handleGuardarEdicionAlumnoETL = (e: React.FormEvent) => {
    e.preventDefault();
    if (!alumnoAEditarETL) return;
    setEditAlmErrorETL(null);

    const res = StorageService.actualizarAlumno(alumnoAEditarETL.id_alumno, {
      nombre: editAlmNombreETL.trim(),
      apellidos: editAlmApellidosETL.trim(),
      grupo: editAlmGrupoETL as any,
      nie: editAlmNieETL.trim() || undefined,
      nombre_tutor: editAlmTutorLegalETL.trim() || undefined,
      telefono_tutor: editAlmTelETL.trim() || undefined,
    }, currentUser.email);

    if (res.success) {
      setActionFeedbackMsg({
        type: 'success',
        text: `Alumno/a ${editAlmNombreETL.trim()} ${editAlmApellidosETL.trim()} actualizado correctamente en el censo.`
      });
      setAlumnoAEditarETL(null);
      onImportCompleted();
      setTimeout(() => setActionFeedbackMsg(null), 5000);
    } else {
      setEditAlmErrorETL(res.error || 'Error al actualizar alumno/a.');
    }
  };

  // Student management handlers in ETL
  const handleConfirmarBajaAlumnoETL = () => {
    if (!alumnoABajarETL) return;
    const res = StorageService.darDeBajaAlumno(alumnoABajarETL.id_alumno, motivoBajaAlumnoETL, currentUser.email);
    if (res.success) {
      setActionFeedbackMsg({
        type: 'success',
        text: `Alumno/a ${alumnoABajarETL.nombre} ${alumnoABajarETL.apellidos} tramitado de baja con éxito.`
      });
      setAlumnoABajarETL(null);
      onImportCompleted();
      setTimeout(() => setActionFeedbackMsg(null), 5000);
    }
  };

  const handleReactivarAlumnoETL = (idAlumno: string) => {
    const res = StorageService.reactivarAlumno(idAlumno, currentUser.email);
    if (res.success) {
      setActionFeedbackMsg({
        type: 'success',
        text: `Alumno/a reactivado con éxito en el censo activo.`
      });
      onImportCompleted();
      setTimeout(() => setActionFeedbackMsg(null), 5000);
    }
  };

  const handleCrearNuevoAlumno = (e: React.FormEvent) => {
    e.preventDefault();
    setAltaAlumnoError(null);
    if (!nuevoAlmNombre.trim() || !nuevoAlmApellidos.trim()) {
      setAltaAlumnoError('El nombre y apellidos son obligatorios.');
      return;
    }
    const res = StorageService.crearAlumno({
      nombre: nuevoAlmNombre.trim(),
      apellidos: nuevoAlmApellidos.trim(),
      grupo: nuevoAlmGrupo as any,
      nie: nuevoAlmNie.trim() || undefined as any,
      nombre_tutor: nuevoAlmTutorLegal.trim() || 'Tutor Legal',
      telefono_tutor: nuevoAlmTel.trim() || '600000000',
    }, currentUser.email);

    if (res.success) {
      setActionFeedbackMsg({
        type: 'success',
        text: `Nuevo alumno/a ${nuevoAlmNombre.trim()} ${nuevoAlmApellidos.trim()} registrado en ${nuevoAlmGrupo}.`
      });
      setModalAltaAlumnoOpen(false);
      setNuevoAlmNombre('');
      setNuevoAlmApellidos('');
      setNuevoAlmNie('');
      setNuevoAlmTutorLegal('');
      setNuevoAlmTel('');
      onImportCompleted();
      setTimeout(() => setActionFeedbackMsg(null), 5000);
    } else {
      setAltaAlumnoError(res.error || 'Error al crear alumno.');
    }
  };

  // Detección en tiempo real de alumnos duplicados por nombre o NIE
  const duplicadosDetectados = useMemo(() => {
    const nameMap = new Map<string, Alumno[]>();
    (alumnos || []).forEach(a => {
      const k = normalizarNombreComparacion(a.nombre, a.apellidos);
      if (k) {
        const list = nameMap.get(k) || [];
        list.push(a);
        nameMap.set(k, list);
      }
    });
    const dups: Array<{ key: string; alumnos: Alumno[] }> = [];
    nameMap.forEach((list, key) => {
      if (list.length > 1) {
        dups.push({ key, alumnos: list });
      }
    });
    return dups;
  }, [alumnos]);

  const handleEjecutarDepuracionDuplicados = () => {
    const res = StorageService.depurarAlumnosDuplicados(currentUser.email);
    if (res.duplicadosEliminados > 0) {
      setActionFeedbackMsg({
        type: 'success',
        text: `¡Limpieza de duplicados exitosa! Se han unificado ${res.duplicadosEliminados} registro(s) repetidos conservando todos sus partes y puntos.`
      });
      onImportCompleted();
      GoogleDriveSyncService.pushToGoogleDrive().catch(() => {});
      setTimeout(() => setActionFeedbackMsg(null), 8000);
    } else {
      setActionFeedbackMsg({
        type: 'success',
        text: 'El censo está perfectamente limpio. No se encontraron alumnos duplicados.'
      });
      setTimeout(() => setActionFeedbackMsg(null), 5000);
    }
  };

  // Filtered students list for ETL management
  const filteredAlumnosETL = (alumnos || []).filter((a) => {
    const matchesSearch = 
      a.nombre.toLowerCase().includes(searchTermAlumno.toLowerCase()) ||
      a.apellidos.toLowerCase().includes(searchTermAlumno.toLowerCase()) ||
      (a.nie || '').toLowerCase().includes(searchTermAlumno.toLowerCase()) ||
      a.grupo.toLowerCase().includes(searchTermAlumno.toLowerCase());

    if (!matchesSearch) return false;
    if (filtroGrupoAlumno !== 'TODOS' && a.grupo !== filtroGrupoAlumno) return false;

    const isBaja = a.estado === 'BAJA';
    if (filtroEstadoAlumno === 'ACTIVO' && isBaja) return false;
    if (filtroEstadoAlumno === 'BAJA' && !isBaja) return false;

    return true;
  });

  // Filtered teachers list for management
  const filteredProfesores = (profesores || []).filter((p) => {
    const matchesSearch = 
      p.nombre.toLowerCase().includes(searchTermProfesor.toLowerCase()) ||
      p.apellidos.toLowerCase().includes(searchTermProfesor.toLowerCase()) ||
      p.email.toLowerCase().includes(searchTermProfesor.toLowerCase()) ||
      (p.departamento || '').toLowerCase().includes(searchTermProfesor.toLowerCase());

    const estadoProf = p.estado || 'ACTIVO';
    if (filtroEstadoProfesor === 'ACTIVO') return matchesSearch && estadoProf === 'ACTIVO';
    if (filtroEstadoProfesor === 'INACTIVO') return matchesSearch && estadoProf === 'INACTIVO';
    return matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner: Storage Info & Cloud Architecture */}
      <div className="bg-white border border-sky-100 rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-sky-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Infraestructura Google Drive & ETL de Ingesta
              </h1>
              <span className="text-[11px] font-mono bg-sky-100 text-sky-900 border border-sky-200 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                <Lock className="w-3 h-3 text-sky-700" />
                @g.educaand.es Encrypted
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Persistencia institucional en Google Drive corporativo (<strong className="font-mono text-slate-700">{CUENTA_DRIVE}</strong> · Almacenamiento Oficial del Centro). Cumplimiento estricto RGPD/LOPDGDD.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleCreateSnapshot}
              disabled={isBackingUp}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-950 text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-2xs"
              title="Genera y descarga un archivo .JSON con la base de datos completa a tu equipo"
            >
              <Download className={`w-3.5 h-3.5 text-emerald-700 ${isBackingUp ? 'animate-bounce' : ''}`} />
              <span>{isBackingUp ? 'Generando y descargando...' : 'Descargar Snapshot Backup (.JSON)'}</span>
            </button>

            <button
              type="button"
              onClick={() => setModalVaciarOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-800 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              title="Elimina todos los alumnos y partes generados"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              <span>Vaciar Alumnos y Partes</span>
            </button>
          </div>
        </div>

        {backupMessage && (
          <div className="mt-3 p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-950 font-medium flex items-center gap-2 shadow-2xs animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{backupMessage}</span>
          </div>
        )}

        {/* 3 Architecture Components status */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
          <div className="bg-sky-50/50 border border-sky-100 rounded-xl p-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Base de Datos JSON Drive
              </span>
              <span className="w-2 h-2 rounded-full bg-sky-500" />
            </div>
            <div className="font-mono text-xs font-bold text-slate-900 truncate" title={ARCHIVO_DB_DRIVE}>
              {ARCHIVO_DB_DRIVE}
            </div>
            <div className="text-[10px] text-slate-500 font-mono">
              Unidad Compartida: {CUENTA_DRIVE}
            </div>
          </div>

          <div className="bg-sky-50/50 border border-sky-100 rounded-xl p-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Partes PDF Repository
              </span>
              <span className="w-2 h-2 rounded-full bg-sky-500" />
            </div>
            <div className="font-mono text-xs font-bold text-slate-900 truncate">
              /2026-2027/01_Partes_PDF/
            </div>
            <div className="text-[10px] text-slate-500 font-mono">
              30 grupos: 6 Ciclos, 16 ESO, 8 Bachillerato
            </div>
          </div>

          <div className="bg-sky-50/50 border border-sky-100 rounded-xl p-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Formato Ingesta Alumnos
              </span>
              <span className="text-[10px] font-mono font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded-full">
                ODS / 2 Columnas
              </span>
            </div>
            <div className="font-mono text-xs font-bold text-slate-900">
              [Apellidos y Nombre] + [Curso]
            </div>
            <div className="text-[10px] text-slate-500 font-mono">
              Soporte nativo LibreOffice / Calc
            </div>
          </div>
        </div>
      </div>

      {/* ETL Ingest Tabs & Card */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50/70 p-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveImportTab('alumnos');
              setImportStatus(null);
              setOdsLoadedRows(null);
              setLoadedFileName('');
              setCsvContent('');
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeImportTab === 'alumnos'
                ? 'bg-white text-sky-900 shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <GraduationCap className="w-4 h-4 text-sky-600" />
            <span>Alumnado (Formato .ODS 2 Columnas)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveImportTab('profesores');
              setImportStatus(null);
              setOdsLoadedRows(null);
              setLoadedFileName('');
              setCsvContent('');
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeImportTab === 'profesores'
                ? 'bg-white text-sky-900 shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Upload className="w-4 h-4 text-sky-600" />
            <span>Importación CSV Claustro</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveImportTab('gestion_profesores');
              setImportStatus(null);
              setOdsLoadedRows(null);
              setLoadedFileName('');
              setCsvContent('');
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeImportTab === 'gestion_profesores'
                ? 'bg-white text-sky-900 shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Users className="w-4 h-4 text-sky-600" />
            <span>Gestión del Claustro ({profesores.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveImportTab('gestion_alumnos');
              setImportStatus(null);
              setOdsLoadedRows(null);
              setLoadedFileName('');
              setCsvContent('');
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeImportTab === 'gestion_alumnos'
                ? 'bg-white text-sky-900 shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Table className="w-4 h-4 text-sky-600" />
            <span>Censo y Bajas de Alumnos ({alumnos.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveImportTab('cursos');
              setImportStatus(null);
              setOdsLoadedRows(null);
              setLoadedFileName('');
              setCsvContent('');
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeImportTab === 'cursos'
                ? 'bg-white text-sky-900 shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Calendar className="w-4 h-4 text-sky-600" />
            <span>Cursos Escolares e Histórico</span>
          </button>
        </div>

        {activeImportTab === 'gestion_profesores' ? (
          /* GESTIÓN DE CLAUSTRO: BAJAS, ALTAS Y ESTADO ANUAL */
          <div className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-150 pb-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Users className="w-4 h-4 text-sky-700" />
                  <span>Gestión del Claustro: Bajas y Altas de Profesores</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Gestiona el personal docente activo en el IES Blas Infante. Puedes dar de baja a los profesores que no continúan en el centro manteniendo intacta toda la trazabilidad de sus partes pasados.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setAltaError(null);
                  setModalAltaOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>+ Alta de Docente</span>
              </button>
            </div>

            {/* Filtros y Buscador */}
            {actionFeedbackMsg && (
              <div className={`p-3 rounded-xl text-xs flex items-center gap-2 animate-in fade-in ${
                actionFeedbackMsg.type === 'success'
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-950 font-semibold'
                  : 'bg-rose-50 border border-rose-200 text-rose-950 font-semibold'
              }`}>
                {actionFeedbackMsg.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{actionFeedbackMsg.text}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Buscar por nombre, apellidos, departamento o email..."
                  value={searchTermProfesor}
                  onChange={(e) => setSearchTermProfesor(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-sky-600"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs">
                  {(['TODOS', 'ACTIVO', 'INACTIVO'] as const).map((est) => (
                    <button
                      key={est}
                      type="button"
                      onClick={() => setFiltroEstadoProfesor(est)}
                      className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                        filtroEstadoProfesor === est
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {est === 'TODOS' ? 'Todos' : est === 'ACTIVO' ? 'Activos' : 'Bajas'}
                    </button>
                  ))}
                </div>

                {profesores.some(p => p.estado === 'INACTIVO') && (
                  <button
                    type="button"
                    onClick={handleEliminarTodosInactivos}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-colors cursor-pointer"
                    title="Elimina de forma permanente y definitiva a todos los profesores dados de baja"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                    <span>Eliminar Bajas Definitivamente ({profesores.filter(p => p.estado === 'INACTIVO').length})</span>
                  </button>
                )}
              </div>
            </div>

            {/* Listado de Docentes */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold text-[11px]">
                  <tr>
                    <th className="p-3">Docente</th>
                    <th className="p-3">Departamento</th>
                    <th className="p-3">Rol / Tutoría</th>
                    <th className="p-3 text-center">Estado</th>
                    <th className="p-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {filteredProfesores.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-slate-500">
                        No se han encontrado docentes con los criterios de búsqueda.
                      </td>
                    </tr>
                  ) : (
                    filteredProfesores.map((prof) => {
                      const isActivo = prof.estado !== 'INACTIVO';
                      const isAdminPrincipal = prof.email.toLowerCase() === 'mgonruz857@g.educaand.es';

                      return (
                        <tr key={prof.id_profesor} className={`hover:bg-slate-50/70 transition-colors ${!isActivo ? 'bg-slate-50/50 opacity-80' : ''}`}>
                          <td className="p-3">
                            <div className="font-bold text-slate-900">
                              {prof.nombre} {prof.apellidos}
                            </div>
                            <div className="text-[11px] font-mono text-slate-500">
                              {prof.email}
                            </div>
                            {clavesActivadas && isActivo && (
                              clavesActivadas[prof.email.toLowerCase().trim()] ? (
                                <div className="text-[10px] text-emerald-700 font-semibold mt-0.5" title="El docente ya ha fijado su contraseña">
                                  ✓ Cuenta activada
                                </div>
                              ) : (
                                <div className="text-[10px] text-amber-700 font-semibold mt-0.5" title="Aún no ha entrado nunca: fijará su contraseña en el primer acceso">
                                  Pendiente de primer acceso
                                </div>
                              )
                            )}
                            {!isActivo && prof.motivo_baja && (
                              <div className="text-[10px] text-rose-700 font-medium mt-0.5">
                                Motivo baja: {prof.motivo_baja} ({prof.fecha_baja || ''})
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-slate-700">
                            {prof.departamento}
                          </td>
                          <td className="p-3">
                            {prof.rol === 'ROLE_CONVIVENCIA_ADMIN' ? (
                              <span className="inline-block text-[10px] font-mono px-2 py-0.5 rounded-full font-bold bg-purple-100 text-purple-900 border border-purple-200">
                                Convivencia (Admin)
                              </span>
                            ) : (
                              <span className="inline-block text-[10px] font-mono px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-800 border border-slate-200">
                                Docente
                              </span>
                            )}
                            {prof.tutor_de_grupo && (
                              <div className="text-[10px] text-slate-500 mt-0.5 font-semibold">
                                Tutor/a: {LISTA_GRUPOS_OFICIALES.find(g => g.codigo === prof.tutor_de_grupo)?.etiqueta || prof.tutor_de_grupo}
                                {prof.tutoria_asignada_por === 'DOCENTE' && (
                                  <span className="ml-1 text-amber-700" title="El propio docente se ha asignado esta tutoría en su perfil. Revísela y cámbiela si no es correcta.">
                                    (indicada por el docente)
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {isActivo ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                Activo
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-800 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                Dado de baja
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleAbrirGestionClave(prof)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-amber-900 hover:text-white hover:bg-amber-600 bg-amber-50 border border-amber-200 rounded-lg transition-colors cursor-pointer"
                                title="Gestionar, restablecer o asignar contraseña de acceso"
                              >
                                <KeyRound className="w-3.5 h-3.5" />
                                <span>Contraseña</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleAbrirEditarProfesor(prof)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:text-sky-800 hover:bg-sky-50 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                                title="Modificar datos del docente (Nombre, Apellidos, Dpto, Tutoría, etc.)"
                              >
                                <Pencil className="w-3.5 h-3.5 text-sky-700" />
                                <span>Editar</span>
                              </button>

                              {isAdminPrincipal ? (
                                <span className="text-[10px] font-semibold text-slate-400 italic px-2">
                                  Admin Principal
                                </span>
                              ) : isActivo ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setProfesorABajar(prof);
                                    setMotivoBajaInput('Fin de destino / Cambio de centro en nuevo curso escolar');
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:text-white hover:bg-rose-600 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                                  title="Dar de baja para que no aparezca en los cursos activos"
                                >
                                  <UserMinus className="w-3.5 h-3.5" />
                                  <span>Dar de baja</span>
                                </button>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleReactivarProfesor(prof)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:text-white hover:bg-emerald-600 border border-emerald-200 rounded-lg transition-colors cursor-pointer"
                                    title="Reactivar profesor en el centro"
                                  >
                                    <UserCheck className="w-3.5 h-3.5" />
                                    <span>Reactivar</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleEliminarProfesorPermanente(prof)}
                                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-rose-700 hover:text-white hover:bg-rose-600 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                                    title="Eliminar de forma permanente y definitiva a este docente"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Eliminar</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Modal de Confirmación de Baja */}
            {profesorABajar && (
              <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-100">
                  <div className="flex items-center gap-2 text-rose-700 font-bold text-sm">
                    <UserX className="w-5 h-5" />
                    <span>Confirmar Baja de Docente en el Centro</span>
                  </div>

                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-950 space-y-1">
                    <p className="font-semibold">
                      ¿Deseas dar de baja a {profesorABajar.nombre} {profesorABajar.apellidos}?
                    </p>
                    <p className="text-[11px] text-rose-800">
                      El profesor dejará de aparecer en los selectores activos y no podrá iniciar sesión en la aplicación durante el nuevo curso. Todos los partes y sanciones que impuso anteriormente se conservan intactos en el historial.
                    </p>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-700">
                      Motivo de la baja / Observación:
                    </label>
                    <input
                      type="text"
                      value={motivoBajaInput}
                      onChange={(e) => setMotivoBajaInput(e.target.value)}
                      placeholder="Ej: Traslado a otro centro, fin de sustitución, etc."
                      className="w-full text-xs p-2 rounded-xl border border-slate-300 focus:outline-sky-600"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setProfesorABajar(null)}
                      className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmarBajaProfesor}
                      className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors cursor-pointer shadow-xs"
                    >
                      Confirmar y Dar de Baja
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Modal de Alta Manual de Docente */}
            {modalAltaOpen && (
              <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
                <form
                  onSubmit={handleCrearNuevoProfesor}
                  className="bg-white rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-100"
                >
                  <div className="flex items-center justify-between border-b border-slate-150 pb-2">
                    <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                      <Plus className="w-5 h-5 text-sky-600" />
                      <span>Alta Manual de Nuevo Docente</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setModalAltaOpen(false)}
                      className="text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>

                  {altaError && (
                    <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-semibold">
                      {altaError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Nombre: *</label>
                      <input
                        type="text"
                        required
                        value={nuevoProfNombre}
                        onChange={(e) => setNuevoProfNombre(e.target.value)}
                        placeholder="Ej: Laura"
                        className="w-full p-2 border border-slate-300 rounded-xl focus:outline-sky-600"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Apellidos: *</label>
                      <input
                        type="text"
                        required
                        value={nuevoProfApellidos}
                        onChange={(e) => setNuevoProfApellidos(e.target.value)}
                        placeholder="Ej: Sánchez Romero"
                        className="w-full p-2 border border-slate-300 rounded-xl focus:outline-sky-600"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block font-semibold text-slate-700 mb-1">Correo Corporativo @g.educaand.es: *</label>
                      <input
                        type="email"
                        required
                        value={nuevoProfEmail}
                        onChange={(e) => setNuevoProfEmail(e.target.value)}
                        placeholder="ejemplo@g.educaand.es"
                        className="w-full p-2 border border-slate-300 rounded-xl focus:outline-sky-600 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Departamento:</label>
                      <input
                        type="text"
                        value={nuevoProfDpto}
                        onChange={(e) => setNuevoProfDpto(e.target.value)}
                        placeholder="Ej: Geografía e Historia"
                        className="w-full p-2 border border-slate-300 rounded-xl focus:outline-sky-600"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Rol en el Centro:</label>
                      <select
                        value={nuevoProfRol}
                        onChange={(e) => setNuevoProfRol(e.target.value as Profesor['rol'])}
                        className="w-full p-2 border border-slate-300 rounded-xl focus:outline-sky-600 bg-white"
                      >
                        <option value="ROLE_DOCENTE">Docente (Sin privilegios administrativos)</option>
                        <option value="ROLE_CONVIVENCIA_ADMIN">Convivencia (Todos los privilegios administrativos)</option>
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block font-semibold text-slate-700 mb-1">Tutoría de Grupo (Opcional):</label>
                      <select
                        value={nuevoProfTutor}
                        onChange={(e) => setNuevoProfTutor(e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded-xl focus:outline-sky-600 bg-white"
                      >
                        <option value="">Ninguna tutoría asignada</option>
                        {LISTA_GRUPOS_OFICIALES.map((g) => (
                          <option key={g.codigo} value={g.codigo}>
                            {g.etiqueta} - {g.descripcion}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setModalAltaOpen(false)}
                      className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl transition-colors cursor-pointer shadow-xs"
                    >
                      Registrar Docente
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Modal de Modificación de Datos de Docente */}
            {profesorAEditar && (
              <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
                <form
                  onSubmit={handleGuardarEdicionProfesor}
                  className="bg-white rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-100"
                >
                  <div className="flex items-center justify-between border-b border-slate-150 pb-2">
                    <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                      <Pencil className="w-4 h-4 text-sky-600" />
                      <span>Modificar Datos de Docente</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setProfesorAEditar(null)}
                      className="text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>

                  {editProfError && (
                    <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-semibold">
                      {editProfError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Nombre: *</label>
                      <input
                        type="text"
                        required
                        value={editProfNombre}
                        onChange={(e) => setEditProfNombre(e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded-xl focus:outline-sky-600 font-medium"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Apellidos: *</label>
                      <input
                        type="text"
                        required
                        value={editProfApellidos}
                        onChange={(e) => setEditProfApellidos(e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded-xl focus:outline-sky-600 font-medium"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block font-semibold text-slate-700 mb-1">Correo Corporativo @g.educaand.es: *</label>
                      <input
                        type="email"
                        required
                        value={editProfEmail}
                        onChange={(e) => setEditProfEmail(e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded-xl focus:outline-sky-600 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Departamento:</label>
                      <input
                        type="text"
                        value={editProfDpto}
                        onChange={(e) => setEditProfDpto(e.target.value)}
                        placeholder="Ej: Matemáticas"
                        className="w-full p-2 border border-slate-300 rounded-xl focus:outline-sky-600"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Rol en el Centro:</label>
                      <select
                        value={editProfRol}
                        onChange={(e) => setEditProfRol(e.target.value as Profesor['rol'])}
                        className="w-full p-2 border border-slate-300 rounded-xl focus:outline-sky-600 bg-white"
                      >
                        <option value="ROLE_DOCENTE">Docente (Sin privilegios administrativos)</option>
                        <option value="ROLE_CONVIVENCIA_ADMIN">Convivencia (Todos los privilegios administrativos)</option>
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block font-semibold text-slate-700 mb-1">Tutoría de Grupo (Curso del que es tutor):</label>
                      <select
                        value={editProfTutor}
                        onChange={(e) => setEditProfTutor(e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded-xl focus:outline-sky-600 bg-white font-medium"
                      >
                        <option value="">Ninguna tutoría asignada</option>
                        {LISTA_GRUPOS_OFICIALES.map((g) => (
                          <option key={g.codigo} value={g.codigo}>
                            {g.etiqueta} - {g.descripcion}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setProfesorAEditar(null)}
                      className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl transition-colors cursor-pointer shadow-xs"
                    >
                      Guardar Modificaciones
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Modal de Gestión y Restablecimiento de Contraseñas del Claustro */}
            {profesorParaGestionarClave && (
              <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2.5 text-amber-900 font-bold text-base">
                      <div className="p-2 bg-amber-100 text-amber-800 rounded-xl">
                        <KeyRound className="w-5 h-5" />
                      </div>
                      <div>
                        <h3>Gestión de Contraseña y Acceso</h3>
                        <p className="text-xs font-normal text-slate-500 mt-0.5">
                          Administración de credenciales del Claustro
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setProfesorParaGestionarClave(null)}
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                      title="Cerrar"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Datos del docente */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-xs">
                    <div className="font-bold text-slate-900 text-sm">
                      {profesorParaGestionarClave.nombre} {profesorParaGestionarClave.apellidos}
                    </div>
                    <div className="font-mono text-slate-600 flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      <span>{profesorParaGestionarClave.email}</span>
                    </div>
                    <div className="text-slate-500 pt-1 flex items-center justify-between">
                      <span>{profesorParaGestionarClave.departamento}</span>
                      {clavesActivadas?.[profesorParaGestionarClave.email.toLowerCase().trim()] ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-200 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                          Contraseña vinculada activa
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-full">
                          <AlertCircle className="w-3 h-3 text-amber-700" />
                          Sin contraseña (primer acceso pendiente)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Mensaje de feedback en el modal */}
                  {claveModalFeedback && (
                    <div className={`p-3 rounded-xl text-xs flex items-start gap-2 animate-in fade-in duration-100 ${
                      claveModalFeedback.type === 'success'
                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                        : 'bg-rose-50 border border-rose-200 text-rose-900'
                    }`}>
                      {claveModalFeedback.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      )}
                      <span className="leading-relaxed">{claveModalFeedback.text}</span>
                    </div>
                  )}

                  {/* Opción 1: Restablecer para Primer Acceso */}
                  <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2.5">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-950">
                      <RefreshCw className="w-4 h-4 text-amber-700" />
                      <span>Opción 1: Restablecer para que el docente cree una nueva contraseña</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Borra la contraseña registrada actual. La próxima vez que este docente ingrese su correo en la pantalla de bienvenida, el sistema le solicitará definir y confirmar libremente su nueva clave de acceso.
                    </p>
                    <button
                      type="button"
                      onClick={handleRestablecerClaveProfesor}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer shadow-xs"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>Restablecer y solicitar nueva contraseña en próximo acceso</span>
                    </button>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-end pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setProfesorParaGestionarClave(null)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                    >
                      Cerrar Panel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : activeImportTab === 'gestion_alumnos' ? (
          /* GESTIÓN DE ALUMNOS: CENSO, BAJAS ESCOLARES Y ALTAS */
          <div className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-150 pb-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Table className="w-4 h-4 text-sky-700" />
                  <span>Censo de Alumnos y Gestión de Bajas Escolares</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Gestiona el censo del IES Blas Infante. Dar de baja a un alumno/a lo retira de los selectores activos de nuevos partes y del aula, pero preserva íntegramente su historial disciplinario previo y trazabilidad legal.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={handleEjecutarDepuracionDuplicados}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs ${
                    duplicadosDetectados.length > 0
                      ? 'bg-amber-600 hover:bg-amber-700 text-white animate-pulse'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                  title="Detecta y fusiona alumnos con el mismo nombre o NIE conservando todos sus partes y puntos"
                >
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>
                    {duplicadosDetectados.length > 0 
                      ? `Depurar Duplicados (${duplicadosDetectados.length} detectados)` 
                      : 'Depurar Duplicados'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setModalAltaAlumnoOpen(true);
                    setAltaAlumnoError(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Alta Manual Alumno/a</span>
                </button>
              </div>
            </div>

            {/* Aviso especial si existen alumnos duplicados detectados */}
            {duplicadosDetectados.length > 0 && (
              <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-xs font-bold text-amber-950 uppercase tracking-wide">
                      Alumnos con nombres duplicados detectados ({duplicadosDetectados.length})
                    </h3>
                    <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                      Se han encontrado registros con el mismo nombre y apellidos en el censo. Al pulsar en &quot;Fusionar Duplicados&quot;, el sistema unificará cada alumno en una única ficha oficial, preservando íntegramente todos sus partes disciplinarios y movimientos de puntos.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleEjecutarDepuracionDuplicados}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer shrink-0 shadow-xs self-start sm:self-auto"
                >
                  Fusionar Duplicados Ahora
                </button>
              </div>
            )}

            {/* Filtros de alumnos en ETL */}
            {actionFeedbackMsg && (
              <div className={`p-3 rounded-xl text-xs flex items-center gap-2 animate-in fade-in ${
                actionFeedbackMsg.type === 'success'
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-950 font-semibold'
                  : 'bg-rose-50 border border-rose-200 text-rose-950 font-semibold'
              }`}>
                {actionFeedbackMsg.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{actionFeedbackMsg.text}</span>
              </div>
            )}

            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between">
              <div className="relative w-full lg:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchTermAlumno}
                  onChange={(e) => setSearchTermAlumno(e.target.value)}
                  placeholder="Buscar alumno/a por nombre, apellidos, NIE..."
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-sky-600 bg-white"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto text-xs">
                {/* Selector de Grupo */}
                <select
                  value={filtroGrupoAlumno}
                  onChange={(e) => setFiltroGrupoAlumno(e.target.value)}
                  className="p-1.5 rounded-xl border border-slate-300 bg-white text-xs text-slate-800 font-semibold"
                >
                  <option value="TODOS">Todos los Grupos ({LISTA_GRUPOS_OFICIALES.length})</option>
                  {LISTA_GRUPOS_OFICIALES.map((g) => (
                    <option key={g.codigo} value={g.codigo}>
                      {g.etiqueta}
                    </option>
                  ))}
                </select>

                {/* Filtro de Estado */}
                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setFiltroEstadoAlumno('TODOS')}
                    className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                      filtroEstadoAlumno === 'TODOS'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Todos ({alumnos.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiltroEstadoAlumno('ACTIVO')}
                    className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                      filtroEstadoAlumno === 'ACTIVO'
                        ? 'bg-white text-emerald-800 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Activos ({alumnos.filter(a => a.estado !== 'BAJA').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiltroEstadoAlumno('BAJA')}
                    className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                      filtroEstadoAlumno === 'BAJA'
                        ? 'bg-white text-rose-800 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Bajas ({alumnos.filter(a => a.estado === 'BAJA').length})
                  </button>
                </div>
              </div>
            </div>

            {/* Tabla de Alumnos */}
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-3">Alumno/a</th>
                    <th className="p-3">Grupo</th>
                    <th className="p-3">NIE</th>
                    <th className="p-3">Saldo Carnet</th>
                    <th className="p-3">Estado</th>
                    <th className="p-3">Tutor Legal</th>
                    <th className="p-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAlumnosETL.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-slate-400">
                        No se encontraron alumnos con los criterios seleccionados.
                      </td>
                    </tr>
                  ) : (
                    filteredAlumnosETL.map((alm) => {
                      const isBaja = alm.estado === 'BAJA';

                      return (
                        <tr key={alm.id_alumno} className={`hover:bg-slate-50/60 ${isBaja ? 'bg-slate-50/80 opacity-75' : ''}`}>
                          <td className="p-3 font-semibold text-slate-900">
                            {alm.apellidos}, {alm.nombre}
                          </td>
                          <td className="p-3 font-mono font-bold text-sky-900">{alm.grupo}</td>
                          <td className="p-3 font-mono text-[11px] text-slate-600">{alm.nie || 'Sin NIE'}</td>
                          <td className="p-3">
                            <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${
                              isBaja
                                ? 'bg-slate-200 text-slate-700'
                                : alm.puntos_actuales === 0
                                ? 'bg-rose-100 text-rose-800'
                                : alm.puntos_actuales <= 3
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-sky-100 text-sky-900'
                            }`}>
                              {alm.puntos_actuales} / 10 pts
                            </span>
                          </td>
                          <td className="p-3">
                            {isBaja ? (
                              <div>
                                <span className="inline-flex items-center gap-1 font-bold text-[10px] bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full">
                                  <UserX className="w-3 h-3" />
                                  <span>Baja escolar</span>
                                </span>
                                {alm.motivo_baja && (
                                  <div className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[160px]" title={alm.motivo_baja}>
                                    {alm.motivo_baja}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 font-bold text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                                <UserCheck className="w-3 h-3" />
                                <span>Activo</span>
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-slate-600 text-[11px]">
                            {alm.nombre_tutor} ({alm.telefono_tutor})
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleAbrirEditarAlumnoETL(alm)}
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 hover:text-sky-900 hover:bg-sky-50 px-2 py-1 rounded-lg transition-colors cursor-pointer border border-slate-200"
                                title="Modificar datos del alumno/a (Nombre, Apellidos, Curso/Grupo, NIE, etc.)"
                              >
                                <Pencil className="w-3.5 h-3.5 text-sky-700" />
                                <span>Editar</span>
                              </button>

                              {isBaja ? (
                                <button
                                  type="button"
                                  onClick={() => handleReactivarAlumnoETL(alm.id_alumno)}
                                  className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50 px-2.5 py-1 rounded-lg transition-colors cursor-pointer border border-emerald-200"
                                  title="Reactivar e incorporar alumno al censo activo"
                                >
                                  <UserCheck className="w-3.5 h-3.5" />
                                  <span>Reactivar</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAlumnoABajarETL(alm);
                                    setMotivoBajaAlumnoETL('Traslado a otro centro educativo');
                                  }}
                                  className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                                  title="Dar de baja a este alumno/a"
                                >
                                  <UserMinus className="w-3.5 h-3.5" />
                                  <span>Dar de Baja</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Modal de Confirmación de Baja de Alumno */}
            {alumnoABajarETL && (
              <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-100">
                  <div className="flex items-center gap-2 text-rose-700 font-bold text-sm">
                    <UserX className="w-5 h-5" />
                    <span>Confirmar Baja de Alumno/a</span>
                  </div>

                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-950 space-y-1">
                    <p className="font-semibold">
                      ¿Deseas dar de baja a {alumnoABajarETL.nombre} {alumnoABajarETL.apellidos} ({alumnoABajarETL.grupo})?
                    </p>
                    <p className="text-[11px] text-rose-800">
                      El alumno dejará de figurar en el censo activo del aula y en los selectores para nuevos partes. Las sanciones pasadas y trazabilidad se mantienen intactas.
                    </p>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-700">
                      Motivo de la baja escolar:
                    </label>
                    <select
                      value={motivoBajaAlumnoETL}
                      onChange={(e) => setMotivoBajaAlumnoETL(e.target.value)}
                      className="w-full text-xs p-2 rounded-xl border border-slate-300 focus:outline-sky-600 bg-white"
                    >
                      <option value="Traslado a otro centro educativo">Traslado a otro centro educativo</option>
                      <option value="Cambio de residencia / localidad">Cambio de residencia / localidad</option>
                      <option value="Baja voluntaria / Fin de escolarización">Baja voluntaria / Fin de escolarización</option>
                      <option value="Baja por incorporación al mercado laboral">Baja por incorporación al mercado laboral</option>
                      <option value="Abandono escolar o anulación de matrícula">Abandono escolar o anulación de matrícula</option>
                      <option value="Cambio de ciclo formativo / etapa">Cambio de ciclo formativo / etapa</option>
                      <option value="Otro motivo justificado">Otro motivo justificado</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setAlumnoABajarETL(null)}
                      className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmarBajaAlumnoETL}
                      className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors cursor-pointer shadow-xs"
                    >
                      Confirmar y Dar de Baja
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Modal de Alta Manual de Alumno */}
            {modalAltaAlumnoOpen && (
              <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
                <form
                  onSubmit={handleCrearNuevoAlumno}
                  className="bg-white rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-100"
                >
                  <div className="flex items-center justify-between border-b border-slate-150 pb-2">
                    <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                      <Plus className="w-5 h-5 text-sky-600" />
                      <span>Alta Manual de Nuevo Alumno/a</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setModalAltaAlumnoOpen(false)}
                      className="text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>

                  {altaAlumnoError && (
                    <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-semibold">
                      {altaAlumnoError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Nombre: *</label>
                      <input
                        type="text"
                        required
                        value={nuevoAlmNombre}
                        onChange={(e) => setNuevoAlmNombre(e.target.value)}
                        placeholder="Ej: David"
                        className="w-full p-2 border border-slate-300 rounded-xl focus:outline-sky-600"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Apellidos: *</label>
                      <input
                        type="text"
                        required
                        value={nuevoAlmApellidos}
                        onChange={(e) => setNuevoAlmApellidos(e.target.value)}
                        placeholder="Ej: Gómez Moreno"
                        className="w-full p-2 border border-slate-300 rounded-xl focus:outline-sky-600"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Grupo Educativo: *</label>
                      <select
                        value={nuevoAlmGrupo}
                        onChange={(e) => setNuevoAlmGrupo(e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded-xl focus:outline-sky-600 bg-white"
                      >
                        {LISTA_GRUPOS_OFICIALES.map((g) => (
                          <option key={g.codigo} value={g.codigo}>
                            {g.etiqueta} - {g.descripcion}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">NIE (Opcional):</label>
                      <input
                        type="text"
                        value={nuevoAlmNie}
                        onChange={(e) => setNuevoAlmNie(e.target.value)}
                        placeholder="Ej: 12345678A"
                        className="w-full p-2 border border-slate-300 rounded-xl focus:outline-sky-600 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Nombre Tutor/a Legal:</label>
                      <input
                        type="text"
                        value={nuevoAlmTutorLegal}
                        onChange={(e) => setNuevoAlmTutorLegal(e.target.value)}
                        placeholder="Ej: Carmen Moreno"
                        className="w-full p-2 border border-slate-300 rounded-xl focus:outline-sky-600"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Teléfono Contacto:</label>
                      <input
                        type="tel"
                        value={nuevoAlmTel}
                        onChange={(e) => setNuevoAlmTel(e.target.value)}
                        placeholder="Ej: 611223344"
                        className="w-full p-2 border border-slate-300 rounded-xl focus:outline-sky-600 font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setModalAltaAlumnoOpen(false)}
                      className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl transition-colors cursor-pointer shadow-xs"
                    >
                      Registrar Alumno/a
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Modal de Modificación de Datos de Alumno en ETL */}
            {alumnoAEditarETL && (
              <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
                <form
                  onSubmit={handleGuardarEdicionAlumnoETL}
                  className="bg-white rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-100"
                >
                  <div className="flex items-center justify-between border-b border-slate-150 pb-2">
                    <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                      <Pencil className="w-4 h-4 text-sky-600" />
                      <span>Modificar Datos de Alumno/a</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAlumnoAEditarETL(null)}
                      className="text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>

                  {editAlmErrorETL && (
                    <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-semibold">
                      {editAlmErrorETL}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Nombre: *</label>
                      <input
                        type="text"
                        required
                        value={editAlmNombreETL}
                        onChange={(e) => setEditAlmNombreETL(e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded-xl focus:outline-sky-600 font-medium"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Apellidos: *</label>
                      <input
                        type="text"
                        required
                        value={editAlmApellidosETL}
                        onChange={(e) => setEditAlmApellidosETL(e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded-xl focus:outline-sky-600 font-medium"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Curso / Grupo Educativo: *</label>
                      <select
                        value={editAlmGrupoETL}
                        onChange={(e) => setEditAlmGrupoETL(e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded-xl focus:outline-sky-600 bg-white font-bold"
                      >
                        {LISTA_GRUPOS_OFICIALES.map((g) => (
                          <option key={g.codigo} value={g.codigo}>
                            {g.etiqueta} - {g.descripcion}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">NIE (Opcional):</label>
                      <input
                        type="text"
                        value={editAlmNieETL}
                        onChange={(e) => setEditAlmNieETL(e.target.value)}
                        placeholder="Ej: 12345678A"
                        className="w-full p-2 border border-slate-300 rounded-xl focus:outline-sky-600 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Nombre Tutor/a Legal:</label>
                      <input
                        type="text"
                        value={editAlmTutorLegalETL}
                        onChange={(e) => setEditAlmTutorLegalETL(e.target.value)}
                        placeholder="Ej: Carmen Moreno"
                        className="w-full p-2 border border-slate-300 rounded-xl focus:outline-sky-600"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Teléfono Contacto:</label>
                      <input
                        type="tel"
                        value={editAlmTelETL}
                        onChange={(e) => setEditAlmTelETL(e.target.value)}
                        placeholder="Ej: 611223344"
                        className="w-full p-2 border border-slate-300 rounded-xl focus:outline-sky-600 font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setAlumnoAEditarETL(null)}
                      className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl transition-colors cursor-pointer shadow-xs"
                    >
                      Guardar Modificaciones
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        ) : activeImportTab === 'cursos' ? (
          /* PESTAÑA DE GESTIÓN Y HISTÓRICO DE CURSOS ESCOLARES */
          <div className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-150 pb-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-sky-700" />
                  <span>Cursos Escolares: Histórico Permanente y Apertura de Nuevo Curso</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Los datos de cada curso escolar se archivan de forma inmutable. Puedes abrir un nuevo curso escolar cuando finalice el actual; todos los partes pasados permanecen almacenados para su comparación interanual.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setModalNuevoCursoOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>+ Apertura de Nuevo Curso</span>
              </button>
            </div>

            {/* Tarjetas informativas de estado de cursos */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-sky-50/70 border border-sky-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-sky-800 uppercase tracking-wider flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Curso Escolar Activo</span>
                  </span>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-full text-[10px] font-bold">
                    EN CURSO
                  </span>
                </div>
                <div className="text-xl font-bold text-slate-900 font-mono">
                  Curso {StorageService.getCursoActual()}
                </div>
                <p className="text-xs text-slate-600">
                  Actualmente el sistema está registrando partes y gestionando los puntos de carnet para el curso <strong>{StorageService.getCursoActual()}</strong>.
                </p>
                <div className="flex items-center gap-4 pt-1 text-xs font-medium text-slate-700">
                  <div>Censo activo: <strong>{alumnos.length}</strong> alumnos</div>
                  <div>Partes activos: <strong>{StorageService.getSanciones().length}</strong> partes</div>
                </div>
              </div>

              <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1">
                    <Archive className="w-3.5 h-3.5" />
                    <span>Garantía de Almacenamiento y Comparativa</span>
                  </span>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-full text-[10px] font-bold">
                    PRESERVACIÓN TOTAL
                  </span>
                </div>
                <div className="text-sm font-bold text-slate-900">
                  Comparativa Interanual Continua
                </div>
                <p className="text-xs text-slate-600">
                  Al abrir un nuevo curso escolar, el curso anterior se archiva automáticamente con todas sus sanciones, partes y movimientos. En la sección <strong>Analítica</strong> podrás seleccionar cualquier curso pasado para comparar indicadores, evolución mensual y tramos horarios.
                </p>
              </div>
            </div>

            {/* Listado de cursos escolares registrados */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-slate-500" />
                  <span>Historial de Cursos Escolares Registrados</span>
                </h3>
                <span className="text-[11px] text-slate-500">
                  Total cursos disponibles: <strong>{StorageService.getCursosDisponibles().length}</strong>
                </span>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-3">Curso Escolar</th>
                      <th className="p-3">Estado</th>
                      <th className="p-3 text-center">Alumnos</th>
                      <th className="p-3 text-center">Partes Registrados</th>
                      <th className="p-3">Fecha de Cierre</th>
                      <th className="p-3 text-right">Comparativa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {StorageService.getCursosDisponibles().map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-3 font-bold text-slate-900 font-mono flex items-center gap-1.5">
                          <School className="w-4 h-4 text-sky-600" />
                          <span>Curso {c.id}</span>
                        </td>
                        <td className="p-3">
                          {c.isCurrent ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                              <span>Activo</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              <Archive className="w-3 h-3 text-slate-500" />
                              <span>Archivado</span>
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center font-mono">
                          {c.totalAlumnos !== undefined ? c.totalAlumnos : '—'}
                        </td>
                        <td className="p-3 text-center font-mono font-semibold">
                          {c.totalSanciones !== undefined ? c.totalSanciones : 'Disponible'}
                        </td>
                        <td className="p-3 text-slate-500 font-mono text-[11px]">
                          {c.fechaCierre
                            ? new Date(c.fechaCierre).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
                            : c.isCurrent ? 'En curso actual' : 'Histórico previo'}
                        </td>
                        <td className="p-3 text-right">
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 bg-sky-50 px-2 py-1 rounded-lg border border-sky-100">
                            <CheckCircle2 className="w-3 h-3 text-sky-600" />
                            <span>100% Disponible en Analítica</span>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal de Apertura de Nuevo Curso Escolar */}
            {modalNuevoCursoOpen && (
              <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
                <form
                  onSubmit={handleCrearNuevoCurso}
                  className="bg-white rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-100"
                >
                  <div className="flex items-center justify-between border-b border-slate-150 pb-2">
                    <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                      <Calendar className="w-5 h-5 text-sky-600" />
                      <span>Apertura de Nuevo Curso Escolar</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setModalNuevoCursoOpen(false)}
                      className="text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl text-xs text-sky-950 space-y-2">
                    <p className="font-bold flex items-center gap-1.5 text-sky-900">
                      <Archive className="w-4 h-4 text-sky-700" />
                      <span>Preservación y Archivado Inmutable</span>
                    </p>
                    <p className="text-[11px] text-sky-800">
                      El curso actual (<strong>{StorageService.getCursoActual()}</strong>) se archivará de forma permanente y quedará disponible para consultas y comparativas en cualquier momento en la sección de <strong>Analítica</strong>.
                    </p>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Identificador del Nuevo Curso Escolar: *
                      </label>
                      <input
                        type="text"
                        required
                        value={nuevoCursoInput}
                        onChange={(e) => setNuevoCursoInput(e.target.value)}
                        placeholder="Ejemplo: 2027/2028"
                        className="w-full p-2 border border-slate-300 rounded-xl focus:outline-sky-600 font-mono font-bold text-sm"
                      />
                      <span className="text-[10px] text-slate-500 mt-1 block">
                        Formato oficial recomendado: <code>AAAA/AAAA</code> (ej. <code>2027/2028</code>).
                      </span>
                    </div>

                    <div className="space-y-2 pt-1 border-t border-slate-100">
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={limpiarAlumnosNuevoCurso}
                          onChange={(e) => setLimpiarAlumnosNuevoCurso(e.target.checked)}
                          className="mt-0.5 rounded text-sky-600 focus:ring-sky-500"
                        />
                        <span className="text-slate-700 text-xs">
                          <strong>Vaciar censo de alumnos</strong> para recibir la nueva carga masiva del archivo oficial <code>.ODS</code> del centro escolar. (Recomendado al inicio de curso).
                        </span>
                      </label>

                      <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-600 space-y-1">
                        <div>✓ El claustro de profesores y credenciales se mantendrán activos.</div>
                        <div>✓ El curso actual queda archivado con todos sus partes para comparativas.</div>
                        <div>✓ El nuevo curso arranca con el contador de partes a cero.</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setModalNuevoCursoOpen(false)}
                      className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl transition-colors cursor-pointer shadow-xs"
                    >
                      Confirmar y Abrir Curso Escolar
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        ) : (
        /* PESTAÑAS DE IMPORTACIÓN DE ALUMNADO Y CSV CLAUSTRO */
        <div className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold">
              <FileCheck2 className="w-3.5 h-3.5" />
              Soporte Nativo .ODS (OpenDocument Spreadsheet / LibreOffice Calc)
            </span>

            <button
              onClick={handleDownloadSample}
              className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-900 underline cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Plantilla Ejemplo ({activeImportTab === 'alumnos' ? '2 Columnas ODS' : 'Claustro CSV'})</span>
            </button>
          </div>

          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-sky-700" />
              <span>
                {activeImportTab === 'alumnos'
                  ? 'Carga Masiva de Alumnado en Formato .ODS (2 Columnas)'
                  : 'Carga Masiva del Claustro Docente y Asignación de Roles'}
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {activeImportTab === 'alumnos'
                ? 'Puedes subir directamente tu archivo .ODS (o .XLSX / .CSV). Solo se necesitan dos columnas: "Apellidos y Nombre" y "Curso". Los alumnos se inicializan con 10 puntos en carnet.'
                : 'Estructura requerida: "Apellidos (coma) Nombre", "Correo Corporativo" y "Rol". Compatible con archivos .ODS, Excel (.XLSX) o texto/CSV.'}
            </p>
          </div>

          {activeImportTab === 'alumnos' ? (
            <div className="bg-sky-50/70 border border-sky-200 rounded-xl p-3.5 text-xs text-sky-950 space-y-2">
              <div className="font-bold flex items-center gap-1.5 text-sky-900">
                <Table className="w-4 h-4 text-sky-700" />
                <span>Estructura de las 2 columnas requeridas para Alumnado:</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="bg-white p-2.5 rounded-lg border border-sky-200/80 space-y-1">
                  <div className="font-bold text-slate-900 flex items-center justify-between">
                    <span>Columna 1: Apellidos y Nombre</span>
                    <span className="text-[10px] text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded font-mono">Texto</span>
                  </div>
                  <p className="text-[11px] text-slate-600">
                    Acepta formato con coma (ej: <code className="font-mono text-slate-800">Gómez Soler, Mateo</code>) o directo (ej: <code className="font-mono text-slate-800">Romero Prieto Adriana</code>). El motor extrae y separa apellidos y nombre automáticamente.
                  </p>
                </div>

                <div className="bg-white p-2.5 rounded-lg border border-sky-200/80 space-y-1">
                  <div className="font-bold text-slate-900 flex items-center justify-between">
                    <span>Columna 2: Curso / Grupo</span>
                    <span className="text-[10px] text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded font-mono">30 Grupos</span>
                  </div>
                  <p className="text-[11px] text-slate-600">
                    Reconoce los 30 grupos del IES Blas Infante: <code className="font-mono text-slate-800">1º FRIO</code>, <code className="font-mono text-slate-800">2º INF</code>, <code className="font-mono text-slate-800">1º CALOR</code>, <code className="font-mono text-slate-800">1º ESO A..D</code>, <code className="font-mono text-slate-800">1º BACH A..D</code>, etc.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-sky-50/70 border border-sky-200 rounded-xl p-3.5 text-xs text-sky-950 space-y-2">
              <div className="font-bold flex items-center gap-1.5 text-sky-900">
                <Table className="w-4 h-4 text-sky-700" />
                <span>Estructura oficial requerida para Profesores:</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div className="bg-white p-2.5 rounded-lg border border-sky-200/80 space-y-1">
                  <div className="font-bold text-slate-900 flex items-center justify-between">
                    <span>1. Apellidos (coma) Nombre</span>
                    <span className="text-[10px] text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded font-mono">Obligatorio</span>
                  </div>
                  <p className="text-[11px] text-slate-600">
                    Formato: <code className="font-mono text-slate-800">"González Ruiz, Manuel"</code> o <code className="font-mono text-slate-800">Luque Serrano, Carmen</code>.
                  </p>
                </div>

                <div className="bg-white p-2.5 rounded-lg border border-sky-200/80 space-y-1">
                  <div className="font-bold text-slate-900 flex items-center justify-between">
                    <span>2. Correo Corporativo</span>
                    <span className="text-[10px] text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded font-mono">@g.educaand.es</span>
                  </div>
                  <p className="text-[11px] text-slate-600">
                    Email institucional del docente (ej: <code className="font-mono text-slate-800">tu_usuario@g.educaand.es</code>).
                  </p>
                </div>

                <div className="bg-white p-2.5 rounded-lg border border-sky-200/80 space-y-1">
                  <div className="font-bold text-slate-900 flex items-center justify-between">
                    <span>3. Rol en el Centro</span>
                    <span className="text-[10px] text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded font-mono">Docente / Convivencia</span>
                  </div>
                  <p className="text-[11px] text-slate-600">
                    <code className="font-mono text-slate-800">Docente</code> o <code className="font-mono text-slate-800">Convivencia</code> (también vale Jefatura, Dirección o Admin). La guardia del Aula PAC no necesita un rol propio: cualquier docente puede atenderla.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Drag & Drop Area */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${
              dragActive
                ? 'border-sky-500 bg-sky-50/70'
                : 'border-sky-200 hover:border-sky-300 bg-sky-50/20'
            }`}
          >
            <Upload className="w-8 h-8 text-sky-500 mx-auto mb-2" />
            <div className="text-xs font-semibold text-slate-800">
              {loadedFileName ? (
                <span className="text-emerald-700 font-bold">Archivo cargado: {loadedFileName}</span>
              ) : (
                'Arrastra tu archivo .ODS, .XLSX o .CSV aquí'
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {activeImportTab === 'alumnos' ? (
                <>Formato soportado: <strong>.ODS (LibreOffice Calc)</strong>, Excel (.XLSX) o CSV con 2 columnas (Apellidos y Nombre, Curso)</>
              ) : (
                <>Columnas requeridas: <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-sky-100">"Apellidos, Nombre", Correo Corporativo, Rol</code> (Soporte .ODS / Excel / CSV)</>
              )}
            </p>

            <div className="mt-4 flex items-center justify-center gap-3">
              <label className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-semibold cursor-pointer transition-colors shadow-xs">
                Seleccionar archivo (.ods, .xlsx, .csv)
                <input
                  type="file"
                  accept=".ods,.xlsx,.xls,.csv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={handleLoadSampleInEditor}
                className="px-3 py-2 bg-white border border-sky-200 hover:bg-sky-50 text-sky-950 rounded-xl text-xs font-medium transition-colors cursor-pointer"
              >
                Cargar datos de prueba
              </button>
            </div>
          </div>

          {/* ODS Table Preview if student file loaded */}
          {odsLoadedRows && odsLoadedRows.length > 0 && (
            <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  Archivo ODS procesado correctamente ({odsLoadedRows.length} alumnos detectados)
                </span>
                <span className="text-[11px] font-mono text-emerald-800 bg-white px-2 py-0.5 rounded border border-emerald-200">
                  Listo para transformar & guardar
                </span>
              </div>
              <div className="max-h-40 overflow-y-auto border border-emerald-200 bg-white rounded-lg">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-emerald-100/60 text-emerald-900 sticky top-0 font-semibold text-[11px]">
                    <tr>
                      <th className="p-2 border-b border-emerald-200">#</th>
                      <th className="p-2 border-b border-emerald-200">Apellidos</th>
                      <th className="p-2 border-b border-emerald-200">Nombre</th>
                      <th className="p-2 border-b border-emerald-200">Curso Normalizado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                    {odsLoadedRows.slice(0, 15).map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-2 text-slate-400">{idx + 1}</td>
                        <td className="p-2 font-bold text-slate-800">{row.apellidos}</td>
                        <td className="p-2 text-slate-700">{row.nombre}</td>
                        <td className="p-2 text-sky-800 font-bold">{row.grupo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {odsLoadedRows.length > 15 && (
                <p className="text-[10px] text-slate-500 text-right">
                  Mostrando primeros 15 alumnos de {odsLoadedRows.length}...
                </p>
              )}
            </div>
          )}

          {/* ODS Table Preview if teacher file loaded */}
          {odsLoadedProfesores && odsLoadedProfesores.length > 0 && (
            <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  Archivo de profesores procesado correctamente ({odsLoadedProfesores.length} docentes detectados)
                </span>
                <span className="text-[11px] font-mono text-emerald-800 bg-white px-2 py-0.5 rounded border border-emerald-200">
                  Listo para transformar & guardar
                </span>
              </div>
              <div className="max-h-40 overflow-y-auto border border-emerald-200 bg-white rounded-lg">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-emerald-100/60 text-emerald-900 sticky top-0 font-semibold text-[11px]">
                    <tr>
                      <th className="p-2 border-b border-emerald-200">#</th>
                      <th className="p-2 border-b border-emerald-200">Apellidos</th>
                      <th className="p-2 border-b border-emerald-200">Nombre</th>
                      <th className="p-2 border-b border-emerald-200">Correo Corporativo</th>
                      <th className="p-2 border-b border-emerald-200">Rol</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                    {odsLoadedProfesores.slice(0, 15).map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-2 text-slate-400">{idx + 1}</td>
                        <td className="p-2 font-bold text-slate-800">{row.apellidos}</td>
                        <td className="p-2 text-slate-700">{row.nombre}</td>
                        <td className="p-2 text-sky-800">{row.email}</td>
                        <td className="p-2 font-bold">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            row.rol === 'ROLE_CONVIVENCIA_ADMIN'
                              ? 'bg-purple-100 text-purple-900 border border-purple-200'
                              : 'bg-slate-100 text-slate-800 border border-slate-200'
                          }`}>
                            {row.rol === 'ROLE_CONVIVENCIA_ADMIN'
                              ? 'Convivencia (Admin)'
                              : 'Docente'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {odsLoadedProfesores.length > 15 && (
                <p className="text-[10px] text-slate-500 text-right">
                  Mostrando primeros 15 docentes de {odsLoadedProfesores.length}...
                </p>
              )}
            </div>
          )}

          {/* Textarea for direct inspection/edit if CSV */}
          {(!odsLoadedRows || odsLoadedRows.length === 0) && (!odsLoadedProfesores || odsLoadedProfesores.length === 0) && (
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-semibold text-slate-700">
                  Contenido de Texto / CSV a procesar:
                </label>
                <span className="text-[11px] font-mono text-slate-500">
                  {csvContent ? `${csvContent.split('\n').filter(l => l.trim()).length} líneas` : 'Vacío'}
                </span>
              </div>
              <textarea
                rows={6}
                value={csvContent}
                onChange={(e) => setCsvContent(e.target.value)}
                placeholder={
                  activeImportTab === 'alumnos'
                    ? 'Pega aquí el contenido de 2 columnas (Apellidos y Nombre, Curso) o carga un archivo .ODS...'
                    : 'Pega aquí: "Apellidos, Nombre", Correo corporativo, Rol (ej: "García Moreno, Laura", tu_usuario@g.educaand.es, Docente)...'
                }
                className="w-full text-xs font-mono rounded-xl border border-slate-300 p-2.5 bg-slate-50 focus:bg-white focus:outline-sky-600 focus:border-sky-600"
              />
            </div>
          )}

          <div className="flex justify-between items-center pt-2">
            <span className="text-[11px] text-slate-500">
              {activeImportTab === 'alumnos'
                ? '* Cada alumno nuevo se creará con 10 puntos íntegros de carnet.'
                : '* Estructura requerida: Apellidos (coma) Nombre, Correo corporativo y Rol.'}
            </span>

            <button
              onClick={handleRunImport}
              disabled={(!csvContent.trim() && (!odsLoadedRows || odsLoadedRows.length === 0) && (!odsLoadedProfesores || odsLoadedProfesores.length === 0))}
              className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-xs cursor-pointer"
            >
              Ejecutar Transformación & Ingesta (ETL)
            </button>
          </div>

          {/* Import Result Notification */}
          {importStatus && (
            <div
              className={`p-4 rounded-2xl border text-xs space-y-2 animate-in fade-in duration-100 ${
                importStatus.success
                  ? 'bg-sky-50/80 border-sky-200 text-sky-950'
                  : 'bg-rose-50 border-rose-200 text-rose-950'
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-sm">
                {importStatus.success ? (
                  <CheckCircle2 className="w-5 h-5 text-sky-700" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-rose-700" />
                )}
                <span>
                  {importStatus.success
                    ? 'Proceso de Ingesta Completado Exitosamente'
                    : 'Fallo al procesar el archivo'}
                </span>
              </div>

              {importStatus.success && (
                <div className="grid grid-cols-3 gap-2 py-2">
                  <div className="bg-white/80 p-2 rounded-xl border border-sky-200 text-center">
                    <div className="text-[10px] text-slate-500 uppercase font-bold">Procesados</div>
                    <div className="text-base font-bold text-slate-900">{importStatus.totalProcessed}</div>
                  </div>
                  <div className="bg-white/80 p-2 rounded-xl border border-sky-200 text-center">
                    <div className="text-[10px] text-slate-500 uppercase font-bold">Nuevos</div>
                    <div className="text-base font-bold text-sky-800">+{importStatus.nuevos}</div>
                  </div>
                  <div className="bg-white/80 p-2 rounded-xl border border-sky-200 text-center">
                    <div className="text-[10px] text-slate-500 uppercase font-bold">Actualizados</div>
                    <div className="text-base font-bold text-slate-700">{importStatus.actualizados}</div>
                  </div>
                </div>
              )}

              {importStatus.errores && importStatus.errores.length > 0 && (
                <div className="pt-2">
                  <div className="font-semibold text-rose-900 mb-1">
                    Advertencias durante el procesamiento ({importStatus.errores.length}):
                  </div>
                  <ul className="list-disc pl-5 space-y-0.5 max-h-32 overflow-y-auto text-rose-800 font-mono text-[11px]">
                    {importStatus.errores.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
        )}
      </div>

      {/* Audit Logs Table for ETL Operations */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-sky-700" />
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Trazabilidad y Registro de Auditoría de Ingestas
            </h3>
          </div>
          <span className="text-[11px] font-mono text-slate-500">
            {auditLogs.length} eventos registrados
          </span>
        </div>

        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th className="p-2.5">Fecha / Hora</th>
                <th className="p-2.5">Usuario @g.educaand.es</th>
                <th className="p-2.5">Operación</th>
                <th className="p-2.5">Entidad</th>
                <th className="p-2.5">Detalles de Ingesta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {auditLogs.slice(0, 8).map((log) => (
                <tr key={log.id_log} className="hover:bg-slate-50/50">
                  <td className="p-2.5 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString('es-ES', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="p-2.5 font-mono text-[11px] text-slate-700">{log.usuario_email}</td>
                  <td className="p-2.5">
                    <span className="font-mono text-[10px] bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded font-bold">
                      {log.accion}
                    </span>
                  </td>
                  <td className="p-2.5 text-slate-600">{log.entidad}</td>
                  <td className="p-2.5 text-slate-500 text-[11px]">{log.detalles}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Confirmación de Vaciado de Alumnos y Partes */}
      {modalVaciarOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center gap-2 text-rose-700 font-bold text-sm">
              <Trash2 className="w-5 h-5 text-rose-600" />
              <span>Eliminar Alumnos y Partes (Puesta a Cero)</span>
            </div>

            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-950 space-y-2">
              <p className="font-bold">
                ¿Estás seguro de que deseas eliminar a todos los alumnos y todos los partes disciplinarios?
              </p>
              <ul className="list-disc list-inside text-[11px] text-rose-800 space-y-1">
                <li>Se vaciará el censo completo de alumnos.</li>
                <li>Se eliminarán todos los partes disciplinarios registrados.</li>
                <li>Se vaciarán las compensaciones e historial de movimientos.</li>
                <li><strong>El claustro de profesores y la configuración del centro se mantendrán intactos.</strong></li>
              </ul>
            </div>

            <p className="text-xs text-slate-500">
              Esta acción deja el sistema completamente limpio para proceder con la importación oficial de los archivos definitivos del centro.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setModalVaciarOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarVaciar}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors cursor-pointer shadow-xs"
              >
                Sí, Eliminar Alumnos y Partes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
