import { useEffect, useRef, useState } from 'react';
import { Icon } from './brand.jsx';
import './admin.css';

/**
 * Diálogo de confirmación propio (reemplaza window.confirm). Muestra qué va a pasar y, si se indica,
 * una tabla "antes → después". Para acciones peligrosas pide escribir una palabra de confirmación.
 *
 * Uso: const [dlg, confirmar] = useConfirmar();  …  if (await confirmar({...})) { … }  …  {dlg}
 */
export function useConfirmar() {
  const [estado, setEstado] = useState(null);
  const confirmar = (opts) => new Promise((resolve) => setEstado({ ...opts, resolve }));
  const cerrar = (v) => { estado?.resolve(v); setEstado(null); };
  const dlg = estado ? <Dialogo {...estado} onClose={cerrar} /> : null;
  return [dlg, confirmar];
}

function Dialogo({ titulo, mensaje, cambios, detalle, peligro = false, confirmarTexto = 'Confirmar', palabra, onClose }) {
  const [escrito, setEscrito] = useState('');
  const btn = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(false); };
    document.addEventListener('keydown', onKey);
    if (!palabra) btn.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, palabra]);
  const listo = !palabra || escrito.trim().toUpperCase() === palabra.toUpperCase();
  return (
    <div className="cf-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(false); }}>
      <div className={`cf ${peligro ? 'peligro' : ''}`} role="alertdialog" aria-modal="true" aria-label={titulo}>
        <div className="cf-head">
          <span className="cf-ico"><Icon name={peligro ? 'info' : 'check'} /></span>
          <h2>{titulo}</h2>
        </div>
        {mensaje && <p className="cf-msg">{mensaje}</p>}
        {cambios?.length > 0 && (
          <table className="cf-tabla">
            <thead><tr><th>Dato</th><th className="num">Antes</th><th className="num">Después</th></tr></thead>
            <tbody>
              {cambios.map((c) => (
                <tr key={c.dato} className={c.antes !== c.despues ? 'cambia' : ''}>
                  <td>{c.dato}</td><td className="num">{c.antes ?? '—'}</td><td className="num"><b>{c.despues ?? '—'}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {detalle && <p className="cf-det">{detalle}</p>}
        {palabra && (
          <label className="field">Para confirmar escriba <b>{palabra}</b>
            <input type="text" value={escrito} onChange={(e) => setEscrito(e.target.value)} autoFocus />
          </label>
        )}
        <div className="cf-foot">
          <button type="button" className="btn" onClick={() => onClose(false)}>Cancelar</button>
          <button type="button" ref={btn} className={`btn ${peligro ? 'btn-peligro' : 'primary'}`} disabled={!listo} onClick={() => onClose(true)}>{confirmarTexto}</button>
        </div>
      </div>
    </div>
  );
}
