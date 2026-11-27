import { useEffect, useState } from 'react';
import { api, download, qs } from '../api.js';
import { ErrorBox, Loading, Select } from '../components/ui.jsx';
import { Icon } from '../components/brand.jsx';
import { fmtMoney, fmtInt, fmtCorte, fmtRanking } from '../format.js';
import { CAMPOS, REGLAS, esMonto, esFecha, etiquetaCampo } from '../labels.js';
import { irCon, tomarFoco } from '../foco.js';
import { usePublicarSeleccion } from '../asistenteContexto.js';
import '../components/admin.css';

const ORDEN = ['Numero_Prestamo', 'Codigo_Banco', 'Saldo', 'Estado', 'Macroactividad', 'Subactividad', 'Dias_Mora'];
const COLUMNAS = ['Numero_Prestamo', 'Codigo_Banco', 'Macroactividad', 'Subactividad', 'Saldo', 'Dias_Mora', 'Estado'];
const CLIENTE = ['Nombre_Cliente', 'ID_Cliente'];

function valor(campo, v) {
  if (v === undefined || v === null || v === '') return '—';
  if (esMonto(campo)) return fmtMoney(v);
  if (esFecha(campo) && String(v).length === 8 && v !== 'NA') return fmtCorte(v);
  if (campo === 'Macroactividad' && v) return fmtRanking(v);
  if (campo === 'Filtro' && REGLAS[v]) return `${v} / ${REGLAS[v].nombre}`;
  return String(v);
}

