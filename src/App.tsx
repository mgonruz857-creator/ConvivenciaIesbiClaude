/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Header 
} from './components/Header';
import { 
  FastParteModal 
} from './components/FastParteModal';
import { 
  DailyFeedView 
} from './components/DailyFeedView';
import { 
  CarnetListView 
} from './components/CarnetListView';
import { 
  MisPartesDocenteView 
} from './components/MisPartesDocenteView';
import { 
  AulaPACMonitor 
} from './components/AulaPACMonitor';
import { 
  AnalyticsView 
} from './components/AnalyticsView';
import { 
  EtlImportView 
} from './components/EtlImportView';
import { 
  OfficialPartePrintModal 
} from './components/OfficialPartePrintModal';
import { 
  DriveAuditModal 
} from './components/DriveAuditModal';
import { 
  SecurityAuditModal 
} from './components/SecurityAuditModal';
import { 
  UserManualModal 
} from './components/UserManualModal';
import { 
  MiPerfilModal 
} from './components/MiPerfilModal';
import { 
  LoginView 
} from './components/LoginView';
import { 
  StorageService 
} from './services/storageService';
import { 
  AuthService 
} from './services/authService';
import { 
  GoogleDriveSyncService 
} from './services/googleDriveSyncService';
import { ExpedienteSancion, 
  Alumno, 
  Profesor, 
  Sancion, 
  Compensacion, 
  AuditLog, 
  EstadoTramitacion, 
  EstadoPAC 
} from './types/convivencia';
import { 
  PROFESORES_INICIALES 
} from './data/seedData';
import { 
  AlertOctagon, 
  ChevronRight, 
  X, 
  ShieldCheck,
  Info,
  Clock
} from 'lucide-react';
import { EntornoBanner } from './components/EntornoBanner';
import { AvisoGuardado } from './components/AvisoGuardado';
import { InformeCambioVersion } from './components/InformeCambioVersion';
import { TutoriaView } from './components/TutoriaView';
import { SancionesView } from './components/SancionesView';
import { EVENTO_SESION_CADUCADA } from './services/apiService';
import { guardarCola, hayCambiosSinSubir, contarCambiosSinSubir } from './services/colaPendiente';
import { CUENTA_DRIVE } from './config/entorno';

