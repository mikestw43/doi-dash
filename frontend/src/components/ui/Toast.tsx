import { useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';

const ICONS = {
  success: <CheckCircle size={16} className="text-success" />,
  error: <XCircle size={16} className="text-danger" />,
  warning: <AlertCircle size={16} className="text-warning" />,
  info: <Info size={16} className="text-accent-blue" />,
};

export const ToastContainer = () => {
  const { toasts, removeToast } = useUIStore();

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className="flex items-start gap-3 bg-bg-tertiary border border-border2 p-3.5 shadow-2xl animate-fade-in relative"
          style={{
            boxShadow: toast.type === 'success'
              ? '0 0 20px rgba(34,197,94,0.15)'
              : toast.type === 'error'
              ? '0 0 20px rgba(239,68,68,0.15)'
              : '0 0 20px rgba(56,189,248,0.1)',
          }}
        >
          <span className="absolute top-0 left-0 w-2.5 h-2.5 border-t-2 border-l-2 border-accent-blue/50 pointer-events-none" />
          <div className="mt-0.5 shrink-0">{ICONS[toast.type]}</div>
          <div className="flex-1 min-w-0">
            <p className="font-tech text-sm text-white">{toast.title}</p>
            {toast.message && <p className="font-tech text-xs text-gray-500 mt-0.5">{toast.message}</p>}
          </div>
          <button
            onClick={() => removeToast(toast.id)}
            className="text-gray-600 hover:text-gray-300 transition-colors shrink-0"
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
};
