import { Fragment, useState } from 'react';
import { api, download } from '../api.js';
import { useApi, ErrorBox, Loading, SortableTable, Badge, Select } from '../components/ui.jsx';
import { fmtInt, fmtPeriodo, fmtFechaHora, fmtMoney, fmtRanking } from '../format.js';
import Diagnostico from '../components/Diagnostico.jsx';
import { etiquetaMotivo } from '../labels.js';

const readFile = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file, 'utf-8'); });

export default function Admin({ ctx }) {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Administración</h1>
          <p>Carga y actualización de períodos, parámetros de análisis, catálogos y registro de operaciones. Cada cambio recalcula todos los rankings automáticamente, sin editar código.</p>
        </div>
      </div>
      <Carga ctx={ctx} />
      <div className="grid g2">
        <Periodos ctx={ctx} />
        <Parametros ctx={ctx} />
      </div>
      <Permisos />
      <Contrasenas />
      <Catalogos ctx={ctx} />
      <Bitacora />
    </>
  );
}

function Carga({ ctx }) {
  const [file, setFile] = useState(null);
  const [text, setText] = useState('');
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [rechazo, setRechazo] = useState(null); // diagnóstico de un archivo que no se puede importar

  const pick = async (f) => {
    setResult(null); setPreview(null); setError(null); setRechazo(null);
    if (!f) return;
    if (!/\.(csv|txt)$/i.test(f.name)) { setError(new Error('El archivo debe ser .csv (formato AT03 separado por comas). Si viene de Excel, use Guardar como, CSV UTF-8.')); return; }
    setFile(f); setBusy(true);
    try {
      const t = await readFile(f);
      setText(t);
      setPreview(await api(`/admin/periods?nombre=${encodeURIComponent(f.name)}&dryRun=1`, { method: 'POST', body: t, headers: { 'Content-Type': 'text/csv' } }));
    } catch (e) {
      if (e.diagnostico) setRechazo(e.diagnostico); else setError(e);
    } finally { setBusy(false); }
  };
  const descargarDiagnostico = async () => {
    try { await download(`/admin/periods/diagnostico.csv?nombre=${encodeURIComponent(file.name)}&bom=1`, 'diagnostico.csv', { method: 'POST', body: text, headers: { 'Content-Type': 'text/csv' } }); } catch (e) { setError(e); }
  };
  const confirm = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api(`/admin/periods?nombre=${encodeURIComponent(file.name)}`, { method: 'POST', body: text, headers: { 'Content-Type': 'text/csv' } });
      setResult(r); setPreview(null); setFile(null);
      await ctx.reloadMeta();
      ctx.setFecha(r.fechas.at(-1));
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  return (
    <div className="card">
      <h2>Cargar o actualizar un período</h2>
      <p className="sub">Archivo AT03 en CSV con las 61 columnas del diccionario. El período se toma del campo Fecha. Si el período ya existe, se reemplaza (el archivo anterior queda en historial).</p>
      <div className={`dropzone ${over ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}>
        <p>Arrastre aquí el archivo AT03 o</p>
        <input type="file" accept=".csv,.txt,text/csv" onChange={(e) => { pick(e.target.files[0]); e.target.value = ''; }} />
      </div>
      {busy && <Loading />}
      <div style={{ marginTop: 12 }}><ErrorBox error={error} /></div>
      {rechazo && (
        <div style={{ marginTop: 12 }}>
          <Diagnostico diag={rechazo} onDescargar={descargarDiagnostico} />
          <div className="toolbar" style={{ marginTop: 10 }}>
            <button className="btn" onClick={() => { setRechazo(null); setFile(null); }}>Cerrar</button>
          </div>
        </div>
      )}
      {preview && (
        <div style={{ marginTop: 12 }}>
          {preview.diagnostico && <Diagnostico diag={preview.diagnostico} onDescargar={descargarDiagnostico} />}
          <div className="alert info" style={{ marginTop: 12 }}>
            {preview.reemplaza.length > 0
              ? <><b>Actualizará</b> el período existente (reemplaza {preview.reemplaza.join(', ')}; el archivo anterior queda en historial).</>
              : <><b>Período nuevo:</b> {preview.fechas.map(fmtPeriodo).join(', ')}.</>}
            <div className="toolbar" style={{ marginTop: 10 }}>
              <button className="btn primary" onClick={confirm} disabled={busy}>{preview.accion === 'nuevo' ? 'Importar y recalcular' : 'Actualizar y recalcular'}</button>
              <button className="btn" onClick={() => { setPreview(null); setFile(null); }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
      {result && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="alert success"><b>Período cargado y rankings recalculados.</b> Períodos disponibles: {result.periodosAhora.map(fmtPeriodo).join(' / ')}</div>
          {result.resultados.map((r) => (
            <div key={r.fecha}>
              <p style={{ margin: '0 0 6px' }}>
                <b>{fmtPeriodo(r.fecha)}</b>: {fmtInt(r.calidad.Filas_Leidas)} filas leídas / E1 {r.calidad.E1_Duplicados} / E2 {r.calidad.E2_Destino_Extranjero} / E3 {r.calidad.E3_Saldo_No_Positivo} / E4 {r.calidad.E4_Actividad_No_Catalogada} / universo {fmtInt(r.calidad.Universo_Local_Valido)} ({fmtMoney(r.calidad.Saldo_Universo_Local_Valido)}){' '}
                <Badge ok={r.calidad.Reconciliacion_1 && r.calidad.Reconciliacion_2}>Reconciliaciones</Badge>
              </p>
              {r.comparadoCon ? (
                <>
                  <p className="muted" style={{ margin: '0 0 6px' }}>Movimientos significativos detectados frente a {fmtPeriodo(r.comparadoCon)}: <b>{r.movimientosSignificativos.length}</b></p>
                  <ul className="explain">
                    {r.movimientosSignificativos.slice(0, 10).map((m) => <li key={m.Ranking + m.Codigo_Banco} className={(m.Cambio_Posicion ?? 0) < 0 ? 'down' : ''}><div className="r">{fmtRanking(m.Ranking)} / {etiquetaMotivo(m.Motivo_Significativo)}</div>{m.Explicacion}</li>)}
                  </ul>
                </>
              ) : <p className="muted">Es el primer período: no hay período anterior para comparar.</p>}
            </div>
          ))}
          <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => ctx.goTo('comparar')}>Ver comparación completa</button>
        </div>
      )}
    </div>
  );
}

function Periodos({ ctx }) {
  const [error, setError] = useState(null);
  const remove = async (fecha) => {
    if (!window.confirm(`¿Retirar el período ${fmtPeriodo(fecha)}? El archivo se mueve a historial y se recalculan los rankings.`)) return;
    try { await api(`/admin/periods/${fecha}`, { method: 'DELETE' }); await ctx.reloadMeta(); } catch (e) { setError(e); }
  };
  const recalc = async () => { try { await api('/admin/recalculate', { method: 'POST' }); await ctx.reloadMeta(); } catch (e) { setError(e); } };
  return (
    <div className="card">
      <h2>Períodos cargados</h2>
      <p className="sub">Los rankings se recalculan desde estos archivos.</p>
      <ErrorBox error={error} />
      {ctx.meta.erroresArchivos?.map((e) => <div key={e.archivo} className="alert error">Archivo rechazado {e.archivo}: {e.errores.join(' ')}</div>)}
      <table>
        <thead><tr><th>Período</th><th>Archivo</th><th className="num">Filas</th><th className="num">Universo</th><th /></tr></thead>
        <tbody>
          {ctx.meta.periodos.map((p) => (
            <tr key={p.fecha}>
              <td>{fmtPeriodo(p.fecha)}<br /><span className="muted">{p.fecha}</span></td>
              <td>{p.archivos.join(', ')}</td>
              <td className="num">{fmtInt(p.filas)}</td>
              <td className="num">{fmtInt(p.universo)}</td>
              <td><button className="btn danger" onClick={() => remove(p.fecha)}>Retirar</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn" style={{ marginTop: 12 }} onClick={recalc}>Recalcular todo</button>
    </div>
  );
}

function Parametros({ ctx }) {
  const [p, setP] = useState(ctx.meta.params);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const save = async (e) => {
    e.preventDefault(); setMsg(null); setError(null);
    try { const r = await api('/admin/params', { method: 'PUT', body: p }); setP(r); setMsg('Parámetros guardados. Las comparaciones se recalcularon.'); await ctx.reloadMeta(); } catch (err) { setError(err); }
  };
  return (
    <form className="card" onSubmit={save}>
      <h2>Regla de movimiento significativo</h2>
      <p className="sub">Un movimiento es significativo si cumple <b>cualquiera</b> de las condiciones activas.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label className="field">Cambio mínimo de posición (|Cambio_Posicion| ≥ N)
          <input type="number" min={1} max={12} value={p.minCambioPosicion} onChange={(e) => setP({ ...p, minCambioPosicion: e.target.value })} />
        </label>
        <label className="field">Umbral de variación de saldo en % (0 = desactivado)
          <input type="number" min={0} step="0.1" value={p.umbralVarSaldoPct} onChange={(e) => setP({ ...p, umbralVarSaldoPct: e.target.value })} />
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={p.cambioLider} onChange={(e) => setP({ ...p, cambioLider: e.target.checked })} /> Señalar cambio de líder (posición 1)
        </label>
        <button className="btn primary" style={{ alignSelf: 'flex-start' }}>Guardar parámetros</button>
        {msg && <div className="alert success">{msg}</div>}
        <ErrorBox error={error} />
      </div>
    </form>
  );
}

function Catalogos({ ctx }) {
  const { data, error, loading, reload } = useApi('/admin/catalogs');
  const [kind, setKind] = useState('cinu');
  const [msg, setMsg] = useState(null);
  const [upErr, setUpErr] = useState(null);
  const replace = async (f) => {
    setMsg(null); setUpErr(null);
    if (!f) return;
    if (!window.confirm(`¿Reemplazar el catálogo ${data[kind].archivo} con ${f.name}? Se recalcularán todos los rankings.`)) return;
    try {
      await api(`/admin/catalogs/${kind}`, { method: 'PUT', body: await readFile(f), headers: { 'Content-Type': 'text/csv' } });
      setMsg('Catálogo actualizado y rankings recalculados.'); reload(); await ctx.reloadMeta();
    } catch (e) { setUpErr(e); }
  };
  if (error) return <ErrorBox error={error} />;
  if (loading || !data) return <Loading />;
  const c = data[kind];
  return (
    <div className="card">
      <h2>Catálogos</h2>
      <p className="sub">Toda clasificación proviene exclusivamente de estos catálogos. Puede consultarlos o reemplazarlos con una versión validada (se guarda copia del anterior).</p>
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <Select label="Catálogo" value={kind} onChange={setKind} options={Object.entries(data).map(([k, v]) => ({ value: k, label: v.archivo }))} />
        <label className="field">Reemplazar con archivo CSV
          <input type="file" accept=".csv" onChange={(e) => { replace(e.target.files[0]); e.target.value = ''; }} />
        </label>
      </div>
      {msg && <div className="alert success">{msg}</div>}
      <ErrorBox error={upErr} />
      <SortableTable rows={c.filas} maxHeight={340} columns={c.columnas.map((col) => ({ key: col, label: col, wrap: col.startsWith('Desc') || col === 'Regla_clave' }))} />
    </div>
  );
}

function Bitacora() {
  const { data, error, loading, reload } = useApi('/admin/log');
  return (
    <div className="card">
      <div className="page-head"><div><h2>Registro de operaciones</h2><p className="sub">Qué se cargó, cuándo y con qué perfil.</p></div><button className="btn" onClick={reload}>Actualizar</button></div>
      <ErrorBox error={error} />
      {loading ? <Loading /> : (
        <SortableTable rows={data || []} maxHeight={340} columns={[
          { key: 'Fecha_Hora', label: 'Fecha y hora', render: (r) => fmtFechaHora(r.Fecha_Hora) },
          { key: 'Perfil', label: 'Perfil' },
          { key: 'Accion', label: 'Acción' },
          { key: 'Detalle', label: 'Detalle', wrap: true },
        ]} empty="Aún no hay operaciones registradas." />
      )}
    </div>
  );
}

const PERFIL_COLS = [{ id: 'publico', label: 'Público' }, { id: 'analista', label: 'Analista' }];

function Permisos() {
  const { data, error, loading } = useApi('/admin/permisos');
  if (error) return <ErrorBox error={error} />;
  if (loading || !data) return <Loading />;
  const grupos = [...new Set(data.catalogo.map((p) => p.grupo))];
  return (
    <div className="card">
      <h2>Perfiles y permisos</h2>
      <p className="sub">Los tres perfiles están definidos por el reto. Esta tabla solo los muestra. Las funciones de Administración y de Consultas no se pueden pasar a otro perfil.</p>
      <table>
        <thead><tr><th>Qué puede hacer</th>{PERFIL_COLS.map((c) => <th key={c.id}>{c.label}</th>)}<th>Administrador</th></tr></thead>
        <tbody>
          {grupos.map((g) => (
            <Fragment key={g}>
              <tr><td colSpan={4} style={{ fontWeight: 600, background: 'var(--surface-2)' }}>{g}</td></tr>
              {data.catalogo.filter((p) => p.grupo === g).map((p) => (
                <tr key={p.clave}>
                  <td className="wrap">{p.label}</td>
                  {PERFIL_COLS.map((c) => <td key={c.id}>{(data.asignaciones[p.clave] || []).includes(c.id) ? 'Sí' : 'No'}</td>)}
                  <td>Sí</td>
                </tr>
              ))}
            </Fragment>
          ))}
          <tr><td>Cargar períodos, catálogos, parámetros, bitácora y consultas de préstamos</td><td>No</td><td>No</td><td>Sí</td></tr>
        </tbody>
      </table>
    </div>
  );
}

function Contrasenas() {
  const [perfil, setPerfil] = useState('analista');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const guardar = async (e) => {
    e.preventDefault();
    setErr(null); setMsg(null);
    try {
      await api('/admin/contrasena', { method: 'PUT', body: { perfil, password } });
      setPassword('');
      setMsg('Contraseña actualizada. No se vuelve a mostrar.');
    } catch (ex) { setErr(ex); }
  };
  return (
    <form className="card" onSubmit={guardar}>
      <h2>Contraseñas</h2>
      <p className="sub">Escriba una contraseña nueva para Analista o Administrador. La actual no se muestra.</p>
      <div className="toolbar">
        <Select label="Perfil" value={perfil} onChange={setPerfil} options={[{ value: 'analista', label: 'Analista' }, { value: 'administrador', label: 'Administrador' }]} />
        <label className="field">Contraseña nueva
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} />
        </label>
        <button className="btn primary" type="submit">Guardar contraseña</button>
      </div>
      {msg && <div className="alert success">{msg}</div>}
      <ErrorBox error={err} />
    </form>
  );
}