export default function App() {
  // Authentication session (null means show LoginView)
  const [currentUser, setCurrentUser] = useState<Profesor | null>(() => {
    // Sin token de servidor (p. ej. sesión de la versión anterior) hay que volver a entrar
    const user = AuthService.getCurrentUser();
    if (user && !AuthService.getToken()) {
      AuthService.logout('MANUAL');
      return null;
    }
    return user;
  });

  // Número de cambios aún no confirmados por el servidor (se muestra en la cabecera)
  const [cambiosSinSubir, setCambiosSinSubir] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setCambiosSinSubir(contarCambiosSinSubir()), 1500);
    return () => clearInterval(id);
  }, []);

  // Antes de cerrar la pestaña: guardar en el navegador lo que no se ha subido y avisar
  useEffect(() => {
    const alCerrar = (e: BeforeUnloadEvent) => {
      const email = AuthService.getCurrentUser()?.email;
      guardarCola(email);
      if (email && hayCambiosSinSubir()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', alCerrar);
    return () => window.removeEventListener('beforeunload', alCerrar);
  }, []);

  // Si el servidor indica que la sesión ya no es válida, volver a la pantalla de acceso
  useEffect(() => {
    const alCaducar = () => {
      AuthService.logout('MANUAL');
      StorageService.clearMemoryCacheForFreshLogin();
      setCurrentUser(null);
    };
    window.addEventListener(EVENTO_SESION_CADUCADA, alCaducar);
    return () => window.removeEventListener(EVENTO_SESION_CADUCADA, alCaducar);
  }, []);

  const [currentView, setCurrentView] = useState<string>('imponer');

  // Application Data States
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [profesores, setProfesores] = useState<Profesor[]>([]);
  const [sanciones, setSanciones] = useState<Sancion[]>([]);
  // Alumno/a elegido al pulsar «Poner Parte» desde su carnet
  const [alumnoParaParte, setAlumnoParaParte] = useState<string | null>(null);
  const [compensaciones, setCompensaciones] = useState<Compensacion[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [expedientes, setExpedientes] = useState<ExpedienteSancion[]>([]);
  // Alumno para el que abrir (o mostrar) el expediente al entrar en Sanciones desde un aviso
  const [sancionParaAlumno, setSancionParaAlumno] = useState<string | null>(null);

  // Modals state
  const [printableParte, setPrintableParte] = useState<Sancion | null>(null);
  const [printableBatch, setPrintableBatch] = useState<Sancion[] | null>(null);
  const [driveModalOpen, setDriveModalOpen] = useState<boolean>(false);
  const [securityModalOpen, setSecurityModalOpen] = useState<boolean>(false);
  const [manualModalOpen, setManualModalOpen] = useState<boolean>(false);
  const [profileModalOpen, setProfileModalOpen] = useState<boolean>(false);
  const [expulsionBannerDismissed, setExpulsionBannerDismissed] = useState<boolean>(false);
  const [carnetInitialFilterEstado, setCarnetInitialFilterEstado] = useState<string>('TODOS');
  const [carnetFocusedAlumnoId, setCarnetFocusedAlumnoId] = useState<string | null>(null);
  const [inactivityWarningSeconds, setInactivityWarningSeconds] = useState<number | null>(null);

  // Monitor de Inactividad y Caducidad de Sesión en Equipos Compartidos (RGPD / ENS)
  useEffect(() => {
    if (!currentUser) return;

    let lastRecordedActivity = Date.now();

    const handleUserActivity = () => {
      const now = Date.now();
      // Throttle a 3 segundos para máxima eficiencia sin lag
      if (now - lastRecordedActivity > 3000) {
        lastRecordedActivity = now;
        AuthService.recordActivity();
        if (inactivityWarningSeconds !== null) {
          setInactivityWarningSeconds(null);
        }
      }
    };

    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    activityEvents.forEach((evt) => {
      window.addEventListener(evt, handleUserActivity, { passive: true });
    });

    // Verificación periódica del estado de la sesión cada 2 segundos
    const checkInterval = setInterval(() => {
      const status = AuthService.getSessionStatus();
      if (!status.isAuthenticated || status.remainingSeconds <= 0) {
        handleLogout('INACTIVITY');
        return;
      }

      if (status.showWarning) {
        setInactivityWarningSeconds(status.remainingSeconds);
      } else {
        setInactivityWarningSeconds(null);
      }
    }, 2000);

    return () => {
      clearInterval(checkInterval);
      activityEvents.forEach((evt) => {
        window.removeEventListener(evt, handleUserActivity);
      });
    };
  }, [currentUser, inactivityWarningSeconds]);

  // Load from StorageService on initial render
  const refreshAllData = () => {
    StorageService.recalcularPuntosAlumnos();
    setAlumnos(StorageService.getAlumnos());
    setProfesores(StorageService.getProfesores());
    setSanciones(StorageService.getSanciones());
    setCompensaciones(StorageService.getCompensaciones());
    setAuditLogs(StorageService.getAuditLogs());
    setExpedientes(StorageService.getExpedientes());
  };

  // Mantener el usuario de la sesión al día si Jefatura cambia su tutoría o su rol
  useEffect(() => {
    if (!currentUser || !StorageService.hasLoadedFromDrive()) return;
    const ficha = profesores.find((p) => p.email.toLowerCase() === currentUser.email.toLowerCase());
    if (!ficha) return;
    const campos: (keyof Profesor)[] = ['tutor_de_grupo', 'tutoria_asignada_por', 'rol', 'nombre', 'apellidos', 'departamento'];
    if (campos.some((c) => (ficha[c] || '') !== (currentUser[c] || ''))) {
      const actualizado: Profesor = { ...currentUser };
      campos.forEach((c) => { (actualizado as any)[c] = ficha[c]; });
      AuthService.persistSession(actualizado, AuthService.isSharedSession());
      setCurrentUser(actualizado);
    }
  }, [profesores]);

  useEffect(() => {
    refreshAllData();

    // Canal de sincronización instantánea entre pestañas abiertas en el mismo navegador
    let broadcastChannel: BroadcastChannel | null = null;
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        broadcastChannel = new BroadcastChannel('sigc_bi_realtime_sync');
        broadcastChannel.onmessage = (event) => {
          if (event.data?.type === 'DATA_UPDATED') {
            refreshAllData();
          }
        };
      }
    } catch {}

    // 1. Sincronización inmediata al arrancar (fuerza carga completa desde Google Drive sin caché)
    const syncFromDrive = (force = true) => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      GoogleDriveSyncService.pullFromGoogleDrive({ forceRefresh: force })
        .then((res) => {
          if (res.success) {
            refreshAllData();
          }
        })
        .catch(() => {});
    };

    syncFromDrive(true);

    // 2. Comprobación periódica de cambios (cada 10 segundos). Si no hay novedades, el servidor
    //    responde solo "sin cambios", sin reenviar la base de datos.
    const intervalId = setInterval(() => syncFromDrive(true), 10000);

    // 3. Sincronización inmediata cuando la pestaña recupera el foco, cambia la visibilidad o vuelve la conexión
    const handleQuickSync = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      syncFromDrive(true);
    };
    window.addEventListener('focus', handleQuickSync);
    window.addEventListener('visibilitychange', handleQuickSync);
    window.addEventListener('online', handleQuickSync);
    window.addEventListener('storage', handleQuickSync);

    return () => {
      clearInterval(intervalId);
      if (broadcastChannel) {
        broadcastChannel.close();
      }
      window.removeEventListener('focus', handleQuickSync);
      window.removeEventListener('visibilitychange', handleQuickSync);
      window.removeEventListener('online', handleQuickSync);
      window.removeEventListener('storage', handleQuickSync);
    };
  }, []);

  // Ensure currentView is permitted whenever user changes
  useEffect(() => {
    if (currentUser) {
      if (!AuthService.isViewAllowed(currentUser, currentView)) {
        setCurrentView('imponer');
      }
    }
  }, [currentUser, currentView]);

  // Quick lookup map of Alumnos
  const alumnoMap = useMemo(() => {
    return new Map<string, Alumno>(alumnos.map(a => [a.id_alumno, a]));
  }, [alumnos]);

  // Students with 0 points (V0 minimum alert to Jefatura/Convivencia)
  const alumnosConCeroPuntos = useMemo(() => {
    return alumnos.filter(a => a.puntos_actuales === 0);
  }, [alumnos]);

  const handleLoginSuccess = (user: Profesor) => {
    refreshAllData();
    setCurrentUser(user);
    if (AuthService.isAdmin(user)) {
      setCurrentView('feed');
    } else {
      setCurrentView('imponer');
    }
    // Refrescar inmediatamente desde Google Drive tras el inicio de sesión
    GoogleDriveSyncService.pullFromGoogleDrive({ forceRefresh: true })
      .then((res) => {
        if (res.success) {
          refreshAllData();
        }
      })
      .catch(() => {});
  };

  const handleLogout = (reason: 'MANUAL' | 'INACTIVITY' = 'MANUAL') => {
    AuthService.logout(reason);
    StorageService.clearMemoryCacheForFreshLogin();
    setCurrentUser(null);
    setInactivityWarningSeconds(null);
  };

  // Safe navigation handler enforcing role access and triggering immediate fresh data pull
  const handleNavigate = (view: string) => {
    if (!AuthService.isViewAllowed(currentUser, view)) {
      setCurrentView('imponer');
      return;
    }
    setAlumnoParaParte(null);
    setCurrentView(view);
    GoogleDriveSyncService.pullFromGoogleDrive({ forceRefresh: true })
      .then((res) => {
        if (res.success) {
          refreshAllData();
        }
      })
      .catch(() => {});
  };

  const notifyLocalSync = () => {
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        const bc = new BroadcastChannel('sigc_bi_realtime_sync');
        bc.postMessage({ type: 'DATA_UPDATED', timestamp: Date.now() });
        bc.close();
      }
    } catch {}
  };

  // Submission handler for Fast Parte Modal (<30s)
  const handleImponerSancion = (
    sancionData: Omit<Sancion, 'id_sancion' | 'numero_expediente' | 'url_pdf_drive'>
  ) => {
    const userEmail = currentUser ? currentUser.email : 'mgonruz857@g.educaand.es';
    const result = StorageService.imponerSancion(sancionData, userEmail);
    refreshAllData();
    notifyLocalSync();
    // Auto-sincronización transparente ultrarrápida en segundo plano con Google Drive
    GoogleDriveSyncService.triggerFastSync(100);
    return result;
  };

  // Update tramitation status (call made, parte printed, resolved)
  const handleUpdateTramitacion = (
    idSancion: string,
    nuevoEstado: EstadoTramitacion,
    observaciones: string
  ) => {
    const userEmail = currentUser ? currentUser.email : 'mgonruz857@g.educaand.es';
    StorageService.actualizarTramitacion(idSancion, nuevoEstado, observaciones, userEmail);
    refreshAllData();
    notifyLocalSync();
    GoogleDriveSyncService.triggerFastSync(200);
  };

  // Update Aula PAC status (arrived, tasks completed)
  const handleUpdatePACStatus = (
    idSancion: string,
    nuevoEstadoPAC: EstadoPAC,
    profesorReceptor: string
  ) => {
    const userEmail = currentUser ? currentUser.email : 'mgonruz857@g.educaand.es';
    StorageService.actualizarEstadoPAC(idSancion, nuevoEstadoPAC, profesorReceptor, userEmail);
    refreshAllData();
    notifyLocalSync();
    GoogleDriveSyncService.triggerFastSync(200);
  };

  // Restitution / Compensation of points
  const handleRegistrarCompensacion = (
    compData: Omit<Compensacion, 'id_compensacion' | 'timestamp'>
  ) => {
    const userEmail = currentUser ? currentUser.email : 'mgonruz857@g.educaand.es';
    StorageService.registrarCompensacion(compData, userEmail);
    refreshAllData();
    notifyLocalSync();
    GoogleDriveSyncService.triggerFastSync(200);
  };

  // Deletion of parte (exclusive to Convivencia Team / Admin)
  const handleDeleteParte = (idSancion: string, motivo: string) => {
    const userEmail = currentUser ? currentUser.email : 'mgonruz857@g.educaand.es';
    const result = StorageService.eliminarSancion(idSancion, userEmail, motivo);
    refreshAllData();
    notifyLocalSync();
    GoogleDriveSyncService.triggerFastSync(100);
    return result;
  };

  // Modification of parte (Convivencia Team / Admin / Author)
  const handleEditParte = (idSancion: string, cambios: Partial<Sancion>, motivo: string) => {
    const userEmail = currentUser ? currentUser.email : 'mgonruz857@g.educaand.es';
    const result = StorageService.modificarSancion(idSancion, cambios, userEmail, motivo);
    refreshAllData();
    notifyLocalSync();
    GoogleDriveSyncService.triggerFastSync(100);
    return result;
  };

  // Reset all data to initial seed
  const handleResetData = () => {
    const userEmail = currentUser ? currentUser.email : 'mgonruz857@g.educaand.es';
    StorageService.resetToSeed(userEmail);
    refreshAllData();
    notifyLocalSync();
    GoogleDriveSyncService.triggerFastSync(0);
    setDriveModalOpen(false);
  };

  // 1. Initial Login Screen if no user session
  if (!currentUser) {
    return (
      <>
        <EntornoBanner />
        <LoginView onLoginSuccess={handleLoginSuccess} />
      </>
    );
  }

  const isAdmin = AuthService.isAdmin(currentUser);

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50/40 via-slate-50 to-blue-50/30 flex flex-col text-slate-800 font-sans selection:bg-sky-200 selection:text-sky-900">
      <EntornoBanner />
      <AvisoGuardado />
      {isAdmin && <InformeCambioVersion alumnos={alumnos} sanciones={sanciones} profesores={profesores} onCambio={refreshAllData} />}
      {/* Top Bar Header with pastel styling & role-based tabs */}
      <Header
        currentView={currentView}
        onNavigate={handleNavigate}
        currentUser={currentUser}
        onSwitchUser={(user) => {
          setCurrentUser(user);
          AuthService.persistSession(user, AuthService.isSharedSession());
        }}
        profesoresDisponibles={profesores.length > 0 ? profesores.filter(p => p.estado !== 'INACTIVO') : PROFESORES_INICIALES}
        pendingSyncCount={cambiosSinSubir}
        onManualSync={async () => {
          const res = await GoogleDriveSyncService.pullFromGoogleDrive({ forceRefresh: true });
          if (res.success) {
            refreshAllData();
          }
        }}
        onOpenDriveModal={() => setDriveModalOpen(true)}
        onOpenSecurityModal={() => setSecurityModalOpen(true)}
        onOpenManualModal={() => setManualModalOpen(true)}
        onOpenProfileModal={() => setProfileModalOpen(true)}
        onLogout={handleLogout}
      />

      {/* Role notice banner for teachers / Non-admin users */}
      {!isAdmin && (
        <div className="bg-sky-50 border-b border-sky-200/80 px-4 py-2 text-xs text-sky-950 flex items-center justify-between">
          <div className="flex items-center gap-2 max-w-7xl mx-auto flex-1">
            <Info className="w-4 h-4 text-sky-700 shrink-0" />
            <span>
              <strong>Sesión Docente ({currentUser.nombre}):</strong> Puedes registrar partes rápidos (<strong>+ Nuevo Parte</strong>), consultar tu historial (<strong>Mis Partes Puestos</strong>), atender guardias (<strong>Aula PAC</strong>) y actualizar tus datos personales (<strong>Mi Perfil</strong>).
            </span>
          </div>
        </div>
      )}

      {/* Global Alert Banner for 0 Points (V0 - Sección 7 & 9) - Visible únicamente para administradores / Jefatura */}
      {isAdmin && alumnosConCeroPuntos.length > 0 && !expulsionBannerDismissed && (
        <div className="bg-rose-900 text-white px-4 py-2.5 text-xs flex items-center justify-between border-b border-rose-950 shadow-xs">
          <div className="flex items-center gap-2 max-w-7xl mx-auto flex-1 flex-wrap">
            <AlertOctagon className="w-4 h-4 text-rose-300 shrink-0" />
            <span>
              <strong>Aviso a Jefatura de Estudios / Convivencia (V0):</strong> Se registran {alumnosConCeroPuntos.length} alumno(s) con saldo 0 puntos para su valoración disciplinaria:{' '}
              {alumnosConCeroPuntos.map((a, idx) => (
                <span key={a.id_alumno}>
                  {idx > 0 && ', '}
                  <button
                    type="button"
                    onClick={() => {
                      setCarnetInitialFilterEstado('SALDO_CERO');
                      setCarnetFocusedAlumnoId(a.id_alumno);
                      setCurrentView('carnet');
                    }}
                    className="underline font-bold text-rose-200 hover:text-white cursor-pointer"
                    title={`Ver ficha y movimientos de ${a.nombre} ${a.apellidos}`}
                  >
                    {a.nombre} {a.apellidos} ({a.grupo})
                  </button>
                </span>
              ))}. (Recordatorio: la app no impone expulsiones automáticas).
            </span>
            <button
              type="button"
              onClick={() => {
                setCarnetInitialFilterEstado('SALDO_CERO');
                if (alumnosConCeroPuntos.length > 0) {
                  setCarnetFocusedAlumnoId(alumnosConCeroPuntos[0].id_alumno);
                }
                setCurrentView('carnet');
              }}
              className="bg-white text-rose-950 font-bold px-2.5 py-1 rounded-lg text-xs hover:bg-rose-100 transition-colors shadow-2xs cursor-pointer ml-2 shrink-0 inline-flex items-center gap-1 active:scale-98"
            >
              <span>Ver en Carnet</span>
              <span>&rarr;</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const sinExpediente = StorageService.getAlumnosPendientesDeExpediente();
                setSancionParaAlumno(sinExpediente.length === 1 ? sinExpediente[0].id_alumno : (alumnosConCeroPuntos.length === 1 ? alumnosConCeroPuntos[0].id_alumno : null));
                setCurrentView('sanciones');
              }}
              className="bg-amber-300 text-rose-950 font-bold px-2.5 py-1 rounded-lg text-xs hover:bg-amber-200 transition-colors shadow-2xs cursor-pointer ml-2 shrink-0 inline-flex items-center gap-1 active:scale-98"
              title="Ir a Sanciones para abrir el expediente y marcar los trámites"
            >
              <span>{alumnosConCeroPuntos.length === 1 ? 'Abrir expediente de sanción' : 'Ir a Sanciones'}</span>
              <span>&rarr;</span>
            </button>
          </div>
          <button
            type="button"
            onClick={() => setExpulsionBannerDismissed(true)}
            className="p-1 hover:bg-rose-800 rounded text-rose-300 ml-2 cursor-pointer"
            title="Ocultar aviso"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Viewport Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {currentView === 'imponer' && (
          <FastParteModal
            alumnos={alumnos}
            profesores={profesores}
            currentUser={currentUser}
            onSubmitSancion={handleImponerSancion}
            onPrintParte={(sancion) => setPrintableParte(sancion)}
            alumnoInicialId={alumnoParaParte}
            onDone={() => {
              setAlumnoParaParte(null);
              if (isAdmin) {
                setCurrentView('feed');
              } else {
                setCurrentView('mis_partes');
              }
            }}
          />
        )}

        {/* Views strictly restricted to Admin (mgonruz857@g.educaand.es) */}
        {isAdmin && currentView === 'feed' && (
          <DailyFeedView
            sanciones={sanciones}
            alumnos={alumnos}
            profesores={profesores}
            currentUser={currentUser}
            onUpdateTramitacion={handleUpdateTramitacion}
            onPrintSingleParte={(sancion) => setPrintableParte(sancion)}
            onPrintBatchToday={(batch) => setPrintableBatch(batch)}
            onNavigateToImponer={() => setCurrentView('imponer')}
            onNavigateToCarnet={(idAlumno) => {
              if (idAlumno) setCarnetFocusedAlumnoId(idAlumno);
              setCurrentView('carnet');
            }}
            onNavigateToPAC={() => setCurrentView('pac')}
            onDeleteParte={handleDeleteParte}
            onEditParte={handleEditParte}
          />
        )}

        {isAdmin && currentView === 'carnet' && (
          <CarnetListView
            alumnos={alumnos}
            sanciones={sanciones}
            profesores={profesores}
            compensaciones={compensaciones}
            currentUser={currentUser}
            initialFilterEstado={carnetInitialFilterEstado}
            focusedAlumnoId={carnetFocusedAlumnoId}
            onClearFocusedAlumno={() => setCarnetFocusedAlumnoId(null)}
            onSelectAlumnoForParte={(idAlumno) => {
              setAlumnoParaParte(idAlumno);
              setCurrentView('imponer');
            }}
            onPrintParte={(sancion) => setPrintableParte(sancion)}
            onDataChanged={() => {
              refreshAllData();
              notifyLocalSync();
              GoogleDriveSyncService.triggerFastSync(150);
            }}
            onDeleteParte={handleDeleteParte}
            onEditParte={handleEditParte}
          />
        )}

        {/* Historial Individual de Partes para el Profesorado Docente */}
        {isAdmin && currentView === 'sanciones' && (
          <SancionesView
            currentUser={currentUser}
            alumnos={alumnos}
            expedientes={expedientes}
            abrirParaAlumno={sancionParaAlumno}
            onAbrirParaAlumnoAtendido={() => setSancionParaAlumno(null)}
            onDataChanged={() => {
              refreshAllData();
              notifyLocalSync();
              GoogleDriveSyncService.triggerFastSync(150);
            }}
          />
        )}

        {currentView === 'tutoria' && currentUser.tutor_de_grupo && (
          <TutoriaView
            currentUser={currentUser}
            alumnos={alumnos}
            sanciones={sanciones}
            expedientes={expedientes}
            onPrintParte={(sancion) => setPrintableParte(sancion)}
          />
        )}

        {currentView === 'mis_partes' && (
          <MisPartesDocenteView
            sanciones={sanciones}
            alumnos={alumnos}
            profesores={profesores}
            currentUser={currentUser}
            onPrintSingleParte={(sancion) => setPrintableParte(sancion)}
            onNavigateToImponer={() => setCurrentView('imponer')}
            onDeleteParte={handleDeleteParte}
            onEditParte={handleEditParte}
            onManualSync={async () => {
              const res = await GoogleDriveSyncService.pullFromGoogleDrive({ forceRefresh: true });
              if (res.success) {
                refreshAllData();
              }
            }}
          />
        )}

        {/* Aula PAC: Accessible by both Admin and Pepe (para atender al alumnado) */}
        {currentView === 'pac' && (
          <AulaPACMonitor
            sanciones={sanciones}
            alumnos={alumnos}
            currentUser={currentUser}
            onUpdatePACStatus={handleUpdatePACStatus}
          />
        )}

        {/* Analytics & Stats: strictly restricted to Admin */}
        {isAdmin && currentView === 'analitica' && (
          <AnalyticsView
            sanciones={sanciones}
            alumnos={alumnos}
            compensaciones={compensaciones}
            onNavigateToCarnet={(idAlumno) => {
              if (idAlumno) setCarnetFocusedAlumnoId(idAlumno);
              setCurrentView('carnet');
            }}
          />
        )}

        {/* Drive ETL & Seneca Ingest: strictly restricted to Admin */}
        {isAdmin && currentView === 'etl' && (
          <EtlImportView
            currentUser={currentUser}
            onImportCompleted={() => {
              refreshAllData();
              notifyLocalSync();
              GoogleDriveSyncService.triggerFastSync(150);
            }}
            auditLogs={auditLogs}
            profesores={profesores}
            alumnos={alumnos}
          />
        )}
      </main>

      {/* Official Disciplinary Report Printable Modal (Junta de Andalucía / IES Blas Infante) */}
      {(printableParte || printableBatch) && (
        <OfficialPartePrintModal
          sancion={printableParte || undefined}
          sancionesBatch={printableBatch || undefined}
          alumnoMap={alumnoMap}
          onClose={() => {
            setPrintableParte(null);
            setPrintableBatch(null);
          }}
        />
      )}

      {/* Google Drive Persistence & Security Audit Modal (Solo Administradores) */}
      {isAdmin && driveModalOpen && (
        <DriveAuditModal
          onClose={() => setDriveModalOpen(false)}
          auditLogs={auditLogs}
          sanciones={sanciones}
          alumnos={alumnos}
          currentUserEmail={currentUser.email}
          onResetData={handleResetData}
        />
      )}

      {/* Tests de Seguridad y Protección de Datos RGPD (Solo Administradores) */}
      {isAdmin && securityModalOpen && (
        <SecurityAuditModal
          isOpen={securityModalOpen}
          onClose={() => setSecurityModalOpen(false)}
          currentUserEmail={currentUser.email}
        />
      )}

      {/* Manual de Funcionamiento (Disponible para Claustro y Equipo Directivo con RBAC estricto) */}
      <UserManualModal
        isOpen={manualModalOpen}
        onClose={() => setManualModalOpen(false)}
        isAdmin={isAdmin}
      />

      {/* Gestión de Datos Personales del Docente (Mi Perfil) */}
      {profileModalOpen && (
        <MiPerfilModal
          currentUser={currentUser}
          onClose={() => setProfileModalOpen(false)}
          onProfileUpdated={(updatedUser) => {
            setCurrentUser(updatedUser);
            refreshAllData();
          }}
        />
      )}

      {/* Modal de Advertencia de Inactividad Próxima a Expirar (RGPD / Equipos Compartidos) */}
      {inactivityWarningSeconds !== null && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-amber-300 text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-600 shadow-inner">
              <Clock className="w-8 h-8 animate-pulse" />
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full">
                Seguridad de Sesión · RGPD
              </span>
              <h3 className="text-lg font-extrabold text-slate-900 mt-2">
                ¿Sigues ahí? Cierre por inactividad
              </h3>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                Por seguridad de datos del centro en este equipo compartido, tu sesión se cerrará automáticamente en:
              </p>
              
              <div className="mt-3 py-2 px-5 inline-block bg-amber-50 border border-amber-300 rounded-xl shadow-2xs">
                <span className="text-3xl font-extrabold font-mono text-amber-700">
                  {inactivityWarningSeconds}s
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  AuthService.recordActivity();
                  setInactivityWarningSeconds(null);
                }}
                className="w-full sm:flex-1 py-3 px-4 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Continuar conectado</span>
              </button>

              <button
                type="button"
                onClick={() => handleLogout('MANUAL')}
                className="w-full sm:w-auto py-3 px-4 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer (Pastel blue aesthetic) */}
      <footer className="mt-auto border-t border-sky-100 bg-white/90 py-4 px-4 sm:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sky-950">SIGC-BI v2.0</span>
            <span>·</span>
            <span>IES Blas Infante (Córdoba)</span>
            <span>·</span>
            <span className="font-mono text-[11px] text-sky-800">Código Centro: 14007180</span>
          </div>

          <div className="flex items-center gap-4 text-[11px]">
            <span>Decreto 327/2010</span>
            <span>·</span>
            <span>Almacenamiento Centro: <strong className="font-mono text-sky-950">{CUENTA_DRIVE}</strong></span>
            <span>·</span>
            <span className="text-sky-700 font-medium">Google Workspace for Education</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
