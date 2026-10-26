import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { api } from '../utils/api';
import { money, METHODS } from '../utils/format';
import Modal from '../components/Modal';

export default function Close() {
  const { cash, refreshCash, toast, fail, isAdmin } = useApp();
  const [summary, setSummary] = useState(null);
  const [counted, setCounted] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    if (!cash) return;
    api(`/cash/${cash.id}/summary`).then(setSummary).catch(fail);
  }, [cash, fail]);

  if (!isAdmin()) {
    return <div className="empty"><div className="big">🔒</div><p>Solo la administradora puede cerrar la caja</p></div>;
  }

  if (!cash) {
    return <div className="empty"><div className="big">🧮</div><p>No hay caja abierta para cerrar</p></div>;
  }

  if (!summary) return <div className="empty"><div className="big">💗</div><p>Cargando…</p></div>;

  const diff = Number(counted) - (summary.efectivo_esperado || 0);

  const doClose = async () => {
    try {
      await api('/cash/close', { method: 'POST', body: { counted: Number(counted) || 0 } });
      toast('Caja cerrada correctamente');
      await refreshCash();
      setShowConfirm(false);
      nav('/dashboard');
    } catch (e) { fail(e); }
  };

  return (
    <>
      <div className="grid g3 mb">
        <div className="card stat">
          <div className="lbl">Ventas del día</div>
          <div className="val">{money(summary.ventas_total)}</div>
          <div className="sub">{summary.n_sales} comprobantes</div>
        </div>
        <div className="card stat">
          <div className="lbl">Salidas</div>
          <div className="val">{money(summary.gastos)}</div>
        </div>
        <div className="card stat hot">
          <div className="lbl">Fórmula (Base + Ventas − Salidas)</div>
          <div className="val">{money(summary.total_formula)}</div>
        </div>
      </div>
      <div className="card mb">
        <h3>Por método de pago</h3>
        <div className="grid g4">
          {Object.entries(METHODS).map(([k, [em, name]]) => (
            <div key={k} className="stat">
              <div className="lbl">{em} {name}</div>
              <div className="val" style={{ fontSize: 20 }}>{money(summary.by_method?.[k] || 0)}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="card">
        <h3>Arqueo de efectivo físico</h3>
        <p className="muted">Efectivo esperado en caja: <b>{money(summary.efectivo_esperado)}</b> (base + ventas en efectivo − salidas)</p>
        <div className="field" style={{ maxWidth: 280 }}>
          <label>Efectivo contado</label>
          <input className="input" type="number" value={counted} onChange={e => setCounted(e.target.value)} />
        </div>
        {counted !== '' && (
          <p className={diff === 0 ? 'ok' : 'danger'}>
            Diferencia: {money(diff)} {diff === 0 ? '✅ Cuadra' : diff > 0 ? 'Sobra' : 'Falta'}
          </p>
        )}
        <button className="btn primary big mt" onClick={() => setShowConfirm(true)} disabled={counted === ''}>
          Cerrar caja del día
        </button>
      </div>

      {showConfirm && (
        <Modal title="¿Cerrar la caja?" onClose={() => setShowConfirm(false)}>
          <p>Se cerrará la sesión de caja con efectivo contado de <b>{money(Number(counted))}</b>.</p>
          <div className="foot">
            <button className="btn" onClick={() => setShowConfirm(false)}>Cancelar</button>
            <button className="btn primary" onClick={doClose}>Confirmar cierre</button>
          </div>
        </Modal>
      )}
    </>
  );
}
