import type { ReactNode } from 'react';
import { X } from 'lucide-react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export const Dialog = ({ open, onClose, title, children }: DialogProps) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="relative bg-bg-secondary border border-border2 shadow-2xl w-full max-w-md"
        style={{ boxShadow: '0 0 40px rgba(56,189,248,0.08)' }}
      >
        {/* corner brackets */}
        <span className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-accent-blue/60 pointer-events-none" />
        <span className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-accent-blue/60 pointer-events-none" />

        <div className="flex items-center justify-between px-5 py-4 border-b border-border2">
          <h2 className="font-pixel text-[11px] text-accent-blue tracking-wider">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-600 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
};
