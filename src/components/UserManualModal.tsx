/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  BookOpen, 
  UserCheck, 
  Shield, 
  Printer, 
  Download, 
  X, 
  CheckCircle, 
  Clock, 
  FileText, 
  Award, 
  Search, 
  AlertTriangle,
  FolderLock,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { CUENTA_DRIVE, CARPETA_DRIVE_ID } from '../config/entorno';

interface UserManualModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
}

export const UserManualModal: React.FC<UserManualModalProps> = ({
  isOpen,
  onClose,
  isAdmin,
}) => {
  // Para usuarios administradores, por defecto abre el de Directivo; para docentes ordinarios, queda bloqueado estrictamente en DOCENTE
  const [activeTab, setActiveTab] = useState<'DOCENTE' | 'DIRECTIVO'>(
    isAdmin ? 'DIRECTIVO' : 'DOCENTE'
  );

  // Blindaje estricto: Si no es administrador, el tab activo es forzosamente 'DOCENTE'
  const currentTab = isAdmin ? activeTab : 'DOCENTE';

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden my-auto print:max-h-none print:shadow-none print:border-none print:w-full">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-sky-900 via-slate-900 to-sky-950 text-white p-5 flex items-start justify-between border-b border-sky-800/40 shrink-0 print:bg-none print:text-black">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-sky-500/20 border border-sky-400/40 flex items-center justify-center shrink-0">
              <BookOpen className="w-6 h-6 text-sky-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold">
                  {isAdmin ? 'Manuales de Funcionamiento S.I.G.C.' : 'Manual de Funcionamiento Docente'}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/20 text-sky-200 border border-sky-400/30">
                  {isAdmin ? 'Modo Administración' : 'Claustro Docente'}
                </span>
              </div>
              <p className="text-xs text-sky-200/80 mt-0.5">
                IES Blas Infante · Sistema Integral de Gestión de la Convivencia y Carnet por Puntos (Decreto 327/2010)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            <button
              onClick={handlePrint}
              className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              title="Imprimir o guardar como PDF"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              title="Cerrar manual"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Selector or Role Header */}
        {!isAdmin ? (
          <div className="bg-sky-50/80 px-4 py-2.5 border-b border-sky-200 text-xs font-semibold text-sky-950 flex items-center justify-between shrink-0 print:hidden">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-sky-700" />
              <span>Guía Operativa para Profesorado, Tutorías y Guardias PAC</span>
            </div>
            <span className="text-[10px] text-sky-800 bg-sky-100/90 border border-sky-200 px-2 py-0.5 rounded-full font-mono font-bold">
              Acceso Docente
            </span>
          </div>
        ) : (
          <div className="bg-slate-100 p-2 border-b border-slate-200 flex items-center justify-center gap-2 shrink-0 print:hidden">
            <button
              onClick={() => setActiveTab('DOCENTE')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                currentTab === 'DOCENTE'
                  ? 'bg-white text-sky-950 shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <UserCheck className="w-4 h-4 text-sky-700" />
              <span>1. Manual para Claustro Docente</span>
            </button>

            <button
              onClick={() => setActiveTab('DIRECTIVO')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                currentTab === 'DIRECTIVO'
                  ? 'bg-white text-amber-950 shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Shield className="w-4 h-4 text-amber-700" />
              <span>2. Manual para Equipo Directivo y Convivencia</span>
            </button>
          </div>
        )}

        {/* Manual Content Area */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-800 text-xs sm:text-sm leading-relaxed print:p-0">
          
          {/* ========================================================================= */}
          {/* TAB 1: PROFESORADO COMÚN */}
          {/* ========================================================================= */}
          {currentTab === 'DOCENTE' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              
              {/* Introducción */}
              <div className="p-4 bg-sky-50 border border-sky-200 rounded-2xl flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-sky-700 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-sky-950 text-sm sm:text-base">
                    Bienvenido/a al Sistema de Convivencia del IES Blas Infante
                  </h3>
                  <p className="text-xs text-sky-900/80 mt-1">
                    Esta herramienta ha sido diseñada para agilizar tu labor docente diaria: permite registrar partes disciplinarios en menos de 30 segundos, tramitar medidas inmediatas y consultar en todo momento el estado de tus partes, con total validez jurídica y formato adaptado al ROF del centro y al Decreto 327/2010.
                  </p>
                </div>
              </div>

              {/* Sección 1 */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                  <div className="w-6 h-6 rounded-lg bg-sky-100 text-sky-800 flex items-center justify-center font-bold text-xs">1</div>
                  <h4>Acceso al Sistema y Privacidad (RGPD)</h4>
                </div>
                <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-600">
                  <li><strong>Identificación oficial:</strong> Inicia sesión con tu correo corporativo institucional finalizado en <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-sky-900 font-bold">@g.educaand.es</code>.</li>
                  <li><strong>Contraseña de acceso:</strong> Utilice su clave de acceso corporativa asignada por el centro / Jefatura de Convivencia.</li>
                  <li><strong>Privacidad de datos:</strong> Por normativa de protección de datos de menores (RGPD), como docente solo tienes acceso a tus propios partes puestos, a la imposición rápida de sanciones y al módulo del Aula PAC si estás en hora de guardia.</li>
                </ul>
              </div>

              {/* Sección 2: Flujo de 30s */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                  <div className="w-6 h-6 rounded-lg bg-sky-100 text-sky-800 flex items-center justify-center font-bold text-xs">2</div>
                  <h4>Cómo Imponer un Parte Disciplinario en &lt; 30 Segundos</h4>
                </div>
                <div className="space-y-3 text-xs text-slate-600">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <strong className="text-slate-900 block mb-1">Paso 1: Seleccionar al Alumno/a</strong>
                    <p>Escribe el nombre, apellidos o grupo en el buscador (ej. <em>"García 2ESO_B"</em>). El sistema autocompleta el NIE y muestra su saldo de puntos actual.</p>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <strong className="text-slate-900 block mb-1">Paso 2: Hora lectiva y Ubicación</strong>
                    <p>Indica el tramo horario (1ª, 2ª, Recreo, 4ª...) y el espacio donde ocurrió el incidente (Aula ordinaria, Guardia, Pasillos, Patio, Biblioteca, etc.).</p>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <strong className="text-slate-900 block mb-1">Paso 3: Seleccionar la Conducta en el Catálogo ROF</strong>
                    <p>Elige la conducta correspondiente. La aplicación desglosa automáticamente la gravedad y la penalización de puntos:</p>
                    <ul className="list-disc pl-5 mt-1 space-y-0.5">
                      <li><strong>Incidencia Académica:</strong> 0 puntos (no descuenta del carnet).</li>
                      <li><strong>Conducta Leve (Art. 34):</strong> Descuento automático de 1 a 3 puntos según ROF.</li>
                      <li><strong>Conducta Grave (Art. 37):</strong> Descuento de 5 a 10 puntos con aviso inmediato a Jefatura.</li>
                    </ul>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <strong className="text-slate-900 block mb-1">Paso 4: Medida Inmediata Adoptada</strong>
                    <p>Selecciona la medida correctora inicial (Amonestación verbal, Cambio provisional de sitio, Retirada de móvil al despacho, o Derivación al Aula PAC si la permanencia en clase imposibilita la docencia).</p>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <strong className="text-slate-900 block mb-1">Paso 5: Descripción de los Hechos y Guardado</strong>
                    <p>Redacta una breve síntesis objetiva de lo acontecido. Al pulsar <strong>«Confirmar e Imponer Parte»</strong>, se calcula el saldo de puntos, se genera el parte oficial y se archiva en la cuenta institucional de Drive del centro.</p>
                  </div>
                </div>
              </div>

              {/* Sección 3: Mis partes puestos */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                  <div className="w-6 h-6 rounded-lg bg-sky-100 text-sky-800 flex items-center justify-center font-bold text-xs">3</div>
                  <h4>Seguimiento y Consulta: "Mis Partes Puestos"</h4>
                </div>
                <p className="text-xs text-slate-600">
                  Desde la pestaña superior <strong>«Mis Partes Puestos»</strong> puedes comprobar la evolución de todas las incidencias que has registrado:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                  <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 font-semibold">
                    1. PENDIENTE: Recibido en Jefatura
                  </div>
                  <div className="p-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 font-semibold">
                    2. EN_TRAMITE: Citación a familia
                  </div>
                  <div className="p-2 rounded-lg bg-purple-50 border border-purple-200 text-purple-900 font-semibold">
                    3. MEDIACION: En proceso restaurativo
                  </div>
                  <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 font-semibold">
                    4. RESUELTO: Medida ejecutada
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  En cualquier momento puedes pulsar <strong>«Ver / Imprimir PDF Oficial»</strong> para obtener la copia impresa para el expediente o la familia con el sello oficial del IES Blas Infante.
                </p>
              </div>

              {/* Sección 4: Guardia de PAC */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                  <div className="w-6 h-6 rounded-lg bg-sky-100 text-sky-800 flex items-center justify-center font-bold text-xs">4</div>
                  <h4>Profesorado de Guardia: Módulo "Aula PAC"</h4>
                </div>
                <p className="text-xs text-slate-600">
                  Si estás realizando guardia de convivencia o atención al Aula PAC:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-xs text-slate-600">
                  <li>Entra en la pestaña <strong>«Aula PAC»</strong>.</li>
                  <li>Verás al alumnado que ha sido derivado por sus profesores durante esa hora lectiva.</li>
                  <li>Puedes registrar la recepción del alumno/a, comprobar las tareas académicas encomendadas y anotar observaciones sobre su actitud durante la permanencia en el aula.</li>
                </ul>
              </div>

            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 2: EQUIPO DIRECTIVO Y CONVIVENCIA (Solo Administradores) */}
          {/* ========================================================================= */}
          {isAdmin && currentTab === 'DIRECTIVO' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              
              {/* Introducción */}
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
                <Shield className="w-5 h-5 text-amber-800 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-amber-950 text-sm sm:text-base">
                    Manual de Administración para Jefatura de Estudios y Comisión de Convivencia
                  </h3>
                  <p className="text-xs text-amber-900/80 mt-1">
                    Este perfil dispone de control completo y supervisión global del centro: tramitación de expedientes, gestión del carnet por puntos, control de reincidentes, carga de censos de Séneca, analítica de convivencia y custodia oficial en Google Drive.
                  </p>
                </div>
              </div>

              {/* Sección 1: Feed T-0 */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                  <div className="w-6 h-6 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs">1</div>
                  <h4>Feed Diario (T-0) y Tramitación de Incidencias</h4>
                </div>
                <p className="text-xs text-slate-600">
                  El Feed Diario es el panel de control matinal para Jefatura:
                </p>
                <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-600">
                  <li><strong>Visibilidad en tiempo real:</strong> Muestra todos los partes emitidos en el centro ordenados cronológicamente.</li>
                  <li><strong>Tramitación ágil:</strong> Puedes modificar el estado de cada expediente (<span className="font-semibold text-sky-800">Pendiente &rarr; En Trámite &rarr; Mediación / Sanción &rarr; Resuelto</span>) con un solo clic.</li>
                  <li><strong>Impresión por lotes:</strong> Puedes filtrar los partes del día o de un grupo específico y generar un único documento impreso para citación a familias o firma de Jefatura.</li>
                </ul>
              </div>

              {/* Sección 2: Carnet de Puntos */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                  <div className="w-6 h-6 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs">2</div>
                  <h4>Carnet de Puntos y Régimen Disciplinario (Decreto 327/2010)</h4>
                </div>
                <div className="space-y-3 text-xs text-slate-600">
                  <p>
                    Cada alumno parte con una dotación reglamentaria de <strong>10 puntos iniciales</strong>. El sistema clasifica automáticamente a los alumnos en tres estados:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                      <span className="font-bold text-emerald-950 block">ACTIVO (4 a 10 pts)</span>
                      <p className="text-[11px] text-emerald-800 mt-0.5">Comportamiento ordinario sin medidas especiales de intervención.</p>
                    </div>
                    <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
                      <span className="font-bold text-amber-950 block">ALERTA PUNTOS (1 a 3 pts)</span>
                      <p className="text-[11px] text-amber-800 mt-0.5">Umbral crítico: citación preceptiva al tutor y propuesta de compromisos de convivencia.</p>
                    </div>
                    <div className="p-3 bg-red-50 rounded-xl border border-red-200">
                      <span className="font-bold text-red-950 block">SALDO CERO (0 pts)</span>
                      <p className="text-[11px] text-red-800 mt-0.5">Alerta prioritaria a Dirección/Jefatura para incoación de expediente o corrección extraordinaria.</p>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 mt-2">
                    <strong className="text-slate-900 block mb-1">Restitución y Compensación Positiva de Puntos:</strong>
                    <p>
                      Jefatura y la Comisión de Convivencia pueden compensar puntos por realización de tareas en beneficio de la comunidad escolar, compromisos de convivencia firmados o mediaciones escolares exitosas. El sistema garantiza que las compensaciones nunca superen el techo legal de 10 puntos.
                    </p>
                  </div>
                </div>
              </div>

              {/* Sección 3: Analítica y Memoria */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                  <div className="w-6 h-6 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs">3</div>
                  <h4>Estadísticas, ROF y Memoria Anual del Centro</h4>
                </div>
                <p className="text-xs text-slate-600">
                  La pestaña <strong>«Estadísticas &amp; ROF»</strong> genera automáticamente los indicadores clave para la Comisión de Convivencia y el Consejo Escolar:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-xs text-slate-600">
                  <li><strong>Distribución por grupos:</strong> Detección inmediata de aulas que concentran mayor conflictividad.</li>
                  <li><strong>Mapa temporal:</strong> Tramos horarios y días con mayor índice de partes para reajustar los refuerzos de guardias en pasillos y patios.</li>
                  <li><strong>Informes en 1 clic:</strong> Descarga instantánea de informes completos en PDF y CSV para anexar a la Memoria Final de Curso de Séneca.</li>
                  <li><strong>Comparativa Interanual:</strong> Análisis evolutivo interanual cuando existen cursos escolares archivados.</li>
                </ul>
              </div>

              {/* Sección 4: ETL Séneca y Apertura de Cursos */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                  <div className="w-6 h-6 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs">4</div>
                  <h4>Carga ETL Séneca y Gestión de Cursos Escolares</h4>
                </div>
                <div className="space-y-2 text-xs text-slate-600">
                  <p>
                    Desde la pestaña <strong>«Drive &amp; Carga ETL»</strong>:
                  </p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li><strong>Importación de Alumnado Séneca:</strong> Arrastra el archivo <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-sky-900">.ODS</code> o <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-sky-900">.CSV</code> exportado de Séneca con la relación del alumnado matriculado.</li>
                    <li><strong>Importación de Claustro:</strong> Carga masiva del listado de docentes y tutores de grupo.</li>
                    <li><strong>Bajas y Modificaciones:</strong> Si un alumno o docente se traslada, cámbialo a estado <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-800">INACTIVO</code>. Sus partes históricos se conservan íntegros pero ya no aparecerá en los selectores activos.</li>
                    <li><strong>Apertura y Cierre de Curso Escolar:</strong> Al finalizar el año lectivo, pulsa <em>«Abrir Nuevo Curso Escolar»</em>. El curso saliente se archiva y sella de forma inmutable, y los alumnos inician el nuevo curso con 10 puntos limpios.</li>
                  </ul>
                </div>
              </div>

              {/* Sección 5: Drive y Seguridad RGPD */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                  <div className="w-6 h-6 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs">5</div>
                  <h4>Custodia en Google Drive y Auditoría de Seguridad (RGPD)</h4>
                </div>
                <div className="space-y-2 text-xs text-slate-600">
                  <p>
                    La aplicación garantiza la custodia institucional permanente dentro del ecosistema de la Junta de Andalucía:
                  </p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li><strong>Cuenta Institucional:</strong> <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-900 font-bold">{CUENTA_DRIVE}</code>.</li>
                    <li><strong>Carpeta Oficial Vinculada:</strong> <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-900 font-bold">{CARPETA_DRIVE_ID}</code>.</li>
                    <li><strong>Tests de Seguridad RGPD:</strong> En la barra superior, pulsa <strong>«Tests RGPD»</strong> para auditar en tiempo real los 12 controles de ciberseguridad, inmutabilidad y protección de datos, y exportar el informe para inspección.</li>
                  </ul>
                </div>
              </div>

            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-3.5 bg-slate-100 border-t border-slate-200 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-2 shrink-0 print:hidden">
          <div className="flex items-center gap-1.5">
            <Award className="w-4 h-4 text-sky-700" />
            <span>Documentación Oficial · IES Blas Infante (Córdoba - 14007180)</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl font-semibold cursor-pointer transition-colors shadow-2xs"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir Manual</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-semibold cursor-pointer transition-colors"
            >
              Entendido / Cerrar
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
