import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { api, getToken } from '../utils/api';
import { Lock, Download } from '../utils/icons';

export default function Settings() {
  const { settings, setSettings, toast, fail, isAdmin } = useApp();
  const [form, setForm] = useState({
    business_name: settings.business_name || '',
    boss_phone: settings.boss_phone || '',
    business_whatsapp: settings.business_whatsapp || '',
    tax_rate: settings.tax_rate || '0',
    receipt_footer: settings.receipt_footer || '',
    allow_negative_stock: settings.allow_negative_stock || '0',
  });

  if (!isAdmin()) {
    return (
      <div className="empty">
        <div className="big"><Lock size={42} strokeWidth={1.5} style={{ color: 'var(--plum-soft)' }} /></div>
        <p>Solo el admin puede cambiar la configuración</p>
      </div>
    );
  }

  const save = async () => {
    try {
      const r = await api('/settings', { method: 'PUT', body: form });
      setSettings(r);
      toast('Configuración guardada');
    } catch (e) { fail(e); }
  };

  const downloadBackup = async () => {
    try {
      const token = getToken();
      const res = await fetch('/api/backup.json', { headers: token ? { Authorization: 'Bearer ' + token } : {} });
      if (!res.ok) throw new Error('No se pudo generar el respaldo');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup_belleza_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Respaldo descargado');
    } catch (e) { fail(e); }
  };

  return (
    <>
      <div className="card mb" style={{ maxWidth: 560 }}>
        <h3>Configuración del negocio</h3>
        <div className="field">
          <label>Nombre del negocio</label>
          <input className="input" value={form.business_name} onChange={e => setForm(f => ({ ...f, business_name: e.target.value }))} />
        </div>
        <div className="field">
          <label>WhatsApp Business del local (Opción A)</label>
          <input className="input" value={form.business_whatsapp} onChange={e => setForm(f => ({ ...f, business_whatsapp: e.target.value }))} placeholder="3001234567" />
          <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Número oficial del negocio. Usa este WhatsApp en el celular/tablet del POS para que los comprobantes salgan del local y el admin vea las conversaciones.
          </p>
        </div>
        <div className="field">
          <label>Celular del jefe (alertas de stock)</label>
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
        <div className="field">
          <label>
            <input type="checkbox" checked={form.allow_negative_stock === '1'} onChange={e => setForm(f => ({ ...f, allow_negative_stock: e.target.checked ? '1' : '0' }))} />
            {' '}Permitir a admin vender sin stock (no recomendado)
          </label>
        </div>
        <button className="btn primary" onClick={save}>Guardar</button>
      </div>

      <div className="card" style={{ maxWidth: 560 }}>
        <h3>Respaldo de datos</h3>
        <p className="muted">Descarga un JSON con productos, categorías, proveedores, usuarios y configuración. Guárdalo en un lugar seguro.</p>
        <button className="btn" onClick={downloadBackup}><Download size={16} style={{ marginRight: 6 }} /> Descargar respaldo JSON</button>
      </div>
    </>
  );
}
