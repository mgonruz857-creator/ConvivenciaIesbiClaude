# Plan de trabajo – SIGC-BI (copia de desarrollo)

Esta copia (`ConvivenciaIesbiClaude`) es donde se corrige y amplía la app.
La app en uso (`convivenciaiesbi.github.io`) no se toca hasta el paso final.

## ✅ Hecho

- Copia separada del Drive real: base de datos de pruebas (`SIGC_PRUEBAS`), franja de aviso
  y configuración única en `src/config/entorno.ts` (`PRUEBAS` / `PRODUCCION`).
- El alumnado importado ya no desaparece al sincronizar.
- Cálculo del Carnet de Puntos en orden cronológico; recuperación semanal automática
  (+1 cada 7 días naturales sin partes que resten puntos; los de 0 puntos no cuentan);
  medidas restaurativas guardadas en Drive; números de expediente únicos.

## 🔒 Fase 1 – Seguridad

- [x] Quitar el DNI del código público (`src/data/seedData.ts`). Sigue en el historial de versiones antiguas.
- [x] Servidor v2 (`src/services/appsScriptServidor.ts`): toda petición exige sesión; contraseñas
      comprobadas y guardadas (con sal) solo en el servidor; bloqueo tras 5 fallos; sin guardado por GET.
- [x] Primer acceso: el docente escribe su contraseña dos veces (decisión de Miguel Ángel). Una vez
      fijada nadie puede "reclamar" la cuenta. Jefatura ve quién ha activado su cuenta y puede restablecerla.
- [x] Permisos en el servidor: el profesorado sin privilegios no recibe teléfonos, hechos de partes
      ajenos ni auditoría, y solo puede guardar sus partes y el estado del Aula PAC.
- [x] Las contraseñas de la versión 1 siguen valiendo y se convierten al formato nuevo en el primer acceso.
- [x] Cambio de contraseña propio desde "Mi perfil".
- [x] Si el administrador olvida su contraseña: ejecutar `restablecerClaveAdministrador` en el editor
      de Apps Script (solo el propietario del proyecto puede).
- [x] Probado en el entorno de pruebas real (servidor v2 en la cuenta de Miguel Ángel).

## ⚙️ Fase 2 – Funcionamiento

- [x] Confirmar de verdad que Drive ha guardado; si falla, los cambios quedan pendientes y se reintenta.
- [x] No perder cambios si se cierra la pestaña o falla la red: lo no confirmado se guarda en el
      navegador (solo hasta que el servidor lo confirma) y se reenvía al volver a entrar con la misma cuenta.
      Aviso al cerrar la pestaña y contador "Guardando… (n)" en la cabecera.
- [x] Sincronización eficiente: comprobación cada 10 s; si no hay cambios el servidor responde
      "sin cambios" (unos 70 bytes) en lugar de enviar toda la base de datos.
- [ ] Probar la fase 2 en el entorno de pruebas real.
- [x] Aviso visible de cambios guardados solo en el dispositivo (franja ámbar y estado en la confirmación del parte).

## ✅ EN PRODUCCIÓN desde el 9/10/2026 (18:10)

- Servidor v2 en el proyecto `API_Convivencia_BlasInfante` (cuenta 14007180), implementación de siempre
  (`…HimLNQ`) con versión nueva; las otras tres implementaciones antiguas, archivadas.
- Web publicada desde la rama `produccion` de esta copia en `convivenciaiesbi/convivenciaiesbi.github.io`
  (avance rápido). Para futuras versiones: probar en pruebas (rama `main`), pasar los cambios a
  `produccion` y publicar.
- Copia de seguridad del JSON de la v1: `COPIA_SEGURIDAD_ANTES_V2_2026-10-09_18-10.json` (carpeta de Drive).
- Partes perdidos por la v1: 30 (creados el 2, 3 y 5/10), recuperados desde la copia del 8/10 de Miguel
  Ángel con `prepararPartesParaRevisar` + «Recuperar todos». Total: 71 partes.
- 37 partes de la semana del 5/10 eran reconstrucciones de la v1: 22 recuperaron su texto original desde las
  versiones de Drive (`buscarTextosEnVersiones` + `aplicarTextosRecuperados`); 15 sin texto original (Miguel Ángel
  decidió no intentar una búsqueda menos estricta).
- Queda en el repositorio del centro una rama sin uso `prueba-permiso-claude` (se puede borrar en GitHub).

## 🚀 Paso a producción (histórico del procedimiento)

> Decisión (8/10/2026): Miguel Ángel avisará cuando quiera pasar a producción, tras las nuevas
> funcionalidades. En ese momento: guía paso a paso, muy detallada y explícita.
> Mientras tanto, la app real sigue con el servidor v1: su dirección /exec responde a cualquiera
> (datos expuestos). Solo se corrige al publicar a la vez el servidor v2 y la app nueva.

> ⚠️ **RECORDATORIO OBLIGATORIO antes de sustituir la app en uso:**
> Con la recuperación semanal automática, el alumnado que lleva semanas sin partes
> **recuperará puntos de golpe** al activar esta versión. Avisar a Jefatura y preparar
> antes un listado comparando el saldo actual y el nuevo de cada alumno.

