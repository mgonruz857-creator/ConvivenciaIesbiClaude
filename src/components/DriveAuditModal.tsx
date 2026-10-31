/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Cloud, 
  HardDrive, 
  ShieldCheck, 
  X, 
  CheckCircle2, 
  RefreshCw, 
  FileText, 
  Lock, 
  Layers, 
  Wifi,
  ExternalLink,
  Settings,
  Mail,
  AlertCircle,
  Check,
  FolderTree,
  Copy,
  Code2,
  Terminal,
  FolderPlus,
  Download,
  Upload
} from 'lucide-react';
import { AuditLog, Sancion, Alumno, UnidadInstitucionalConfig } from '../types/convivencia';
import { StorageService } from '../services/storageService';
import { AuthService } from '../services/authService';
import { GoogleDriveSyncService } from '../services/googleDriveSyncService';
import { ESTRUCTURA_DRIVE_OFICIAL, generarGoogleAppsScriptCreacion } from '../services/driveProvisioningService';
import { generarServidorAppsScript } from '../services/appsScriptServidor';
import iesLogo from '../assets/images/logo_rectangular_iesbi.png';
import { CUENTA_DRIVE, CARPETA_DRIVE_ID, ARCHIVO_DB_DRIVE, PREFIJO_BACKUP, NOMBRE_UNIDAD_DRIVE } from '../config/entorno';

interface DriveAuditModalProps {
  onClose: () => void;
  auditLogs: AuditLog[];
  sanciones: Sancion[];
  alumnos: Alumno[];
  currentUserEmail: string;
}

