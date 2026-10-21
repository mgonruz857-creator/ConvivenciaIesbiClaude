# Pruebas del servidor (simulador de Apps Script)

Ejecutan el servidor real (`src/services/appsScriptServidor.ts`) en Node con un Drive simulado,
y en `e2e`, `fase2`, `cambio`… también el código real de la app.

    npx tsx pruebas/servidor/produccion.test.mts   # migración v1, seguridad, concurrencia
    npx tsx pruebas/servidor/cambio.test.mts       # el día del cambio, con la app real

Algunas pruebas leen `pruebas/datos/Alumnado_FICTICIO_pruebas.xlsx` (alumnado ficticio).
