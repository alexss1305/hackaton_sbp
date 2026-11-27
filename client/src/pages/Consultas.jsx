import { useEffect, useState } from 'react';
import { api, download, qs } from '../api.js';
import { ErrorBox, Loading, Select } from '../components/ui.jsx';
import { fmtMoney, fmtInt, fmtCorte, fmtRanking } from '../format.js';
import { CAMPOS, REGLAS, esMonto, esFecha, etiquetaCampo } from '../labels.js';

const ORDEN = ['Numero_Prestamo', 'Codigo_Banco', 'Saldo', 'Estado', 'Macroactividad', 'Subactividad', 'Dias_Mora'];

function valor(campo, v) {
  if (v === undefined || v === null || v === '') return '—';
  if (esMonto(campo)) return fmtMoney(v);
  if (esFecha(campo) && String(v).length === 8 && v !== 'NA') return fmtCorte(v);
  if (campo === 'Macroactividad' && v) return fmtRanking(v);
  if (campo === 'Filtro' && REGLAS[v]) return `${v} / ${REGLAS[v].nombre}`;
  if (campo === 'Estado') return v === 'valida' ? 'Válida' : 'Excluida';
  return String(v);
}

export default function Consultas({ ctx }) {
  const { meta, fecha } = ctx;
  const [corte, setCorte] = useState(fecha);
  const [banco, setBanco] = useState('');
  const [actividad, setActividad] = useState('');
  const [estado, setEstado] = useState('');
  const [prestamo, setPrestamo] = useState('');
  const [sort, setSort] = useState('Numero_Prestamo');
  const [dir, setDir] = useState('asc');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState(null);

  useEffect(() => { setPage(1); }, [corte, banco, actividad, estado, prestamo, sort, dir]);

  useEffect(() => {
    if (!corte) return undefined;
    let alive = true;
    setLoading(true);
    api(`/admin/operaciones${qs({ fecha: corte, banco, actividad, estado, q: prestamo, sort, dir, page, pageSize: 25 })}`)
      .then((d) => { if (alive) { setData(d); setError(null); } })
      .catch((e) => { if (alive) setError(e); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [corte, banco, actividad, estado, prestamo, sort, dir, page]);

  const paginas = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const columnas = ['Numero_Prestamo', 'Codigo_Banco', 'Macroactividad', 'Subactividad', 'Saldo', 'Estado', 'Filtro'];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Consultas</h1>
          <p>Préstamo por préstamo del corte elegido. La clasificación ya la asignó el motor. Esta vista no recalcula rankings.</p>
        </div>
        <button className="btn" onClick={() => download(`/admin/operaciones.csv${qs({ fecha: corte, banco, actividad, estado, q: prestamo, sort, dir })}`)}>Descargar selección</button>
      </div>

      <div className="card toolbar">
        <Select label="Fecha de corte" value={corte} onChange={setCorte} options={(meta.periodos || []).map((p) => ({ value: p.fecha, label: fmtCorte(p.fecha) }))} />
        <Select label="Banco" value={banco} onChange={setBanco} options={[{ value: '', label: 'Todos los bancos' }, ...meta.bancos.map((b) => ({ value: b.codigo, label: b.nombre }))]} />
        <Select label="Actividad" value={actividad} onChange={setActividad} options={[{ value: '', label: 'Todas las actividades' }, ...meta.rankings.map((r) => ({ value: r, label: fmtRanking(r) }))]} />
        <Select label="Estado" value={estado} onChange={setEstado} options={[{ value: '', label: 'Todas' }, { value: 'valida', label: 'Válida' }, { value: 'excluida', label: 'Excluida' }]} />
        <label className="field">Número de préstamo
          <input value={prestamo} onChange={(e) => setPrestamo(e.target.value)} placeholder="Parte del número" aria-label="Número de préstamo" />
        </label>
        <Select label="Ordenar por" value={sort} onChange={setSort} options={ORDEN.map((c) => ({ value: c, label: etiquetaCampo(c) }))} />
        <Select label="Dirección" value={dir} onChange={setDir} options={[{ value: 'asc', label: 'Ascendente' }, { value: 'desc', label: 'Descendente' }]} />
      </div>

      <ErrorBox error={error} />
      {loading && <Loading />}
      {data && (
        <div className="grid g2">
          <div className="card">
            <p className="sub">{fmtInt(data.total)} préstamos / página {data.page} de {paginas}</p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>{columnas.map((c) => <th key={c}>{etiquetaCampo(c)}</th>)}</tr>
                </thead>
                <tbody>
                  {data.rows.map((r, i) => (
                    <tr key={`${r.Numero_Prestamo}-${r.Estado}-${i}`} onClick={() => setSel(r)} style={{ cursor: 'pointer' }}>
                      {columnas.map((c) => <td key={c}>{valor(c, c === 'Codigo_Banco' ? (meta.bancos.find((b) => b.codigo === r.Codigo_Banco)?.nombre || r.Codigo_Banco) : r[c])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="toolbar" style={{ marginTop: 10 }}>
              <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</button>
              <button className="btn" disabled={page >= paginas} onClick={() => setPage((p) => p + 1)}>Siguiente</button>
            </div>
          </div>
          <div className="card">
            <h2>Detalle</h2>
            {!sel && <p className="sub">Elija una fila para ver todos los campos.</p>}
            {sel && (
              <dl>
                {Object.keys(CAMPOS).filter((k) => k in sel || ['Estado', 'Filtro', 'Macroactividad', 'Subactividad'].includes(k)).map((k) => (
                  <div key={k} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <dt>{etiquetaCampo(k)}</dt>
                    <dd style={{ margin: 0 }}>{valor(k, sel[k])}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
      )}
    </>
  );
}
