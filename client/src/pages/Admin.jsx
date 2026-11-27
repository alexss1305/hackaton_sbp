import { Fragment, useState } from 'react';
import { api, download } from '../api.js';
import { useApi, ErrorBox, Loading, SortableTable, Badge, Select } from '../components/ui.jsx';
import { fmtInt, fmtPeriodo, fmtFechaHora, fmtMoney, fmtRanking } from '../format.js';
import Diagnostico from '../components/Diagnostico.jsx';
import { useConfirmar } from '../components/Confirmar.jsx';
import Usuarios from '../components/Usuarios.jsx';
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
      <Usuarios />
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
  const [dlg, confirmar] = useConfirmar();
  const paso = result ? 3 : preview || rechazo ? 2 : 1;

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
    const fechas = preview.fechas;
    const antes = ctx.meta.periodos.filter((p) => fechas.includes(p.fecha));
    const despues = preview.diagnostico?.porPeriodo || [];
    const ok = await confirmar(preview.reemplaza.length ? {
      titulo: `Reemplazar ${fechas.map(fmtPeriodo).join(', ')}`,
      mensaje: `El período ya existe. El archivo actual (${preview.reemplaza.join(', ')}) pasará al historial y se recalcularán todos los rankings. Podrá restaurarlo desde "Versiones".`,
      cambios: fechas.flatMap((f) => {
        const a = antes.find((x) => x.fecha === f); const d = despues.find((x) => x.Fecha === f);
        return [
          { dato: `${fmtPeriodo(f)} · filas`, antes: a ? fmtInt(a.filas) : null, despues: d ? fmtInt(d.Filas_Leidas) : null },
          { dato: `${fmtPeriodo(f)} · universo válido`, antes: a ? fmtInt(a.universo) : null, despues: d ? fmtInt(d.Universo_Local_Valido) : null },
        ];
      }),
      confirmarTexto: 'Reemplazar y recalcular',
      peligro: true,
    } : {
      titulo: `Importar ${fechas.map(fmtPeriodo).join(', ')}`,
      mensaje: `Se agregará ${fechas.length === 1 ? 'un período nuevo' : `${fechas.length} períodos nuevos`} y se recalcularán los rankings y las comparaciones.`,
      cambios: despues.map((d) => ({ dato: `${fmtPeriodo(d.Fecha)} · universo válido`, antes: null, despues: fmtInt(d.Universo_Local_Valido) })),
      confirmarTexto: 'Importar y recalcular',
    });
    if (!ok) return;
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
      <ol className="stepper" aria-label="Pasos de la carga">
        {['Elegir archivo', 'Revisar diagnóstico', 'Listo'].map((t, i) => (
          <li key={t} className={paso === i + 1 ? 'on' : paso > i + 1 ? 'done' : ''} aria-current={paso === i + 1 ? 'step' : undefined}><span>{paso > i + 1 ? '✓' : i + 1}</span>{t}</li>
        ))}
      </ol>
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
          <div className="toolbar">
            <button className="btn" onClick={() => ctx.goTo('comparar')}>Ver comparación completa</button>
            <button className="btn" onClick={() => setResult(null)}>Cargar otro archivo</button>
          </div>
        </div>
      )}
      {dlg}
    </div>
  );
}

