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

/** Reglas de tipo según la columna `Tipo` del diccionario AT03. */
const TYPE_RULES = {
  'Fecha (AAAAMMDD)': { test: (v) => /^\d{8}$/.test(v), desc: 'fecha AAAAMMDD' },
  'Fecha/Texto': { test: (v) => v === 'NA' || /^\d{8}$/.test(v), desc: 'fecha AAAAMMDD o NA' },
  'Numerico (Decimal)': { test: (v) => v === 'NA' || /^-?\d+(\.\d+)?$/.test(v), desc: 'número decimal con punto' },
  'Numerico (Entero)': { test: (v) => v === 'NA' || /^-?\d+$/.test(v), desc: 'número entero' },
  'Codigo (Texto)': { test: (v) => v.trim() !== '' && v === v.trim(), desc: 'código no vacío y sin espacios' },
  Texto: { test: (v) => v.trim() !== '', desc: 'texto no vacío' },
};

/**
 * Tipos de datos y campos mínimos (Sección 4.A), guiados por el diccionario.
 * Son ALERTAS agrupadas por campo: el reto solo permite excluir filas por E1–E4.
 * (Fecha y Saldo inválidos ya rechazan el archivo completo en validateAt03.)
 */
export function typeAlerts(rows, catalogs) {
  const fields = catalogs.raw.diccionario.map((d) => ({ campo: d.Campo, tipo: d.Tipo, rule: TYPE_RULES[d.Tipo] })).filter((f) => f.rule);
  const bad = new Map(); // campo -> { tipo, desc, lines[] }
  for (const r of rows) {
    for (const f of fields) {
      const v = r[f.campo] ?? '';
      if (!f.rule.test(v)) {
        if (!bad.has(f.campo)) bad.set(f.campo, { tipo: f.tipo, desc: f.rule.desc, lines: [], ejemplo: v });
        bad.get(f.campo).lines.push(r._line);
      }
    }
  }
  const fecha = rows[0]?.Fecha;
  return [...bad.entries()].map(([campo, b]) => ({
    Fecha: fecha, Tipo: 'Tipo de dato inválido', Numero_Prestamo: '', Codigo_Banco: '',
    Linea_Archivo: b.lines[0],
    Mensaje: `${campo} (${b.tipo}): ${b.lines.length} valor(es) que no son ${b.desc}; ej. "${b.ejemplo}" en líneas ${list(b.lines)}`,
  }));
}
