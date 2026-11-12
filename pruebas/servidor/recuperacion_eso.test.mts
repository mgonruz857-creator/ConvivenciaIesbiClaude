// Recuperación semanal solo para la ESO (12/11/2026): FP Básica, ciclos y Bachillerato dejan de recuperar
// a partir del día siguiente a FECHA_FIN_RECUPERACION_NO_ESO; lo recuperado antes se mantiene.
const { calcularCarnet, esGrupoESO, FECHA_FIN_RECUPERACION_NO_ESO, historicoSancionesPorAlumno, historicoDe } =
  await import('/home/claude/convivenciaiesbiclaude/src/services/carnetPuntos.ts');
let fallos = 0; const ok = (t: string, c: boolean, x = '') => { if (!c) fallos++; console.log(`${c ? 'OK   ' : 'FALLO'} ${t}${x ? ' → ' + x : ''}`); };
const parte = (id: string, fecha: string, p: number) => ({ id_sancion: id, id_alumno: 'a1', fecha, hora_incidente: '09:00', timestamp: fecha + 'T09:00:00Z', puntos_restados: p, codigo_infraccion: 'X', nombre_profesor: 'P', descripcion_hechos: '' } as any);
const medida = (id: string, fecha: string, p: number) => ({ id_compensacion: id, id_alumno: 'a1', timestamp: fecha + 'T10:00:00', fecha_completada: fecha, puntos_recuperados: p, nombre_profesor_autoriza: 'J', descripcion_tarea: '' } as any);

ok('fecha de corte', FECHA_FIN_RECUPERACION_NO_ESO === '2026-11-12');
ok('grupos ESO', ['1ESO_A', '4ESO_D', '2º ESO B', '3 ESO C'].every(esGrupoESO));
ok('grupos no ESO', !['1_INF', '2_INF', '1_FRIO', '2_CALOR', '1BACH_A', '2BACH_D', '1FPB', ''].some(esGrupoESO));

// Parte de 6 puntos el 15/10 (saldo 4). Recuperaciones: 22/10, 29/10, 5/11, 12/11, 19/11, 26/11
const P = [parte('s1', '2026-10-15', 6)];
for (const g of ['1_INF', '1_FRIO', '2_CALOR', '1BACH_A']) {
  ok(`${g}: lo recuperado hasta el 12/11 se mantiene (4+4=8)`, calcularCarnet('a1', P, [], '2026-11-12', g).saldo === 8);
  ok(`${g}: desde el 13/11 no recupera más`, calcularCarnet('a1', P, [], '2026-12-31', g).saldo === 8);
}
ok('ESO: sigue recuperando (10 el 26/11)', calcularCarnet('a1', P, [], '2026-11-26', '2ESO_A').saldo === 10);
ok('ESO: 9 el 19/11', calcularCarnet('a1', P, [], '2026-11-19', '2ESO_A').saldo === 9);
ok('sin grupo: como hasta ahora', calcularCarnet('a1', P, [], '2026-11-26').saldo === 10);

// Parte nuevo después del corte en Bachillerato: no recupera nunca
const P2 = [parte('s1', '2026-11-16', 3)];
ok('BACH, parte el 16/11: sigue en 7 en enero', calcularCarnet('a1', P2, [], '2027-01-20', '1BACH_B').saldo === 7);
ok('BACH: no hay movimientos de recuperación', !calcularCarnet('a1', P2, [], '2027-01-20', '1BACH_B').movimientos.some((m: any) => m.tipo === 'RECUPERACION_SEMANAL'));
ok('BACH: las medidas restaurativas siguen sumando', calcularCarnet('a1', P2, [medida('m1', '2026-11-20', 2)], '2027-01-20', '1BACH_B').saldo === 9);
ok('ESO, mismo caso: recupera hasta 10', calcularCarnet('a1', P2, [], '2027-01-20', '1ESO_A').saldo === 10);

// FP Básica a 0 el 10/11: no recupera el 17/11 (antes recuperaba y seguía otra vez a 0)
const P3 = [parte('s1', '2026-11-10', 10)];
const r = calcularCarnet('a1', P3, [], '2026-12-15', '2_INF');
ok('FPB a 0 el 10/11 sigue a 0', r.saldo === 0 && r.vecesSaldoCero === 1);
const h = historicoSancionesPorAlumno([parte('s1', '2026-11-10', 10), parte('s2', '2026-11-20', 10)], [], [], () => '1_FRIO', '2026-12-01');
ok('histórico: en FP no cuenta como otra vez a 0 (no ha recuperado)', historicoDe(h, 'a1').vecesSaldoCero === 1);
const h2 = historicoSancionesPorAlumno([parte('s1', '2026-11-10', 10), parte('s2', '2026-11-20', 10)], [], [], () => '1ESO_A', '2026-12-01');
ok('histórico: en ESO recuperó y vuelve a 0 (2 veces)', historicoDe(h2, 'a1').vecesSaldoCero === 2);

console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTodo correcto'); if (fallos) process.exit(1);