function Periodos({ ctx }) {
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(null);
  const [abierto, setAbierto] = useState(null);
  const [versiones, setVersiones] = useState([]);
  const [dlg, confirmar] = useConfirmar();
  const remove = async (p) => {
    const si = await confirmar({
      titulo: `Retirar ${fmtPeriodo(p.fecha)}`, peligro: true, palabra: 'RETIRAR', confirmarTexto: 'Retirar período',
      mensaje: 'El período dejará de mostrarse en rankings, comparaciones y reportes. El archivo pasa al historial y se puede restaurar volviendo a cargarlo.',
      cambios: [{ dato: 'Períodos cargados', antes: fmtInt(ctx.meta.periodos.length), despues: fmtInt(ctx.meta.periodos.length - 1) }, { dato: 'Filas del período', antes: fmtInt(p.filas), despues: '0' }],
    });
    if (!si) return;
    setError(null); setOk(null);
    try { await api(`/admin/periods/${p.fecha}`, { method: 'DELETE' }); await ctx.reloadMeta(); setOk(`Se retiró ${fmtPeriodo(p.fecha)}.`); } catch (e) { setError(e); }
  };
  const verVersiones = async (fecha) => {
    if (abierto === fecha) { setAbierto(null); return; }
    setError(null);
    try { setVersiones(await api(`/admin/periods/${fecha}/versiones`)); setAbierto(fecha); } catch (e) { setError(e); }
  };
  const restaurar = async (fecha, v) => {
    const si = await confirmar({
      titulo: `Restaurar versión de ${fmtPeriodo(fecha)}`, peligro: true, confirmarTexto: 'Restaurar y recalcular',
      mensaje: `Se restaurará ${v.nombreOriginal} (guardado el ${v.guardado ? new Date(v.guardado).toLocaleString('es-PA') : 'sin fecha'}). La versión actual pasará al historial.`,
      cambios: [{ dato: 'Filas', antes: fmtInt(ctx.meta.periodos.find((x) => x.fecha === fecha)?.filas), despues: fmtInt(v.filas) }],
    });
    if (!si) return;
    setError(null); setOk(null);
    try { await api(`/admin/periods/${fecha}/restaurar`, { method: 'POST', body: { archivo: v.archivo } }); await ctx.reloadMeta(); setAbierto(null); setOk(`Versión restaurada para ${fmtPeriodo(fecha)}.`); } catch (e) { setError(e); }
  };
  const recalc = async () => { try { await api('/admin/recalculate', { method: 'POST' }); await ctx.reloadMeta(); setOk('Todo recalculado desde los archivos.'); } catch (e) { setError(e); } };
  return (
    <div className="card">
      <h2>Períodos cargados</h2>
      <p className="sub">Los rankings se recalculan desde estos archivos. Cada reemplazo guarda la versión anterior.</p>
      <ErrorBox error={error} />
      {ok && <div className="alert success">{ok}</div>}
      {ctx.meta.erroresArchivos?.map((e) => <div key={e.archivo} className="alert error">Archivo rechazado {e.archivo}: {e.errores.join(' ')}</div>)}
      <table>
        <thead><tr><th>Período</th><th>Archivo</th><th className="num">Filas</th><th className="num">Universo</th><th /></tr></thead>
        <tbody>
          {ctx.meta.periodos.map((p) => (
            <Fragment key={p.fecha}>
              <tr>
                <td>{fmtPeriodo(p.fecha)}<br /><span className="muted">{p.fecha}</span></td>
                <td>{p.archivos.join(', ')}</td>
                <td className="num">{fmtInt(p.filas)}</td>
                <td className="num">{fmtInt(p.universo)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn" onClick={() => verVersiones(p.fecha)} aria-expanded={abierto === p.fecha}>Versiones</button>{' '}
                  <button className="btn danger" onClick={() => remove(p)}>Retirar</button>
                </td>
              </tr>
              {abierto === p.fecha && (
                <tr><td colSpan={5}>
                  {versiones.length === 0 ? <span className="muted">No hay versiones anteriores de este período.</span> : (
                    <table>
                      <thead><tr><th>Archivo</th><th>Guardado</th><th className="num">Filas</th><th /></tr></thead>
                      <tbody>
                        {versiones.map((v) => (
                          <tr key={v.archivo}>
                            <td>{v.nombreOriginal}</td>
                            <td>{v.guardado ? new Date(v.guardado).toLocaleString('es-PA') : '—'}</td>
                            <td className="num">{fmtInt(v.filas)}</td>
                            <td><button className="btn" onClick={() => restaurar(p.fecha, v)}>Restaurar</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </td></tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
      <button className="btn" style={{ marginTop: 12 }} onClick={recalc}>Recalcular todo</button>
      {dlg}
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
  const [dlg, confirmar] = useConfirmar();
  const { data, error, loading, reload } = useApi('/admin/catalogs');
  const [kind, setKind] = useState('cinu');
  const [msg, setMsg] = useState(null);
  const [upErr, setUpErr] = useState(null);
  const replace = async (f) => {
    setMsg(null); setUpErr(null);
    if (!f) return;
    if (!(await confirmar({ titulo: `Reemplazar ${data[kind].archivo}`, peligro: true, confirmarTexto: 'Reemplazar y recalcular', mensaje: `Se reemplazará el catálogo con ${f.name} y se recalcularán todos los rankings. Se guarda copia del catálogo anterior en el historial.` }))) return;
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
      {dlg}
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
      <p className="sub">Los tres perfiles están definidos por el reto. Esta tabla solo los muestra. Las funciones de Administración no se pueden pasar a otro perfil.</p>
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
