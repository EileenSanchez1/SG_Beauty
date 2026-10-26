import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../utils/api';
import { fdt } from '../utils/format';
import { Shield, Lock } from '../utils/icons';

export default function Audit() {
  const { fail, isAdmin } = useApp();
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (isAdmin()) api('/audit?limit=200').then(setRows).catch(fail);
  }, []);

  if (!isAdmin()) {
    return <div className="empty"><div className="big"><Lock size={42} strokeWidth={1.5} style={{ color: 'var(--plum-soft)' }} /></div><p>Solo el admin ve auditoría</p></div>;
  }

  return (
    <div className="card">
      <p className="muted mb">Registro de acciones sensibles: anulaciones, devoluciones, cambios de producto, cierres, envíos WhatsApp, respaldos.</p>
      <table className="table">
        <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr></thead>
        <tbody>
          {rows.map(a => (
            <tr key={a.id}>
              <td>{fdt(a.created_at)}</td>
              <td>{a.username}</td>
              <td><code>{a.action}</code></td>
              <td>{a.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <div className="empty"><div className="big"><Shield size={42} strokeWidth={1.5} style={{ color: 'var(--plum-soft)' }} /></div><p>Sin registros aún</p></div>}
    </div>
  );
}
