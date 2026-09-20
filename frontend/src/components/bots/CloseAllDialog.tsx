import { useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { closeAllOrders } from '../../services/api';
import { useUIStore } from '../../stores/uiStore';

interface Props {
  accountId: string;
  accountName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const CloseAllDialog = ({ accountId, accountName, onClose, onSuccess }: Props) => {
  const [loading, setLoading] = useState(false);
  const { addToast } = useUIStore();

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const result = await closeAllOrders(accountId);
      if (result.mode === 'immediate') {
        addToast({ type: 'success', title: 'All positions closed', message: `Closed ${result.closed} orders, deleted ${result.deleted} pending on ${accountName}` });
      } else {
        addToast({ type: 'warning', title: 'Close All queued', message: `Command will execute on ${accountName} when EA polls next (~2s)` });
      }
      onSuccess();
      onClose();
    } catch {
      addToast({ type: 'error', title: 'Failed to close orders' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title="CLOSE ALL ORDERS">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Warning box */}
        <div style={{ display: 'flex', gap: '10px', padding: '12px', background: 'rgba(248,113,113,.08)', border: '1px solid rgba(248,113,113,.3)' }}>
          <span style={{ color: 'var(--red)', fontSize: '16px', flexShrink: 0 }}>⚠</span>
          <div>
            <div style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--red)', marginBottom: '6px', letterSpacing: '.5px' }}>
              DANGEROUS ACTION
            </div>
            <p style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text-dim)', lineHeight: 1.6 }}>
              This will close ALL open orders on{' '}
              <span style={{ color: 'var(--text)', fontWeight: 700 }}>{accountName}</span>.
              This action cannot be undone.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', padding: '9px 16px', background: 'none', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)', color: 'var(--text-dim)', cursor: 'pointer', letterSpacing: '.5px' }}
          >
            CANCEL
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', padding: '9px 16px', background: 'var(--red)', color: '#fff', border: '1px solid var(--red)', cursor: loading ? 'not-allowed' : 'pointer', letterSpacing: '.5px', opacity: loading ? .6 : 1 }}
          >
            {loading ? 'SENDING...' : 'YES, CLOSE ALL'}
          </button>
        </div>
      </div>
    </Dialog>
  );
};
