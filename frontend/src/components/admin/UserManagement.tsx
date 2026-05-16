import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchUsers, createUser, deleteUser, changeUserRole, changeUserStatus } from '../../services/api';
import { useUIStore } from '../../stores/uiStore';
import { useAuthStore } from '../../stores/authStore';
import { Dialog } from '../ui/Dialog';
import { AuditLogViewer } from './AuditLogViewer';
import type { UserInfo } from '../../types';

const ROLE_COLOR: Record<string, { border: string; color: string; bg: string }> = {
  admin: { border: 'rgba(56,189,248,.4)',  color: 'var(--accent-blue)', bg: 'rgba(56,189,248,.08)' },
  vip:   { border: 'rgba(250,204,21,.4)',  color: 'var(--warning)',     bg: 'rgba(250,204,21,.07)' },
  user:  { border: 'var(--border2)',       color: 'var(--text-dim)',    bg: 'none' },
};

const STATUS_META: Record<string, { color: string; dot: string; label: string }> = {
  active:    { color: 'var(--success)', dot: 'var(--success)', label: 'ACTIVE' },
  pending:   { color: 'var(--warning)', dot: 'var(--warning)', label: 'PENDING' },
  rejected:  { color: 'var(--danger)',  dot: 'var(--danger)',  label: 'REJECTED' },
  suspended: { color: 'var(--warning)', dot: 'var(--warning)', label: 'SUSPENDED' },
};

const roleBadge = (role: string) => {
  const r = ROLE_COLOR[role] || ROLE_COLOR.user;
  return (
    <span style={{ fontFamily: "'Press Start 2P'", fontSize: '7px', letterSpacing: '.5px', padding: '3px 8px', border: `1px solid ${r.border}`, color: r.color, background: r.bg }}>
      {role.toUpperCase()}
    </span>
  );
};

const StatusBadge = ({ status }: { status: string }) => {
  const m = STATUS_META[status] || STATUS_META.active;
  return (
    <span style={{ fontFamily: "'Share Tech Mono'", fontSize: '11px', color: m.color, display: 'flex', alignItems: 'center', gap: '4px' }}>
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: m.dot, display: 'inline-block', flexShrink: 0 }} />
      {m.label}
    </span>
  );
};

const inp: React.CSSProperties = { width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border2)', color: 'var(--text)', fontFamily: "'Share Tech Mono'", fontSize: '12px', padding: '8px 10px', outline: 'none', boxSizing: 'border-box' };
const lbl: React.CSSProperties = { fontFamily: "'Press Start 2P'", fontSize: '7px', color: 'var(--text-dim)', letterSpacing: '.5px', display: 'block', marginBottom: '6px' };

