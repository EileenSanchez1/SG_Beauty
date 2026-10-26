import { useEffect, useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../utils/api';
import JsBarcode from 'jsbarcode';

export default function Labels() {
  const { fail, isAdmin } = useApp();
  const [products, setProducts] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const printRef = useRef(null);

  useEffect(() => {
    api('/products').then(setProducts).catch(fail);
  }, [fail]);

  useEffect(() => {
    if (!printRef.current) return;
    selected.forEach(id => {
      const p = products.find(x => x.id === id);
      if (!p) return;
      const el = printRef.current.querySelector(`#bc-${id}`);
      if (el) {
        try {
          JsBarcode(el, p.sku, { format: 'CODE128', width: 1.5, height: 40, displayMargin: 0, fontSize: 12 });
        } catch {}
      }
    });
  }, [selected, products]);

  if (!isAdmin()) {
    return <div className="empty"><div className="big"><Lock size={42} strokeWidth={1.5} style={{color:"var(--plum-soft)"}} /></div><p>Solo el admin puede imprimir etiquetas</p></div>;
  }

  const toggle = id => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const print = () => {
    const html = printRef.current?.innerHTML || '';
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Etiquetas</title><style>
      body{font-family:sans-serif;margin:8px}
      .label{display:inline-block;border:1px dashed #ccc;padding:8px;margin:4px;text-align:center;width:160px}
      .label b{font-size:12px;display:block}
    </style></head><body>${html}</body></html>`);
    w.document.close();
    w.print();
  };

  return (
    <>
      <div className="spread mb">
        <p className="muted">Selecciona productos para generar etiquetas con código de barras (SKU).</p>
        <button className="btn primary" disabled={!selected.size} onClick={print}>Imprimir {selected.size} etiquetas</button>
      </div>
      <div className="card">
        <div className="catalog" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))' }}>
          {products.map(p => (
            <button
              key={p.id}
              className={`pcard ${selected.has(p.id) ? 'selected' : ''}`}
              onClick={() => toggle(p.id)}
              style={selected.has(p.id) ? { outline: '2px solid var(--rose-500)' } : {}}
            >
              <div className="info">
                <b>{p.name}</b>
                <span className="muted small">{p.sku}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
      <div ref={printRef} style={{ position: 'absolute', left: -9999, top: 0 }}>
        {[...selected].map(id => {
          const p = products.find(x => x.id === id);
          if (!p) return null;
          return (
            <div className="label" key={id}>
              <b>{p.name}</b>
              <svg id={`bc-${id}`} />
              <small>{p.sku}</small>
            </div>
          );
        })}
      </div>
    </>
  );
}
