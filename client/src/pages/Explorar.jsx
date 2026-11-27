import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useApi, ErrorBox, Loading, SortableTable, ChartTooltip, MultiSelect, Select, Legend } from '../components/ui.jsx';
import { download, qs } from '../api.js';
import { fmtMoney, fmtCompact, fmtInt, fmtPeriodo, fmtRanking, SERIES } from '../format.js';

export default function Explorar({ ctx }) {
  const { meta, fecha, setFecha } = ctx;
  const [ranking, setRanking] = useState(meta.rankings[0]);
  const [bancos, setBancos] = useState([]);
  const [subs, setSubs] = useState([]);
  const allSubs = meta.subactividades[ranking];
  const activeSubs = subs.filter((s) => allSubs.includes(s));
  const filters = { rankings: [ranking], bancos, subactividades: activeSubs };
  const { data, error, loading } = useApi(`/periods/${fecha}/subactividades${qs(filters)}`);

  // Color fijo por subactividad según el orden del catálogo (no cambia al filtrar)
  const colorOf = (s) => SERIES[allSubs.indexOf(s) % SERIES.length];
  const shown = activeSubs.length ? allSubs.filter((s) => activeSubs.includes(s)) : allSubs;

  const chartData = useMemo(() => {
    const by = new Map();
    for (const r of data || []) {
      if (!by.has(r.Codigo_Banco)) by.set(r.Codigo_Banco, { banco: r.Banco, total: 0 });
      const o = by.get(r.Codigo_Banco);
      o[r.Subactividad] = Number(r.Saldo);
      o.total += Number(r.Saldo);
    }
    return [...by.values()].sort((a, b) => b.total - a.total);
  }, [data]);
  const total = (data || []).reduce((a, r) => a + Number(r.Saldo), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Filtros y desglose por subactividad</h1>
          <p>Combine período, ranking, bancos y subactividades. En CONSUMO, las operaciones de crédito personal con facilidad 07 (tarjeta, tabla SB21) se muestran en Tarjeta.</p>
        </div>
        <button className="btn" onClick={() => download(`/export/subactividades.csv${qs({ fechas: [fecha], ...filters })}`)}>⬇ Descargar selección (CSV)</button>
      </div>

      <div className="card toolbar">
        <Select label="Período" value={fecha} onChange={setFecha} options={meta.periodos.map((p) => ({ value: p.fecha, label: fmtPeriodo(p.fecha) }))} />
        <Select label="Ranking" value={ranking} onChange={(r) => { setRanking(r); setSubs([]); }} options={meta.rankings.map((r) => ({ value: r, label: fmtRanking(r) }))} />
        <MultiSelect label="Bancos" options={meta.bancos.map((b) => ({ value: b.codigo, label: `${b.codigo} · ${b.nombre}` }))} value={bancos} onChange={setBancos} placeholder="Todos los bancos" />
        <MultiSelect label="Subactividades" options={allSubs.map((s) => ({ value: s, label: s }))} value={activeSubs} onChange={setSubs} placeholder="Todas" />
        <button className="btn" onClick={() => { setBancos([]); setSubs([]); }}>Limpiar filtros</button>
      </div>

      <ErrorBox error={error} />
      {loading ? <Loading /> : (
        <>
          <div className="card">
            <h2>{fmtRanking(ranking)} por banco y subactividad · {fmtPeriodo(fecha)}</h2>
            <p className="sub">Total seleccionado: {fmtMoney(total)}</p>
            <Legend items={shown.map((s) => ({ label: s, color: colorOf(s) }))} />
            <div className="chart tall">
              <ResponsiveContainer>
                <BarChart data={chartData} margin={{ left: 10, right: 10, bottom: 50 }} barCategoryGap="20%">
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="banco" angle={-30} textAnchor="end" interval={0} axisLine={false} tickLine={false} height={60} />
                  <YAxis tickFormatter={fmtCompact} axisLine={false} tickLine={false} />
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
            <p className="sub">{fmtInt(data?.length || 0)} filas</p>
            <SortableTable
              rows={data || []}
              rowKey={(r) => r.Codigo_Banco + r.Subactividad}
              initialSort={{ key: 'Saldo', dir: -1 }}
              columns={[
                { key: 'Fecha', label: 'Fecha' },
                { key: 'Ranking', label: 'Ranking' },
                { key: 'Subactividad', label: 'Subactividad', render: (r) => <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><i className="sw" style={{ background: colorOf(r.Subactividad) }} />{r.Subactividad}</span> },
                { key: 'Codigo_Banco', label: 'Código' },
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