/** Registros: consulta de préstamos de un período (solo lectura), relacionada con rankings y bancos. */
export default function Registros({ ctx }) {
  const { meta, fecha, goTo, perfil } = ctx;
  const [f] = useState(() => tomarFoco('registros') || {});
  const [corte, setCorte] = useState(f.fecha || fecha);
  const [banco, setBanco] = useState(f.banco || '');
  const [actividad, setActividad] = useState(f.actividad || '');
  const [subactividad, setSubactividad] = useState('');
  const [estado, setEstado] = useState(f.estado || '');
  const [filtro, setFiltro] = useState('');
  const [mora, setMora] = useState('');
  const [min, setMin] = useState('');
  const [prestamo, setPrestamo] = useState('');
  const [sort, setSort] = useState('Saldo');
  const [dir, setDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState(null);
  const nombreBanco = (c) => meta.bancos.find((b) => b.codigo === c)?.nombre || c;
  usePublicarSeleccion({ fecha: corte, banco: banco ? nombreBanco(banco) : '', actividad, subactividad, estado, filtro, prestamo_seleccionado: sel?.Numero_Prestamo || '' });

  const filtros = { fecha: corte, banco, actividad, subactividad, estado, filtro, mora, min, q: prestamo, sort, dir };
  const clave = JSON.stringify(filtros);
  useEffect(() => { setPage(1); }, [clave]);
  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    api(`/registros${qs({ ...filtros, page, pageSize: 25 })}`)
      .then((d) => { if (alive) { setData(d); setLoading(false); } })
      .catch((e) => { if (alive) { setError(e); setLoading(false); } });
    return () => { alive = false; };
  }, [clave, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const paginas = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const subsDisp = actividad ? meta.subactividades[actividad] : [];
  const limpiar = () => { setBanco(''); setActividad(''); setSubactividad(''); setEstado(''); setFiltro(''); setMora(''); setMin(''); setPrestamo(''); };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Registros</h1>
          <p>Préstamos del archivo AT03 de cada corte, con su estado (válido o excluido y por qué regla) y la actividad en la que suman. Solo consulta: los rankings no cambian.{perfil !== 'administrador' && ' Los datos del cliente no se muestran.'}</p>
        </div>
        <button className="btn" onClick={() => download(`/registros.csv${qs(filtros)}`)}><Icon name="download" />Descargar selección</button>
      </div>

      <div className="card toolbar">
        <Select label="Fecha de corte" value={corte} onChange={setCorte} options={meta.periodos.map((p) => ({ value: p.fecha, label: fmtCorte(p.fecha) }))} />
        <Select label="Banco" value={banco} onChange={setBanco} options={[{ value: '', label: 'Todos los bancos' }, ...meta.bancos.map((b) => ({ value: b.codigo, label: b.nombre }))]} />
        <Select label="Actividad" value={actividad} onChange={(v) => { setActividad(v); setSubactividad(''); }} options={[{ value: '', label: 'Todas' }, ...meta.rankings.map((r) => ({ value: r, label: fmtRanking(r) }))]} />
        {actividad && <Select label="Subactividad" value={subactividad} onChange={setSubactividad} options={[{ value: '', label: 'Todas' }, ...subsDisp.map((s) => ({ value: s, label: s }))]} />}
        <Select label="Estado" value={estado} onChange={setEstado} options={[{ value: '', label: 'Todos' }, { value: 'valida', label: 'Válido (suma en el ranking)' }, { value: 'excluida', label: 'Excluido' }]} />
        <Select label="Regla de exclusión" value={filtro} onChange={setFiltro} options={[{ value: '', label: 'Cualquiera' }, ...['E1', 'E2', 'E3', 'E4'].map((x) => ({ value: x, label: `${x} · ${REGLAS[x]?.nombre || ''}` }))]} />
        <Select label="Mora" value={mora} onChange={setMora} options={[{ value: '', label: 'Con y sin mora' }, { value: 'si', label: 'Solo con días de mora' }]} />
        <label className="field">Saldo mínimo<input type="number" min="0" value={min} onChange={(e) => setMin(e.target.value)} style={{ width: 140, minWidth: 0 }} /></label>
        <label className="field">Número de préstamo<input value={prestamo} onChange={(e) => setPrestamo(e.target.value)} placeholder="Parte del número" /></label>
        <Select label="Ordenar por" value={sort} onChange={setSort} options={ORDEN.map((c) => ({ value: c, label: etiquetaCampo(c) }))} />
        <Select label="Dirección" value={dir} onChange={setDir} options={[{ value: 'desc', label: 'Descendente' }, { value: 'asc', label: 'Ascendente' }]} />
        <button className="btn" onClick={limpiar}>Limpiar</button>
      </div>

      <ErrorBox error={error} />
      {loading && !data && <Loading />}
      {data && (
        <div className="grid g2">
          <div className="card">
            <p className="sub">{fmtInt(data.total)} préstamos · página {data.page} de {paginas}</p>
            <div className="table-wrap">
              <table>
                <thead><tr>{COLUMNAS.map((c) => <th key={c}>{etiquetaCampo(c)}</th>)}</tr></thead>
                <tbody>
                  {data.rows.map((r, i) => (
                    <tr key={`${r.Numero_Prestamo}-${i}`} className={`clickable ${sel === r ? 'selected' : ''}`} onClick={() => setSel(r)}>
                      {COLUMNAS.map((c) => (
                        <td key={c} className={esMonto(c) ? 'num' : ''}>
                          {c === 'Estado' ? <span className={`rg-estado ${r.Estado}`}>{r.Estado === 'valida' ? 'Válido' : `Excluido ${r.Filtro}`}</span>
                            : c === 'Codigo_Banco' ? nombreBanco(r.Codigo_Banco) : valor(c, r[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {!data.rows.length && <tr><td colSpan={COLUMNAS.length} className="muted">Ningún préstamo cumple los filtros.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="toolbar" style={{ marginTop: 10 }}>
              <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</button>
              <button className="btn" disabled={page >= paginas} onClick={() => setPage((p) => p + 1)}>Siguiente</button>
            </div>
          </div>
          <div className="card">
            <h2>Detalle del préstamo</h2>
            {!sel && <p className="sub">Elija una fila para ver todos sus campos y dónde suma su saldo.</p>}
            {sel && (
              <>
                {sel.Estado === 'valida' ? (
                  <div className="alert info">
                    Suma {fmtMoney(sel.Saldo)} al ranking <b>{fmtRanking(sel.Macroactividad)}</b> ({sel.Subactividad}) de {nombreBanco(sel.Codigo_Banco)}.
                    <div className="toolbar" style={{ marginTop: 8 }}>
                      <button className="rg-link" onClick={() => irCon(goTo, 'rankings', { fecha: corte, ranking: sel.Macroactividad, banco: sel.Codigo_Banco })}>Ver en el ranking →</button>
                      <button className="rg-link" onClick={() => irCon(goTo, 'bancos', { banco: sel.Codigo_Banco })}>Ver ficha del banco →</button>
                    </div>
                  </div>
                ) : (
                  <div className="alert error">Excluido por <b>{valor('Filtro', sel.Filtro)}</b>: no suma en ningún ranking.</div>
                )}
                <dl>
                  {Object.keys(CAMPOS).filter((k) => k in sel && !(perfil !== 'administrador' && CLIENTE.includes(k))).map((k) => (
                    <div key={k} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                      <dt>{etiquetaCampo(k)}</dt>
                      <dd style={{ margin: 0 }}>{valor(k, sel[k])}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
