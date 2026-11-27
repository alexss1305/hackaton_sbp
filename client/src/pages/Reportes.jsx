import { useState } from 'react';
import { download, qs } from '../api.js';
import { ErrorBox, MultiSelect } from '../components/ui.jsx';
import { fmtPeriodo, fmtRanking } from '../format.js';

export default function Reportes({ ctx }) {
  const { meta, nivel } = ctx;
  const [error, setError] = useState(null);
  const [fechas, setFechas] = useState([]);
  const [rankings, setRankings] = useState([]);
  const [bancos, setBancos] = useState([]);
  const run = (path) => { setError(null); download(path).catch(setError); };

  const oficiales = [
    { t: 'Rankings por período', d: 'Entregable 2: Fecha, Ranking, Posicion, Codigo_Banco, Banco, Saldo_Actividad, Total_Cartera_Local_Valida, Ponderacion_Pct, Operaciones_Validas.', p: '/export/rankings.csv', min: 1 },
    { t: 'Desglose por subactividad', d: 'Entregable 3: Fecha, Ranking, Subactividad, Codigo_Banco, Saldo (incluye reclasificación SB21 a Tarjeta).', p: '/export/subactividades.csv', min: 1 },
    { t: 'Reporte de calidad', d: 'Entregable 4: conteos en cascada E1–E4, universo local válido y reconciliaciones por período.', p: '/export/calidad.csv', min: 1 },
    { t: 'Movimientos de posición', d: 'Entregable 5: períodos consecutivos y primero→último, con regla de significancia y explicación.', p: '/export/movimientos.csv', min: 2 },
    { t: 'Filas excluidas', d: 'Lista trazable de cada fila excluida con archivo, línea y motivo.', p: '/export/excluidas.csv', min: 2 },
    { t: 'Alertas de calidad', d: 'Integridad referencial y coherencia de CONSUMO (no excluyen filas).', p: '/export/alertas.csv', min: 2 },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Reportes y descargas</h1>
          <p>Archivos CSV (UTF-8, separador coma) generados automáticamente desde los datos cargados. Los códigos conservan sus ceros a la izquierda.</p>
        </div>
      </div>
      <ErrorBox error={error} />
      <div className="grid g3">
        {oficiales.filter((o) => nivel >= o.min).map((o) => (
          <div className="card" key={o.t} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h3>{o.t}</h3>
            <p className="sub" style={{ flex: 1 }}>{o.d}</p>
            <button className="btn primary" onClick={() => run(o.p)}>⬇ Descargar (todos los períodos)</button>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Reporte personalizado</h2>
        <p className="sub">
          {nivel >= 2 ? 'Seleccione períodos, rankings y entidades y descargue solo esa información.' : 'Seleccione los filtros y descargue la información autorizada. La comparación de períodos y movimientos está disponible para el perfil Analista.'}
        </p>
        <div className="toolbar">
          <MultiSelect label="Períodos" options={meta.periodos.map((p) => ({ value: p.fecha, label: fmtPeriodo(p.fecha) }))} value={fechas} onChange={setFechas} placeholder="Todos" />
          <MultiSelect label="Rankings" options={meta.rankings.map((r) => ({ value: r, label: fmtRanking(r) }))} value={rankings} onChange={setRankings} placeholder="Todos" />
          <MultiSelect label="Bancos" options={meta.bancos.map((b) => ({ value: b.codigo, label: `${b.codigo} · ${b.nombre}` }))} value={bancos} onChange={setBancos} placeholder="Todos" />
        </div>
        <div className="toolbar" style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => run(`/export/rankings.csv${qs({ fechas, rankings, bancos })}`)}>⬇ Rankings filtrados</button>
          <button className="btn" onClick={() => run(`/export/subactividades.csv${qs({ fechas, rankings, bancos })}`)}>⬇ Subactividades filtradas</button>
          {nivel >= 2 && fechas.length === 2 && (
            <button className="btn" onClick={() => run(`/export/movimientos.csv${qs({ desde: [...fechas].sort()[0], hasta: [...fechas].sort()[1], rankings, bancos })}`)}>⬇ Movimientos entre los 2 períodos</button>
          )}
        </div>
        {nivel >= 2 && fechas.length !== 2 && <p className="muted" style={{ fontSize: 12 }}>Seleccione exactamente 2 períodos para descargar también sus movimientos.</p>}
      </div>
    </>
  );
}