export const DriveAuditModal: React.FC<DriveAuditModalProps> = ({
  onClose,
  auditLogs,
  sanciones,
  alumnos,
  currentUserEmail,
}) => {
  const [isSimulatingSync, setIsSimulatingSync] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  // Institutional unit state
  const [unidadConfig, setUnidadConfig] = useState<UnidadInstitucionalConfig>(() =>
    StorageService.getUnidadInstitucional()
  );
  const [isEditingUnidad, setIsEditingUnidad] = useState(false);
  const [tempEmail, setTempEmail] = useState(unidadConfig.email);
  const [tempEsPruebas, setTempEsPruebas] = useState(unidadConfig.esModoPruebas);
  const [tempObservaciones, setTempObservaciones] = useState(unidadConfig.observaciones);
  const [tempFolderId, setTempFolderId] = useState(unidadConfig.folderId || CARPETA_DRIVE_ID);
  const [copiedScript, setCopiedScript] = useState(false);
  const [showScriptViewer, setShowScriptViewer] = useState(false);

  const sanitizeDriveFolderId = (input: string): string => {
    if (!input) return '';
    let id = input.trim();
    if (id.includes('/folders/')) {
      id = id.split('/folders/')[1];
    }
    if (id.includes('?')) {
      id = id.split('?')[0];
    }
    return id.replace(/#.*$/, '').replace(/\/+$/, '').trim();
  };

  const handleCopyScript = () => {
    const code = generarGoogleAppsScriptCreacion(unidadConfig.email, unidadConfig.folderId);
    navigator.clipboard.writeText(code);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 3000);
  };

  const [copiedBackendScript, setCopiedBackendScript] = useState(false);
  const [showBackendScriptViewer, setShowBackendScriptViewer] = useState(false);
  const [syncApiUrl, setSyncApiUrl] = useState(() => GoogleDriveSyncService.getSyncApiUrl());
  const [isSavingApiUrl, setIsSavingApiUrl] = useState(false);

  const handleCopyBackendScript = () => {
    const code = generarServidorAppsScript();
    navigator.clipboard.writeText(code);
    setCopiedBackendScript(true);
    setTimeout(() => setCopiedBackendScript(false), 3000);
  };

  const handleSaveApiUrl = (e: React.FormEvent) => {
    e.preventDefault();
    GoogleDriveSyncService.setSyncApiUrl(syncApiUrl);
    setIsSavingApiUrl(false);
    setSyncFeedback('URL del conector de base de datos de Google Apps Script guardada correctamente.');
  };

  const handleForceSync = async () => {
    setIsSimulatingSync(true);
    setSyncFeedback('Sincronizando y guardando base de datos en Google Drive...');
    try {
      const pullRes = await GoogleDriveSyncService.pullFromGoogleDrive({ forceRefresh: true });
      const pushRes = await GoogleDriveSyncService.pushToGoogleDrive();
      setIsSimulatingSync(false);
      if (pullRes.success || pushRes.success) {
        setSyncFeedback(`✅ ¡Base de datos sincronizada! Archivo '${ARCHIVO_DB_DRIVE}' actualizado (${StorageService.getAlumnos().length} alumnos, ${StorageService.getSanciones().length} partes).`);
      } else {
        setSyncFeedback(`⚠️ ${pushRes.message}`);
      }
    } catch (err: any) {
      setIsSimulatingSync(false);
      setSyncFeedback(`❌ Error al conectar con Google Drive: ${err.message || err}`);
    }
  };

  const handlePullOnlyFromDrive = async () => {
    setIsSimulatingSync(true);
    setSyncFeedback(`Descargando datos desde ${ARCHIVO_DB_DRIVE} en Google Drive...`);
    try {
      StorageService.saveDeletedSancionIds([]);
      const pullRes = await GoogleDriveSyncService.pullFromGoogleDrive({ forceRefresh: true });
      setIsSimulatingSync(false);
      if (pullRes.success) {
        setSyncFeedback(`✅ ¡Datos recuperados desde '${ARCHIVO_DB_DRIVE}'! (${pullRes.dataCount?.alumnos ?? 0} alumnos, ${pullRes.dataCount?.sanciones ?? 0} partes cargados). Recargando...`);
        setTimeout(() => {
          window.location.reload();
        }, 900);
      } else {
        setSyncFeedback(`⚠️ No se pudo leer desde Drive: ${pullRes.message}`);
      }
    } catch (err: any) {
      setIsSimulatingSync(false);
      setSyncFeedback(`❌ Error al leer desde Google Drive: ${err.message || err}`);
    }
  };

  const handleSaveUnidadConfig = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanFolderId = sanitizeDriveFolderId(tempFolderId);
    const updated: UnidadInstitucionalConfig = {
      ...unidadConfig,
      email: tempEmail.trim(),
      esModoPruebas: tempEsPruebas,
      observaciones: tempObservaciones.trim(),
      folderId: cleanFolderId,
      fechaConfiguracion: new Date().toISOString().split('T')[0],
    };
    StorageService.saveUnidadInstitucional(updated);
    setUnidadConfig(updated);
    setTempFolderId(cleanFolderId);
    setIsEditingUnidad(false);
    setSyncFeedback(`Unidad institucional actualizada a ${updated.email} (${updated.esModoPruebas ? 'Modo Pruebas' : 'Definitiva'}) con carpeta vinculada [${cleanFolderId}].`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 border border-sky-100 animate-in fade-in zoom-in-95 duration-100 space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-sky-100">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white border border-sky-100 p-1 flex items-center justify-center shrink-0 shadow-2xs">
              <img
                src={iesLogo}
                alt="Logo IES Blas Infante"
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900">
                  Persistencia y Almacenamiento Google Drive Corporativo
                </h2>
                {unidadConfig.esModoPruebas ? (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                    Modo Pruebas
                  </span>
                ) : (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-300">
                    Definitiva
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 font-mono flex items-center gap-1.5 mt-0.5">
                <Mail className="w-3.5 h-3.5 text-sky-700" />
                <span>Unidad Institucional:</span>
                <strong className="text-sky-950 font-semibold">{unidadConfig.email}</strong>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-sky-50 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {syncFeedback && (
          <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl text-xs text-sky-950 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-sky-700 shrink-0" />
            <span>{syncFeedback}</span>
          </div>
        )}

        {/* Institutional Unit Card / Status Callout */}
        <div className={`p-4 rounded-xl text-xs space-y-2 border ${
          unidadConfig.esModoPruebas 
            ? 'bg-amber-50/70 border-amber-200' 
            : 'bg-emerald-50/70 border-emerald-200'
        }`}>
          <div className="flex items-center justify-between">
            <div className={`flex items-center gap-2 font-bold ${
              unidadConfig.esModoPruebas ? 'text-amber-950' : 'text-emerald-950'
            }`}>
              {unidadConfig.esModoPruebas ? (
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              )}
              <span>
                {unidadConfig.esModoPruebas 
                  ? 'Unidad Institucional en Modo de Pruebas' 
                  : 'Unidad Oficial de Almacenamiento del Centro Educativo'}
              </span>
            </div>
            <button
              onClick={() => setIsEditingUnidad(!isEditingUnidad)}
              className="inline-flex items-center gap-1 text-[11px] text-sky-900 hover:text-sky-950 underline font-medium cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>{isEditingUnidad ? 'Cancelar edición' : 'Modificar cuenta'}</span>
            </button>
          </div>

          <p className="text-[11px] text-slate-700 leading-relaxed">
            Cuenta corporativa de almacenamiento:{' '}
            <strong className="font-mono bg-white px-1.5 py-0.5 rounded border border-emerald-300 text-emerald-950">
              {unidadConfig.email}
            </strong>{' '}
            (Centro: <strong>{unidadConfig.centroEducativo}</strong> · Código: <code className="font-mono text-slate-800">{unidadConfig.codigoCentro}</code>).
            Los datos residen y se custodian de forma oficial y permanente dentro del entorno educativo de la Junta de Andalucía.
          </p>

          <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-slate-700">
            <span>Carpeta vinculada en Google Drive:</span>
            <code className="font-mono bg-white px-2 py-0.5 rounded border border-emerald-300 text-emerald-950 font-bold">
              {unidadConfig.folderId || CARPETA_DRIVE_ID}
            </code>
            <a
              href={`https://drive.google.com/drive/folders/${unidadConfig.folderId || CARPETA_DRIVE_ID}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sky-700 hover:text-sky-900 underline font-semibold cursor-pointer"
            >
              <span>Abrir carpeta oficial en Drive</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {isEditingUnidad && (
            <form onSubmit={handleSaveUnidadConfig} className="mt-3 p-3 bg-white rounded-xl border border-sky-200 space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Email de la Unidad Institucional (@g.educaand.es)
                </label>
                <input
                  type="email"
                  value={tempEmail}
                  onChange={(e) => setTempEmail(e.target.value)}
                  placeholder={`ej. ${CUENTA_DRIVE}`}
                  required
                  pattern=".+@g\.educaand\.es"
                  title="Debe pertenecer al dominio @g.educaand.es"
                  className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-300 font-mono focus:border-sky-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  ID de la Carpeta en Google Drive (Convivencia - IES Blas Infante)
                </label>
                <input
                  type="text"
                  value={tempFolderId}
                  onChange={(e) => setTempFolderId(e.target.value)}
                  placeholder={`ej. ${CARPETA_DRIVE_ID}`}
                  required
                  className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-300 font-mono font-semibold focus:border-sky-600 focus:outline-none"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Introduce solo el ID alfanumérico limpio (sin <code>?hl=...</code>). Si pegas la URL completa o con parámetros, el sistema lo limpiará automáticamente.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="chkPruebas"
                  checked={tempEsPruebas}
                  onChange={(e) => setTempEsPruebas(e.target.checked)}
                  className="rounded border-slate-300 text-sky-600 focus:ring-sky-600"
                />
                <label htmlFor="chkPruebas" className="text-[11px] text-slate-700">
                  Marcar como <strong>Modo Pruebas / Staging</strong> (desmarcado = Producción Oficial)
                </label>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Notas de configuración
                </label>
                <input
                  type="text"
                  value={tempObservaciones}
                  onChange={(e) => setTempObservaciones(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-300 focus:border-sky-600 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsEditingUnidad(false)}
                  className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 px-3 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-semibold cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Guardar Unidad Institucional</span>
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Status Panels */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3.5 bg-sky-50/40 border border-sky-100 rounded-xl space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                <HardDrive className="w-4 h-4 text-sky-700" />
                Base de Datos Drive
              </span>
              <span className="text-[10px] font-mono text-sky-800 font-bold bg-sky-100 px-1.5 py-0.5 rounded-full">
                EN LÍNEA
              </span>
            </div>
            <div className="space-y-1 font-mono text-[11px] text-slate-600">
              <div>Archivo: <strong className="text-slate-900">{ARCHIVO_DB_DRIVE}</strong></div>
              <div>Unidad activa: {unidadConfig.email}</div>
              <div>Alumnos registrados: {alumnos.length}</div>
              <div>Partes almacenados: {sanciones.length}</div>
              <div>Cifrado en reposo: AES-256 Google Cloud</div>
            </div>
            <div className="pt-1">
              <button
                type="button"
                disabled={isSimulatingSync}
                onClick={handlePullOnlyFromDrive}
                className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-[11px] font-semibold transition-colors cursor-pointer shadow-2xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Recuperar Partes desde {ARCHIVO_DB_DRIVE}</span>
              </button>
            </div>
          </div>

          <div className="p-3.5 bg-sky-50/40 border border-sky-100 rounded-xl space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-sky-700" />
                Cola Write-Buffer & Resiliencia
              </span>
              <span className="text-[10px] font-mono text-slate-600 bg-slate-200 px-1.5 py-0.5 rounded-full">
                0 pendientes
              </span>
            </div>
            <div className="space-y-1 text-[11px] text-slate-600">
              <div>• Algoritmo Exponential Backoff con Jitter activo.</div>
              <div>• Prevención de bloqueos en picos HH:55 de cambio de clase.</div>
              <div>• Service Worker PWA para almacenamiento offline local.</div>
            </div>
          </div>
        </div>

        {/* Automatic Provisioning & Folder Tree Section */}
        <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FolderTree className="w-4 h-4 text-sky-700 shrink-0" />
              <h3 className="text-xs font-bold text-slate-900">
                Estructura de Directorios en {unidadConfig.email}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowScriptViewer(!showScriptViewer)}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-medium cursor-pointer"
              >
                <Code2 className="w-3.5 h-3.5 text-slate-600" />
                <span>{showScriptViewer ? 'Ocultar código' : 'Ver script Google Apps'}</span>
              </button>
              <button
                type="button"
                onClick={handleCopyScript}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-xs"
              >
                {copiedScript ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedScript ? '¡Script Copiado!' : 'Copiar Script Autocreador'}</span>
              </button>
            </div>
          </div>

          <p className="text-[11px] text-slate-600 leading-relaxed">
            Puedes crear toda esta jerarquía de carpetas en Google Drive en 5 segundos. Como desarrollador, solo tienes que copiar el script de aprovisionamiento, abrir <strong className="text-slate-800">script.google.com</strong> con la cuenta <code className="font-mono bg-sky-50 text-sky-900 px-1 py-0.5 rounded border border-sky-200">{unidadConfig.email}</code> y pulsar <strong>Ejecutar</strong>.
          </p>

          {/* Visual Interactive Tree */}
          <div className="p-3 bg-slate-900 text-slate-200 rounded-xl font-mono text-[11px] space-y-1.5 overflow-x-auto">
            <div className="text-emerald-400 font-bold flex items-center gap-1.5">
              <span>📁</span> {ESTRUCTURA_DRIVE_OFICIAL.name}
            </div>
            <div className="pl-4 text-sky-300 flex items-center gap-1.5">
              <span>└── 📁</span> 2026-2027 (Curso Académico)
            </div>
            <div className="pl-8 text-amber-300 flex items-center gap-1.5">
              <span>├── 📁</span> 01_Partes_PDF <span className="text-slate-400 text-[10px]">→ (30 grupos: 6 Ciclos, 16 ESO, 8 Bachillerato)</span>
            </div>
            <div className="pl-8 text-amber-300 flex items-center gap-1.5">
              <span>├── 📁</span> 02_Aula_PAC <span className="text-slate-500 text-[10px]">→ Registro de intervenciones y derivaciones</span>
            </div>
            <div className="pl-8 text-amber-300 flex items-center gap-1.5">
              <span>├── 📁</span> 03_Backups_Datos <span className="text-slate-500 text-[10px]">→ Copias .JSON de seguridad del sistema</span>
            </div>
            <div className="pl-8 text-amber-300 flex items-center gap-1.5">
              <span>├── 📁</span> 04_Plantillas_Oficiales <span className="text-slate-500 text-[10px]">→ Modelos ROF / Decreto 327/2010</span>
            </div>
            <div className="pl-8 text-amber-300 flex items-center gap-1.5">
              <span>├── 📁</span> 05_Listados_Seneca <span className="text-slate-500 text-[10px]">→ CSV de alumnado importado</span>
            </div>
            <div className="pl-8 text-slate-400 flex items-center gap-1.5">
              <span>└── 📄</span> LEEME_INFORMACION_SISTEMA.txt
            </div>
          </div>

          {/* Script Viewer */}
          {showScriptViewer && (
            <div className="space-y-2 pt-2 border-t border-slate-200">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-sky-700" />
                  Script Google Apps Script (DriveApp API nativa)
                </span>
                <span className="text-[11px] text-slate-500">Ejecutar en la cuenta del centro</span>
              </div>
              <pre className="p-3 bg-slate-950 text-emerald-400 rounded-xl font-mono text-[10px] max-h-52 overflow-y-auto leading-relaxed border border-slate-800">
                {generarGoogleAppsScriptCreacion(unidadConfig.email, unidadConfig.folderId)}
              </pre>
            </div>
          )}
        </div>

        {/* Real-time Centralized Database Sync API Connector */}
        <div className="p-4 bg-gradient-to-r from-sky-50/70 via-white to-blue-50/60 border border-sky-200 rounded-xl space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Cloud className="w-4 h-4 text-sky-700 shrink-0" />
              <h3 className="text-xs font-bold text-slate-900">
                Conector API de Base de Datos en Tiempo Real (Google Apps Script)
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowBackendScriptViewer(!showBackendScriptViewer)}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-medium cursor-pointer"
              >
                <Code2 className="w-3.5 h-3.5 text-slate-600" />
                <span>{showBackendScriptViewer ? 'Ocultar código API' : 'Ver Script Backend Google Apps'}</span>
              </button>
              <button
                type="button"
                onClick={handleCopyBackendScript}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-xs"
              >
                {copiedBackendScript ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedBackendScript ? '¡Backend Copiado!' : 'Copiar Script Backend'}</span>
              </button>
            </div>
          </div>

          <p className="text-[11px] text-slate-600 leading-relaxed">
            Permite sincronización bidireccional instantánea entre todos los dispositivos (ordenadores de aula, guardias, jefatura) conectándose directamente con la carpeta <code className="font-mono bg-sky-50 text-sky-900 px-1 py-0.5 rounded border border-sky-200">{unidadConfig.folderId || CARPETA_DRIVE_ID}</code> de Drive.
          </p>

          <form onSubmit={handleSaveApiUrl} className="flex flex-wrap items-center gap-2 pt-1">
            <input
              type="url"
              value={syncApiUrl}
              readOnly
              title="La dirección del servidor se fija en la configuración de la app"
              onChange={(e) => setSyncApiUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/.../exec"
              className="flex-1 min-w-[240px] px-3 py-1.5 text-xs font-mono rounded-xl border border-slate-300 bg-white focus:border-sky-600 focus:outline-none"
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-xs"
            >
              Guardar Endpoint
            </button>
            <button
              type="button"
              disabled={isSimulatingSync}
              onClick={async () => {
                setIsSimulatingSync(true);
                setSyncFeedback(`Descargando ${ARCHIVO_DB_DRIVE} desde Google Drive...`);
                try {
                  StorageService.saveDeletedSancionIds([]);
                  const res = await GoogleDriveSyncService.pullFromGoogleDrive({ forceRefresh: true });
                  setIsSimulatingSync(false);
                  if (res.success) {
                    window.dispatchEvent(new Event('focus'));
                    setSyncFeedback(`✅ ¡Archivo ${ARCHIVO_DB_DRIVE} leído y sincronizado! (${res.dataCount?.alumnos ?? 0} alumnos, ${res.dataCount?.sanciones ?? 0} partes recuperados)`);
                  } else {
                    setSyncFeedback(`⚠️ Aviso de conexión: ${res.message}`);
                  }
                } catch (err: any) {
                  setIsSimulatingSync(false);
                  setSyncFeedback(`❌ Error al conectar: ${err.message || err}`);
                }
              }}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-xs inline-flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSimulatingSync ? 'animate-spin' : ''}`} />
              <span>Probar Conexión Ahora</span>
            </button>
          </form>

          {showBackendScriptViewer && (
            <div className="space-y-2 pt-2 border-t border-slate-200">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-emerald-700" />
                  Script Backend REST (Google Apps Script Web App)
                </span>
                <span className="text-[11px] text-slate-500">Publicar como Aplicación Web</span>
              </div>
              <pre className="p-3 bg-slate-950 text-emerald-300 rounded-xl font-mono text-[10px] max-h-56 overflow-y-auto leading-relaxed border border-slate-800">
                {generarServidorAppsScript()}
              </pre>
            </div>
          )}
        </div>

        {/* Centralized Database Backup / Export & Restore section */}
        <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-emerald-700 shrink-0" />
              <h3 className="text-xs font-bold text-slate-900">
                Custodia de Archivo y Transferencia entre Dispositivos
              </h3>
            </div>
            <span className="text-[10px] font-mono font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200">
              {ARCHIVO_DB_DRIVE}
            </span>
          </div>

          <p className="text-[11px] text-slate-600 leading-relaxed">
            Puedes descargar el archivo maestro de la base de datos para subirlo a la carpeta de Google Drive del centro o para cargarlo directamente en cualquier otro ordenador (portátil de guardia, sala de profesores o Jefatura de Estudios) manteniendo el 100% de los datos sincronizados.
          </p>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                try {
                  const payload = GoogleDriveSyncService.getFullDatabasePayload();
                  const jsonStr = JSON.stringify(payload, null, 2);
                  const filename = `${PREFIJO_BACKUP}_${new Date().toISOString().split('T')[0]}.json`;

                  // Método 1: Blob y enlace a
                  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
                  
                  // Soporte navegador estándar
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

                  // Guardar copia local en el registro de snapshots
                  StorageService.crearSnapshotBackup(currentUserEmail);

                  setSyncFeedback(`✅ ¡Copia de seguridad descargada exitosamente como "${filename}"! (${payload.alumnos.length} alumnos, ${payload.sanciones.length} partes).`);
                } catch (err: any) {
                  // Fallback con Data URI si Blob está restringido por políticas de sandbox
                  try {
                    const payload = GoogleDriveSyncService.getFullDatabasePayload();
                    const jsonStr = JSON.stringify(payload, null, 2);
                    const filename = `${PREFIJO_BACKUP}_${new Date().toISOString().split('T')[0]}.json`;
                    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonStr);
                    const link = document.createElement('a');
                    link.setAttribute('href', dataUri);
                    link.setAttribute('download', filename);
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    setSyncFeedback(`✅ ¡Copia de seguridad descargada con éxito!`);
                  } catch (fallbackErr: any) {
                    setSyncFeedback(`❌ Error al descargar el archivo: ${err?.message || fallbackErr?.message}`);
                  }
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs cursor-pointer active:scale-98 transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Descargar Base de Datos Completa (.json)</span>
            </button>

            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold shadow-xs cursor-pointer">
              <Upload className="w-3.5 h-3.5 text-slate-500" />
              <span>Restaurar / Cargar en este Dispositivo</span>
              <input
                type="file"
                accept=".json"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setIsSimulatingSync(true);
                  setSyncFeedback(`Procesando archivo "${file.name}"...`);
                  const reader = new FileReader();
                  reader.onload = async (event) => {
                    try {
                      const rawContent = (event.target?.result as string) || '';
                      let data: any;
                      try {
                        data = JSON.parse(rawContent);
                      } catch {
                        const trimmed = rawContent.trim();
                        if (trimmed.startsWith('data=')) {
                          data = JSON.parse(decodeURIComponent(trimmed.substring(5).replace(/\+/g, ' ')));
                        } else {
                          throw new Error('JSON inválido');
                        }
                      }

                      // Soportar tanto objeto completo { alumnos, sanciones } como arrays o archivos de curso
                      const incomingProfesores = Array.isArray(data?.profesores) ? data.profesores : [];
                      const incomingAlumnos = Array.isArray(data?.alumnos)
                        ? data.alumnos
                        : (Array.isArray(data?.alumnos_archivo) ? data.alumnos_archivo : []);
                      let incomingSanciones: Sancion[] = [];
                      if (Array.isArray(data?.sanciones)) {
                        incomingSanciones = data.sanciones;
                      } else if (Array.isArray(data?.partes)) {
                        incomingSanciones = data.partes;
                      } else if (Array.isArray(data?.sanciones_archivo)) {
                        incomingSanciones = data.sanciones_archivo;
                      } else if (Array.isArray(data)) {
                        incomingSanciones = data;
                      }

                      // Si vienen también en cursos archivados dentro del JSON, rescatarlos si la lista principal tuviera menos
                      if (Array.isArray(data?.historico_cursos)) {
                        data.historico_cursos.forEach((hc: any) => {
                          if (Array.isArray(hc?.sanciones_archivo)) {
                            const existingIds = new Set(incomingSanciones.map(s => s.id_sancion));
                            hc.sanciones_archivo.forEach((sa: Sancion) => {
                              if (sa?.id_sancion && !existingIds.has(sa.id_sancion)) {
                                incomingSanciones.push(sa);
                              }
                            });
                          }
                        });
                      }

                      if (incomingProfesores.length > 0) {
                        StorageService.saveProfesores(incomingProfesores);
                      }
                      // Las contraseñas se gestionan solo en el servidor: no se restauran desde copias
                      if (incomingAlumnos.length > 0) {
                        StorageService.saveDeletedAlumnoIds([]);
                        StorageService.saveAlumnos(incomingAlumnos);
                      }

                      // Limpiar cualquier marca de borrado previa y guardar el 100% de las sanciones del archivo
                      StorageService.saveDeletedSancionIds([]);
                      if (incomingSanciones.length > 0) {
                        // Marcar todos los partes restaurados como pendientes de subida para que el servidor de Drive nunca los descarte
                        StorageService.savePendingSyncSancionIds(incomingSanciones.map(s => s.id_sancion).filter(Boolean));
                        StorageService.saveSanciones(incomingSanciones);
                      }

                      if (Array.isArray(data?.compensaciones) && data.compensaciones.length > 0) {
                        StorageService.saveCompensaciones(data.compensaciones);
                      }
                      if (Array.isArray(data?.audit_logs) && data.audit_logs.length > 0) {
                        StorageService.saveAuditLogs(data.audit_logs);
                      }

                      StorageService.recalcularPuntosAlumnos();

                      setSyncFeedback(`Subiendo ${incomingSanciones.length} partes y ${incomingAlumnos.length || StorageService.getAlumnos().length} alumnos a Google Drive...`);
                      await GoogleDriveSyncService.pushToGoogleDrive();
                      setIsSimulatingSync(false);
                      setSyncFeedback(`✅ ¡Restauración completada con éxito! Se han cargado ${incomingSanciones.length} partes y ${StorageService.getAlumnos().length} alumnos.`);
                      window.dispatchEvent(new Event('focus'));
                      setTimeout(() => {
                        window.location.reload();
                      }, 1200);
                    } catch (err: any) {
                      setIsSimulatingSync(false);
                      setSyncFeedback('Error: El archivo seleccionado no tiene un formato JSON válido.');
                    }
                  };
                  reader.readAsText(file);
                }}
              />
            </label>
          </div>
        </div>


        {/* RGPD & Security Compliance */}
        <div className="p-3.5 bg-sky-50/60 border border-sky-200 rounded-xl text-xs space-y-2">
          <div className="font-bold text-sky-950 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-sky-700" />
            <span>Principio de Localización de Datos (RGPD / LOPDGDD)</span>
          </div>
          <p className="text-[11px] text-sky-950 leading-relaxed">
            Todos los datos identificativos (NIE, Nombres y Apellidos del alumnado) residen exclusivamente dentro de la tenencia corporativa de Google Workspace for Education de la Consejería de Desarrollo Educativo y Formación Profesional de la Junta de Andalucía (<code className="font-mono bg-white px-1 py-0.5 rounded border border-sky-300">{unidadConfig.email}</code>). Se deniega el acceso a cuentas externas a <code className="font-mono bg-white px-1 py-0.5 rounded border border-sky-300">@g.educaand.es</code>.
          </p>
        </div>

        {/* Actions bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <span />

          <div className="flex items-center gap-2">
            <button
              onClick={handleForceSync}
              disabled={isSimulatingSync}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSimulatingSync ? 'animate-spin' : ''}`} />
              <span>Forzar Sincronización Inmediata</span>
            </button>
            <button
              onClick={onClose}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-medium transition-colors cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
