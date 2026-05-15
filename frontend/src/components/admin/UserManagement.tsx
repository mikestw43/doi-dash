import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchUsers, createUser, deleteUser, changeUserRole } from '../../services/api';
import { useUIStore } from '../../stores/uiStore';
import { useAuthStore } from '../../stores/authStore';
import { Dialog } from '../ui/Dialog';
import type { UserInfo } from '../../types';

const ROLE_COLOR: Record<string, { border: string; color: string; bg: string }> = {
  admin: { border: 'rgba(56,189,248,.4)',  color: 'var(--cyan)',   bg: 'rgba(56,189,248,.08)' },
  vip:   { border: 'rgba(250,204,21,.4)',  color: 'var(--yellow)', bg: 'rgba(250,204,21,.07)' },
  user:  { border: 'var(--border2)',       color: 'var(--text-dim)', bg: 'none' },
};

const roleBadge = (role: string) => {
  const r = ROLE_COLOR[role] || ROLE_COLOR.user;
  return (
    <span style={{ fontFamily: "'Press Start 2P'", fontSize: '7px', letterSpacing: '.5px', padding: '3px 8px', border: `1px solid ${r.border}`, color: r.color, background: r.bg }}>
      {role.toUpperCase()}
    </span>
  );
};

const inp: React.CSSProperties = { width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border2)', color: 'var(--text)', fontFamily: "'Share Tech Mono'", fontSize: '12px', padding: '8px 10px', outline: 'none', boxSizing: 'border-box' };
const lbl: React.CSSProperties = { fontFamily: "'Press Start 2P'", fontSize: '7px', color: 'var(--text-dim)', letterSpacing: '.5px', display: 'block', marginBottom: '6px' };

