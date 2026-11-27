import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useApi, ErrorBox, Loading, SortableTable, ChartTooltip, MultiSelect, Select, Legend } from '../components/ui.jsx';
import { download, qs } from '../api.js';
import { fmtMoney, fmtMoneyCompact, fmtInt, fmtCorte, fmtRanking, SERIES } from '../format.js';

const RANGOS = [
  { value: '', label: 'Cualquier saldo', min: 0, max: Infinity },
  { value: '1', label: 'Hasta $1,000,000.00', min: 0, max: 1000000 },
  { value: '2', label: 'De $1,000,000.00 a $10,000,000.00', min: 1000000, max: 10000000 },
  { value: '3', label: 'Más de $10,000,000.00', min: 10000000, max: Infinity },
];

export default function Explorar({ ctx }) {
  const { meta, fecha, setFecha } = ctx;
  const [ranking, setRanking] = useState(meta.rankings[0]);
  const [bancos, setBancos] = useState([]);
  const [subs, setSubs] = useState([]);
  const [rango, setRango] = useState('');
  const allSubs = meta.subactividades[ranking];
  const activeSubs = subs.filter((s) => allSubs.includes(s));
  const filters = { rankings: [ranking], bancos, subactividades: activeSubs };
  const { data, error, loading } = useApi(`/periods/${fecha}/subactividades${qs(filters)}`);
  const limites = RANGOS.find((r) => r.value === rango) || RANGOS[0];

  const colorOf = (s) => SERIES[allSubs.indexOf(s) % SERIES.length];
  const shown = activeSubs.length ? allSubs.filter((s) => activeSubs.includes(s)) : allSubs;
  const visibles = useMemo(() => (data || []).filter((r) => {
    const n = Number(r.Saldo);
    if (limites.value === '') return true;
    if (limites.value === '1') return n <= 1000000;
    if (limites.value === '2') return n > 1000000 && n <= 10000000;
    return n > 10000000;
  }), [data, limites]);

  const chartData = useMemo(() => {
    const by = new Map();
    for (const r of visibles) {
      if (!by.has(r.Codigo_Banco)) by.set(r.Codigo_Banco, { banco: r.Banco, total: 0 });
      const o = by.get(r.Codigo_Banco);
      o[r.Subactividad] = Number(r.Saldo);
      o.total += Number(r.Saldo);
    }
    return [...by.values()].sort((a, b) => b.total - a.total);
  }, [visibles]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Filtros y subactividades</h1>
          <p>Elija la fecha de corte, la actividad, las subactividades, los bancos y un rango de saldo. El filtro solo oculta filas: no cambia el ranking ni la cartera local.</p>
        </div>
        {ctx.puede('descargar_subactividades') && <button className="btn" onClick={() => download(`/export/subactividades.csv${qs({ fechas: [fecha], ...filters })}`)}>Descargar CSV</button>}
      </div>

      <div className="card toolbar">
        <Select label="Fecha de corte" value={fecha} onChange={setFecha} options={meta.periodos.map((p) => ({ value: p.fecha, label: fmtCorte(p.fecha) }))} />
        <Select label="Actividad" value={ranking} onChange={(r) => { setRanking(r); setSubs([]); }} options={meta.rankings.map((r) => ({ value: r, label: fmtRanking(r) }))} />
        <Select label="Rango de saldo" value={rango} onChange={setRango} options={RANGOS.map((r) => ({ value: r.value, label: r.label }))} />
        <MultiSelect label="Bancos" options={meta.bancos.map((b) => ({ value: b.codigo, label: b.nombre }))} value={bancos} onChange={setBancos} placeholder="Todos los bancos" />
        <MultiSelect label="Subactividades" options={allSubs.map((s) => ({ value: s, label: s }))} value={activeSubs} onChange={setSubs} placeholder="Todas" />
        <button className="btn" onClick={() => { setBancos([]); setSubs([]); setRango(''); }}>Limpiar filtros</button>
      </div>

      <ErrorBox error={error} />
      {loading ? <Loading /> : (
        <>
          <div className="card">
            <h2>{fmtRanking(ranking)} / {fmtCorte(fecha)}</h2>
            <p className="sub">Total de lo que se ve en pantalla: {fmtMoney(visibles.reduce((a, r) => a + Number(r.Saldo), 0))}. En Consumo, el crédito personal con facilidad de tarjeta se muestra en Tarjeta.</p>
            <Legend items={shown.map((s) => ({ label: s, color: colorOf(s) }))} />
            <div className="chart tall">
              <ResponsiveContainer>
                <BarChart data={chartData} margin={{ left: 10, right: 10, bottom: 50 }} barCategoryGap="20%">
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="banco" angle={-30} textAnchor="end" interval={0} axisLine={false} tickLine={false} height={60} />
                  <YAxis tickFormatter={fmtMoneyCompact} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip valueFormatter={fmtMoney} />} />
                  {shown.map((s, i) => (
                    <Bar key={s} dataKey={s} name={s} stackId="a" fill={colorOf(s)} stroke="var(--surface-1)" strokeWidth={1}
                      radius={i === shown.length - 1 ? [4, 4, 0, 0] : 0} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="card">
            <h2>Detalle</h2>
            <p className="sub">{fmtInt(visibles.length)} filas</p>
            <SortableTable
              rows={visibles}
              rowKey={(r) => r.Codigo_Banco + r.Subactividad}
              initialSort={{ key: 'Saldo', dir: -1 }}
              columns={[
                { key: 'Fecha', label: 'Fecha de corte', render: (r) => fmtCorte(r.Fecha) },
                { key: 'Ranking', label: 'Actividad', render: (r) => fmtRanking(r.Ranking) },
                { key: 'Subactividad', label: 'Subactividad' },
                { key: 'Banco', label: 'Banco' },
                { key: 'Saldo', label: 'Saldo', num: true, render: (r) => fmtMoney(r.Saldo) },
                { key: 'Operaciones', label: 'Operaciones', num: true },
              ]}
            />
          </div>
        </>
      )}
    </>
  );
}
