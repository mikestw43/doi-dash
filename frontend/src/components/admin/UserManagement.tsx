import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchUsers, createUser, deleteUser, changeUserStatus } from '../../services/api';
import { useUIStore } from '../../stores/uiStore';
import { useAuthStore } from '../../stores/authStore';
import { Dialog } from '../ui/Dialog';
import { AuditLogViewer } from './AuditLogViewer';
import { UserDetailDialog } from './UserDetailDialog';
import type { UserInfo } from '../../types';
import { IconFilter } from '../icons';

const COUNTRY_CODES = [
  { code: '+66',  label: 'TH +66' },
  { code: '+1',   label: 'US +1' },
  { code: '+44',  label: 'UK +44' },
  { code: '+61',  label: 'AU +61' },
  { code: '+65',  label: 'SG +65' },
  { code: '+60',  label: 'MY +60' },
  { code: '+62',  label: 'ID +62' },
  { code: '+63',  label: 'PH +63' },
  { code: '+84',  label: 'VN +84' },
  { code: '+86',  label: 'CN +86' },
  { code: '+81',  label: 'JP +81' },
  { code: '+82',  label: 'KR +82' },
  { code: '+91',  label: 'IN +91' },
];

const ROLE_COLOR: Record<string, { border: string; color: string; bg: string }> = {
  admin: { border: 'rgba(96,165,250,.4)',  color: 'var(--accent-blue)', bg: 'rgba(96,165,250,.08)' },
  vip:   { border: 'rgba(251,191,36,.4)',  color: 'var(--warning)',     bg: 'rgba(251,191,36,.07)' },
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
    <span style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', letterSpacing: '.5px', padding: '3px 8px', border: `1px solid ${r.border}`, color: r.color, background: r.bg }}>
      {role.toUpperCase()}
    </span>
  );
};

const StatusBadge = ({ status }: { status: string }) => {
  const m = STATUS_META[status] || STATUS_META.active;
  return (
    <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: m.color, display: 'flex', alignItems: 'center', gap: '4px' }}>
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: m.dot, display: 'inline-block', flexShrink: 0 }} />
      {m.label}
    </span>
  );
};

const inp: React.CSSProperties = { width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)', color: 'var(--text)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', padding: '8px 10px', outline: 'none', boxSizing: 'border-box' };
const lbl: React.CSSProperties = { fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-dim)', letterSpacing: '.5px', display: 'block', marginBottom: '6px' };

