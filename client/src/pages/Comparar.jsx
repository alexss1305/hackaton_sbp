import { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { api, qs } from '../api.js';
import { ErrorBox, Loading, SortableTable, ChartTooltip, Select, MultiSelect } from '../components/ui.jsx';
import { fmtMoney, fmtMoneyCompact, fmtPct, fmtCorte, fmtRanking, SERIES } from '../format.js';
import Movimientos from '../components/Movimientos.jsx';

const MEDIDAS = [
  { value: 'saldo', label: 'Saldo' },
  { value: 'ponderacion', label: 'Ponderación (%)' },
  { value: 'posicion', label: 'Posición en el ranking' },
  { value: 'cambio', label: 'Cambio respecto al período anterior' },
];

function csvVisible(filas) {
  const cols = ['Fecha de corte', 'Actividad', 'Banco', 'Saldo', 'Ponderación', 'Posición', 'Cambio de posición'];
  const esc = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  const lines = [cols.join(',')];
  for (const r of filas) lines.push([r.fecha, r.actividad, r.banco, r.saldo, r.ponderacion, r.posicion, r.cambio].map(esc).join(','));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
  a.download = 'comparacion_vista.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function Comparar({ ctx }) {
  const { meta, fecha } = ctx;
  const fechas = meta.periodos.map((p) => p.fecha);
  const [modo, setModo] = useState('entidades');
  const [corte, setCorte] = useState(fecha);
  const [cortes, setCortes] = useState(fechas.slice(-2));
  const [bancos, setBancos] = useState(meta.bancos.slice(0, 2).map((b) => b.codigo));
  const [actividades, setActividades] = useState([meta.rankings[0]]);
  const [medida, setMedida] = useState('saldo');
  const [rankings, setRankings] = useState(null);
  const [movs, setMovs] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const actividadesOn = actividades.length ? actividades : meta.rankings;
  const bancosOn = bancos.length ? bancos.slice(0, 4) : meta.bancos.map((b) => b.codigo);
  const cortesOn = [...cortes].sort();
  const par = cortesOn.length >= 2 ? [cortesOn[0], cortesOn[cortesOn.length - 1]] : [cortesOn[0], cortesOn[0]];

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    const fechasCarga = modo === 'entidades' ? [corte] : cortesOn;
    const jobs = [
      ...fechasCarga.map((f) => api(`/periods/${f}/rankings`)),
      par[0] && par[0] !== par[1] ? api(`/compare${qs({ desde: par[0], hasta: par[1] })}`) : Promise.resolve(null),
    ];
    Promise.all(jobs).then((res) => {
      if (!alive) return;
      const maps = {};
      fechasCarga.forEach((f, i) => { maps[f] = res[i]; });
      setRankings(maps);
      setMovs(res.at(-1));
      setLoading(false);
    }).catch((e) => { if (alive) { setError(e); setLoading(false); } });
    return () => { alive = false; };
  }, [modo, corte, cortesOn.join(','), par[0], par[1]]);

  const filas = useMemo(() => {
    if (!rankings) return [];
    const out = [];
    const fuentes = modo === 'entidades' ? [corte] : cortesOn;
    for (const f of fuentes) {
      const pack = rankings[f];
      if (!pack) continue;
      for (const act of actividadesOn) {
        for (const row of pack[act] || []) {
          if (!bancosOn.includes(row.Codigo_Banco)) continue;
          out.push({
            fecha: f, actividad: act, codigo: row.Codigo_Banco, banco: row.Banco,
            saldo: row.Saldo_Actividad, ponderacion: row.Ponderacion_Pct, posicion: row.Posicion,
            cambio: '',
          });
        }
      }
    }
    if (movs?.movimientos && medida === 'cambio') {
      for (const row of out) {
        const m = movs.movimientos.find((x) => x.Fecha_Actual === row.fecha && x.Ranking === row.actividad && x.Codigo_Banco === row.codigo);
        if (m) row.cambio = m.Cambio_Posicion;
      }
    }
    return out;
  }, [rankings, movs, modo, corte, cortesOn.join(','), actividadesOn.join(','), bancosOn.join(','), medida]);

  const grafico = useMemo(() => {
    if (modo === 'entidades') {
      return filas.filter((r) => r.actividad === actividadesOn[0]).map((r) => ({
        nombre: r.banco,
        valor: medida === 'ponderacion' ? Number(r.ponderacion) : medida === 'posicion' ? Number(r.posicion) : medida === 'cambio' ? Number(r.cambio || 0) : Number(r.saldo),
      }));
    }
    const act = actividadesOn[0];
    return cortesOn.map((f) => {
      const punto = { fecha: fmtCorte(f) };
      for (const codigo of bancosOn) {
        const row = filas.find((r) => r.fecha === f && r.actividad === act && r.codigo === codigo);
        const banco = meta.bancos.find((b) => b.codigo === codigo)?.nombre || codigo;
        punto[banco] = row ? (medida === 'ponderacion' ? Number(row.ponderacion) : medida === 'posicion' ? Number(row.posicion) : medida === 'cambio' ? Number(row.cambio || 0) : Number(row.saldo)) : null;
      }
      return punto;
    });
  }, [filas, modo, medida, actividadesOn, cortesOn, bancosOn, meta.bancos]);

  const fmtValor = (v) => (medida === 'saldo' ? fmtMoney(v) : medida === 'ponderacion' ? fmtPct(v, 2) : String(v ?? '—'));
  const nombres = bancosOn.map((c) => meta.bancos.find((b) => b.codigo === c)?.nombre || c);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Comparar</h1>
          <p>Compare bancos en un mismo corte, o un banco a lo largo de varios cortes. Las cifras vienen del cálculo ya hecho.</p>
        </div>
        <button className="btn" onClick={() => csvVisible(filas.map((r) => ({ ...r, fecha: fmtCorte(r.fecha), actividad: fmtRanking(r.actividad), saldo: r.saldo, ponderacion: r.ponderacion })))}>Descargar comparación visible</button>
      </div>

      <div className="card">
        <Select label="Modo de comparación" value={modo} onChange={setModo} options={[
          { value: 'entidades', label: 'Entre entidades (mismo período)' },
          { value: 'periodos', label: 'Entre períodos (misma entidad)' },
        ]} />
        <p className="sub">{modo === 'entidades'
          ? 'Compara varios bancos en una misma fecha de corte.'
          : 'Sigue a los bancos elegidos a través de dos o más fechas de corte.'}</p>
        <div className="toolbar">
          {modo === 'entidades'
            ? <Select label="Fecha de corte" value={corte} onChange={setCorte} options={fechas.map((f) => ({ value: f, label: fmtCorte(f) }))} />
            : <MultiSelect label="Fechas de corte" options={fechas.map((f) => ({ value: f, label: fmtCorte(f) }))} value={cortes} onChange={(v) => setCortes(v.length ? v : cortes)} placeholder="Elija dos o más" />}
          <MultiSelect label="Entidades" options={meta.bancos.map((b) => ({ value: b.codigo, label: b.nombre }))} value={bancos} onChange={(v) => setBancos(v.slice(0, 4))} placeholder="Todos los bancos" />
          <MultiSelect label="Actividades" options={meta.rankings.map((r) => ({ value: r, label: fmtRanking(r) }))} value={actividades} onChange={setActividades} placeholder="Todas las actividades" />
          <Select label="Medida" value={medida} onChange={setMedida} options={MEDIDAS} />
        </div>
      </div>

      <p className="resumen-sel">
        Comparando {nombres.join(', ')} / {modo === 'entidades' ? `corte ${fmtCorte(corte)}` : cortesOn.map(fmtCorte).join(', ')} / {actividadesOn.map(fmtRanking).join(', ')} / {MEDIDAS.find((m) => m.value === medida).label}.
      </p>

      <ErrorBox error={error} />
      {loading || !rankings ? <Loading /> : (
        <>
          <div className="card">
            <h2>{modo === 'entidades' ? 'Comparación entre entidades' : 'Comparación entre períodos'}</h2>
            <div className="chart">
              <ResponsiveContainer>
                {modo === 'entidades' ? (
                  <BarChart data={grafico} margin={{ left: 10, right: 10, bottom: 40 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="nombre" interval={0} angle={-25} textAnchor="end" height={70} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={medida === 'saldo' ? fmtMoneyCompact : (v) => v} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip valueFormatter={fmtValor} />} />
                    <Bar dataKey="valor" name={MEDIDAS.find((m) => m.value === medida).label} fill="var(--series-1)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                ) : (
                  <LineChart data={grafico} margin={{ left: 10, right: 10 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="fecha" axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={medida === 'saldo' ? fmtMoneyCompact : (v) => v} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip valueFormatter={fmtValor} />} />
                    <Legend />
                    {nombres.map((n, i) => <Line key={n} dataKey={n} stroke={SERIES[i % SERIES.length]} dot={false} strokeWidth={2} />)}
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
          <div className="card">
            <SortableTable
              rows={filas}
              rowKey={(r) => r.fecha + r.actividad + r.codigo}
              columns={[
                { key: 'fecha', label: 'Fecha de corte', render: (r) => fmtCorte(r.fecha) },
                { key: 'actividad', label: 'Actividad', render: (r) => fmtRanking(r.actividad) },
                { key: 'banco', label: 'Banco' },
                { key: 'saldo', label: 'Saldo', num: true, render: (r) => fmtMoney(r.saldo) },
                { key: 'ponderacion', label: 'Ponderación', num: true, render: (r) => fmtPct(r.ponderacion) },
                { key: 'posicion', label: 'Posición', num: true },
                { key: 'cambio', label: 'Cambio de posición', num: true, render: (r) => (r.cambio === '' ? '—' : r.cambio) },
              ]}
            />
          </div>
          {movs?.movimientos && (
            <div className="card">
              <Movimientos movimientos={movs.movimientos.filter((m) => actividadesOn.includes(m.Ranking) && bancosOn.includes(m.Codigo_Banco))} desde={par[0]} hasta={par[1]} />
            </div>
          )}
        </>
      )}
    </>
  );
}
