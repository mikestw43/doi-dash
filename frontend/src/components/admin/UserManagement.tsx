import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, UserPlus, Trash2, ShieldCheck, Shield, Loader2 } from 'lucide-react';
import { fetchUsers, createUser, deleteUser, changeUserRole } from '../../services/api';
import { useUIStore } from '../../stores/uiStore';
import { useAuthStore } from '../../stores/authStore';
import { Dialog } from '../ui/Dialog';
import type { UserInfo } from '../../types';

export const UserManagement = () => {
  const { setCurrentPage, addToast } = useUIStore();
  const currentUserId = useAuthStore(s => s.user?.id);
  const queryClient = useQueryClient();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Form state
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

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <button
        onClick={() => setCurrentPage('dashboard')}
        className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
      >
        <ArrowLeft size={16} />
        Back to Dashboard
      </button>

      <div className="flex items-center justify-between">
        <h2 className="font-pixel text-[13px] text-accent-blue tracking-wider" style={{ textShadow: '0 0 8px rgba(56,189,248,0.5)' }}>User Management</h2>
        <button
          onClick={() => setShowAddDialog(true)}
          className="btn-primary flex items-center gap-2"
        >
          <UserPlus size={12} />
          ADD USER
        </button>
      </div>

      {/* User Table */}
      <div className="bg-bg-secondary border border-border2 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center font-tech text-gray-600">Loading...</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border2">
                <th className="font-pixel text-[8px] text-gray-600 tracking-widest text-left p-4">Email</th>
                <th className="font-pixel text-[8px] text-gray-600 tracking-widest text-left p-4">Name</th>
                <th className="font-pixel text-[8px] text-gray-600 tracking-widest text-left p-4">Role</th>
                <th className="font-pixel text-[8px] text-gray-600 tracking-widest text-center p-4">Accounts</th>
                <th className="font-pixel text-[8px] text-gray-600 tracking-widest text-left p-4">Created</th>
                <th className="font-pixel text-[8px] text-gray-600 tracking-widest text-right p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id} className="border-b border-gray-800/40 hover:bg-gray-800/20 transition-colors">
                  <td className="p-4 font-tech text-white">{user.email}</td>
                  <td className="p-4 font-tech text-gray-400">{user.name || '-'}</td>
                  <td className="p-4">
                    <button
                      onClick={() => {
                        if (user.id === currentUserId) return;
                        roleMutation.mutate({ id: user.id, role: user.role === 'admin' ? 'user' : 'admin' });
                      }}
                      disabled={user.id === currentUserId}
                      className={`font-pixel text-[8px] flex items-center gap-1 px-2 py-1 border transition-colors ${
                        user.role === 'admin'
                          ? 'border-accent-blue/40 text-accent-blue hover:bg-accent-blue/10'
                          : 'border-gray-700 text-gray-500 hover:border-gray-500'
                      } ${user.id === currentUserId ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      {user.role === 'admin' ? <ShieldCheck size={10} /> : <Shield size={10} />}
                      {user.role}
                    </button>
                  </td>
                  <td className="p-4 text-center font-display text-xl text-gray-400">{user._count.accounts}</td>
                  <td className="p-4 font-tech text-xs text-gray-600">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="p-4 text-right">
                    {user.id !== currentUserId && (
                      <button
                        onClick={() => setDeleteId(user.id)}
                        className="text-gray-600 hover:text-danger transition-colors p-1"
                        title="Delete user"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add User Dialog */}
      <Dialog
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        title="Add New User"
      >
        <div className="space-y-4">
          <div>
            <label className="font-pixel text-[8px] text-gray-600 tracking-widest uppercase block mb-2">Email *</label>
            <input
              type="email"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              className="w-full bg-bg-primary border border-border2 px-3 py-2 font-tech text-sm text-white placeholder-gray-700 focus:outline-none focus:border-accent-blue"
              placeholder="user@example.com"
            />
          </div>
          <div>
            <label className="font-pixel text-[8px] text-gray-600 tracking-widest uppercase block mb-2">Password * (min 6 chars)</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="w-full bg-bg-primary border border-border2 px-3 py-2 font-tech text-sm text-white focus:outline-none focus:border-accent-blue"
            />
          </div>
          <div>
            <label className="font-pixel text-[8px] text-gray-600 tracking-widest uppercase block mb-2">Name</label>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              className="w-full bg-bg-primary border border-border2 px-3 py-2 font-tech text-sm text-white placeholder-gray-700 focus:outline-none focus:border-accent-blue"
              placeholder="Optional"
            />
          </div>
          <div>
            <label className="font-pixel text-[8px] text-gray-600 tracking-widest uppercase block mb-2">Role</label>
            <select
              value={newRole}
              onChange={e => setNewRole(e.target.value)}
              className="w-full bg-bg-primary border border-border2 px-3 py-2 font-tech text-sm text-white focus:outline-none focus:border-accent-blue"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setShowAddDialog(false)} className="btn-ghost flex-1">
              CANCEL
            </button>
            <button
              onClick={() => createMutation.mutate({ email: newEmail, password: newPassword, name: newName || undefined, role: newRole })}
              disabled={!newEmail || !newPassword || newPassword.length < 6 || createMutation.isPending}
              className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {createMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />}
              CREATE USER
            </button>
          </div>
        </div>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Delete User"
      >
        <div className="space-y-4">
          <p className="font-tech text-sm text-gray-400">
            Delete <span className="text-white">{deleteTarget?.email}</span>?
            This will also remove {deleteTarget?._count.accounts || 0} accounts.
          </p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteId(null)} className="btn-ghost flex-1">CANCEL</button>
            <button
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
              className="btn-danger flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {deleteMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              DELETE
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};
