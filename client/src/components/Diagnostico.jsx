import { useState } from 'react';
import { Icon } from './brand.jsx';
import { fmtInt, fmtMoney, fmtPeriodo } from '../format.js';

const GRAVEDAD = {
  bloqueante: { label: 'Bloqueante', desc: 'impide importar el archivo', cls: 'bad' },
  calculo: { label: 'Afecta el cálculo', desc: 'la fila se importa pero se excluye (E1–E4) o queda fuera de un catálogo', cls: 'warn' },
  advertencia: { label: 'Advertencia', desc: 'dato fuera de formato que no cambia el ranking', cls: 'muted' },
};
const ESTADO = {
  limpio: { titulo: 'Archivo listo para importar', texto: 'No se encontraron observaciones.', cls: 'success', icon: 'check' },
  con_observaciones: { titulo: 'Se puede importar, con observaciones', texto: 'Revise las observaciones antes de confirmar. Ninguna impide la importación.', cls: 'diag-warn', icon: 'info' },
  rechazado: { titulo: 'El archivo no se puede importar', texto: 'Corrija los errores bloqueantes y vuelva a cargarlo.', cls: 'error', icon: 'close' },
};

/** Panel con el diagnóstico de un archivo AT03 antes de importarlo. */
export default function Diagnostico({ diag, onDescargar }) {
  const [abierto, setAbierto] = useState(() => new Set(diag.hallazgos.filter((h) => h.gravedad === 'bloqueante').map((h) => h.regla + h.campo)));
  const e = ESTADO[diag.estado];
  const toggle = (k) => setAbierto((s) => {
    const n = new Set(s);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });

  return (
    <div className="diag">
      <div className={`alert ${e.cls} diag-estado`}>
        <Icon name={e.icon} />
        <div>
          <b>{e.titulo}</b>
          <div>{e.texto}</div>
        </div>
      </div>

      <div className="diag-resumen">
        <span><b>{diag.resumen.archivo}</b></span>
        <span>{fmtInt(diag.resumen.filas)} filas</span>
        <span>{diag.resumen.columnas} columnas</span>
        {diag.resumen.fechas.length > 0 && <span>Período(s): {diag.resumen.fechas.map(fmtPeriodo).join(', ')}</span>}
        {Object.entries(GRAVEDAD).map(([k, g]) => (
          <span key={k} className={`badge ${diag.totales[k] ? g.cls : 'ok'}`} title={g.desc}>{g.label}: {fmtInt(diag.totales[k])}</span>
        ))}
      </div>

      {diag.porPeriodo.length > 0 && (
        <div className="table-wrap" style={{ maxHeight: 'none' }}>
          <table>
            <thead>
              <tr><th>Período</th><th className="num">Leídas</th><th className="num">E1 dup.</th><th className="num">E2 ext.</th><th className="num">E3 saldo</th><th className="num">E4 CINU</th><th className="num">Universo válido</th><th className="num">Saldo universo</th><th className="num">A Tarjeta (SB21)</th></tr>
            </thead>
            <tbody>
              {diag.porPeriodo.map((p) => (
                <tr key={p.Fecha}>
                  <td>{fmtPeriodo(p.Fecha)} <span className="muted">({p.Fecha})</span></td>
                  <td className="num">{fmtInt(p.Filas_Leidas)}</td>
                  <td className="num">{fmtInt(p.E1_Duplicados)}</td>
                  <td className="num">{fmtInt(p.E2_Destino_Extranjero)}</td>
                  <td className="num">{fmtInt(p.E3_Saldo_No_Positivo)}</td>
                  <td className="num">{fmtInt(p.E4_Actividad_No_Catalogada)}</td>
                  <td className="num"><b>{fmtInt(p.Universo_Local_Valido)}</b></td>
                  <td className="num">{fmtMoney(p.Saldo_Universo_Local_Valido)}</td>
                  <td className="num">{fmtInt(p.Reclasificadas_Tarjeta_SB21)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {diag.hallazgos.length > 0 && (
        <div className="diag-list">
          <div className="diag-list-head">
            <b>Observaciones por regla</b>
            {onDescargar && <button type="button" className="btn" onClick={onDescargar}><Icon name="download" />Descargar diagnóstico (CSV)</button>}
          </div>
          {diag.hallazgos.map((h) => {
            const k = h.regla + h.campo;
            const g = GRAVEDAD[h.gravedad];
            return (
              <div key={k} className={`diag-item ${h.gravedad}`}>
                <button type="button" className="diag-item-head" onClick={() => toggle(k)} aria-expanded={abierto.has(k)}>
                  <span className={`badge ${g.cls}`}>{g.label}</span>
                  <span className="diag-regla"><b>{h.regla}</b>{!h.campo.startsWith('(') && <> · <code>{h.campo}</code></>}</span>
                  <span className="diag-n">{fmtInt(h.cantidad)} {h.cantidad === 1 ? 'caso' : 'casos'}</span>
                  <Icon name={abierto.has(k) ? 'chevronDown' : 'chevron'} />
                </button>
                {abierto.has(k) && (
                  <div className="table-wrap" style={{ maxHeight: 260 }}>
                    <table>
                      <thead><tr><th className="num">Línea</th><th>Valor encontrado</th><th>Se esperaba</th><th>Sugerencia</th></tr></thead>
                      <tbody>
                        {h.ejemplos.map((x, i) => (
                          <tr key={i}>
                            <td className="num">{x.linea || '—'}</td>
                            <td><code>{x.valor === '' ? '(vacío)' : x.valor}</code></td>
                            <td>{x.esperado}</td>
                            <td className="wrap">{x.sugerencia}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {h.cantidad > h.ejemplos.length && <p className="muted" style={{ fontSize: 12, margin: 8 }}>Mostrando {h.ejemplos.length} de {fmtInt(h.cantidad)}. Descargue el diagnóstico para ver la lista.</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
