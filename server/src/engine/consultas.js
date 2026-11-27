/** Consulta de préstamos ya procesados. No recalcula rankings ni exclusiones. */

const COLLATOR = new Intl.Collator('es', { numeric: true });

function filtrar(rows, query) {
  let out = rows;
  if (query.banco) out = out.filter((r) => r.Codigo_Banco === query.banco);
  if (query.actividad) out = out.filter((r) => r.Macroactividad === query.actividad);
  if (query.estado === 'valida' || query.estado === 'excluida') out = out.filter((r) => r.Estado === query.estado);
  if (query.filtro) out = out.filter((r) => r.Filtro === query.filtro);
  if (query.subactividad) out = out.filter((r) => r.Subactividad === query.subactividad);
  if (query.min) out = out.filter((r) => Number(r.Saldo) >= Number(query.min));
  if (query.max) out = out.filter((r) => Number(r.Saldo) <= Number(query.max));
  if (query.mora === 'si') out = out.filter((r) => Number(r.Dias_Mora) > 0);
  const q = String(query.q || '').trim().toLowerCase();
  if (q) out = out.filter((r) => String(r.Numero_Prestamo || '').toLowerCase().includes(q));
  return out;
}

export function consultarOperaciones(period, query = {}) {
  const rows = filtrar(period.operaciones || [], query);
  const permitidos = new Set(['Numero_Prestamo', 'Codigo_Banco', 'Saldo', 'Estado', 'Filtro', 'Macroactividad', 'Subactividad', 'Dias_Mora', 'Destino', 'Tipo_Actividad']);
  const sort = permitidos.has(query.sort) ? query.sort : 'Numero_Prestamo';
  const dir = query.dir === 'desc' ? -1 : 1;
  // Montos y días se comparan como números; el resto con un comparador de texto reutilizado (mucho más rápido)
  const numerico = sort === 'Saldo' || sort === 'Dias_Mora';
  const cmp = numerico
    ? (a, b) => (Number(a[sort]) - Number(b[sort])) * dir
    : (a, b) => COLLATOR.compare(String(a[sort] ?? ''), String(b[sort] ?? '')) * dir;
  const ordenadas = [...rows].sort(cmp);
  const total = ordenadas.length;
  if (query.todo === '1') return { total, page: 1, pageSize: total, rows: ordenadas };
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 25));
  const page = Math.max(1, Number(query.page) || 1);
  return { total, page, pageSize, rows: ordenadas.slice((page - 1) * pageSize, page * pageSize) };
}
