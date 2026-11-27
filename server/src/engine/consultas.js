/** Consulta de préstamos ya procesados. No recalcula rankings ni exclusiones. */

function filtrar(rows, query) {
  let out = rows;
  if (query.banco) out = out.filter((r) => r.Codigo_Banco === query.banco);
  if (query.actividad) out = out.filter((r) => r.Macroactividad === query.actividad);
  if (query.estado === 'valida' || query.estado === 'excluida') out = out.filter((r) => r.Estado === query.estado);
  if (query.filtro) out = out.filter((r) => r.Filtro === query.filtro);
  const q = String(query.q || '').trim().toLowerCase();
  if (q) out = out.filter((r) => String(r.Numero_Prestamo || '').toLowerCase().includes(q));
  return out;
}

export function consultarOperaciones(period, query = {}) {
  const rows = filtrar(period.operaciones || [], query);
  const permitidos = new Set(['Numero_Prestamo', 'Codigo_Banco', 'Saldo', 'Estado', 'Filtro', 'Macroactividad', 'Subactividad', 'Dias_Mora', 'Destino', 'Tipo_Actividad']);
  const sort = permitidos.has(query.sort) ? query.sort : 'Numero_Prestamo';
  const dir = query.dir === 'desc' ? -1 : 1;
  const ordenadas = [...rows].sort((a, b) => String(a[sort] ?? '').localeCompare(String(b[sort] ?? ''), 'es', { numeric: true }) * dir);
  const total = ordenadas.length;
  if (query.todo === '1') return { total, page: 1, pageSize: total, rows: ordenadas };
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 25));
  const page = Math.max(1, Number(query.page) || 1);
  return { total, page, pageSize, rows: ordenadas.slice((page - 1) * pageSize, page * pageSize) };
}
