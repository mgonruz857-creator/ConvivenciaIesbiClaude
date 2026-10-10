/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  AlertCircle, 
  Loader2,
  CheckCircle2,
  Lock,
  Mail,
  Eye,
  EyeOff,
  UserCheck,
  Cloud,
  Layers,
  ArrowRight,
  KeyRound,
  Check,
  Info,
  Laptop,
  Users,
  Clock,
  ShieldAlert,
  RefreshCw,
  X
} from 'lucide-react';
import { AuthService } from '../services/authService';
import { StorageService } from '../services/storageService';
import { GoogleDriveSyncService } from '../services/googleDriveSyncService';
import { Profesor } from '../types/convivencia';
import iesLogo from '../assets/images/logo_rectangular_iesbi.png';
import juntaLogo from '../assets/images/junta_andalucia_logo.jpg';

interface LoginViewProps {
  onLoginSuccess: (user: Profesor) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [authStage, setAuthStage] = useState<string | null>(null);
  const [isSharedDevice, setIsSharedDevice] = useState<boolean>(true);
  const [inactivityNotice, setInactivityNotice] = useState<string | null>(null);

  // Comprobar si hubo un cierre de sesión automático por inactividad
  useEffect(() => {
    const r = AuthService.consumeLogoutReason();
    if (r?.motivo === 'INACTIVITY') {
      setInactivityNotice(
        '🔒 Su sesión se ha cerrado automáticamente por inactividad para garantizar la protección de datos (RGPD/ENS).'
      );
    } else if (r?.motivo === 'SERVIDOR') {
      setInactivityNotice('🔒 El servidor ha cerrado la sesión: ' + (r.mensaje || 'la sesión ya no es válida.') + ' Vuelva a entrar.');
    } else if (r?.motivo === 'SIN_SESION') {
      setInactivityNotice('🔒 La sesión se ha cerrado en este navegador (por ejemplo, desde otra pestaña). Vuelva a entrar.');
    }
  }, []);

  // Al montar la pantalla de acceso se vacían los datos en memoria (se descargan al entrar)
  useEffect(() => {
    StorageService.clearMemoryCacheForFreshLogin();
  }, []);

  const cleanEmail = email.trim().toLowerCase();
  const isEducaand = /^[a-z0-9._%+-]+@g\.educaand\.es$/i.test(cleanEmail);

  // Estado de la cuenta según el servidor (alta en el claustro, activa y si ya tiene contraseña)
  const [estadoCuenta, setEstadoCuenta] = useState<{
    email: string;
    registrado?: boolean;
    activo?: boolean;
    tieneClave?: boolean;
    motivoBaja?: string;
  } | null>(null);
  const [isCheckingUserCredentials, setIsCheckingUserCredentials] = useState(false);