export const UserManagement = () => {
  const { setCurrentPage, addToast } = useUIStore();
  const currentUserId = useAuthStore(s => s.user?.id);
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'users' | 'audit'>('users');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [suspendId, setSuspendId] = useState<string | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newMobile, setNewMobile] = useState('');
  const [newPhoneCountry, setNewPhoneCountry] = useState('+66');
  const [newRole, setNewRole] = useState('user');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  // Filter modal — draft state, only committed when Apply is pressed
  const [showFilter, setShowFilter] = useState(false);
  const [draftRole, setDraftRole] = useState('all');
  const [draftStatus, setDraftStatus] = useState('all');

  useEffect(() => {
    if (showFilter) {
      setDraftRole(roleFilter);
      setDraftStatus(statusFilter);
    }
  }, [showFilter, roleFilter, statusFilter]);

  const applyFilters = () => {
    setRoleFilter(draftRole);
    setStatusFilter(draftStatus);
    setShowFilter(false);
  };
  const clearDraftFilters = () => {
    setDraftRole('all');
    setDraftStatus('all');
  };
  const activeFilterCount = (roleFilter !== 'all' ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0);

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
      setNewEmail(''); setNewPassword(''); setNewName(''); setNewDisplayName('');
      setNewMobile(''); setNewPhoneCountry('+66'); setNewRole('user');
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
    fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-dim)',
    letterSpacing: '.5px', padding: '9px 10px', textAlign: 'left',
    borderBottom: '2px solid var(--border2)', fontWeight: 400, whiteSpace: 'nowrap',
  };
  const tdStyle: React.CSSProperties = {
    padding: '8px 10px', borderBottom: '1px solid rgba(42,45,52,.3)',
    fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text)',
  };
  const tabBtn = (active: boolean) => ({
    padding: '9px 20px',
    fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', letterSpacing: '.5px',
    color: active ? 'var(--accent-blue)' : 'var(--text-dim)',
    background: 'none', border: 'none', borderBottom: `2px solid ${active ? 'var(--accent-blue)' : 'transparent'}`,
    cursor: 'pointer', transition: 'all .15s',
  } as React.CSSProperties);

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', width: '100%', overflowX: 'hidden' }}>
      {/* Back */}
      <button
        onClick={() => setCurrentPage('dashboard')}
        style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', cursor: 'pointer', marginBottom: '14px', letterSpacing: '.5px' }}
      >
        ← BACK
      </button>

      {/* Section title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
        <div style={{ width: '7px', height: '7px', background: 'var(--accent-blue)',flexShrink: 0 }} />
        <span style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text)', letterSpacing: '2px',}}>ADMIN</span>
        <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, var(--border2), transparent)' }} />
      </div>

      {/* Tabs row */}
      <div className="um-tab-bar" style={{
        display: 'flex', alignItems: 'center',
        background: 'var(--bg-card)', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)',
        borderBottom: 'none', marginBottom: 0, overflowX: 'auto',
      }}>
        <button className="um-tab-btn" style={tabBtn(activeTab === 'users')} onClick={() => setActiveTab('users')}>
          <span className="um-tab-long">USER MANAGEMENT</span>
          <span className="um-tab-short">USERS</span>
        </button>
        <button className="um-tab-btn" style={tabBtn(activeTab === 'audit')} onClick={() => setActiveTab('audit')}>
          <span className="um-tab-long">AUDIT LOG</span>
          <span className="um-tab-short">AUDIT</span>
        </button>
      </div>

      {/* Tab content */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)', borderTop: '2px solid var(--border2)' }}>

        {activeTab === 'users' && (
          <>
            {/* Toolbar — Create on left, filters pushed right (matches mockup) */}
            <div className="um-toolbar" style={{
              display: 'flex', alignItems: 'center',
              padding: '10px 14px', borderBottom: '1px solid var(--border2)',
              flexWrap: 'wrap', gap: '8px',
            }}>
              <button
                onClick={() => setShowAddDialog(true)}
                style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', letterSpacing: '.5px', padding: '8px 14px', background: 'rgba(96,165,250,.1)', color: 'var(--accent-blue)', border: '1px solid var(--accent-blue)', cursor: 'pointer' }}
              >
                + CREATE USER
              </button>
              <button
                onClick={() => setShowFilter(true)}
                style={{
                  marginLeft: 'auto',
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  padding: '6px 10px',
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', letterSpacing: '.5px',
                  border: activeFilterCount > 0 ? '1px solid var(--accent-blue)' : '1px solid var(--border2)',
                  color: activeFilterCount > 0 ? 'var(--accent-blue)' : 'var(--text-muted)',
                  background: activeFilterCount > 0 ? 'rgba(96,165,250,.08)' : 'none',
                  cursor: 'pointer',
                }}
              >
                <IconFilter size={14} /> FILTER
                {activeFilterCount > 0 && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    minWidth: '18px', height: '16px', padding: '0 5px',
                    fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-micro)',
                    color: 'var(--bg-primary)', background: 'var(--accent-blue)',
                    letterSpacing: 0,
                  }}>{activeFilterCount}</span>
                )}
              </button>
            </div>

            {/* Pending approval section */}
            {pendingUsers.length > 0 && (
              <div style={{ borderBottom: '1px solid var(--border2)', padding: '12px 14px', background: 'rgba(251,191,36,.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <div style={{ width: '6px', height: '6px', background: 'var(--warning)',}} />
                  <span style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--warning)', letterSpacing: '1px' }}>
                    PENDING APPROVAL
                  </span>
                  <span style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--warning)', padding: '3px 8px', border: '1px solid rgba(251,191,36,.4)' }}>
                    {pendingUsers.length}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {pendingUsers.map(u => (
                    <div key={u.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: 'rgba(251,191,36,.06)', border: '1px solid rgba(251,191,36,.2)',
                      flexWrap: 'wrap', gap: '8px',
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text)' }}>
                          {u.name || '—'}
                        </span>
                        <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-muted)' }}>
                          {u.email}
                        </span>
                        {u.mobile && (
                          <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-muted)' }}>
                            📱 {u.phoneCountry} {u.mobile}
                          </span>
                        )}
                        <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-muted)' }}>
                          Registered: {new Date(u.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => statusMutation.mutate({ id: u.id, status: 'active' })}
                          disabled={statusMutation.isPending}
                          style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', padding: '6px 12px', border: '1px solid var(--success)', color: 'var(--success)', background: 'rgba(52,211,153,.08)', cursor: 'pointer', letterSpacing: '.5px' }}
                        >
                          ✓ APPROVE
                        </button>
                        <button
                          onClick={() => statusMutation.mutate({ id: u.id, status: 'rejected' })}
                          disabled={statusMutation.isPending}
                          style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', padding: '6px 12px', border: '1px solid var(--danger)', color: 'var(--danger)', background: 'rgba(248,113,113,.08)', cursor: 'pointer', letterSpacing: '.5px' }}
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
                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-dim)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)' }}>Loading...</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '480px' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-card2)' }}>
                      <th style={thStyle}>USER</th>
                      <th style={thStyle} className="um-col-email">EMAIL</th>
                      <th style={thStyle} className="um-col-mobile">MOBILE</th>
                      <th style={thStyle}>ROLE</th>
                      <th style={{ ...thStyle, textAlign: 'center' }} className="um-col-accounts">ACCTS</th>
                      <th style={thStyle} className="um-col-created">CREATED</th>
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
                      const initials = (user.displayName || user.name || user.email).slice(0, 2).toUpperCase();
                      const rc = ROLE_COLOR[user.role] || ROLE_COLOR.user;
                      return (
                        <tr key={user.id}
                          onClick={() => setViewId(user.id)}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(42,45,52,.25)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          style={{ cursor: 'pointer' }}
                          title="Click to view details and manage user"
                        >
                          {/* USER */}
                          <td style={tdStyle}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{ width: '26px', height: '26px', flexShrink: 0, background: rc.bg, border: `1px solid ${rc.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: rc.color }}>
                                {initials}
                              </div>
                              <span style={{ color: 'var(--text)', fontWeight: 700 }}>{user.displayName || user.name || '—'}</span>
                            </div>
                          </td>
                          {/* EMAIL */}
                          <td style={{ ...tdStyle, color: 'var(--text-dim)' }} className="um-col-email">{user.email}</td>
                          {/* MOBILE */}
                          <td style={{ ...tdStyle, color: 'var(--text-dim)' }} className="um-col-mobile">
                            {user.mobile
                              ? `${user.phoneCountry || ''} ${user.mobile}`.trim()
                              : <span style={{ opacity: .4 }}>—</span>
                            }
                          </td>
                          {/* ROLE */}
                          <td style={tdStyle}>
                            {roleBadge(user.role)}
                          </td>
                          {/* ACCOUNTS */}
                          <td style={{ ...tdStyle, textAlign: 'center', fontFamily: 'var(--ff-display)', fontSize: 'var(--fs-disp-sm)', color: 'var(--accent-blue)' }} className="um-col-accounts">
                            {user._count.accounts}
                          </td>
                          {/* CREATED */}
                          <td style={{ ...tdStyle, color: 'var(--text-dim)', fontSize: 'var(--fs-micro)' }} className="um-col-created">
                            {new Date(user.createdAt).toLocaleDateString()}
                          </td>
                          {/* STATUS */}
                          <td style={tdStyle}>
                            <StatusBadge status={user.status} />
                          </td>
                          {/* ACTIONS — open detail */}
                          <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--accent-blue)' }}>
                            <span style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', letterSpacing: '.5px' }}>
                              VIEW ›
                            </span>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div><label style={lbl}>EMAIL *</label><input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="user@example.com" style={inp} /></div>
          <div><label style={lbl}>PASSWORD * (min 6)</label><input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} style={inp} /></div>
          <div><label style={lbl}>FULL NAME</label><input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="John Doe" style={inp} /></div>
          <div>
            <label style={lbl}>DISPLAY NAME</label>
            <input type="text" value={newDisplayName} onChange={e => setNewDisplayName(e.target.value)} placeholder="Shown in top menu (e.g. JohnD)" style={inp} />
          </div>
          <div>
            <label style={lbl}>MOBILE</label>
            <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '6px' }}>
              <select value={newPhoneCountry} onChange={e => setNewPhoneCountry(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                {COUNTRY_CODES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
              <input type="tel" value={newMobile} onChange={e => setNewMobile(e.target.value)} placeholder="812345678" style={inp} />
            </div>
          </div>
          <div>
            <label style={lbl}>ROLE</label>
            <select value={newRole} onChange={e => setNewRole(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
              <option value="user">User (limit: 1 account)</option>
              <option value="vip">VIP (unlimited accounts)</option>
              <option value="admin">Admin (full access)</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '8px', paddingTop: '4px' }}>
            <button onClick={() => setShowAddDialog(false)}
              style={{ flex: 1, fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', padding: '10px', background: 'none', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)', color: 'var(--text-dim)', cursor: 'pointer' }}>
              CANCEL
            </button>
            <button
              onClick={() => createMutation.mutate({
                email: newEmail,
                password: newPassword,
                name: newName || undefined,
                displayName: newDisplayName || undefined,
                mobile: newMobile || undefined,
                phoneCountry: newMobile ? newPhoneCountry : undefined,
                role: newRole,
              })}
              disabled={!newEmail || !newPassword || newPassword.length < 6 || createMutation.isPending}
              style={{ flex: 1, fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', padding: '10px', background: 'var(--accent-blue)', color: '#25272c', border: '1px solid var(--accent-blue)', cursor: 'pointer', opacity: (!newEmail || !newPassword || newPassword.length < 6 || createMutation.isPending) ? .5 : 1 }}
            >
              {createMutation.isPending ? '...' : 'CREATE'}
            </button>
          </div>
        </div>
      </Dialog>

      {/* User Detail Dialog */}
      <UserDetailDialog
        user={users.find(u => u.id === viewId) || null}
        currentUserId={currentUserId}
        onClose={() => setViewId(null)}
        onDelete={(id) => { setViewId(null); setDeleteId(id); }}
      />

      {/* Suspend Confirm Dialog */}
      <Dialog open={!!suspendId} onClose={() => setSuspendId(null)} title="SUSPEND USER">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <p style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text)', lineHeight: 1.6 }}>
            Suspend <span style={{ color: 'var(--warning)' }}>{suspendTarget?.email}</span>?<br />
            They will not be able to log in until reactivated.
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setSuspendId(null)}
              style={{ flex: 1, fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', padding: '10px', background: 'none', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)', color: 'var(--text-dim)', cursor: 'pointer' }}>
              CANCEL
            </button>
            <button
              onClick={() => suspendId && statusMutation.mutate({ id: suspendId, status: 'suspended' })}
              disabled={statusMutation.isPending}
              style={{ flex: 1, fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', padding: '10px', background: 'rgba(251,191,36,.15)', color: 'var(--warning)', border: '1px solid rgba(251,191,36,.5)', cursor: 'pointer', opacity: statusMutation.isPending ? .5 : 1 }}
            >
              {statusMutation.isPending ? '...' : 'SUSPEND'}
            </button>
          </div>
        </div>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteId} onClose={() => setDeleteId(null)} title="DELETE USER">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <p style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text)', lineHeight: 1.6 }}>
            Permanently delete <span style={{ color: 'var(--danger)' }}>{deleteTarget?.email}</span>?
            <br />This will also remove {deleteTarget?._count.accounts || 0} account{deleteTarget?._count.accounts !== 1 ? 's' : ''}.
            <br /><span style={{ color: 'var(--danger)', fontSize: 'var(--fs-micro)' }}>⚠ This action cannot be undone.</span>
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setDeleteId(null)}
              style={{ flex: 1, fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', padding: '10px', background: 'none', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)', color: 'var(--text-dim)', cursor: 'pointer' }}>
              CANCEL
            </button>
            <button
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
              style={{ flex: 1, fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', padding: '10px', background: 'var(--danger)', color: '#fff', border: '1px solid var(--danger)', cursor: 'pointer', opacity: deleteMutation.isPending ? .5 : 1 }}
            >
              {deleteMutation.isPending ? '...' : 'DELETE'}
            </button>
          </div>
        </div>
      </Dialog>

      {/* Filter & sort modal — draft state, only committed when Apply is pressed */}
      <Dialog open={showFilter} onClose={() => setShowFilter(false)} title="FILTER USERS">
        <div style={{ marginBottom: '12px' }}>
          <label style={lbl}>ROLE</label>
          <select
            value={draftRole}
            onChange={e => setDraftRole(e.target.value)}
            style={{ ...inp, cursor: 'pointer' }}
          >
            <option value="all">All Roles</option>
            <option value="admin">Admin</option>
            <option value="vip">VIP</option>
            <option value="user">User</option>
          </select>
        </div>
        <div style={{ marginBottom: '16px' }}>
          <label style={lbl}>STATUS</label>
          <select
            value={draftStatus}
            onChange={e => setDraftStatus(e.target.value)}
            style={{ ...inp, cursor: 'pointer' }}
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={clearDraftFilters}
            style={{
              flex: 1, padding: '9px',
              fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
              border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)',
              background: 'none', cursor: 'pointer', letterSpacing: '.5px',
            }}
          >
            CLEAR ALL
          </button>
          <button
            onClick={applyFilters}
            style={{
              flex: 1, padding: '9px',
              fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
              border: '1px solid var(--cyan)', color: 'var(--cyan)',
              background: 'rgba(96,165,250,.1)', cursor: 'pointer', letterSpacing: '.5px',
            }}
          >
            APPLY
          </button>
        </div>
      </Dialog>

      <style>{`
        /* ── UserManagement responsive ── */

        /* Short labels hidden by default */
        .um-tab-short { display: none; }

        @media (max-width: 860px) {
          .um-col-mobile  { display: none !important; }
          .um-col-created { display: none !important; }
        }
        @media (max-width: 640px) {
          .um-col-email    { display: none !important; }
          .um-col-accounts { display: none !important; }
        }

        /* Toolbar stacks on very small screens */
        @media (max-width: 520px) {
          .um-toolbar { flex-direction: column !important; align-items: stretch !important; }
          .um-toolbar select { width: 100% !important; }
          .um-toolbar button { width: 100% !important; text-align: center !important; }
        }

        /* Tab bar — switch to short labels on narrow screens */
        @media (max-width: 500px) {
          .um-tab-long  { display: none; }
          .um-tab-short { display: inline; }
          .um-tab-btn   { flex: 1; text-align: center; padding: 9px 6px !important; }
          .um-tab-bar   { overflow-x: visible !important; }
        }
      `}</style>
    </div>
  );
};
