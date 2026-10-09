/**
 * Datos que el servidor envía junto con el inicio de sesión. La primera descarga los usa
 * directamente en lugar de hacer otra petición (ahorra un viaje al servidor). Solo se usan una vez.
 */
let pendientes: any = null;

export function guardarDatosIniciales(datos: any): void {
  pendientes = datos && typeof datos === 'object' ? datos : null;
}

export function tomarDatosIniciales(): any {
  const d = pendientes;
  pendientes = null;
  return d;
}