  useEffect(() => {
    if (!isEducaand) {
      setEstadoCuenta(null);
      return;
    }
    let vigente = true;
    setIsCheckingUserCredentials(true);
    const t = setTimeout(() => {
      AuthService.consultarCuenta(cleanEmail)
        .then((r) => {
          if (!vigente) return;
          setEstadoCuenta(r.ok ? { email: cleanEmail, ...r } : null);
          // Si solo es lentitud o falta de conexión, no se muestra error: el inicio de sesión lo dirá si hace falta
          if (!r.ok && r.error && (r as any).codigo !== 'SIN_CONEXION') setErrorMessage(r.error);
        })
        .finally(() => {
          if (vigente) setIsCheckingUserCredentials(false);
        });
    }, 400);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [cleanEmail, isEducaand]);

  const estadoActual = estadoCuenta && estadoCuenta.email === cleanEmail ? estadoCuenta : null;
  const registeredTeacher = Boolean(estadoActual?.registrado && estadoActual?.activo);
  const cuentaNoRegistrada = Boolean(estadoActual && !estadoActual.registrado);
  const cuentaDeBaja = Boolean(estadoActual?.registrado && estadoActual.activo === false);
  const requiresPasswordChange = false;
  const isDriveSyncing = false;
  // Primer acceso (o contraseña restablecida por Jefatura): se escribe dos veces
  const isFirstTimeAccess = Boolean(registeredTeacher && estadoActual?.tieneClave === false && !isCheckingUserCredentials);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!isEducaand) {
      setErrorMessage('Acceso restringido: El usuario debe pertenecer al dominio corporativo oficial @g.educaand.es de la Junta de Andalucía.');
      return;
    }
    if (cuentaDeBaja) {
      setErrorMessage(`Acceso bloqueado: La cuenta "${cleanEmail}" está dada de baja en el centro${estadoActual?.motivoBaja ? ` (${estadoActual.motivoBaja})` : ''}.`);
      return;
    }
    if (!password.trim()) {
      setErrorMessage('Por favor, introduzca su contraseña.');
      return;
    }
    if (isFirstTimeAccess) {
      if (password !== confirmPassword) {
        setErrorMessage('Las contraseñas no coinciden. Por favor, asegúrese de escribir la misma en ambas casillas.');
        return;
      }
      const complexity = AuthService.validatePasswordComplexity(password);
      if (!complexity.valid) {
        setErrorMessage(`Requisitos de contraseña: ${complexity.error}`);
        return;
      }
    }

    setIsLoading(true);
    setAuthStage(isFirstTimeAccess ? 'Registrando su contraseña de forma segura...' : 'Comprobando sus credenciales...');
    const res = await AuthService.login(cleanEmail, password, isSharedDevice);

    if (res.success && res.user) {
      // Preparar los datos antes de mostrar la app (vienen con la respuesta del inicio de sesión)
      setAuthStage('Cargando datos del centro...');
      try {
        await GoogleDriveSyncService.pullFromGoogleDrive({ forceRefresh: true });
      } catch {
        /* la app volverá a intentarlo enseguida */
      }
      setIsLoading(false);
      setAuthStage(null);
      onLoginSuccess(res.user);
    } else {
      setIsLoading(false);
      setAuthStage(null);
      setErrorMessage(res.error || 'No se ha podido iniciar sesión.');
      // Por si otra persona fijó la contraseña mientras tanto, refrescar el estado
      AuthService.consultarCuenta(cleanEmail).then((r) => r.ok && setEstadoCuenta({ email: cleanEmail, ...r }));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-blue-50/50 to-slate-100 flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8 text-slate-800">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* Institutional Dual Logos: Junta de Andalucía + IES Blas Infante */}
        <div className="inline-flex items-center justify-center gap-3 p-2.5 bg-white rounded-2xl shadow-xs border border-sky-100 mb-3">
          <div className="h-14 w-24 flex items-center justify-center p-1 border-r border-slate-200 pr-2">
            <img
              src={juntaLogo}
              alt="Junta de Andalucía"
              className="h-12 w-auto max-w-[85px] object-contain"
            />
          </div>
          <div className="h-14 w-14 flex items-center justify-center p-0.5">
            <img
              src={iesLogo}
              alt="IES Blas Infante Córdoba"
              className="w-12 h-12 object-contain"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>
        </div>

        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          SIGC-BI
        </h1>
        <p className="text-xs font-semibold text-sky-800 uppercase tracking-wider mt-0.5">
          Sistema de Convivencia y Carnet de Puntos
        </p>
        <p className="text-xs text-slate-500 font-medium mt-1">
          IES Blas Infante · Córdoba (Código Centro: 14007180)
        </p>
        <p className="text-[11px] text-emerald-800 font-semibold mt-0.5">
          Junta de Andalucía · Consejería de Desarrollo Educativo y FP
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-sm border border-sky-100 sm:rounded-2xl sm:px-8 space-y-5">
          
          {/* Inactivity Auto-Logout notice banner */}
          {inactivityNotice && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2.5 animate-in fade-in duration-100">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1 leading-snug">
                {inactivityNotice}
              </div>
              <button
                type="button"
                onClick={() => setInactivityNotice(null)}
                className="text-amber-500 hover:text-amber-800 p-0.5 cursor-pointer"
                title="Cerrar aviso"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Error message */}
          {errorMessage && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2.5 animate-in fade-in duration-100">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span className="leading-snug">{errorMessage}</span>
            </div>
          )}

