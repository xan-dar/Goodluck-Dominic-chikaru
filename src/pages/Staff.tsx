import React from 'react';
import { CheckCircle2, XCircle, Clock, History, User, Shield, Info, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';
import { apiFetch } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

interface ApprovalRequest {
  id: number;
  type: 'stock_intake' | 'disposal' | 'product_update' | 'sale';
  data: any;
  requester_id: number;
  requester_name: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewer_id?: number;
  reviewer_name?: string;
  created_at: string;
  reviewed_at?: string;
  notes?: string;
}

interface AuditLog {
  id: number;
  user_id: number;
  user_name: string;
  user_role: string;
  action: string;
  details: string;
  created_at: string;
}

export default function Staff() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = React.useState<'approvals' | 'logs'>('approvals');
  const [approvals, setApprovals] = React.useState<ApprovalRequest[]>([]);
  const [logs, setLogs] = React.useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [reviewNotes, setReviewNotes] = React.useState<Record<number, string>>({});

  const fetchData = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const [appRes, logRes] = await Promise.all([
        apiFetch('/api/staff/approvals'),
        apiFetch('/api/staff/audit-logs')
      ]);
      const appData = await appRes.json();
      const logData = await logRes.json();
      setApprovals(appData);
      setLogs(logData);
    } catch (error) {
      console.error('Failed to fetch staff data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleReview = async (id: number, status: 'approved' | 'rejected') => {
    try {
      const res = await apiFetch(`/api/staff/approvals/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({
          status,
          reviewer_id: user?.id || 1,
          notes: reviewNotes[id] || ''
        })
      });
      if (res.ok) {
        fetchData();
        // Clear notes for this id
        const newNotes = { ...reviewNotes };
        delete newNotes[id];
        setReviewNotes(newNotes);
      }
    } catch (error) {
      console.error('Review failed:', error);
    }
  };

  const getActionColor = (action: string) => {
    if (action.startsWith('APPROVED')) return 'text-emerald-600 bg-emerald-50 border-emerald-100';
    if (action.startsWith('REJECTED')) return 'text-rose-600 bg-rose-50 border-rose-100';
    if (action.startsWith('REQUEST')) return 'text-amber-600 bg-amber-50 border-amber-100';
    return 'text-slate-600 bg-slate-50 border-slate-100';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Staff Control Center</h2>
          <p className="text-slate-500">Track activities and manage operational approvals</p>
        </div>
        <div className="flex bg-white p-1 rounded-xl shadow-sm border border-slate-200">
          <button
            onClick={() => setActiveTab('approvals')}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2",
              activeTab === 'approvals' ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"
            )}
          >
            <Shield size={16} />
            Pending Approvals
            {approvals.filter(a => a.status === 'pending').length > 0 && (
              <span className="bg-red-400 text-white px-1.5 py-0.5 rounded-full text-[10px]">
                {approvals.filter(a => a.status === 'pending').length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2",
              activeTab === 'logs' ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"
            )}
          >
            <History size={16} />
            Action Logs
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'approvals' ? (
          <motion.div
            key="approvals"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {approvals.length === 0 ? (
              <div className="bg-white rounded-2xl p-12 text-center border border-dashed border-slate-200">
                <Shield className="mx-auto text-slate-300 mb-4" size={48} />
                <h3 className="text-lg font-medium text-slate-900">No Pending Requests</h3>
                <p className="text-slate-500 max-w-sm mx-auto">
                  There are currently no actions waiting for your approval. Everything is up to date!
                </p>
              </div>
            ) : (
              approvals.map((request) => (
                <div 
                  key={request.id} 
                  className={cn(
                    "bg-white rounded-2xl border transition-all overflow-hidden",
                    request.status === 'pending' ? "border-amber-200 shadow-sm" : "border-slate-200 opacity-80"
                  )}
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-12 h-12 rounded-xl flex items-center justify-center",
                          request.type === 'stock_intake' ? "bg-emerald-50 text-emerald-600 border border-emerald-100" :
                          request.type === 'disposal' ? "bg-rose-50 text-rose-600 border border-rose-100" :
                          "bg-indigo-50 text-indigo-600 border border-indigo-100"
                        )}>
                          {request.type === 'stock_intake' ? <Package size={24} /> :
                           request.type === 'disposal' ? <XCircle size={24} /> :
                           <Info size={24} />}
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 capitalize">
                            {request.type.replace('_', ' ')}
                          </h4>
                          <div className="flex items-center gap-2 text-sm text-slate-500">
                            <User size={14} />
                            Requested by <span className="font-medium text-slate-700">{request.requester_name}</span>
                            <span className="text-slate-300">•</span>
                            <Clock size={14} />
                            {format(new Date(request.created_at), 'MMM d, h:mm a')}
                          </div>
                        </div>
                      </div>
                      <div className={cn(
                        "px-3 py-1 rounded-full text-xs font-bold uppercase",
                        request.status === 'pending' ? "bg-amber-100 text-amber-700" :
                        request.status === 'approved' ? "bg-emerald-100 text-emerald-700" :
                        "bg-rose-100 text-rose-700"
                      )}>
                        {request.status}
                      </div>
                    </div>

                    <div className="bg-slate-50 rounded-xl p-4 mb-4 text-sm text-slate-600 grid grid-cols-2 md:grid-cols-4 gap-4">
                      {Object.entries(request.data).map(([key, value]) => (
                        <div key={key}>
                          <span className="block text-slate-400 capitalize text-[10px] font-bold tracking-wider">{key.replace('_', ' ')}</span>
                          <span className="font-medium text-slate-800">{String(value)}</span>
                        </div>
                      ))}
                    </div>

                    {request.status === 'pending' ? (
                      <div className="flex items-end gap-4">
                        <div className="flex-1">
                          <label className="block text-xs font-bold text-slate-400 uppercase mb-1 ml-1">Review Notes (Optional)</label>
                          <input 
                            type="text"
                            placeholder="Add reason for approval or rejection..."
                            className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
                            value={reviewNotes[request.id] || ''}
                            onChange={(e) => setReviewNotes({ ...reviewNotes, [request.id]: e.target.value })}
                          />
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => handleReview(request.id, 'rejected')}
                            className="px-6 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-600 font-bold text-sm hover:bg-rose-100 transition-colors flex items-center gap-2"
                          >
                            <XCircle size={18} />
                            Reject
                          </button>
                          <button 
                            onClick={() => handleReview(request.id, 'approved')}
                            className="px-6 py-2 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition-shadow shadow-lg shadow-emerald-600/20 flex items-center gap-2"
                          >
                            <CheckCircle2 size={18} />
                            Approve
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm">
                        <User size={16} className="text-slate-400" />
                        <span className="text-slate-500">Reviewed by:</span>
                        <span className="font-semibold text-slate-700">{request.reviewer_name}</span>
                        {request.notes && (
                          <div className="ml-4 flex items-center gap-2 text-slate-500 italic">
                            <Info size={14} />
                            "{request.notes}"
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </motion.div>
        ) : (
          <motion.div
            key="logs"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white rounded-2xl border border-slate-200 overflow-hidden"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Time</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">User</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Action</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                        {format(new Date(log.created_at), 'HH:mm:ss')}
                        <span className="block text-[10px] opacity-60">{format(new Date(log.created_at), 'yyyy-MM-dd')}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">
                            {log.user_name.split(' ').map(n => n[0]).join('')}
                          </div>
                          <div>
                            <div className="text-sm font-bold text-slate-900">{log.user_name}</div>
                            <div className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">{log.user_role}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-2 py-1 rounded text-[10px] font-bold border uppercase",
                          getActionColor(log.action)
                        )}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 font-mono">
                        {log.details}
                      </td>
                    </tr>
                  ))}
                  {logs.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">
                        No activity logs found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Package({ size }: { size: number }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
}
