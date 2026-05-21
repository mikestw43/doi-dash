import { useState, useEffect } from 'react';
import { fetchAuditLogs, fetchAuditActions, fetchUsers } from '../../services/api';
import { exportToCSV } from '../../utils/export';
import { useUIStore } from '../../stores/uiStore';
import { Dialog } from '../ui/Dialog';
import type { AuditLogEntry, UserInfo } from '../../types';

const ACTION_COLORS: Record<string, string> = {
  login:                  'var(--cyan)',
  create_account:         'var(--green)',
  delete_account:         'var(--red)',
  create_user:            'var(--green)',
  delete_user:            'var(--red)',
  close_all:              'var(--yellow)',
  protection_triggered:   'var(--red)',
  change_password:        'var(--cyan)',
  change_role:            'var(--yellow)',
  update_profile:         'var(--cyan)',
  update_telegram:        'var(--cyan)',
  update_alerts:          'var(--cyan)',
  update_report_settings: 'var(--cyan)',
  update_protection:      'var(--yellow)',
  create_group:           'var(--green)',
  update_group:           'var(--cyan)',
  delete_group:           'var(--red)',
};

const selStyle: React.CSSProperties = { width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border2)', color: 'var(--text)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', padding: '8px 10px', outline: 'none', cursor: 'pointer', boxSizing: 'border-box' };
const lblStyle: React.CSSProperties = { fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-dim)', letterSpacing: '.5px', display: 'block', marginBottom: '6px' };
const thStyle: React.CSSProperties = { fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-dim)', letterSpacing: '.5px', padding: '9px 10px', textAlign: 'left', borderBottom: '2px solid var(--border2)', fontWeight: 400, whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '7px 10px', borderBottom: '1px solid rgba(45,64,96,.3)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text)' };