          {/* Loading / Status Stage */}
          {isLoading && authStage && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-center gap-2.5 animate-in fade-in duration-100">
              <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
              <span className="font-medium">{authStage}</span>
            </div>
          )}

          {/* Formulario de Acceso Único Centralizado */}
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            
            {/* Campo de Correo Corporativo */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  Usuario del Claustro (@g.educaand.es)
                </label>
                <span className="text-[10px] font-mono bg-sky-100 text-sky-900 border border-sky-200 px-1.5 py-0.5 rounded font-bold">
                  @g.educaand.es
                </span>
              </div>
              <div className="relative rounded-xl shadow-2xs">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="usuario@g.educaand.es"
                  className={`block w-full pl-10 pr-3.5 py-2.5 text-xs border rounded-xl focus:ring-2 text-slate-900 font-mono placeholder:font-sans placeholder:text-slate-400 bg-white transition-colors ${
                    email.includes('@') && !isEducaand
                      ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/20 bg-rose-50/20'
                      : registeredTeacher
                      ? 'border-emerald-400 focus:border-emerald-500 focus:ring-emerald-500/20 bg-emerald-50/10'
                      : 'border-slate-200 focus:border-sky-600 focus:ring-sky-600/20'
                  }`}
                />
              </div>

              {/* Autocompletar rápido si teclea solo el nombre de usuario */}
              {email.trim().length > 0 && !email.includes('@') && (
                <button
                  type="button"
                  onClick={() => setEmail(`${email.trim()}@g.educaand.es`)}
                  className="mt-1.5 text-[11px] text-sky-700 hover:text-sky-900 font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>¿Completar como</span>
                  <code className="font-mono bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200 text-sky-900">
                    {email.trim()}@g.educaand.es
                  </code>
                  <span>?</span>
                </button>
              )}

              {/* Advertencia si el dominio no es @g.educaand.es */}
              {email.includes('@') && !isEducaand && (
                <div className="flex items-center gap-1.5 text-[11px] text-rose-700 font-semibold mt-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-600" />
                  <span>Dominio no corporativo: Solo se permite <strong>@g.educaand.es</strong></span>
                </div>
              )}

              {/* Feedback en verde si el docente está en el claustro */}
              {isEducaand && registeredTeacher && (
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-800 font-medium mt-1.5 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-lg animate-in fade-in duration-100">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                  <span>Cuenta del claustro verificada.</span>
                </div>
              )}

              {/* Feedback en rojo si el docente NO está en el claustro */}
              {isEducaand && cuentaNoRegistrada && (
                <div className="flex items-center gap-1.5 text-[11px] text-rose-800 font-medium mt-1.5 bg-rose-50 border border-rose-200 px-2.5 py-1.5 rounded-lg animate-in fade-in duration-100">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-600" />
                  <span>Cuenta no registrada en el claustro del IES Blas Infante. Debe ser dada de alta previamente por Jefatura.</span>
                </div>
              )}
            </div>

            {/* Indicador de verificación de credenciales con Google Drive */}
            {isCheckingUserCredentials && isEducaand && (
              <div className="p-2.5 bg-sky-50 border border-sky-200 rounded-xl text-xs text-sky-800 flex items-center gap-2 animate-in fade-in duration-100">
                <Loader2 className="w-3.5 h-3.5 text-sky-600 animate-spin shrink-0" />
                <span className="font-medium">Comprobando la cuenta...</span>
              </div>
            )}

            {/* Aviso informativo de PRIMER ACCESO o CAMBIO DE CONTRASEÑA */}
            {isFirstTimeAccess && (
              <div className={`p-3 rounded-xl text-xs space-y-1.5 animate-in fade-in duration-150 border ${
                requiresPasswordChange 
                  ? 'bg-amber-50/90 border-amber-300 text-amber-950' 
                  : 'bg-sky-50 border-sky-200 text-sky-950'
              }`}>
                <div className="flex items-center gap-1.5 font-bold">
                  {requiresPasswordChange ? (
                    <RefreshCw className="w-4 h-4 text-amber-700 animate-spin-reverse" />
                  ) : (
                    <KeyRound className="w-4 h-4 text-sky-600" />
                  )}
                  <span>
                    {requiresPasswordChange 
                      ? 'Actualización de Seguridad: Define tu nueva contraseña' 
                      : 'Primer Acceso: Establece tu contraseña corporativa'}
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-700">
                  {requiresPasswordChange 
                    ? 'Jefatura de Estudios ha solicitado que establezcas una nueva contraseña para continuar. Introduce una clave de al menos 6 caracteres combinando letras y números (ej: infante26).' 
                    : 'Esta es tu primera vez accediendo al sistema. Introduce una contraseña que contenga al menos 6 caracteres combinando letras y números (ejemplo: infante26, blas2026). Se guardará de forma centralizada para que puedas usarla en cualquier equipo.'}
                </p>
              </div>
            )}

            {/* Campo de Contraseña */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  {isFirstTimeAccess 
                    ? (requiresPasswordChange ? 'Nueva Contraseña Requerida' : 'Nueva Contraseña') 
                    : 'Contraseña de Acceso'}
                </label>
                {isFirstTimeAccess && (
                  <span className="text-[10px] text-amber-800 bg-amber-100 font-semibold px-1.5 py-0.5 rounded border border-amber-200">
                    Mín. 6 caráct. (letras y números)
                  </span>
                )}
              </div>
              <div className="relative rounded-xl shadow-2xs">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isFirstTimeAccess ? 'Crea tu contraseña (ej: infante26)' : 'Introduce tu contraseña'}
                  className="block w-full pl-10 pr-10 py-2.5 text-xs border border-slate-200 rounded-xl focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20 text-slate-900 bg-white transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                  title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirmar Contraseña (Solo en Primer Acceso) */}
            {isFirstTimeAccess && (
              <div className="animate-in fade-in duration-150">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    Confirmar Nueva Contraseña
                  </label>
                  {password && confirmPassword && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                      password === confirmPassword 
                        ? 'text-emerald-800 bg-emerald-100 border border-emerald-200' 
                        : 'text-rose-800 bg-rose-100 border border-rose-200'
                    }`}>
                      {password === confirmPassword ? '✓ Coinciden' : '✗ No coinciden'}
                    </span>
                  )}
                </div>
                <div className="relative rounded-xl shadow-2xs">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repite la contraseña elegida"
                    className={`block w-full pl-10 pr-10 py-2.5 text-xs border rounded-xl focus:ring-2 text-slate-900 bg-white transition-colors ${
                      confirmPassword && password !== confirmPassword 
                        ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/20' 
                        : 'border-slate-200 focus:border-sky-600 focus:ring-sky-600/20'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                    title={showConfirmPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* Selector de Seguridad: Equipo Compartido vs Personal (RGPD) */}
            <div className="p-3 bg-slate-50 border border-slate-200/90 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-sky-700" />
                  <span>Seguridad de Sesión y Dispositivo</span>
                </label>
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-sky-100 text-sky-900 border border-sky-200">
                  RGPD / ENS
                </span>
              </div>

              <div className="grid grid-cols-1 gap-1.5">
                {/* Opción 1: Equipo compartido del centro (Predeterminada por seguridad) */}
                <label
                  className={`flex items-start gap-2.5 p-2 rounded-lg border text-left cursor-pointer transition-all ${
                    isSharedDevice
                      ? 'bg-sky-50/90 border-sky-300 ring-1 ring-sky-300 shadow-2xs'
                      : 'bg-white border-slate-200 hover:bg-slate-50 opacity-80'
                  }`}
                >
                  <input
                    type="radio"
                    name="deviceSecurityMode"
                    checked={isSharedDevice}
                    onChange={() => setIsSharedDevice(true)}
                    className="mt-0.5 text-sky-600 focus:ring-sky-500 cursor-pointer"
                  />
                  <div className="flex-1 text-xs">
                    <div className="flex items-center gap-1.5 font-bold text-slate-800">
                      <Users className="w-3.5 h-3.5 text-sky-700 shrink-0" />
                      <span>Equipo compartido del centro</span>
                      <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1 py-0.2 rounded font-bold border border-emerald-200">
                        Recomendado
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                      Sala de profesores, aulas, ordenadores de guardia. <strong>Cierra sesión tras 15 min de inactividad o al cerrar la ventana</strong>.
                    </p>
                  </div>
                </label>

                {/* Opción 2: Portátil personal */}
                <label
                  className={`flex items-start gap-2.5 p-2 rounded-lg border text-left cursor-pointer transition-all ${
                    !isSharedDevice
                      ? 'bg-sky-50/90 border-sky-300 ring-1 ring-sky-300 shadow-2xs'
                      : 'bg-white border-slate-200 hover:bg-slate-50 opacity-80'
                  }`}
                >
                  <input
                    type="radio"
                    name="deviceSecurityMode"
                    checked={!isSharedDevice}
                    onChange={() => setIsSharedDevice(false)}
                    className="mt-0.5 text-sky-600 focus:ring-sky-500 cursor-pointer"
                  />
                  <div className="flex-1 text-xs">
                    <div className="flex items-center gap-1.5 font-bold text-slate-800">
                      <Laptop className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                      <span>Mi portátil personal privado</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                      Mantiene la sesión iniciada en este navegador privado para que no tengas que introducir tu contraseña continuamente.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Botón de Envío */}
            <div className="pt-1">
              <button
                type="submit"
                disabled={
                  isLoading || 
                  !isEducaand || 
                  password.trim().length === 0 ||
                  (isFirstTimeAccess && (password.length < 6 || password !== confirmPassword))
                }
                className="w-full flex items-center justify-center gap-2.5 py-3 px-4 bg-sky-600 hover:bg-sky-700 text-white font-bold text-sm rounded-xl shadow-xs hover:shadow transition-all cursor-pointer disabled:opacity-50 group"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Conectando con el censo...</span>
                  </>
                ) : (
                  <>
                    <UserCheck className="w-4 h-4" />
                    <span>
                      {isFirstTimeAccess 
                        ? (requiresPasswordChange ? 'Guardar Nueva Contraseña y Acceder' : 'Crear Contraseña y Acceder') 
                        : 'Acceder al Sistema'}
                    </span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Información de Recuperación */}
          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1 text-[11px] text-slate-600">
            <div className="flex items-center gap-1.5 text-slate-700 font-semibold">
              <Info className="w-3.5 h-3.5 text-sky-600" />
              <span>¿Has olvidado tu contraseña?</span>
            </div>
            <p className="text-slate-500 leading-relaxed pl-5">
              Si olvidas tu contraseña o necesitas cambiarla, Jefatura de Estudios puede restablecer tu cuenta desde la <em>«Gestión del Claustro»</em> para que puedas volver a elegir una nueva en tu siguiente inicio de sesión.
            </p>
          </div>

          {/* RGPD & Legal Footer */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-sky-600" />
              <span>Decreto 327/2010 (ROF)</span>
            </div>
            <span>Junta de Andalucía · IES Blas Infante</span>
          </div>
        </div>
      </div>
    </div>
  );
};
