/**
 * "Foco" para saltar entre pantallas con un filtro ya aplicado (por ejemplo, de un ranking a los préstamos de
 * un banco, o de un préstamo al ranking donde suma). Se guarda un momento en sessionStorage y la pantalla
 * de destino lo toma una sola vez al abrir.
 */
const KEY = 'sbp-foco';
export function irCon(goTo, pagina, foco) {
  sessionStorage.setItem(KEY, JSON.stringify({ pagina, ...foco }));
  goTo(pagina);
}
export function tomarFoco(pagina) {
  try {
    const f = JSON.parse(sessionStorage.getItem(KEY));
    if (f?.pagina !== pagina) return null;
    sessionStorage.removeItem(KEY);
    return f;
  } catch { return null; }
}
