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
  `revisarVersionesDatos` (solo lee las versiones de Drive), `restaurarUltimaVersionValida` (si el archivo está vacío o dañado)
  (y las de recuperación ya usadas: `prepararPartesParaRevisar`, `buscarTextosEnVersiones`, `aplicarTextosRecuperados`).

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
