import { toCents } from './money.js';

const MAX_LISTED = 20;
const list = (a) => a.slice(0, MAX_LISTED).join(', ') + (a.length > MAX_LISTED ? `… (${a.length} en total)` : '');

/**
 * Valida la estructura de un archivo AT03 contra el diccionario (61 columnas, nombres y orden),
 * número de campos por fila, formato de Fecha (AAAAMMDD) y de Saldo.
 * Devuelve { ok, errors: string[] }. Si !ok, el archivo se rechaza completo.
 */
export function validateAt03(header, rows, schema) {
  const errors = [];
  if (header.length !== schema.length) {
    errors.push(`Se esperaban ${schema.length} columnas y el archivo tiene ${header.length}.`);
  }
  const wrong = [];
  schema.forEach((col, i) => {
    if (header[i] !== col) wrong.push(`posición ${i + 1}: se esperaba "${col}" y llegó "${header[i] ?? '(vacío)'}"`);
  });
  if (wrong.length) {
    errors.push(`Encabezado distinto al diccionario: ${wrong.slice(0, 5).join('; ')}${wrong.length > 5 ? ` (y ${wrong.length - 5} más)` : ''}.`);
  }
  if (errors.length) return { ok: false, errors };
  if (rows.length === 0) return { ok: false, errors: ['El archivo no contiene filas de datos.'] };

  const iFecha = schema.indexOf('Fecha');
  const iSaldo = schema.indexOf('Saldo');
  const badCount = [];
  const badFecha = [];
  const badSaldo = [];
  rows.forEach((r, idx) => {
    const line = idx + 2; // la línea 1 es el encabezado
    if (r.length !== schema.length) { badCount.push(line); return; }
    if (!/^\d{8}$/.test(r[iFecha])) badFecha.push(line);
    if (toCents(r[iSaldo]) === null) badSaldo.push(line);
  });
  if (badCount.length) errors.push(`Filas con un número de campos distinto de ${schema.length}: líneas ${list(badCount)}.`);
  if (badFecha.length) errors.push(`Fecha inválida (se espera AAAAMMDD): líneas ${list(badFecha)}.`);
  if (badSaldo.length) errors.push(`Saldo no numérico: líneas ${list(badSaldo)}.`);
  return { ok: errors.length === 0, errors };
}

/**
 * Integridad referencial (Sección 7): Codigo_Banco vs bancos y Facilidad_Crediticia vs SB21.
 * Son ALERTAS: no excluyen filas. (Tipo_Actividad vs CINU se maneja como exclusión E4.)
 */
export function referentialAlerts(rows, catalogs) {
  const alerts = [];
  for (const r of rows) {
    if (!catalogs.bancoMap.has(r.Codigo_Banco)) {
      alerts.push({ Fecha: r.Fecha, Tipo: 'Banco no catalogado', Numero_Prestamo: r.Numero_Prestamo, Codigo_Banco: r.Codigo_Banco, Linea_Archivo: r._line, Mensaje: `Codigo_Banco ${r.Codigo_Banco} no existe en Bancos_ficticios.csv` });
    }
    if (!catalogs.sb21Map.has(r.Facilidad_Crediticia)) {
      alerts.push({ Fecha: r.Fecha, Tipo: 'Facilidad no catalogada', Numero_Prestamo: r.Numero_Prestamo, Codigo_Banco: r.Codigo_Banco, Linea_Archivo: r._line, Mensaje: `Facilidad_Crediticia ${r.Facilidad_Crediticia} no existe en Tabla_SB21_simplificada.csv` });
    }
  }
  return alerts;
}
