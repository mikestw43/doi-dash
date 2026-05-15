import { useState, useEffect } from 'react';
import { fetchAuditLogs, fetchAuditActions, fetchUsers } from '../../services/api';
import { exportToCSV } from '../../utils/export';
import { useUIStore } from '../../stores/uiStore';
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

const selStyle: React.CSSProperties = { background: 'var(--bg-input)', border: '1px solid var(--border2)', color: 'var(--text)', fontFamily: "'Share Tech Mono'", fontSize: '11px', padding: '6px 10px', outline: 'none', cursor: 'pointer' };
const thStyle: React.CSSProperties = { fontFamily: "'Press Start 2P'", fontSize: '7px', color: 'var(--text-dim)', letterSpacing: '.5px', padding: '9px 10px', textAlign: 'left', borderBottom: '2px solid var(--border2)', fontWeight: 400, whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '7px 10px', borderBottom: '1px solid rgba(45,64,96,.3)', fontFamily: "'Share Tech Mono'", fontSize: '11px', color: 'var(--text)' };

export const AuditLogViewer = () => {
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
        <span style={{ fontFamily: "'Press Start 2P'", fontSize: '8px', color: 'var(--text)', letterSpacing: '2px', textShadow: '0 0 12px rgba(56,189,248,.8)' }}>AUDIT LOG</span>
        <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, var(--border2), transparent)' }} />
        <span style={{ fontFamily: "'Press Start 2P'", fontSize: '7px', color: 'var(--text-dim)', padding: '4px 10px', border: '1px solid var(--border2)' }}>{total}</span>
        <button
          onClick={handleExport}
          disabled={!logs.length}
          style={{ fontFamily: "'Press Start 2P'", fontSize: '7px', letterSpacing: '.5px', padding: '7px 12px', background: 'none', border: '1px solid var(--border2)', color: 'var(--text-dim)', cursor: logs.length ? 'pointer' : 'not-allowed', opacity: logs.length ? 1 : .3 }}
        >
          ↓ EXPORT
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <select value={filterUser} onChange={e => { setFilterUser(e.target.value); setPage(1); }} style={selStyle}>
          <option value="">All Users</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.email}</option>)}
        </select>
        <select value={filterAction} onChange={e => { setFilterAction(e.target.value); setPage(1); }} style={selStyle}>
          <option value="">All Actions</option>
          {actions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border2)', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
          <thead>
            <tr style={{ background: 'var(--bg-card2)' }}>
              <th style={thStyle}>USER</th>
              <th style={thStyle}>ACTION</th>
              <th style={thStyle}>RESOURCE</th>
              <th style={thStyle}>DETAILS</th>
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
                  <td style={{ ...tdStyle, color: 'var(--cyan)' }}>
                    {log.user?.email || log.userId.slice(0, 8)}
                  </td>
                  <td style={tdStyle}>
                    <span style={{ color: ACTION_COLORS[log.action] || 'var(--text-dim)' }}>{log.action}</span>
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--text-dim)', fontSize: '10px' }}>
                    {log.resourceType || '—'}
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--text-dim)', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.details || ''}>
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px' }}>
          <span style={{ fontFamily: "'Share Tech Mono'", fontSize: '10px', color: 'var(--text-dim)' }}>
            Page {page} / {totalPages} · {total} entries
          </span>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              style={{ background: 'none', border: '1px solid var(--border2)', color: 'var(--text-dim)', cursor: page > 1 ? 'pointer' : 'not-allowed', padding: '5px 10px', opacity: page > 1 ? 1 : .3, fontFamily: "'Share Tech Mono'", fontSize: '12px' }}>
              ‹
            </button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              style={{ background: 'none', border: '1px solid var(--border2)', color: 'var(--text-dim)', cursor: page < totalPages ? 'pointer' : 'not-allowed', padding: '5px 10px', opacity: page < totalPages ? 1 : .3, fontFamily: "'Share Tech Mono'", fontSize: '12px' }}>
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
