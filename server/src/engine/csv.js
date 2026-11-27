/**
 * Lector/escritor CSV mínimo (RFC 4180) que conserva TODOS los valores como texto.
 * Esto evita perder ceros a la izquierda (07, 001, 010, 0701...).
 */

/** Convierte el texto de un CSV en { header: string[], rows: string[][] }. */
export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // quitar BOM si existiera
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const nonEmpty = rows.filter((r) => !(r.length === 1 && r[0] === ''));
  const [header = [], ...data] = nonEmpty;
  return { header, rows: data };
}

/** Convierte filas de objetos a objetos {col: valor}. */
export function toObjects(header, rows) {
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

function escape(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serializa un arreglo de objetos a CSV (UTF-8, coma, CRLF). */
export function toCsv(objects, columns) {
  const cols = columns || (objects[0] ? Object.keys(objects[0]) : []);
  const lines = [cols.map(escape).join(',')];
  for (const o of objects) lines.push(cols.map((c) => escape(o[c])).join(','));
  return lines.join('\r\n') + '\r\n';
}
