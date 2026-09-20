import { useState, useEffect } from 'react';
import { Dialog } from '../ui/Dialog';
import { useUIStore } from '../../stores/uiStore';
import { fetchGroups, createGroup, updateGroupApi, deleteGroupApi } from '../../services/api';
import type { AccountGroup } from '../../types';

const PRESET_COLORS = [
  '#6b7280', '#f87171', '#fb923c', '#fbbf24', '#34d399',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#60a5fa',
];

interface Props {
  open: boolean;
  onClose: () => void;
  onGroupsChanged?: () => void;
}

const inp: React.CSSProperties = {
  flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)',
  padding: '7px 10px', outline: 'none',
};

export const GroupManager = ({ open, onClose, onGroupsChanged }: Props) => {
  const { addToast } = useUIStore();
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#60a5fa');

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchGroups();
      setGroups(data);
    } catch {
      addToast({ type: 'error', title: 'Failed to load groups' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (open) load(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetForm = () => { setEditId(null); setName(''); setColor('#60a5fa'); };

  const handleSave = async () => {
    if (!name.trim()) return;
    try {
      if (editId) {
        await updateGroupApi(editId, { name: name.trim(), color });
        addToast({ type: 'success', title: 'Group updated' });
      } else {
        await createGroup(name.trim(), color);
        addToast({ type: 'success', title: 'Group created' });
      }
      resetForm(); load(); onGroupsChanged?.();
    } catch { addToast({ type: 'error', title: 'Failed to save group' }); }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteGroupApi(id);
      addToast({ type: 'info', title: 'Group deleted' });
      load(); onGroupsChanged?.();
    } catch { addToast({ type: 'error', title: 'Failed to delete group' }); }
  };

  const startEdit = (g: AccountGroup) => { setEditId(g.id); setName(g.name); setColor(g.color); };

  const btnPrimary: React.CSSProperties = {
    fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', letterSpacing: '.5px',
    padding: '8px 12px', background: 'var(--cyan)', color: '#25272c',
    border: '1px solid var(--cyan)', cursor: name.trim() ? 'pointer' : 'not-allowed',
    opacity: name.trim() ? 1 : .4,
  };

  return (
    <Dialog open={open} onClose={onClose} title="MANAGE GROUPS">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

        {/* Name input + Save */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'stretch' }}>
          <input
            type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="Group name..." style={inp}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
          />
          <button onClick={handleSave} disabled={!name.trim()} style={btnPrimary}>
            {editId ? 'UPDATE' : 'ADD'}
          </button>
          {editId && (
            <button onClick={resetForm} style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', padding: '8px 10px', background: 'none', border: '1px solid var(--border2)', color: 'var(--text-dim)', cursor: 'pointer' }}>
              ✕
            </button>
          )}
        </div>

        {/* Color picker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-dim)', letterSpacing: '.5px' }}>COLOR:</span>
          {PRESET_COLORS.map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              style={{
                width: '18px', height: '18px', background: c, border: `2px solid ${color === c ? '#fff' : 'transparent'}`,
                cursor: 'pointer', padding: 0, flexShrink: 0,
              }}
            />
          ))}
        </div>

        {/* Groups list */}
        <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {loading && <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-dim)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)' }}>Loading...</div>}
          {!loading && groups.length === 0 && (
            <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-dim)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)' }}>No groups yet. Create one above.</div>
          )}
          {groups.map(g => (
            <div
              key={g.id}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-card2)', border: '1px solid var(--border2)', padding: '8px 10px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '10px', height: '10px', background: g.color, flexShrink: 0 }} />
                <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text)' }}>{g.name}</span>
                <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-dim)' }}>
                  {g._count?.accounts ?? 0} accounts
                </span>
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  onClick={() => startEdit(g)}
                  style={{ background: 'none', border: '1px solid var(--border2)', color: 'var(--text-dim)', cursor: 'pointer', padding: '3px 7px', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)' }}
                  title="Edit"
                >✎</button>
                <button
                  onClick={() => handleDelete(g.id)}
                  style={{ background: 'none', border: '1px solid rgba(248,113,113,.3)', color: 'var(--red)', cursor: 'pointer', padding: '3px 7px', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)' }}
                  title="Delete"
                >✕</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Dialog>
  );
};