export const UserManagement = () => {
  const { setCurrentPage, addToast } = useUIStore();
  const currentUserId = useAuthStore(s => s.user?.id);
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'users' | 'audit'>('users');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [suspendId, setSuspendId] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('user');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

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

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'pending' | 'rejected' | 'suspended' }) =>
      changeUserStatus(id, status),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setSuspendId(null);
      const label =
        vars.status === 'active' ? 'User approved / activated' :
        vars.status === 'rejected' ? 'User rejected' :
        vars.status === 'suspended' ? 'User suspended' : 'Status updated';
      addToast({ type: 'success', title: label });
    },
    onError: () => { addToast({ type: 'error', title: 'Failed to update status' }); },
  });

  const deleteTarget  = users.find(u => u.id === deleteId);
  const suspendTarget = users.find(u => u.id === suspendId);

  const pendingUsers = users.filter(u => u.status === 'pending');

  const filteredUsers = users.filter(u => {
    if (u.status === 'pending') return false; // shown in separate section
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (statusFilter !== 'all' && u.status !== statusFilter) return false;
    return true;
  });

  const thStyle: React.CSSProperties = {
    fontFamily: "'Press Start 2P'", fontSize: '7px', color: 'var(--text-dim)',
    letterSpacing: '.5px', padding: '9px 10px', textAlign: 'left',
    borderBottom: '2px solid var(--border2)', fontWeight: 400, whiteSpace: 'nowrap',
  };
  const tdStyle: React.CSSProperties = {
    padding: '8px 10px', borderBottom: '1px solid rgba(45,64,96,.3)',
    fontFamily: "'Share Tech Mono'", fontSize: '11px', color: 'var(--text)',
  };
  const tabBtn = (active: boolean) => ({
    padding: '9px 20px',
    fontFamily: "'Press Start 2P'", fontSize: '7px', letterSpacing: '.5px',
    color: active ? 'var(--accent-blue)' : 'var(--text-dim)',
    background: 'none', border: 'none', borderBottom: `2px solid ${active ? 'var(--accent-blue)' : 'transparent'}`,
    cursor: 'pointer', transition: 'all .15s',
  } as React.CSSProperties);

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      {/* Back */}
      <button
        onClick={() => setCurrentPage('dashboard')}
        style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', fontFamily: "'Press Start 2P'", fontSize: '7px', cursor: 'pointer', marginBottom: '14px', letterSpacing: '.5px' }}
      >
        ← BACK
      </button>

      {/* Section title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
        <div style={{ width: '7px', height: '7px', background: 'var(--accent-blue)', boxShadow: '0 0 6px var(--accent-blue)', flexShrink: 0 }} />
        <span style={{ fontFamily: "'Press Start 2P'", fontSize: '8px', color: 'var(--text)', letterSpacing: '2px', textShadow: '0 0 12px rgba(56,189,248,.8)' }}>ADMIN</span>
        <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, var(--border2), transparent)' }} />
      </div>

      {/* Tabs row */}
      <div style={{
        display: 'flex', alignItems: 'center',
        background: 'var(--bg-card)', border: '1px solid var(--border2)',
        borderBottom: 'none', marginBottom: 0,
      }}>
        <button style={tabBtn(activeTab === 'users')} onClick={() => setActiveTab('users')}>
          USER MANAGEMENT
        </button>
        <button style={tabBtn(activeTab === 'audit')} onClick={() => setActiveTab('audit')}>
          AUDIT LOG
        </button>
      </div>

      {/* Tab content */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border2)', borderTop: '2px solid var(--border2)' }}>

        {activeTab === 'users' && (
          <>
            {/* Toolbar */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', borderBottom: '1px solid var(--border2)',
              flexWrap: 'wrap', gap: '8px',
            }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <select
                  value={roleFilter}
                  onChange={e => setRoleFilter(e.target.value)}
                  style={{ background: 'var(--bg-card2)', border: '1px solid var(--border2)', color: 'var(--text-dim)', padding: '6px 10px', fontFamily: "'Share Tech Mono'", fontSize: '11px', outline: 'none', cursor: 'pointer' }}
                >
                  <option value="all">All Roles</option>
                  <option value="admin">Admin</option>
                  <option value="vip">VIP</option>
                  <option value="user">User</option>
                </select>
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  style={{ background: 'var(--bg-card2)', border: '1px solid var(--border2)', color: 'var(--text-dim)', padding: '6px 10px', fontFamily: "'Share Tech Mono'", fontSize: '11px', outline: 'none', cursor: 'pointer' }}
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              <button
                onClick={() => setShowAddDialog(true)}
                style={{ fontFamily: "'Press Start 2P'", fontSize: '7px', letterSpacing: '.5px', padding: '8px 14px', background: 'rgba(56,189,248,.1)', color: 'var(--accent-blue)', border: '1px solid var(--accent-blue)', cursor: 'pointer' }}
              >
                + CREATE USER
              </button>
            </div>

            {/* Pending approval section */}
            {pendingUsers.length > 0 && (
              <div style={{ borderBottom: '1px solid var(--border2)', padding: '12px 14px', background: 'rgba(250,204,21,.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <div style={{ width: '6px', height: '6px', background: 'var(--warning)', boxShadow: '0 0 6px var(--warning)' }} />
                  <span style={{ fontFamily: "'Press Start 2P'", fontSize: '7px', color: 'var(--warning)', letterSpacing: '1px' }}>
                    PENDING APPROVAL
                  </span>
                  <span style={{ fontFamily: "'Press Start 2P'", fontSize: '7px', color: 'var(--warning)', padding: '3px 8px', border: '1px solid rgba(250,204,21,.4)' }}>
                    {pendingUsers.length}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {pendingUsers.map(u => (
                    <div key={u.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: 'rgba(250,204,21,.06)', border: '1px solid rgba(250,204,21,.2)',
                      flexWrap: 'wrap', gap: '8px',
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontFamily: "'Share Tech Mono'", fontSize: '12px', color: 'var(--text)' }}>
                          {u.name || '—'}
                        </span>
                        <span style={{ fontFamily: "'Share Tech Mono'", fontSize: '10px', color: 'var(--text-muted)' }}>
                          {u.email}
                        </span>
                        {u.mobile && (
                          <span style={{ fontFamily: "'Share Tech Mono'", fontSize: '10px', color: 'var(--text-muted)' }}>
                            📱 {u.phoneCountry} {u.mobile}
                          </span>
                        )}
                        <span style={{ fontFamily: "'Share Tech Mono'", fontSize: '10px', color: 'var(--text-muted)' }}>
                          Registered: {new Date(u.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => statusMutation.mutate({ id: u.id, status: 'active' })}
                          disabled={statusMutation.isPending}
                          style={{ fontFamily: "'Press Start 2P'", fontSize: '6px', padding: '6px 12px', border: '1px solid var(--success)', color: 'var(--success)', background: 'rgba(34,197,94,.08)', cursor: 'pointer', letterSpacing: '.5px' }}
                        >
                          ✓ APPROVE
                        </button>
                        <button
                          onClick={() => statusMutation.mutate({ id: u.id, status: 'rejected' })}
                          disabled={statusMutation.isPending}
                          style={{ fontFamily: "'Press Start 2P'", fontSize: '6px', padding: '6px 12px', border: '1px solid var(--danger)', color: 'var(--danger)', background: 'rgba(239,68,68,.08)', cursor: 'pointer', letterSpacing: '.5px' }}
                        >
                          ✕ REJECT
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Table */}
            <div style={{ overflowX: 'auto' }}>
              {isLoading ? (
                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-dim)', fontFamily: "'Share Tech Mono'", fontSize: '11px' }}>Loading...</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '780px' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-card2)' }}>
                      <th style={thStyle}>USER</th>
                      <th style={thStyle}>EMAIL</th>
                      <th style={thStyle}>MOBILE</th>
                      <th style={thStyle}>ROLE</th>
                      <th style={{ ...thStyle, textAlign: 'center' }}>ACCOUNTS</th>
                      <th style={thStyle}>CREATED</th>
                      <th style={thStyle}>STATUS</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.length === 0 && (
                      <tr>
                        <td colSpan={8} style={{ ...tdStyle, textAlign: 'center', padding: '24px', color: 'var(--text-dim)' }}>
                          No users match the current filter
                        </td>
                      </tr>
                    )}
                    {filteredUsers.map(user => {
                      const initials = (user.name || user.email).slice(0, 2).toUpperCase();
                      const rc = ROLE_COLOR[user.role] || ROLE_COLOR.user;
                      const isSelf = user.id === currentUserId;
                      const isSuspended = user.status === 'suspended';
                      return (
                        <tr key={user.id}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(45,64,96,.25)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          {/* USER */}
                          <td style={tdStyle}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{ width: '26px', height: '26px', flexShrink: 0, background: rc.bg, border: `1px solid ${rc.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Press Start 2P'", fontSize: '7px', color: rc.color }}>
                                {initials}
                              </div>
                              <span style={{ color: 'var(--text)', fontWeight: 700 }}>{user.name || '—'}</span>
                            </div>
                          </td>
                          {/* EMAIL */}
                          <td style={{ ...tdStyle, color: 'var(--text-dim)' }}>{user.email}</td>
                          {/* MOBILE */}
                          <td style={{ ...tdStyle, color: 'var(--text-dim)' }}>
                            {user.mobile
                              ? `${user.phoneCountry || ''} ${user.mobile}`.trim()
                              : <span style={{ opacity: .4 }}>—</span>
                            }
                          </td>
                          {/* ROLE */}
                          <td style={tdStyle}>
                            <button
                              onClick={() => {
                                if (isSelf) return;
                                roleMutation.mutate({ id: user.id, role: user.role === 'admin' ? 'user' : 'admin' });
                              }}
                              disabled={isSelf}
                              title={isSelf ? 'Cannot change your own role' : 'Click to toggle role'}
                              style={{ background: 'none', border: 'none', padding: 0, cursor: isSelf ? 'not-allowed' : 'pointer', opacity: isSelf ? .5 : 1 }}
                            >
                              {roleBadge(user.role)}
                            </button>
                          </td>
                          {/* ACCOUNTS */}
                          <td style={{ ...tdStyle, textAlign: 'center', fontFamily: "'VT323'", fontSize: '22px', color: 'var(--accent-blue)' }}>
                            {user._count.accounts}
                          </td>
                          {/* CREATED */}
                          <td style={{ ...tdStyle, color: 'var(--text-dim)', fontSize: '10px' }}>
                            {new Date(user.createdAt).toLocaleDateString()}
                          </td>
                          {/* STATUS — actual value from DB */}
                          <td style={tdStyle}>
                            <StatusBadge status={user.status} />
                          </td>
                          {/* ACTIONS */}
                          <td style={{ ...tdStyle, textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                              {!isSelf && (
                                <>
                                  {isSuspended ? (
                                    /* Re-activate suspended user */
                                    <button
                                      onClick={() => statusMutation.mutate({ id: user.id, status: 'active' })}
                                      disabled={statusMutation.isPending}
                                      style={{ fontFamily: "'Press Start 2P'", fontSize: '6px', padding: '4px 10px', border: '1px solid var(--success)', color: 'var(--success)', background: 'rgba(34,197,94,.08)', cursor: 'pointer', letterSpacing: '.5px' }}
                                    >
                                      ACTIVATE
                                    </button>
                                  ) : (
                                    /* Suspend active user */
                                    <button
                                      onClick={() => setSuspendId(user.id)}
                                      style={{ fontFamily: "'Press Start 2P'", fontSize: '6px', padding: '4px 10px', border: '1px solid rgba(250,204,21,.4)', color: 'var(--warning)', background: 'rgba(250,204,21,.06)', cursor: 'pointer', letterSpacing: '.5px' }}
                                    >
                                      SUSPEND
                                    </button>
                                  )}
                                  <button
                                    onClick={() => setDeleteId(user.id)}
                                    style={{ fontFamily: "'Press Start 2P'", fontSize: '6px', padding: '4px 10px', border: '1px solid rgba(239,68,68,.4)', color: 'var(--danger)', background: 'rgba(239,68,68,.06)', cursor: 'pointer', letterSpacing: '.5px' }}
                                  >
                                    DELETE
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {activeTab === 'audit' && (
          <div style={{ padding: '14px' }}>
            <AuditLogViewer embedded />
          </div>
        )}
      </div>

      {/* Add User Dialog */}
      <Dialog open={showAddDialog} onClose={() => setShowAddDialog(false)} title="CREATE NEW USER">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div><label style={lbl}>EMAIL *</label><input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="user@example.com" style={inp} /></div>
          <div><label style={lbl}>PASSWORD * (min 6)</label><input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} style={inp} /></div>
          <div><label style={lbl}>NAME</label><input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Optional" style={inp} /></div>
          <div>
            <label style={lbl}>ROLE</label>
            <select value={newRole} onChange={e => setNewRole(e.target.value)} style={{ ...inp }}>
              <option value="user">User</option>
              <option value="vip">VIP</option>
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
              style={{ flex: 1, fontFamily: "'Press Start 2P'", fontSize: '7px', padding: '10px', background: 'var(--accent-blue)', color: '#0c1422', border: '1px solid var(--accent-blue)', cursor: 'pointer', opacity: (!newEmail || !newPassword || newPassword.length < 6 || createMutation.isPending) ? .5 : 1 }}
            >
              {createMutation.isPending ? '...' : 'CREATE'}
            </button>
          </div>
        </div>
      </Dialog>

      {/* Suspend Confirm Dialog */}
      <Dialog open={!!suspendId} onClose={() => setSuspendId(null)} title="SUSPEND USER">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <p style={{ fontFamily: "'Share Tech Mono'", fontSize: '11px', color: 'var(--text)', lineHeight: 1.6 }}>
            Suspend <span style={{ color: 'var(--warning)' }}>{suspendTarget?.email}</span>?<br />
            They will not be able to log in until reactivated.
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setSuspendId(null)}
              style={{ flex: 1, fontFamily: "'Press Start 2P'", fontSize: '7px', padding: '10px', background: 'none', border: '1px solid var(--border2)', color: 'var(--text-dim)', cursor: 'pointer' }}>
              CANCEL
            </button>
            <button
              onClick={() => suspendId && statusMutation.mutate({ id: suspendId, status: 'suspended' })}
              disabled={statusMutation.isPending}
              style={{ flex: 1, fontFamily: "'Press Start 2P'", fontSize: '7px', padding: '10px', background: 'rgba(250,204,21,.15)', color: 'var(--warning)', border: '1px solid rgba(250,204,21,.5)', cursor: 'pointer', opacity: statusMutation.isPending ? .5 : 1 }}
            >
              {statusMutation.isPending ? '...' : 'SUSPEND'}
            </button>
          </div>
        </div>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteId} onClose={() => setDeleteId(null)} title="DELETE USER">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <p style={{ fontFamily: "'Share Tech Mono'", fontSize: '11px', color: 'var(--text)', lineHeight: 1.6 }}>
            Permanently delete <span style={{ color: 'var(--danger)' }}>{deleteTarget?.email}</span>?
            <br />This will also remove {deleteTarget?._count.accounts || 0} account{deleteTarget?._count.accounts !== 1 ? 's' : ''}.
            <br /><span style={{ color: 'var(--danger)', fontSize: '10px' }}>⚠ This action cannot be undone.</span>
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setDeleteId(null)}
              style={{ flex: 1, fontFamily: "'Press Start 2P'", fontSize: '7px', padding: '10px', background: 'none', border: '1px solid var(--border2)', color: 'var(--text-dim)', cursor: 'pointer' }}>
              CANCEL
            </button>
            <button
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
              style={{ flex: 1, fontFamily: "'Press Start 2P'", fontSize: '7px', padding: '10px', background: 'var(--danger)', color: '#fff', border: '1px solid var(--danger)', cursor: 'pointer', opacity: deleteMutation.isPending ? .5 : 1 }}
            >
              {deleteMutation.isPending ? '...' : 'DELETE'}
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};