export const UserManagement = () => {
  const { setCurrentPage, addToast } = useUIStore();
  const currentUserId = useAuthStore(s => s.user?.id);
  const queryClient = useQueryClient();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('user');

  const { data: users = [], isLoading } = useQuery<UserInfo[]>({
    queryKey: ['admin-users'],
    queryFn: fetchUsers,
    staleTime: 10000,
  });

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setShowAddDialog(false);
      setNewEmail(''); setNewPassword(''); setNewName(''); setNewRole('user');
      addToast({ type: 'success', title: 'User created' });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to create user';
      addToast({ type: 'error', title: msg });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setDeleteId(null);
      addToast({ type: 'success', title: 'User deleted' });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to delete';
      addToast({ type: 'error', title: msg });
    },
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => changeUserRole(id, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      addToast({ type: 'success', title: 'Role updated' });
    },
  });

  const deleteTarget = users.find(u => u.id === deleteId);

  const thStyle: React.CSSProperties = { fontFamily: "'Press Start 2P'", fontSize: '7px', color: 'var(--text-dim)', letterSpacing: '.5px', padding: '9px 10px', textAlign: 'left', borderBottom: '2px solid var(--border2)', fontWeight: 400, whiteSpace: 'nowrap' };
  const tdStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid rgba(45,64,96,.3)', fontFamily: "'Share Tech Mono'", fontSize: '11px', color: 'var(--text)' };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      {/* Back */}
      <button
        onClick={() => setCurrentPage('dashboard')}
        style={{ background: 'none', border: 'none', color: 'var(--cyan)', fontFamily: "'Press Start 2P'", fontSize: '7px', cursor: 'pointer', marginBottom: '14px', letterSpacing: '.5px' }}
      >
        ← BACK
      </button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <div style={{ width: '7px', height: '7px', background: 'var(--cyan)', boxShadow: '0 0 6px var(--cyan)', flexShrink: 0 }} />
        <span style={{ fontFamily: "'Press Start 2P'", fontSize: '8px', color: 'var(--text)', letterSpacing: '2px', textShadow: '0 0 12px rgba(56,189,248,.8)' }}>USER MANAGEMENT</span>
        <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, var(--border2), transparent)' }} />
        <button
          onClick={() => setShowAddDialog(true)}
          style={{ fontFamily: "'Press Start 2P'", fontSize: '7px', letterSpacing: '.5px', padding: '8px 14px', background: 'var(--cyan)', color: '#0c1422', border: '1px solid var(--cyan)', cursor: 'pointer', boxShadow: '0 0 8px rgba(56,189,248,.4)' }}
        >
          + ADD USER
        </button>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border2)', overflowX: 'auto' }}>
        {isLoading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-dim)', fontFamily: "'Share Tech Mono'", fontSize: '11px' }}>Loading...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '640px' }}>
            <thead>
              <tr style={{ background: 'var(--bg-card2)' }}>
                <th style={thStyle}>USER</th>
                <th style={thStyle}>EMAIL</th>
                <th style={thStyle}>ROLE</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>ACCOUNTS</th>
                <th style={thStyle}>CREATED</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => {
                const initials = (user.name || user.email).slice(0, 2).toUpperCase();
                const rc = ROLE_COLOR[user.role] || ROLE_COLOR.user;
                return (
                  <tr key={user.id}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(45,64,96,.25)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '26px', height: '26px', flexShrink: 0, background: rc.bg, border: `1px solid ${rc.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Press Start 2P'", fontSize: '7px', color: rc.color }}>
                          {initials}
                        </div>
                        <span style={{ color: 'var(--text)', fontWeight: 700 }}>{user.name || '—'}</span>
                      </div>
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text-dim)' }}>{user.email}</td>
                    <td style={tdStyle}>
                      <button
                        onClick={() => {
                          if (user.id === currentUserId) return;
                          roleMutation.mutate({ id: user.id, role: user.role === 'admin' ? 'user' : 'admin' });
                        }}
                        disabled={user.id === currentUserId}
                        title={user.id === currentUserId ? 'Cannot change your own role' : 'Click to toggle role'}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: user.id === currentUserId ? 'not-allowed' : 'pointer', opacity: user.id === currentUserId ? .5 : 1 }}
                      >
                        {roleBadge(user.role)}
                      </button>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center', fontFamily: "'VT323'", fontSize: '22px', color: 'var(--cyan)' }}>
                      {user._count.accounts}
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text-dim)', fontSize: '10px' }}>
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      {user.id !== currentUserId && (
                        <button
                          onClick={() => setDeleteId(user.id)}
                          style={{ fontFamily: "'Press Start 2P'", fontSize: '7px', padding: '4px 8px', border: '1px solid rgba(239,68,68,.4)', color: 'var(--red)', background: 'none', cursor: 'pointer', letterSpacing: '.5px' }}
                        >
                          ✕ DEL
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Add User Dialog */}
      <Dialog open={showAddDialog} onClose={() => setShowAddDialog(false)} title="ADD NEW USER">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div><label style={lbl}>EMAIL *</label><input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="user@example.com" style={inp} /></div>
          <div><label style={lbl}>PASSWORD * (min 6)</label><input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} style={inp} /></div>
          <div><label style={lbl}>NAME</label><input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Optional" style={inp} /></div>
          <div>
            <label style={lbl}>ROLE</label>
            <select value={newRole} onChange={e => setNewRole(e.target.value)} style={{ ...inp }}>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '8px', paddingTop: '4px' }}>
            <button onClick={() => setShowAddDialog(false)}
              style={{ flex: 1, fontFamily: "'Press Start 2P'", fontSize: '7px', padding: '10px', background: 'none', border: '1px solid var(--border2)', color: 'var(--text-dim)', cursor: 'pointer' }}>
              CANCEL
            </button>
            <button
              onClick={() => createMutation.mutate({ email: newEmail, password: newPassword, name: newName || undefined, role: newRole })}
              disabled={!newEmail || !newPassword || newPassword.length < 6 || createMutation.isPending}
              style={{ flex: 1, fontFamily: "'Press Start 2P'", fontSize: '7px', padding: '10px', background: 'var(--cyan)', color: '#0c1422', border: '1px solid var(--cyan)', cursor: 'pointer', opacity: (!newEmail || !newPassword || newPassword.length < 6 || createMutation.isPending) ? .5 : 1 }}
            >
              {createMutation.isPending ? '...' : 'CREATE USER'}
            </button>
          </div>
        </div>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteId} onClose={() => setDeleteId(null)} title="DELETE USER">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <p style={{ fontFamily: "'Share Tech Mono'", fontSize: '11px', color: 'var(--text)', lineHeight: 1.6 }}>
            Delete <span style={{ color: 'var(--cyan)' }}>{deleteTarget?.email}</span>?
            <br />This will also remove {deleteTarget?._count.accounts || 0} account{deleteTarget?._count.accounts !== 1 ? 's' : ''}.
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setDeleteId(null)}
              style={{ flex: 1, fontFamily: "'Press Start 2P'", fontSize: '7px', padding: '10px', background: 'none', border: '1px solid var(--border2)', color: 'var(--text-dim)', cursor: 'pointer' }}>
              CANCEL
            </button>
            <button
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
              style={{ flex: 1, fontFamily: "'Press Start 2P'", fontSize: '7px', padding: '10px', background: 'var(--red)', color: '#fff', border: '1px solid var(--red)', cursor: 'pointer', opacity: deleteMutation.isPending ? .5 : 1 }}
            >
              {deleteMutation.isPending ? '...' : 'DELETE'}
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};
