import { useEffect, useMemo, useState } from 'react';
import { usePublicarSeleccion } from '../asistenteContexto.js';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { api, qs } from '../api.js';
import { ErrorBox, Loading, SortableTable, ChartTooltip, Trend } from '../components/ui.jsx';
import { fmtMoney, fmtMoneyCompact, fmtPct, fmtCorte, fmtMes, fmtRanking, SERIES } from '../format.js';
import { Icon } from '../components/brand.jsx';
import Movimientos from '../components/Movimientos.jsx';
import './comparar.css';

const MAX = 5;
const MEDIDAS = [
  { value: 'saldo', label: 'Saldo de la actividad', campo: 'Saldo_Actividad' },
  { value: 'participacion', label: 'Participación de mercado (%)', campo: 'Participacion_Pct' },
  { value: 'ponderacion', label: 'Ponderación en su cartera (%)', campo: 'Ponderacion_Pct' },
  { value: 'posicion', label: 'Posición en el ranking', campo: 'Posicion' },
];
const GRAFICOS = [
  { value: 'lineas', label: 'Evolución', icon: 'chart' },
  { value: 'barras', label: 'Barras', icon: 'table' },
  { value: 'variacion', label: 'Variación', icon: 'compare' },
  { value: 'calor', label: 'Mapa de calor', icon: 'dashboard' },
  { value: 'tabla', label: 'Tabla', icon: 'filter' },
];
const TENDENCIAS = [
  { value: '', label: 'Todas' }, { value: 'Sube', label: 'Suben' }, { value: 'Baja', label: 'Bajan' }, { value: 'Se mantiene', label: 'Se mantienen' },
];

const valorDe = (s, medida) => Number(s[MEDIDAS.find((m) => m.value === medida).campo]);
const fmtMedida = (v, medida) => (v === null || v === undefined || Number.isNaN(v) ? '—'
  : medida === 'saldo' ? fmtMoney(v) : medida === 'posicion' ? `#${v}` : fmtPct(v, 2));

