import { useEffect } from 'react';

export default function Modal({ title, children, onClose, wide }) {
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog">
        <div className="mh">
          <h2>{title}</h2>
          <button className="x" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
