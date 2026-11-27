import { useApi, ErrorBox, Loading, SortableTable, Badge } from '../components/ui.jsx';
import { download, qs } from '../api.js';
import { fmtInt, fmtMoney, fmtPeriodo } from '../format.js';

export default function Calidad({ ctx }) {
  const { fecha, puede } = ctx;
  const { data, error, loading } = useApi(`/periods/${fecha}/quality`);
  if (error) return <ErrorBox error={error} />;
  if (loading || !data) return <Loading />;
  const q = data.quality;
  const steps = [
    { id: 'Leídas', n: q.Filas_Leidas, desc: 'Filas del período (campo Fecha)' },
    { id: 'E1', n: q.E1_Duplicados, desc: data.filtros[0].regla },
    { id: 'E2', n: q.E2_Destino_Extranjero, desc: data.filtros[1].regla },
    { id: 'E3', n: q.E3_Saldo_No_Positivo, desc: data.filtros[2].regla },
    { id: 'E4', n: q.E4_Actividad_No_Catalogada, desc: data.filtros[3].regla },
  ];
  let restantes = q.Filas_Leidas;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Calidad de datos · {fmtPeriodo(fecha)}</h1>
          <p>Exclusiones en cascada: cada filtro se aplica sobre las filas que superaron el anterior y cada fila excluida se cuenta una sola vez, en el primer filtro que incumple.</p>
        </div>
        <div className="toolbar">
          {puede('descargar_calidad') && <button className="btn" onClick={() => download('/export/calidad.csv')}>⬇ Reporte de calidad (todos los períodos)</button>}
          {puede('descargar_excluidas') && <button className="btn" onClick={() => download(`/export/excluidas.csv${qs({ fechas: [fecha] })}`)}>⬇ Filas excluidas</button>}
        </div>
      </div>

      <div className="grid g2">
        <div className="card">
          <h2>Cascada E1–E4</h2>
          <p className="sub">Filas leídas = E1 + E2 + E3 + E4 + universo local válido {q.Cuadre_Cascada ? <Badge ok>Cuadra</Badge> : <Badge>No cuadra</Badge>}</p>
          <table>
            <thead><tr><th>Paso</th><th>Regla</th><th className="num">Excluidas</th><th className="num">Quedan</th></tr></thead>
            <tbody>
              {steps.map((s, i) => {
                if (i > 0) restantes -= s.n;
                return (
                  <tr key={s.id}>
                    <td><b>{s.id}</b></td>
                    <td className="wrap">{s.desc}</td>
                    <td className="num">{i === 0 ? '—' : fmtInt(s.n)}</td>
                    <td className="num">{fmtInt(restantes)}</td>
                  </tr>
                );
              })}
              <tr><td><b>Universo</b></td><td>Universo local válido</td><td /><td className="num"><b>{fmtInt(q.Universo_Local_Valido)}</b></td></tr>
            </tbody>
          </table>
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            Conteo independiente por regla (informativo, una fila puede incumplir varias): E1 {fmtInt(q.Conteo_Independiente.E1)} · E2 {fmtInt(q.Conteo_Independiente.E2)} · E3 {fmtInt(q.Conteo_Independiente.E3)} · E4 {fmtInt(q.Conteo_Independiente.E4)}
          </p>
        </div>

        <div className="card">
          <h2>Controles y reconciliaciones</h2>
          <p className="sub">Saldo del universo local válido: <b>{fmtMoney(q.Saldo_Universo_Local_Valido)}</b></p>
          <table>
            <tbody>
              <tr><td className="wrap">Unicidad de Numero_Prestamo en el universo válido</td><td><Badge ok={q.Prestamos_Unicos_En_Universo}>{q.Prestamos_Unicos_En_Universo ? 'Único' : 'Repetidos'}</Badge></td></tr>
              <tr><td className="wrap"><b>R1</b> · {data.reconciliaciones.r1.descripcion} ({fmtInt(data.reconciliaciones.r1.verificaciones)} verificaciones)</td><td><Badge ok={data.reconciliaciones.r1.ok}>{data.reconciliaciones.r1.ok ? 'Cuadra' : 'No cuadra'}</Badge></td></tr>
              <tr><td className="wrap"><b>R2</b> · {data.reconciliaciones.r2.descripcion}</td><td><Badge ok={data.reconciliaciones.r2.ok}>{data.reconciliaciones.r2.ok ? 'Cuadra' : 'No cuadra'}</Badge></td></tr>
              <tr><td className="wrap"><b>R3</b> · {data.reconciliaciones.r3.descripcion}: {fmtMoney(data.reconciliaciones.r3.sumaBancos)} vs {fmtMoney(data.reconciliaciones.r3.universo)}</td><td><Badge ok={data.reconciliaciones.r3.ok}>{data.reconciliaciones.r3.ok ? 'Cuadra' : 'No cuadra'}</Badge></td></tr>
              <tr><td className="wrap">Operaciones reclasificadas a Tarjeta (crédito personal + facilidad 07, SB21)</td><td><b>{fmtInt(q.Reclasificadas_Tarjeta_SB21)}</b></td></tr>
              <tr><td className="wrap">Alertas de integridad referencial y coherencia CONSUMO (no excluyen filas)</td><td>{q.Alertas ? <Badge kind="warn">{fmtInt(q.Alertas)}</Badge> : <Badge ok>0</Badge>}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>R2 por banco</h2>
        <p className="sub">La suma de las actividades de cada banco es igual a su cartera local válida total.</p>
        <SortableTable rows={data.reconciliaciones.r2.detalle} rowKey={(r) => r.Codigo_Banco} columns={[
          { key: 'Codigo_Banco', label: 'Banco' },
          { key: 'Suma_Actividades', label: 'Suma de actividades', num: true, render: (r) => fmtMoney(r.Suma_Actividades) },
          { key: 'Total_Cartera', label: 'Total cartera local válida', num: true, render: (r) => fmtMoney(r.Total_Cartera) },
          { key: 'Cuadra', label: 'Resultado', render: (r) => <Badge ok={r.Cuadra}>{r.Cuadra ? 'Cuadra' : 'Diferencia'}</Badge> },
        ]} />
      </div>

      <div className="card">
        <h2>Filas excluidas (trazabilidad)</h2>
        <p className="sub">Mostrando {fmtInt(data.excluidas.length)} de {fmtInt(data.totalExcluidas)}. {puede('descargar_excluidas') ? 'Descargue la lista completa con el botón superior.' : 'La descarga de la lista completa requiere permiso (Analista por defecto).'}</p>
        <SortableTable rows={data.excluidas} maxHeight={380} rowKey={(r) => `${r.Archivo}-${r.Linea_Archivo}`} columns={[
          { key: 'Filtro', label: 'Filtro' }, { key: 'Motivo', label: 'Motivo' },
          { key: 'Linea_Archivo', label: 'Línea', num: true }, { key: 'Numero_Prestamo', label: 'Préstamo' },
          { key: 'Codigo_Banco', label: 'Banco' }, { key: 'Destino', label: 'Destino' },
          { key: 'Saldo', label: 'Saldo', num: true, render: (r) => fmtMoney(r.Saldo) }, { key: 'Tipo_Actividad', label: 'Tipo_Actividad' },
        ]} />
      </div>

      {data.totalAlertas > 0 && (
        <div className="card">
          <h2>Alertas de calidad</h2>
          <SortableTable rows={data.alertas} maxHeight={300} columns={[
            { key: 'Tipo', label: 'Tipo' }, { key: 'Numero_Prestamo', label: 'Préstamo' }, { key: 'Codigo_Banco', label: 'Banco' },
            { key: 'Linea_Archivo', label: 'Línea', num: true }, { key: 'Mensaje', label: 'Mensaje', wrap: true },
          ]} />
        </div>
      )}
    </>
  );
}
