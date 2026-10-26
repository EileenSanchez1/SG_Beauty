import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../utils/api';
import { Lock } from '../utils/icons';

export default function Settings() {
  const { settings, setSettings, toast, fail, isAdmin } = useApp();
  const [form, setForm] = useState({
    business_name: settings.business_name || '',
    boss_phone: settings.boss_phone || '',
    tax_rate: settings.tax_rate || '0',
    receipt_footer: settings.receipt_footer || '',
  });

  if (!isAdmin()) {
    return <div className="empty"><div className="big"><Lock size={42} strokeWidth={1.5} style={{color:"var(--plum-soft)"}} /></div><p>Solo el admin puede cambiar la configuración</p></div>;
  }

  const save = async () => {
    try {
      const r = await api('/settings', { method: 'PUT', body: form });
      setSettings(r);
      toast('Configuración guardada');
    } catch (e) { fail(e); }
  };

  return (
    <div className="card" style={{ maxWidth: 520 }}>
      <h3>Configuración del negocio</h3>
      <div className="field">
        <label>Nombre del negocio</label>
        <input className="input" value={form.business_name} onChange={e => setForm(f => ({ ...f, business_name: e.target.value }))} />
      </div>
      <div className="field">
        <label>WhatsApp del jefe (para envío de comprobantes)</label>
        <input className="input" value={form.boss_phone} onChange={e => setForm(f => ({ ...f, boss_phone: e.target.value }))} placeholder="3001234567" />
      </div>
      <div className="field">
        <label>Impuesto interno (%)</label>
        <input className="input" type="number" value={form.tax_rate} onChange={e => setForm(f => ({ ...f, tax_rate: e.target.value }))} />
      </div>
      <div className="field">
        <label>Pie de comprobante</label>
        <input className="input" value={form.receipt_footer} onChange={e => setForm(f => ({ ...f, receipt_footer: e.target.value }))} />
      </div>
      <button className="btn primary" onClick={save}>Guardar</button>
    </div>
  );
}