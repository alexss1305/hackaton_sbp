import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useApi, ErrorBox, Loading, Kpi, Badge, ChartTooltip, Select } from '../components/ui.jsx';
import { download, qs } from '../api.js';
import { fmtInt, fmtMoney, fmtPct, fmtCorte } from '../format.js';
import { REGLAS, ERRORES_ARCHIVO } from '../labels.js';

const IDS = ['E1', 'E2', 'E3', 'E4'];
const CLAVES = {
  E1: 'E1_Duplicados',
  E2: 'E2_Destino_Extranjero',
  E3: 'E3_Saldo_No_Positivo',
  E4: 'E4_Actividad_No_Catalogada',
};

export default function Calidad({ ctx }) {
  const { meta, fecha, setFecha, puede } = ctx;
  const { data, error, loading } = useApi(fecha ? `/periods/${fecha}/quality` : null);
  const [abierto, setAbierto] = useState('reglas');
  if (error) return <ErrorBox error={error} />;
  if (loading || !data) return <Loading />;
  const q = data.quality;
  const excluidas = q.Filas_Leidas - q.Universo_Local_Valido;
  const aceptacion = (q.Universo_Local_Valido / q.Filas_Leidas) * 100;
  const barras = meta.periodos.map((p) => ({ corte: fmtCorte(p.fecha) }));
  // Las cifras de otros períodos salen del resumen ya cargado en meta solo como conteo de filas.
  // El gráfico del período abierto usa el reporte de calidad de ese corte.
  const una = [{ corte: fmtCorte(fecha) }];
  for (const id of IDS) una[0][id] = q[CLAVES[id]];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Calidad de datos / {fmtCorte(fecha)}</h1>
          <p>Control de los registros leídos, de las exclusiones y de que los totales cuadren. Las cifras no se recalculan en esta pantalla.</p>
        </div>
        <div className="toolbar">
          <Select label="Fecha de corte" value={fecha} onChange={setFecha} options={meta.periodos.map((p) => ({ value: p.fecha, label: fmtCorte(p.fecha) }))} />
          {puede('descargar_calidad') && <button className="btn" onClick={() => download('/export/calidad.csv')}>Descargar calidad</button>}
          {puede('descargar_excluidas') && <button className="btn" onClick={() => download(`/export/excluidas.csv${qs({ fechas: [fecha] })}`)}>Descargar filas excluidas</button>}
        </div>
      </div>

      <div className="kpis">
        <Kpi label="Registros leídos" value={fmtInt(q.Filas_Leidas)} hint={fmtCorte(fecha)} />
        <Kpi label="Registros válidos" value={fmtInt(q.Universo_Local_Valido)} hint="Universo local válido" />
        <Kpi label="Registros excluidos" value={fmtInt(excluidas)} hint="Primera regla que incumple cada fila" />
        <Kpi label="Aceptación" value={fmtPct(aceptacion, 2)} hint="Válidos sobre leídos" />
      </div>

      <div className="card">
        <h2>Exclusiones por regla</h2>
        <table>
          <thead><tr><th>Regla</th><th>Qué significa</th><th className="num">Cantidad en {fmtCorte(fecha)}</th></tr></thead>
          <tbody>
            {IDS.map((id) => (
              <tr key={id}>
                <td>{id} / {REGLAS[id].nombre}</td>
                <td className="wrap">{REGLAS[id].frase}</td>
                <td className="num">{fmtInt(q[CLAVES[id]])}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="sub">Leídos = exclusiones + válidos {q.Cuadre_Cascada ? <Badge ok>Cuadra</Badge> : <Badge>No cuadra</Badge>}. El conteo independiente (una fila puede incumplir varias reglas) es E1 {fmtInt(q.Conteo_Independiente.E1)}, E2 {fmtInt(q.Conteo_Independiente.E2)}, E3 {fmtInt(q.Conteo_Independiente.E3)}, E4 {fmtInt(q.Conteo_Independiente.E4)}. Ese conteo es informativo y no sustituye la cascada.</p>
      </div>

      <div className="card">
        <h2>Exclusiones en este corte</h2>
        <div className="chart">
          <ResponsiveContainer>
            <BarChart data={una}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="corte" axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Legend />
              {IDS.map((id, i) => <Bar key={id} dataKey={id} name={REGLAS[id].nombre} fill={SERIES_SAFE[i]} radius={[4, 4, 0, 0]} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="muted">Hay {fmtInt(meta.periodos.length)} cortes cargados. Cambie la fecha de corte del selector para ver las barras de otro período. {barras.length > 1 ? '' : ''}</p>
      </div>

      <details className="card" open={abierto === 'reglas'} onToggle={(e) => setAbierto(e.target.open ? 'reglas' : '')}>
        <summary><h2 style={{ display: 'inline' }}>Reconciliaciones</h2></summary>
        <p className="sub">Saldo del universo local válido: {fmtMoney(q.Saldo_Universo_Local_Valido)}</p>
        <table>
          <tbody>
            <tr>
              <td className="wrap"><b>R1.</b> La suma de las subactividades de cada banco es igual al saldo de esa actividad. {data.reconciliaciones.r1.descripcion}</td>
              <td>{data.reconciliaciones.r1.ok ? <Badge ok>Cuadra</Badge> : <Badge>No cuadra</Badge>}</td>
            </tr>
            <tr>
              <td className="wrap"><b>R2.</b> La suma de las seis actividades de cada banco es igual a su cartera local válida. {data.reconciliaciones.r2.descripcion}</td>
              <td>{data.reconciliaciones.r2.ok ? <Badge ok>Cuadra</Badge> : <Badge>No cuadra</Badge>}</td>
            </tr>
            <tr>
              <td className="wrap"><b>R3.</b> La suma de la cartera de los doce bancos es igual al saldo del universo local válido: {fmtMoney(data.reconciliaciones.r3.sumaBancos)} y {fmtMoney(data.reconciliaciones.r3.universo)}.</td>
              <td>{data.reconciliaciones.r3.ok ? <Badge ok>Cuadra</Badge> : <Badge>No cuadra</Badge>}</td>
            </tr>
          </tbody>
        </table>
      </details>

      <details className="card">
        <summary><h2 style={{ display: 'inline' }}>Descripción de errores</h2></summary>
        <p className="sub">Qué puede rechazar o marcar un archivo, y cómo corregirlo antes de cargarlo.</p>
        {ERRORES_ARCHIVO.map((e) => (
          <p key={e.titulo}><b>{e.titulo}.</b> {e.significa} {e.corregir}</p>
        ))}
      </details>
    </>
  );
}

const SERIES_SAFE = ['var(--series-1)', 'var(--series-2)', 'var(--series-4)', 'var(--series-8)'];
