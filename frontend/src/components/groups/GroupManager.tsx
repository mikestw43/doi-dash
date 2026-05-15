import { useState, useEffect } from 'react';
import { Dialog } from '../ui/Dialog';
import { useUIStore } from '../../stores/uiStore';
import { fetchGroups, createGroup, updateGroupApi, deleteGroupApi } from '../../services/api';
import type { AccountGroup } from '../../types';

const PRESET_COLORS = [
  '#6b7280', '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#38bdf8',
];

interface Props {
  open: boolean;
  onClose: () => void;
  onGroupsChanged?: () => void;
}

const inp: React.CSSProperties = {
  flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: "'Share Tech Mono'", fontSize: '12px',
  padding: '7px 10px', outline: 'none',
};

export const GroupManager = ({ open, onClose, onGroupsChanged }: Props) => {
  const { addToast } = useUIStore();
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#38bdf8');

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

  const resetForm = () => { setEditId(null); setName(''); setColor('#38bdf8'); };

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
    fontFamily: "'Press Start 2P'", fontSize: '7px', letterSpacing: '.5px',
    padding: '8px 12px', background: 'var(--cyan)', color: '#0c1422',
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
            <button onClick={resetForm} style={{ fontFamily: "'Press Start 2P'", fontSize: '7px', padding: '8px 10px', background: 'none', border: '1px solid var(--border2)', color: 'var(--text-dim)', cursor: 'pointer' }}>
              ✕
            </button>
          )}
        </div>

        {/* Color picker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontFamily: "'Press Start 2P'", fontSize: '6px', color: 'var(--text-dim)', letterSpacing: '.5px' }}>COLOR:</span>
          {PRESET_COLORS.map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              style={{
                width: '18px', height: '18px', background: c, border: `2px solid ${color === c ? '#fff' : 'transparent'}`,
                cursor: 'pointer', padding: 0, flexShrink: 0,
                boxShadow: color === c ? `0 0 6px ${c}` : 'none',
              }}
            />
          ))}
        </div>

        {/* Groups list */}
        <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {loading && <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-dim)', fontFamily: "'Share Tech Mono'", fontSize: '10px' }}>Loading...</div>}
          {!loading && groups.length === 0 && (
            <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-dim)', fontFamily: "'Share Tech Mono'", fontSize: '10px' }}>No groups yet. Create one above.</div>
          )}
          {groups.map(g => (
            <div
              key={g.id}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-card2)', border: '1px solid var(--border2)', padding: '8px 10px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '10px', height: '10px', background: g.color, flexShrink: 0 }} />
                <span style={{ fontFamily: "'Share Tech Mono'", fontSize: '12px', color: 'var(--text)' }}>{g.name}</span>
                <span style={{ fontFamily: "'Share Tech Mono'", fontSize: '9px', color: 'var(--text-dim)' }}>
                  {g._count?.accounts ?? 0} accounts
                </span>
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  onClick={() => startEdit(g)}
                  style={{ background: 'none', border: '1px solid var(--border2)', color: 'var(--text-dim)', cursor: 'pointer', padding: '3px 7px', fontFamily: "'Share Tech Mono'", fontSize: '11px' }}
                  title="Edit"
                >✎</button>
                <button
                  onClick={() => handleDelete(g.id)}
                  style={{ background: 'none', border: '1px solid rgba(239,68,68,.3)', color: 'var(--red)', cursor: 'pointer', padding: '3px 7px', fontFamily: "'Share Tech Mono'", fontSize: '11px' }}
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
