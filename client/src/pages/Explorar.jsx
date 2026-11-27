import { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ErrorBox, Loading, SortableTable, ChartTooltip, MultiSelect, Legend } from '../components/ui.jsx';
import { api, download, qs } from '../api.js';
import { fmtMoney, fmtMoneyCompact, fmtInt, fmtCorte, fmtMes, fmtPct, fmtRanking, SERIES } from '../format.js';
import { Icon } from '../components/brand.jsx';
import './explorar.css';

const AGRUPAR = [
  { value: 'banco', label: 'Banco' },
  { value: 'Subactividad', label: 'Subactividad' },
  { value: 'Ranking', label: 'Actividad' },
  { value: 'Fecha', label: 'Fecha de corte' },
];
const GRAFICOS = [
  { value: 'apiladas', label: 'Barras apiladas', icon: 'table' },
  { value: 'porcentaje', label: 'Participación 100%', icon: 'chart' },
  { value: 'dona', label: 'Dona', icon: 'globe' },
  { value: 'evolucion', label: 'Evolución', icon: 'compare' },
];
const OTROS = 'Otros';

export default function Explorar({ ctx }) {
  const { meta, fecha } = ctx;
  const [fechas, setFechas] = useState([fecha]);
  const [rankings, setRankings] = useState([meta.rankings[0]]);
  const [subs, setSubs] = useState([]);
  const [bancos, setBancos] = useState([]);
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [topN, setTopN] = useState('');
  const [eje, setEje] = useState('banco');
  const [serie, setSerie] = useState('Subactividad');
  const [grafico, setGrafico] = useState('apiladas');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const rkOn = rankings.length ? rankings : meta.rankings;
  const subsDisp = rkOn.flatMap((r) => meta.subactividades[r]);
  const subsOn = subs.filter((s) => subsDisp.includes(s));
  const fechasOn = fechas.length ? [...fechas].sort() : [fecha];

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    Promise.all(fechasOn.map((f) => api(`/periods/${f}/subactividades${qs({ rankings: rkOn, bancos, subactividades: subsOn })}`)))
      .then((res) => { if (alive) { setData(res.flat()); setLoading(false); } })
      .catch((e) => { if (alive) { setError(e); setLoading(false); } });
    return () => { alive = false; };
  }, [fechasOn.join(','), rkOn.join(','), bancos.join(','), subsOn.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filtro de rango de saldo por fila (banco × subactividad × corte) y top N bancos por saldo total
  const filas = useMemo(() => {
    let f = (data || []).filter((r) => {
      const n = Number(r.Saldo);
      return (min === '' || n >= Number(min)) && (max === '' || n <= Number(max));
    });
    if (topN) {
      const tot = new Map();
      for (const r of f) tot.set(r.Codigo_Banco, (tot.get(r.Codigo_Banco) || 0) + Number(r.Saldo));
      const top = new Set([...tot.entries()].sort((a, b) => b[1] - a[1]).slice(0, Number(topN)).map(([c]) => c));
      f = f.filter((r) => top.has(r.Codigo_Banco));
    }
    return f;
  }, [data, min, max, topN]);
  const total = filas.reduce((a, r) => a + Number(r.Saldo), 0);

  const claveDe = (r, k) => (k === 'banco' ? r.Banco : k === 'Ranking' ? fmtRanking(r.Ranking) : k === 'Fecha' ? fmtMes(r.Fecha) : r[k]);
  const serieKey = serie === eje ? null : serie;
  const nombresSerie = useMemo(() => (serieKey ? [...new Set(filas.map((r) => claveDe(r, serieKey)))] : ['Saldo']), [filas, serieKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const colorSerie = (n) => SERIES[nombresSerie.indexOf(n) % SERIES.length];

  const porEje = useMemo(() => {
    const by = new Map();
    for (const r of filas) {
      const k = claveDe(r, eje);
      if (!by.has(k)) by.set(k, { eje: k, total: 0 });
      const o = by.get(k);
      const s = serieKey ? claveDe(r, serieKey) : 'Saldo';
      o[s] = (o[s] || 0) + Number(r.Saldo);
      o.total += Number(r.Saldo);
    }
    const out = [...by.values()];
    return eje === 'Fecha' ? out : out.sort((a, b) => b.total - a.total);
  }, [filas, eje, serieKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const pctData = useMemo(() => porEje.map((o) => {
    const p = { eje: o.eje, total: o.total };
    for (const n of nombresSerie) p[n] = o.total ? ((o[n] || 0) / o.total) * 100 : 0;
    return p;
  }), [porEje, nombresSerie]);

  const dona = useMemo(() => {
    const by = new Map();
    for (const r of filas) { const k = claveDe(r, serieKey || eje); by.set(k, (by.get(k) || 0) + Number(r.Saldo)); }
    const arr = [...by.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    if (arr.length <= 8) return arr;
    return [...arr.slice(0, 7), { name: OTROS, value: arr.slice(7).reduce((a, x) => a + x.value, 0) }];
  }, [filas, eje, serieKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const evol = useMemo(() => {
    const k = serieKey && serieKey !== 'Fecha' ? serieKey : eje !== 'Fecha' ? eje : 'Subactividad';
    const nombres = [...new Set(filas.map((r) => claveDe(r, k)))].slice(0, 8);
    const pts = fechasOn.map((f) => {
      const o = { eje: fmtMes(f) };
      for (const n of nombres) o[n] = filas.filter((r) => r.Fecha === f && claveDe(r, k) === n).reduce((a, r) => a + Number(r.Saldo), 0);
      return o;
    });
    return { pts, nombres };
  }, [filas, eje, serieKey, fechasOn.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const limpiar = () => { setSubs([]); setBancos([]); setMin(''); setMax(''); setTopN(''); };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Filtros y subactividades</h1>
          <p>Combine cortes, actividades, subactividades, bancos, rango de saldo y top de bancos, y elija cómo agrupar y graficar. Los filtros solo ocultan filas: no cambian el ranking ni la cartera local.</p>
        </div>
        {ctx.puede('descargar_subactividades') && <button className="btn" onClick={() => download(`/export/subactividades.csv${qs({ fechas: fechasOn, rankings: rkOn, bancos, subactividades: subsOn })}`)}><Icon name="download" />Descargar CSV</button>}
      </div>

      <div className="card ex-filtros">
        <div className="toolbar">
          <MultiSelect label="Fechas de corte" options={meta.periodos.map((p) => ({ value: p.fecha, label: fmtCorte(p.fecha) }))} value={fechas} onChange={setFechas} placeholder="Corte seleccionado" />
          <MultiSelect label="Actividades" options={meta.rankings.map((r) => ({ value: r, label: fmtRanking(r) }))} value={rankings} onChange={(v) => { setRankings(v); }} placeholder="Todas" />
          <MultiSelect label="Subactividades" options={subsDisp.map((s) => ({ value: s, label: s }))} value={subsOn} onChange={setSubs} placeholder="Todas" />
          <MultiSelect label="Bancos" options={meta.bancos.map((b) => ({ value: b.codigo, label: b.nombre }))} value={bancos} onChange={setBancos} placeholder="Todos los bancos" />
        </div>
        <div className="toolbar">
          <label className="field">Saldo mínimo<input type="number" min="0" value={min} onChange={(e) => setMin(e.target.value)} placeholder="Sin mínimo" /></label>
          <label className="field">Saldo máximo<input type="number" min="0" value={max} onChange={(e) => setMax(e.target.value)} placeholder="Sin máximo" /></label>
          <label className="field">Top de bancos
            <select value={topN} onChange={(e) => setTopN(e.target.value)}><option value="">Todos</option>{[3, 5, 8].map((n) => <option key={n} value={n}>Top {n} por saldo</option>)}</select>
          </label>
          <label className="field">Agrupar por (eje)
            <select value={eje} onChange={(e) => setEje(e.target.value)}>{AGRUPAR.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}</select>
          </label>
          <label className="field">Dividir por (color)
            <select value={serie} onChange={(e) => setSerie(e.target.value)}>{AGRUPAR.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}</select>
          </label>
          <button className="btn" onClick={limpiar}>Limpiar filtros</button>
        </div>
        <div className="ex-seg" role="radiogroup" aria-label="Tipo de gráfico">
          {GRAFICOS.map((g) => <button key={g.value} type="button" role="radio" aria-checked={grafico === g.value} className={grafico === g.value ? 'on' : ''} onClick={() => setGrafico(g.value)}><Icon name={g.icon} />{g.label}</button>)}
        </div>
      </div>

      <ErrorBox error={error} />
      {loading ? <Loading /> : (
        <>
          <div className="kpis">
            <div className="kpi"><div className="label">Total visible</div><div className="value">{fmtMoneyCompact(total)}</div><div className="hint">{fmtMoney(total)}</div></div>
            <div className="kpi"><div className="label">Filas</div><div className="value">{fmtInt(filas.length)}</div><div className="hint">banco × subactividad × corte</div></div>
            <div className="kpi"><div className="label">Operaciones</div><div className="value">{fmtInt(filas.reduce((a, r) => a + (r.Operaciones || 0), 0))}</div><div className="hint">préstamos incluidos</div></div>
            <div className="kpi"><div className="label">Mayor grupo</div><div className="value" style={{ fontSize: 17 }}>{porEje[0]?.eje || '—'}</div><div className="hint">{porEje[0] ? `${fmtPct(total ? (porEje[0].total / total) * 100 : 0, 1)} del total` : ''}</div></div>
          </div>

          <div className="card">
            <h2>{rkOn.map(fmtRanking).join(', ')} / {fechasOn.map(fmtMes).join(', ')}</h2>
            <p className="sub">En Consumo, el crédito personal con facilidad de tarjeta (SB21) se muestra en Tarjeta.</p>
            {grafico !== 'dona' && grafico !== 'evolucion' && <Legend items={nombresSerie.map((n) => ({ label: n, color: colorSerie(n) }))} />}
            {filas.length === 0 ? <p className="muted">Ninguna fila cumple los filtros.</p> : (
              <div className="chart tall">
                <ResponsiveContainer>
                  {grafico === 'apiladas' ? (
                    <BarChart data={porEje} margin={{ left: 10, right: 10, bottom: 50 }} barCategoryGap="20%">
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="eje" angle={-30} textAnchor="end" interval={0} axisLine={false} tickLine={false} height={60} />
                      <YAxis tickFormatter={fmtMoneyCompact} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip valueFormatter={fmtMoney} />} />
                      {nombresSerie.map((n, i) => <Bar key={n} dataKey={n} name={n} stackId="a" fill={colorSerie(n)} stroke="var(--surface-1)" strokeWidth={1} radius={i === nombresSerie.length - 1 ? [4, 4, 0, 0] : 0} animationDuration={700} />)}
                    </BarChart>
                  ) : grafico === 'porcentaje' ? (
                    <BarChart data={pctData} margin={{ left: 10, right: 10, bottom: 50 }} barCategoryGap="20%">
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="eje" angle={-30} textAnchor="end" interval={0} axisLine={false} tickLine={false} height={60} />
                      <YAxis tickFormatter={(v) => `${v}%`} domain={[0, 100]} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip valueFormatter={(v) => fmtPct(v, 1)} />} />
                      {nombresSerie.map((n) => <Bar key={n} dataKey={n} name={n} stackId="p" fill={colorSerie(n)} stroke="var(--surface-1)" strokeWidth={1} animationDuration={700} />)}
                    </BarChart>
                  ) : grafico === 'dona' ? (
                    <PieChart>
                      <Tooltip content={<ChartTooltip valueFormatter={(v) => `${fmtMoney(v)} (${fmtPct(total ? (v / total) * 100 : 0, 1)})`} />} />
                      <Pie data={dona} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={1} animationDuration={700}
                        label={({ name, percent }) => (percent > 0.04 ? `${name} ${(percent * 100).toFixed(0)}%` : '')} labelLine={false}>
                        {dona.map((d, i) => <Cell key={d.name} fill={d.name === OTROS ? 'var(--neutral)' : SERIES[i % SERIES.length]} />)}
                      </Pie>
                    </PieChart>
                  ) : (
                    <LineChart data={evol.pts} margin={{ left: 10, right: 20, top: 8 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="eje" axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={fmtMoneyCompact} axisLine={false} tickLine={false} width={70} />
                      <Tooltip content={<ChartTooltip valueFormatter={fmtMoney} />} />
                      {evol.nombres.map((n, i) => <Line key={n} dataKey={n} name={n} stroke={SERIES[i % SERIES.length]} strokeWidth={2.5} dot={{ r: 4 }} animationDuration={700} />)}
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </div>
            )}
            {grafico === 'evolucion' && fechasOn.length < 2 && <p className="muted">Elija dos o más fechas de corte para ver la evolución.</p>}
          </div>

          <div className="card">
            <h2>Detalle</h2>
            <p className="sub">{fmtInt(filas.length)} filas · total {fmtMoney(total)}</p>
            <SortableTable
              rows={filas}
              rowKey={(r) => r.Fecha + r.Codigo_Banco + r.Ranking + r.Subactividad}
              initialSort={{ key: 'Saldo', dir: -1 }}
              columns={[
                { key: 'Fecha', label: 'Fecha de corte', render: (r) => fmtCorte(r.Fecha) },
                { key: 'Ranking', label: 'Actividad', render: (r) => fmtRanking(r.Ranking) },
                { key: 'Subactividad', label: 'Subactividad' },
                { key: 'Banco', label: 'Banco' },
                { key: 'Saldo', label: 'Saldo', num: true, render: (r) => fmtMoney(r.Saldo) },
                { key: 'pct', label: '% del total visible', num: true, sortValue: (r) => Number(r.Saldo), render: (r) => fmtPct(total ? (Number(r.Saldo) / total) * 100 : 0, 2) },
                { key: 'Operaciones', label: 'Operaciones', num: true },
              ]}
            />
          </div>
        </>
      )}
    </>
  );
}
