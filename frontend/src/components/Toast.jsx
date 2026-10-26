import { useApp } from '../context/AppContext';

export default function Toast() {
  const { toasts } = useApp();
  return (
    <div id="toasts">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>
      ))}
    </div>
  );
}