Procedimiento (revisado el 9/10/2026 tras las pruebas de producción):

Preparado por Claude (hecho):
- Servidor de producción `Servidor_PRODUCCION_v2.gs`. Al primer uso: copia de seguridad exacta del
  JSON (`COPIA_SEGURIDAD_ANTES_V2_<fecha>.json`), contraseñas de la v1 unificadas (siguen valiendo),
  foto de los saldos de la v1. Si el archivo no se encuentra o no se puede leer, se detiene sin escribir.
- Informe para Jefatura en la app (franja morada): saldos antes/después (CSV e impresión), partes que la
  v1 tenía marcados como borrados pero seguían en el archivo (botón «Recuperar», decide Jefatura) y
  partes sin docente reconocido.
- Pruebas: `pruebas/servidor/*.test.mts` (migración v1, seguridad, concurrencia, día del cambio).

Antes del cambio (Miguel Ángel, 5 min):
- En el proyecto Apps Script de `14007180.aplicaciones@g.educaand.es`, comprobar el valor de
  `var ID_CARPETA_DRIVE = '...'` del código actual y pasárselo a Claude (el servidor nuevo debe usar la
  misma carpeta; si no coincide con `1S5zjeSgcfVkL-eoQLsJ9I_ltHAnRrbaS`, Claude regenera el servidor).
- En Implementar > Gestionar implementaciones: confirmar que la activa es la que termina en `...HimLNQ`.

El cambio (~20 min, sin profesorado trabajando):
1. [Miguel Ángel] Sustituir todo el código del proyecto por `Servidor_PRODUCCION_v2.gs` y guardar.
2. [Miguel Ángel] Gestionar implementaciones > implementación activa (`...HimLNQ`) > Editar (lápiz) >
   Versión: «Nueva versión» > Implementar. **Misma dirección /exec**: la app antigua deja de poder leer
   o escribir en ese momento (se cierra la exposición de datos). Archivar cualquier OTRA implementación
   activa que quede (versiones antiguas del servidor).
3. [Claude] Publicar la app nueva (`ENTORNO = 'PRODUCCION'`) en `convivenciaiesbi/convivenciaiesbi.github.io`
   (avance rápido desde su historial, sin forzar). Entre los pasos 2 y 3 (~3 min) la web antigua no carga datos.
4. [Miguel Ángel] Abrir la app (Ctrl+Shift+R), entrar con su contraseña de siempre, comprobar partes,
   informe y que en la carpeta de Drive aparece la copia de seguridad.
5. Vuelta atrás si algo va mal: editar la implementación y elegir la versión anterior; Claude vuelve a
   publicar la web antigua y guía para restaurar el contenido del JSON desde la copia de seguridad.

Avisos: Jefatura (saldos que suben, informe); todo el profesorado vuelve a iniciar sesión con su
contraseña de siempre; quien tuviera la contraseña restablecida en la app antigua fijará una nueva.

## ✨ Fase 3 – Nuevas funcionalidades

- [x] **Mi Tutoría**: el tutor/a ve todos los partes de su grupo completos (solo lectura), el saldo
      de su alumnado, las medidas restaurativas y los teléfonos de las familias de su grupo.
      La tutoría la asigna Jefatura o el propio docente en su perfil (solo si el grupo no tiene tutor);
      Jefatura ve "(indicada por el docente)" y puede cambiarla. El servidor aplica las mismas reglas.
- [x] **Restitución manual de puntos**: Jefatura/Convivencia escribe directamente de 1 a 10 puntos
      (campo numérico), con atajo "Completar hasta 10" y aviso si se supera el máximo.
- [x] **Parte en PDF / impresión**: no muestra ningún punto (ni el saldo del alumno ni los descontados
      por el parte). El apartado 6 contiene únicamente
      "Los representantes legales pueden contactar con la tutoría o con la Jefatura de Estudios…".
      Sin espacio para firmas.
- [ ] **Logo del IES (búho) pixelado**: el actual mide 117×97 px. Pendiente de que Miguel Ángel
      consiga el original en alta resolución (SVG/PDF o PNG ≥ 500 px). No usar `public/logo-ies-blas-infante.jpg`
      (es otro diseño, no el logo real). Hay un escudo de la Junta con errata sin usar
      (`andalucia_edu_emblem_*.jpg`) que convendría borrar.
- [x] **Sanciones** (Jefatura/Convivencia): aviso del alumnado a 0 puntos sin expediente; expediente con
      conducta del art. 37 (desplegable, 1 sola), fechas, días que acude, modalidad (aula de Convivencia/
      Orientación o expulsión), fecha del documento; 4 casillas de trámites (quién y cuándo) y botón
      "Marcar todos completados"; **parte de sanción en PDF** según el modelo del centro (sin recibí,
      con espacio para la firma de Dirección). Nombre de la directora en `src/config/centro.ts`.
      El tutor/a ve en Mi Tutoría las sanciones de su grupo y el estado de los trámites (solo lectura).
      El PDF solo se puede generar con los 4 trámites marcados (decisión de Miguel Ángel). Acceso directo
      desde el aviso rojo de 0 puntos ("Abrir expediente de sanción").
- [ ] Siguientes funcionalidades: pendientes de que Miguel Ángel las detalle.
