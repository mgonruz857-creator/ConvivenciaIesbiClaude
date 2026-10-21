# Instrucciones para Claude – SIGC-BI (app de convivencia del IES Blas Infante, Córdoba)

Leer esto entero antes de empezar. El estado de cada funcionalidad y las decisiones tomadas están en
`PLAN_DE_TRABAJO.md` (leerlo también, y actualizarlo al terminar cada cambio).

## Con quién trabajas

- **Miguel Ángel González**, profesor e ingeniero informático del centro. Usa Linux.
- **Responder SIEMPRE en español.** Lenguaje claro, sin jerga ni nombres internos de herramientas.
- Cuando solo pregunta ("¿se podría…?", "¿cómo lo ves?"), **responder y proponer, sin tocar nada**.
  Se hace cuando lo dice expresamente ("hazlo", "pásalo a la app del centro") o cuando responde a las
  decisiones que se le han planteado para un cambio ya propuesto.

## Normas que no se negocian

1. **Todo se prueba primero en la app de PRUEBAS.** Se pasa a la app del centro solo cuando Miguel Ángel
   diga "pásalo a la app del centro" (o equivalente).
2. **Nunca datos reales en pruebas.** Si Miguel Ángel aporta un archivo real (p. ej. una copia del JSON),
   usarlo solo para lo pedido, no publicarlo nunca y borrarlo al terminar.
3. **No recuperar ni restaurar datos (partes, alumnos…) sin preguntarle antes.**
4. **No tener ni pedir la contraseña de la cuenta del centro** (14007180.aplicaciones@g.educaand.es). Los pasos
   en Apps Script con esa cuenta los hace él: darle instrucciones paso a paso, muy explícitas.
5. No eliminar el DNI de ejemplo ni los correos de demostración del código o del historial: son ficticios.
6. No hacer búsquedas "menos estrictas" para recuperar los 15 textos de partes que no se recuperaron
   (decisión: "NO LO HAGAS, PUEDE SER PEOR").

## Repositorios y ramas

- Copia de desarrollo (aquí se trabaja): `mgonruz857-creator/ConvivenciaIesbiClaude`.
  - Rama `main` = **PRUEBAS** → https://mgonruz857-creator.github.io/ConvivenciaIesbiClaude/
  - Rama `produccion` = mismo código con `ENTORNO = 'PRODUCCION'` en `src/config/entorno.ts` (única diferencia).
- App del centro: `convivenciaiesbi/convivenciaiesbi.github.io` (remoto `centro`) → https://convivenciaiesbi.github.io/
- Cada push a `main` de cualquiera de los dos publica con GitHub Actions (Pages). Comprobar con
  `gh run list -R <repo> -L 1`.
- **Se trabaja directamente en `main`** (es lo que publica la app de pruebas; Miguel Ángel prueba ahí). Si la
  sesión crea una rama propia (`claude/...`), al terminar cada cambio llevarlo a `main` y subirlo, sin esperar a que
  lo pida. No abrir pull requests salvo que lo pida.
- **Acceso al repositorio del centro**: cuando Miguel Ángel diga "pásalo a la app del centro", añadir a la sesión
  `convivenciaiesbi/convivenciaiesbi.github.io` (permiso de escritura) y configurarlo como remoto `centro`
  (`git remote add centro https://github.com/convivenciaiesbi/convivenciaiesbi.github.io`), y seguir el
  procedimiento de abajo. Si la rama local `produccion` no existe: `git fetch origin produccion && git checkout produccion`.

### Pasar a la app del centro (solo cuando lo diga Miguel Ángel)

```bash
git checkout produccion
for c in $(git cherry produccion main | grep '^+' | cut -c3-); do git cherry-pick $c || break; done
git diff main produccion --stat        # debe salir SOLO src/config/entorno.ts
npm run build
git fetch centro main && git merge-base --is-ancestor centro/main produccion && git push centro produccion:main
git push origin produccion
git checkout main && npm run build      # dejar dist/ como el de pruebas (está versionado)
gh run list -R convivenciaiesbi/convivenciaiesbi.github.io -L 1
```

Nunca forzar (`--force`) contra el repositorio del centro.

## Servidor (Google Apps Script)

- El código del servidor se genera desde `src/services/appsScriptServidor.ts` (plantilla `String.raw`:
  **sin comillas invertidas ni `${` dentro**). Generarlo con:
  `npx tsx -e "import('./src/services/appsScriptServidor.ts').then(m=>require('fs').writeFileSync('/home/claude/Servidor_PRUEBAS_v2.gs', m.generarServidorAppsScript()))"`
  (en la rama `produccion` sale el de producción: `Servidor_PRODUCCION_v2.gs`). Enviárselo como archivo.