function descargarCsv(nombre, columnas, filas) {
  const esc = (v) => (/[",\r\n]/.test(String(v ?? '')) ? `"${String(v).replaceAll('"', '""')}"` : String(v ?? ''));
  const texto = [columnas.map((c) => c.label).join(','), ...filas.map((f) => columnas.map((c) => esc(f[c.key])).join(','))].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Chips de selección múltiple (con tope opcional). */
function Chips({ label, options, value, onChange, max, colorOf }) {
  const toggle = (v) => {
    if (value.includes(v)) onChange(value.filter((x) => x !== v));
    else if (!max || value.length < max) onChange([...value, v]);
  };
  return (
    <div className="cmp-field">
      <div className="cmp-label">{label}{max ? <span className="muted"> · {value.length}/{max}</span> : null}</div>
      <div className="cmp-chips">
        {options.map((o) => {
          const on = value.includes(o.value);
          const lleno = !on && max && value.length >= max;
          return (
            <button key={o.value} type="button" className={`cmp-chip ${on ? 'on' : ''}`} disabled={lleno} onClick={() => toggle(o.value)}
              title={lleno ? `Máximo ${max}` : undefined} aria-pressed={on}>
              {colorOf && on && <i className="cmp-dot" style={{ background: colorOf(o.value) }} />}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Comparar({ ctx }) {
  const { meta } = ctx;
  const fechasDisp = meta.periodos.map((p) => p.fecha);
  const [fechas, setFechas] = useState(fechasDisp.slice(-3));
  const [bancos, setBancos] = useState(meta.bancos.slice(0, 3).map((b) => b.codigo));
  const [rankings, setRankings] = useState([meta.rankings[0]]);
  const [medida, setMedida] = useState('saldo');
  const [grafico, setGrafico] = useState('lineas');
  const [tendencia, setTendencia] = useState('');
  const [soloSig, setSoloSig] = useState(false);
  const [umbral, setUmbral] = useState('');
  const [par, setPar] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Color fijo por banco mientras esté seleccionado: cada banco conserva su color al agregar o quitar otros
  const [slots, setSlots] = useState(() => Object.fromEntries(meta.bancos.slice(0, 3).map((b, i) => [b.codigo, i])));
  const cambiarBancos = (v) => {
    const libres = [...Array(MAX).keys()];
    const next = {};
    for (const c of v) if (slots[c] !== undefined) { next[c] = slots[c]; libres.splice(libres.indexOf(slots[c]), 1); }
    for (const c of v) if (next[c] === undefined) next[c] = libres.shift();
    setSlots(next);
    setBancos(v);
  };
  const colorOf = (c) => SERIES[(slots[c] ?? 0) % SERIES.length];
  const nombreDe = (c) => meta.bancos.find((b) => b.codigo === c)?.nombre || c;

  const fechasOrd = useMemo(() => [...fechas].sort(), [fechas]);
  usePublicarSeleccion({ fechas: fechasOrd, bancos: bancos.map(nombreDe), actividades: rankings, medida, grafico });
  const sinSeleccion = !fechas.length || !bancos.length || !rankings.length;
  useEffect(() => {
    if (sinSeleccion) return undefined;
    let alive = true;
    setLoading(true); setError(null);
    api(`/comparacion${qs({ fechas: fechasOrd, bancos, rankings })}`)
      .then((d) => { if (alive) { setData(d); setLoading(false); } })
      .catch((e) => { if (alive) { setError(e); setLoading(false); } });
    return () => { alive = false; };
  }, [fechasOrd.join(','), bancos.join(','), rankings.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const pares = useMemo(() => [...new Set((data?.movimientos || []).map((m) => m.Par))], [data]);
  // Por defecto: el último par de cortes consecutivos
  const consecutivos = pares.filter((p) => data.movimientos.find((m) => m.Par === p)?.Consecutivo);
  const parActivo = pares.includes(par) ? par : consecutivos.at(-1) || pares[0] || '';
  const movsFiltrados = useMemo(() => (data?.movimientos || []).filter((m) => m.Par === parActivo
    && (!tendencia || m.Tendencia === tendencia)
    && (!soloSig || m.Significativo)
    && (!umbral || (m.Var_Saldo_Pct !== null && Math.abs(Number(m.Var_Saldo_Pct)) >= Number(umbral)))), [data, parActivo, tendencia, soloSig, umbral]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Comparar bancos y períodos</h1>
          <p>Compare hasta {MAX} bancos a la vez en uno o varios cortes y actividades. Las cifras vienen del cálculo oficial; aquí solo se comparan.</p>
        </div>
        <div className="toolbar no-print">
          <button className="btn" disabled={!data} onClick={() => descargarCsv('comparacion.csv', [
            { key: 'Fecha', label: 'Fecha' }, { key: 'Ranking', label: 'Ranking' }, { key: 'Codigo_Banco', label: 'Codigo_Banco' },
            { key: 'Banco', label: 'Banco' }, { key: 'Posicion', label: 'Posicion' }, { key: 'Saldo_Actividad', label: 'Saldo_Actividad' },
            { key: 'Participacion_Pct', label: 'Participacion_Pct' }, { key: 'Ponderacion_Pct', label: 'Ponderacion_Pct' }, { key: 'Operaciones_Validas', label: 'Operaciones_Validas' },
          ], data.series)}><Icon name="download" />Descargar comparación (CSV)</button>
          <button className="btn" onClick={() => window.print()}>Imprimir</button>
        </div>
      </div>

      <div className="card cmp-filtros no-print">
        <Chips label="Fechas de corte" options={fechasDisp.map((f) => ({ value: f, label: fmtMes(f) }))} value={fechas} onChange={setFechas} />
        <Chips label="Bancos" options={meta.bancos.map((b) => ({ value: b.codigo, label: b.nombre }))} value={bancos} onChange={cambiarBancos} max={MAX} colorOf={colorOf} />
        <Chips label="Actividades" options={meta.rankings.map((r) => ({ value: r, label: fmtRanking(r) }))} value={rankings} onChange={setRankings} />
        <div className="cmp-row">
          <label className="field">Medida
            <select value={medida} onChange={(e) => setMedida(e.target.value)}>{MEDIDAS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select>
          </label>
          <div className="cmp-field">
            <div className="cmp-label">Tipo de gráfico</div>
            <div className="cmp-seg" role="radiogroup">
              {GRAFICOS.map((g) => (
                <button key={g.value} type="button" role="radio" aria-checked={grafico === g.value} className={grafico === g.value ? 'on' : ''} onClick={() => setGrafico(g.value)}>
                  <Icon name={g.icon} />{g.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {sinSeleccion && <div className="alert info">Elija al menos un corte, un banco y una actividad.</div>}
      <ErrorBox error={error} />
      {loading && <Loading />}

      {data && !loading && !sinSeleccion && (
        <>
          <Resumen data={data} medida={medida} colorOf={colorOf} />
          <div className="cmp-grid">
            {data.rankings.map((r) => (
              <div className="card" key={r}>
                <h2>{fmtRanking(r)}</h2>
                <p className="sub">{MEDIDAS.find((m) => m.value === medida).label} · {data.fechas.map(fmtCorte).join(' · ')}</p>
                <Grafico tipo={grafico} ranking={r} data={data} medida={medida} colorOf={colorOf} nombreDe={nombreDe} />
              </div>
            ))}
          </div>

          <div className="card">
            <div className="cmp-mov-head">
              <h2>Movimientos de posición</h2>
              <div className="toolbar no-print">
                {pares.length > 1 && (
                  <label className="field">Entre
                    <select value={parActivo} onChange={(e) => setPar(e.target.value)}>
                      {pares.map((p) => { const [a, b] = p.split('-'); return <option key={p} value={p}>{fmtMes(a)} → {fmtMes(b)}</option>; })}
                    </select>
                  </label>
                )}
                <label className="field">Tendencia
                  <select value={tendencia} onChange={(e) => setTendencia(e.target.value)}>{TENDENCIAS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
                </label>
                <label className="field">Variación mínima (%)
                  <input type="number" min="0" step="1" value={umbral} onChange={(e) => setUmbral(e.target.value)} placeholder="0" style={{ minWidth: 90, width: 110 }} />
                </label>
                <label className="cmp-check"><input type="checkbox" checked={soloSig} onChange={(e) => setSoloSig(e.target.checked)} /> Solo significativos</label>
              </div>
            </div>
            {data.fechas.length < 2 ? <p className="muted">Elija dos o más cortes para ver movimientos.</p> : (
              <>
                <p className="sub">Regla de movimiento significativo (configurable por el Administrador): |cambio de posición| ≥ {data.params.minCambioPosicion}{data.params.cambioLider ? ', cambio de líder' : ''}{data.params.umbralVarSaldoPct ? `, |variación de saldo| ≥ ${data.params.umbralVarSaldoPct}%` : ''}.</p>
                <SortableTable
                  rows={movsFiltrados}
                  rowKey={(m) => m.Par + m.Ranking + m.Codigo_Banco}
                  initialSort={{ key: 'Cambio_Posicion', dir: -1 }}
                  columns={[
                    { key: 'Ranking', label: 'Actividad', render: (m) => fmtRanking(m.Ranking) },
                    { key: 'Banco', label: 'Banco', render: (m) => <span className="cmp-banco"><i className="cmp-dot" style={{ background: colorOf(m.Codigo_Banco) }} />{m.Banco}</span> },
                    { key: 'Posicion_Anterior', label: 'Antes', num: true },
                    { key: 'Posicion_Actual', label: 'Ahora', num: true },
                    { key: 'Cambio_Posicion', label: 'Cambio', num: true, render: (m) => <Trend value={m.Cambio_Posicion} /> },
                    { key: 'Var_Saldo', label: 'Variación de saldo', num: true, render: (m) => fmtMoney(m.Var_Saldo) },
                    { key: 'Var_Saldo_Pct', label: 'Var. %', num: true, render: (m) => fmtPct(m.Var_Saldo_Pct, 2) },
                    { key: 'Significativo', label: 'Significativo', render: (m) => (m.Significativo ? <span className="badge warn">Sí</span> : '') },
                  ]}
                  empty="Ningún movimiento cumple los filtros."
                />
              </>
            )}
          </div>

          {data.fechas.length >= 2 && parActivo && (
            <div className="card cmp-principales">
              <Movimientos movimientos={movsFiltrados} desde={parActivo.split('-')[0]} hasta={parActivo.split('-')[1]} />
            </div>
          )}
        </>
      )}
    </>
  );
}

/** Tarjetas por banco: valor al último corte y cambio respecto al primero (primera actividad elegida). */
function Resumen({ data, medida, colorOf }) {
  const r = data.rankings[0];
  const filas = data.resumen.filter((x) => x.Ranking === r);
  const ult = data.fechas.at(-1);
  return (
    <div className="cmp-cards">
      {filas.map((x) => {
        const s = data.series.find((y) => y.Fecha === ult && y.Ranking === r && y.Codigo_Banco === x.Codigo_Banco);
        return (
          <div key={x.Codigo_Banco} className="cmp-card" style={{ borderTopColor: colorOf(x.Codigo_Banco) }}>
            <div className="cmp-card-t"><i className="cmp-dot" style={{ background: colorOf(x.Codigo_Banco) }} />{x.Banco}</div>
            <div className="cmp-card-v">{fmtMedida(valorDe(s, medida), medida)}</div>
            <div className="cmp-card-h">
              <span>{fmtRanking(r)} · puesto {x.Posicion_Final}</span>
              {data.fechas.length > 1 && <span><Trend value={x.Cambio_Posicion} /> desde {fmtMes(x.Desde)}</span>}
              {data.fechas.length > 1 && x.Var_Saldo_Pct !== null && <span className={Number(x.Var_Saldo_Pct) >= 0 ? 'up' : 'down'}>{Number(x.Var_Saldo_Pct) >= 0 ? '+' : ''}{x.Var_Saldo_Pct}% saldo</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Grafico({ tipo, ranking, data, medida, colorOf, nombreDe }) {
  const series = data.series.filter((s) => s.Ranking === ranking);
  const fmtEje = medida === 'saldo' ? fmtMoneyCompact : medida === 'posicion' ? (v) => `#${v}` : (v) => `${v}%`;
  const tooltip = <Tooltip content={<ChartTooltip valueFormatter={(v) => fmtMedida(v, medida)} />} />;
  const porFecha = data.fechas.map((f) => {
    const o = { fecha: fmtMes(f) };
    for (const b of data.bancos) { const s = series.find((x) => x.Fecha === f && x.Codigo_Banco === b); o[b] = s ? valorDe(s, medida) : null; }
    return o;
  });
  const yPos = medida === 'posicion' ? { reversed: true, domain: [1, 12], allowDecimals: false } : {};

  if (tipo === 'lineas') {
    return (
      <div className="chart">
        <ResponsiveContainer>
          <LineChart data={porFecha} margin={{ left: 10, right: 20, top: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="fecha" axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmtEje} axisLine={false} tickLine={false} width={70} {...yPos} />
            {tooltip}
            {data.bancos.map((b) => <Line key={b} dataKey={b} name={nombreDe(b)} stroke={colorOf(b)} strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} animationDuration={700} />)}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }
  if (tipo === 'barras') {
    return (
      <div className="chart">
        <ResponsiveContainer>
          <BarChart data={porFecha} margin={{ left: 10, right: 20, top: 8 }} barCategoryGap="20%">
            <CartesianGrid vertical={false} />
            <XAxis dataKey="fecha" axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmtEje} axisLine={false} tickLine={false} width={70} {...(medida === 'posicion' ? { domain: [0, 12], allowDecimals: false } : {})} />
            {tooltip}
            {data.bancos.map((b) => <Bar key={b} dataKey={b} name={nombreDe(b)} fill={colorOf(b)} radius={[4, 4, 0, 0]} animationDuration={700} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }
  if (tipo === 'variacion') {
    if (data.fechas.length < 2) return <p className="muted">Elija dos o más cortes para ver la variación.</p>;
    const filas = data.resumen.filter((x) => x.Ranking === ranking).map((x) => {
      const ini = series.find((s) => s.Fecha === x.Desde && s.Codigo_Banco === x.Codigo_Banco);
      const fin = series.find((s) => s.Fecha === x.Hasta && s.Codigo_Banco === x.Codigo_Banco);
      const v = medida === 'posicion' ? x.Cambio_Posicion : medida === 'saldo' ? Number(x.Var_Saldo_Pct ?? 0) : Number((valorDe(fin, medida) - valorDe(ini, medida)).toFixed(2));
      return { banco: x.Banco, codigo: x.Codigo_Banco, v };
    });
    const etiqueta = medida === 'posicion' ? 'Puestos ganados (+) o perdidos (−)' : medida === 'saldo' ? 'Variación de saldo (%)' : 'Variación (puntos porcentuales)';
    return (
      <>
        <p className="cmp-note">{etiqueta} entre {fmtMes(data.fechas[0])} y {fmtMes(data.fechas.at(-1))}. Azul sube, rojo baja.</p>
        <div className="chart" style={{ height: Math.max(180, filas.length * 48) }}>
          <ResponsiveContainer>
            <BarChart data={filas} layout="vertical" margin={{ left: 10, right: 30 }} barCategoryGap={6}>
              <CartesianGrid horizontal={false} />
              <XAxis type="number" axisLine={false} tickLine={false} allowDecimals={medida !== 'posicion'} />
              <YAxis type="category" dataKey="banco" width={150} axisLine={false} tickLine={false} />
              <ReferenceLine x={0} stroke="var(--neutral)" />
              <Tooltip content={<ChartTooltip valueFormatter={(v) => (medida === 'posicion' ? `${v > 0 ? '+' : ''}${v} puestos` : `${v > 0 ? '+' : ''}${v}${medida === 'saldo' ? '%' : ' pp'}`)} />} />
              <Bar dataKey="v" name="Variación" radius={4} animationDuration={700}>
                {filas.map((f) => <Cell key={f.codigo} fill={f.v >= 0 ? 'var(--up)' : 'var(--down)'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </>
    );
  }
  if (tipo === 'calor') {
    const vals = series.map((s) => valorDe(s, medida));
    const min = Math.min(...vals); const max = Math.max(...vals);
    const intensidad = (v) => {
      if (max === min) return 0.5;
      const t = (v - min) / (max - min);
      return medida === 'posicion' ? 1 - t : t; // en posición, más oscuro = mejor puesto
    };
    return (
      <div className="table-wrap" style={{ maxHeight: 'none' }}>
        <table className="cmp-heat">
          <thead><tr><th>Banco</th>{data.fechas.map((f) => <th key={f} className="num">{fmtMes(f)}</th>)}</tr></thead>
          <tbody>
            {data.bancos.map((b) => (
              <tr key={b}>
                <td><span className="cmp-banco"><i className="cmp-dot" style={{ background: colorOf(b) }} />{nombreDe(b)}</span></td>
                {data.fechas.map((f) => {
                  const s = series.find((x) => x.Fecha === f && x.Codigo_Banco === b);
                  const v = s ? valorDe(s, medida) : null;
                  const a = v === null ? 0 : intensidad(v);
                  return <td key={f} className="num" style={{ background: `color-mix(in srgb, var(--indigo) ${Math.round(8 + a * 72)}%, white)`, color: a > 0.55 ? '#fff' : 'var(--text-primary)' }}>{fmtMedida(v, medida)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="cmp-note" style={{ margin: 8 }}>{medida === 'posicion' ? 'Más oscuro = mejor puesto.' : 'Más oscuro = valor más alto.'}</p>
      </div>
    );
  }
  return (
    <SortableTable
      rows={series}
      rowKey={(s) => s.Fecha + s.Codigo_Banco}
      initialSort={{ key: 'Fecha', dir: 1 }}
      columns={[
        { key: 'Fecha', label: 'Corte', render: (s) => fmtCorte(s.Fecha) },
        { key: 'Banco', label: 'Banco', render: (s) => <span className="cmp-banco"><i className="cmp-dot" style={{ background: colorOf(s.Codigo_Banco) }} />{s.Banco}</span> },
        { key: 'Posicion', label: 'Posición', num: true },
        { key: 'Saldo_Actividad', label: 'Saldo', num: true, render: (s) => fmtMoney(s.Saldo_Actividad) },
        { key: 'Participacion_Pct', label: 'Participación', num: true, render: (s) => fmtPct(s.Participacion_Pct, 2) },
        { key: 'Ponderacion_Pct', label: 'Ponderación', num: true, render: (s) => fmtPct(s.Ponderacion_Pct) },
        { key: 'Operaciones_Validas', label: 'Operaciones', num: true },
      ]}
    />
  );
}