export const AuditLogViewer = ({ embedded }: { embedded?: boolean } = {}) => {
  const setCurrentPage = useUIStore(s => s.setCurrentPage);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [filterUser, setFilterUser] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [actions, setActions] = useState<string[]>([]);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const limit = 25;

  // Filter modal — draft state, only committed when Apply is pressed
  const [showFilter, setShowFilter] = useState(false);
  const [draftUser, setDraftUser] = useState('');
  const [draftAction, setDraftAction] = useState('');

  useEffect(() => {
    if (showFilter) {
      setDraftUser(filterUser);
      setDraftAction(filterAction);
    }
  }, [showFilter, filterUser, filterAction]);

  const applyFilters = () => {
    setFilterUser(draftUser);
    setFilterAction(draftAction);
    setPage(1);
    setShowFilter(false);
  };
  const clearDraftFilters = () => {
    setDraftUser('');
    setDraftAction('');
  };
  const activeFilterCount = (filterUser ? 1 : 0) + (filterAction ? 1 : 0);

  useEffect(() => {
    fetchAuditActions().then(setActions).catch(() => {});
    fetchUsers().then(setUsers).catch(() => {});
  }, []);

  const load = () => {
    setLoading(true);
    fetchAuditLogs({ page, limit, userId: filterUser || undefined, action: filterAction || undefined })
      .then(res => { setLogs(res.logs); setTotal(res.total); })
      .catch(() => { setLogs([]); setTotal(0); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [page, filterUser, filterAction]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.ceil(total / limit) || 1;

  const handleExport = () => {
    if (!logs.length) return;
    exportToCSV(
      logs.map(l => ({ user: l.user?.email || l.userId, action: l.action, resourceType: l.resourceType || '', resourceId: l.resourceId || '', details: l.details || '', time: new Date(l.createdAt).toLocaleString() })),
      `audit-log-${new Date().toISOString().slice(0, 10)}`,
      [{ key: 'user', label: 'User' }, { key: 'action', label: 'Action' }, { key: 'resourceType', label: 'Resource Type' }, { key: 'resourceId', label: 'Resource ID' }, { key: 'details', label: 'Details' }, { key: 'time', label: 'Time' }],
    );
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      {/* Back — hidden when embedded */}
      {!embedded && (
        <button
          onClick={() => setCurrentPage('dashboard')}
          style={{ background: 'none', border: 'none', color: 'var(--cyan)', fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', cursor: 'pointer', marginBottom: '14px', letterSpacing: '.5px' }}
        >
          ← BACK
        </button>
      )}

      {/* Header — hidden when embedded */}
      {!embedded && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <div style={{ width: '7px', height: '7px', background: 'var(--cyan)', boxShadow: '0 0 6px var(--cyan)', flexShrink: 0 }} />
          <span style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text)', letterSpacing: '2px', textShadow: '0 0 12px rgba(56,189,248,.8)' }}>AUDIT LOG</span>
          <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, var(--border2), transparent)' }} />
          <span style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-dim)', padding: '4px 10px', border: '1px solid var(--border2)' }}>{total}</span>
          <button
            onClick={handleExport}
            disabled={!logs.length}
            style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', letterSpacing: '.5px', padding: '7px 12px', background: 'none', border: '1px solid var(--border2)', color: 'var(--text-dim)', cursor: logs.length ? 'pointer' : 'not-allowed', opacity: logs.length ? 1 : .3 }}
          >
            ↓ EXPORT
          </button>
        </div>
      )}

      {/* Filter button — opens modal */}
      <div style={{ marginBottom: '10px' }}>
        <button
          onClick={() => setShowFilter(true)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '6px 10px',
            fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', letterSpacing: '.5px',
            border: activeFilterCount > 0 ? '1px solid var(--accent-blue)' : '1px solid var(--border2)',
            color: activeFilterCount > 0 ? 'var(--accent-blue)' : 'var(--text-muted)',
            background: activeFilterCount > 0 ? 'rgba(56,189,248,.08)' : 'none',
            cursor: 'pointer',
          }}
        >
          ⚙ FILTER
          {activeFilterCount > 0 && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              minWidth: '18px', height: '16px', padding: '0 5px',
              fontFamily: 'var(--ff-section)', fontSize: '10px',
              color: 'var(--bg-primary)', background: 'var(--accent-blue)',
              letterSpacing: 0,
            }}>{activeFilterCount}</span>
          )}
        </button>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border2)', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '380px' }}>
          <thead>
            <tr style={{ background: 'var(--bg-card2)' }}>
              <th style={thStyle} className="al-col-user">USER</th>
              <th style={thStyle}>ACTION</th>
              <th style={thStyle} className="al-col-resource">RESOURCE</th>
              <th style={thStyle} className="al-col-details">DETAILS</th>
              <th style={thStyle}>TIME</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ ...tdStyle, textAlign: 'center', padding: '32px', color: 'var(--text-dim)' }}>Loading...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={5} style={{ ...tdStyle, textAlign: 'center', padding: '32px', color: 'var(--text-dim)' }}>No logs found.</td></tr>
            ) : (
              logs.map(log => (
                <tr key={log.id}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(45,64,96,.25)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ ...tdStyle, color: 'var(--cyan)' }} className="al-col-user">
                    {log.user?.email || log.userId.slice(0, 8)}
                  </td>
                  <td style={tdStyle}>
                    <span style={{ color: ACTION_COLORS[log.action] || 'var(--text-dim)' }}>{log.action}</span>
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--text-dim)', fontSize: '10px' }} className="al-col-resource">
                    {log.resourceType || '—'}
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--text-dim)', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} className="al-col-details" title={log.details || ''}>
                    {log.details ? log.details.slice(0, 60) : '—'}
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--text-dim)', fontSize: '10px', whiteSpace: 'nowrap' }}>
                    {new Date(log.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <style>{`
        @media (max-width: 640px) { .al-col-details  { display: none !important; } }
        @media (max-width: 480px) { .al-col-resource { display: none !important; } }
        @media (max-width: 380px) { .al-col-user     { display: none !important; } }
      `}</style>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px' }}>
          <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-dim)' }}>
            Page {page} / {totalPages} · {total} entries
          </span>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              style={{ background: 'none', border: '1px solid var(--border2)', color: 'var(--text-dim)', cursor: page > 1 ? 'pointer' : 'not-allowed', padding: '5px 10px', opacity: page > 1 ? 1 : .3, fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)' }}>
              ‹
            </button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              style={{ background: 'none', border: '1px solid var(--border2)', color: 'var(--text-dim)', cursor: page < totalPages ? 'pointer' : 'not-allowed', padding: '5px 10px', opacity: page < totalPages ? 1 : .3, fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)' }}>
              ›
            </button>
          </div>
        </div>
      )}

      {/* Filter modal — draft state, only committed when Apply is pressed */}
      <Dialog open={showFilter} onClose={() => setShowFilter(false)} title="FILTER AUDIT LOG">
        <div style={{ marginBottom: '12px' }}>
          <label style={lblStyle}>USER</label>
          <select value={draftUser} onChange={e => setDraftUser(e.target.value)} style={selStyle}>
            <option value="">All Users</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.email}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: '16px' }}>
          <label style={lblStyle}>ACTION</label>
          <select value={draftAction} onChange={e => setDraftAction(e.target.value)} style={selStyle}>
            <option value="">All Actions</option>
            {actions.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={clearDraftFilters}
            style={{
              flex: 1, padding: '9px',
              fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
              border: '1px solid var(--border2)', color: 'var(--text-muted)',
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
              background: 'rgba(56,189,248,.1)', cursor: 'pointer', letterSpacing: '.5px',
            }}
          >
            APPLY
          </button>
        </div>
      </Dialog>
    </div>
  );
};
