import React, { useState, useEffect } from 'react';
import { FileCode2, CheckCircle2, Clock, XCircle, MessageSquare } from 'lucide-react';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import api from '../../services/api';
import { formatDateIST } from '../../utils/time';

export default function AdminWebsiteRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedReq, setSelectedReq] = useState(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [newStatus, setNewStatus] = useState('REVIEWED');

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter) params.status_filter = statusFilter;
      const res = await api.get('/admin/website-requests', { params });
      setRequests(res.data);
    } catch (err) {
      console.error('Failed to load website requests', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [statusFilter]);

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!selectedReq) return;
    try {
      const res = await api.put(`/admin/website-requests/${selectedReq.id}`, {
        status: newStatus,
        admin_notes: adminNotes,
      });
      setRequests(requests.map((r) => (r.id === res.data.id ? res.data : r)));
      setSelectedReq(null);
    } catch (err) {
      console.error('Failed to update request', err);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'PENDING':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400">PENDING</span>;
      case 'REVIEWED':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-400">REVIEWED</span>;
      case 'COMPLETED':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400">COMPLETED</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Website Creation Requests</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Review user-submitted proposals for new business websites
          </p>
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3.5 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-slate-300 focus:outline-none"
        >
          <option value="">All Statuses</option>
          <option value="PENDING">Pending</option>
          <option value="REVIEWED">Reviewed</option>
          <option value="COMPLETED">Completed</option>
          <option value="REJECTED">Rejected</option>
        </select>
      </div>

      <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-xs">
        {loading ? (
          <LoadingSpinner message="Loading website requests..." />
        ) : requests.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">No requests found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="p-4 font-bold">Request ID</th>
                  <th className="p-4 font-bold">Business ID</th>
                  <th className="p-4 font-bold">User ID</th>
                  <th className="p-4 font-bold">Status</th>
                  <th className="p-4 font-bold">Message</th>
                  <th className="p-4 font-bold">Submitted</th>
                  <th className="p-4 font-bold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {requests.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-900/50 transition-colors">
                    <td className="p-4 font-mono font-bold text-amber-400">#{r.id}</td>
                    <td className="p-4">Shop #{r.business_id}</td>
                    <td className="p-4 text-slate-400">User #{r.user_id}</td>
                    <td className="p-4">{getStatusBadge(r.status)}</td>
                    <td className="p-4 max-w-xs truncate text-slate-400">{r.message || '—'}</td>
                    <td className="p-4 text-slate-500">{formatDateIST(r.created_at)}</td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => {
                          setSelectedReq(r);
                          setNewStatus(r.status);
                          setAdminNotes(r.admin_notes || '');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-400 font-semibold text-[11px]"
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Review Modal */}
      {selectedReq && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-2xl max-w-md w-full p-6 border border-slate-800 shadow-2xl space-y-4 text-slate-200 text-xs">
            <h3 className="text-sm font-bold text-white">Review Request #{selectedReq.id}</h3>
            <p className="text-slate-400">User note: <span className="text-slate-200">{selectedReq.message || 'None'}</span></p>

            <form onSubmit={handleUpdate} className="space-y-3">
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Update Status</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl"
                >
                  <option value="PENDING">PENDING</option>
                  <option value="REVIEWED">REVIEWED</option>
                  <option value="COMPLETED">COMPLETED</option>
                  <option value="REJECTED">REJECTED</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Admin Notes</label>
                <textarea
                  rows={3}
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Notes on client quotation or web development status..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedReq(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold hover:bg-amber-400"
                >
                  Save Status
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