- PRUEBAS: proyecto `API_SIGC_PRUEBAS` en la cuenta de Miguel Ángel (mgonruz857), carpeta SIGC_PRUEBAS.
- PRODUCCIÓN: proyecto `API_Convivencia_BlasInfante` en la cuenta del centro; implementación de siempre
  (termina en `…HimLNQ`), se actualiza con "Gestionar implementaciones → lápiz → Nueva versión" (misma URL).
  Volver atrás = elegir la versión anterior.
- Si el cambio añade o cambia acciones del servidor que usa la app → hace falta **nueva versión de la
  implementación**. Si solo afecta a tareas programadas o funciones de editor → basta con pegar y guardar.
- Si se añaden permisos nuevos (correo, tareas…), Google los pide al ejecutar una función desde el editor:
  avisar de que **marque todas las casillas**.
- Funciones de editor existentes: `restablecerClaveAdministrador`, `diagnosticoDatos`,
  `activarResumenDiario`, `probarResumenTutores`, `enviarResumenTutores`, `desactivarResumenDiario`,
  `revisarVersionesDatos` (solo lee las versiones de Drive), `restaurarUltimaVersionValida` (si el archivo está vacío o dañado),
  `activarCopiasDiarias`, `copiaSeguridadDiaria`, `listarCopiasDiarias`, `restaurarCopiaDiaria` (con `FECHA_COPIA_A_RESTAURAR`), `desactivarCopiasDiarias`
  (y las de recuperación ya usadas: `prepararPartesParaRevisar`, `buscarTextosEnVersiones`, `aplicarTextosRecuperados`).

## Emergencias con los datos (qué hacer)

Antes de tocar nada, **no restaurar ni borrar sin que Miguel Ángel lo decida** (norma 3). Pedirle capturas.

- **La app dice "No se puede leer el archivo de datos de Drive"** (el servidor se detiene sin escribir; pasó el
  21/10/2026, Drive dejó el archivo con 0 bytes en un guardado que tardó 35 s):
  1. En Drive (cuenta del centro), vista de lista de la carpeta: ¿cuántos archivos con el nombre del archivo de
     datos?, tamaño, fecha. Un duplicado con el mismo nombre también provoca el error (se arregla renombrándolo).
  2. Si está vacío o dañado: ejecutar `revisarVersionesDatos` (solo lee) y revisar con él la versión buena más
     reciente (fecha, nº de partes/alumnos/profesores).
  3. Con su visto bueno: `restaurarUltimaVersionValida` (guarda `COPIA_RESTAURACION_…json`) y comprobar la app.
  4. Ejecuciones: buscar el `doPost` anormalmente largo a esa hora. Si tardó más de 30 s, la app no recibió la
     confirmación y el cambio quedó pendiente en ese dispositivo (se reenvía solo).
- **Hay que volver a un día anterior** (p. ej. borrados por error descubiertos tarde): copias diarias en
  `COPIAS_SEGURIDAD`; `listarCopiasDiarias`, poner la fecha en `FECHA_COPIA_A_RESTAURAR`, guardar,
  `restaurarCopiaDiaria` (guarda antes `COPIA_ANTES_DE_RESTAURAR_…`), y volver a dejar la línea vacía.
  Avisar de que se deshace lo registrado después de esa fecha.
- **Olvido de la contraseña del administrador**: `restablecerClaveAdministrador`.
- Protección activa: tras cada guardado el servidor comprueba que el archivo no ha quedado vacío
  (`comprobarEscritura`); si lo está, reescribe; si sigue, devuelve `ESCRITURA_FALLIDA` y la app conserva el cambio.

## Pruebas

- Servidor y app con Drive simulado: `pruebas/servidor/*.test.mts` → `npx tsx pruebas/servidor/<nombre>.test.mts`.
  Ejecutar todas antes de entregar un cambio del servidor. En la rama `produccion`, `resumen_tutores` da 3
  avisos esperados (en producción el correo va al tutor real y con el enlace del centro).
- Tipos y compilación: `npx tsc --noEmit -p .` y `npm run build`.

## Reglas de la app que hay que respetar

- Carnet de puntos: empieza en 10; los partes restan; las medidas restaurativas suman (máx. 10);
  +1 punto cada 7 días naturales desde el ÚLTIMO parte que restó puntos (los de 0 puntos y las medidas no reinician).
- El profesorado sin privilegios solo recibe lo imprescindible (el servidor filtra; `vistaDocente`).
  Los tutores ven completo lo de su grupo. Un docente puede asignarse una tutoría libre en su perfil.
- El PDF de un expediente de sanción solo se genera con los 4 trámites marcados.
- Primer acceso de un docente: escribe su contraseña dos veces (riesgo aceptado por Miguel Ángel).
- Resumen por correo a tutores: lunes a viernes 8:30, solo con partes nuevos, sin datos del alumnado.

## Documentos

- Manuales (Claude Docs): "Manual del profesorado – SIGC-BI" y "Manual del Equipo de Convivencia – SIGC-BI".
  Actualizarlos cuando un cambio afecte a lo que explican (preguntar antes si no está claro).
