import React from 'react';
import { AlertTriangle, Clock, Calendar, Package, Search, Filter, ChevronRight, AlertCircle, Trash2, Edit, Loader2, X } from 'lucide-react';
import { format, differenceInDays, isPast, isFuture, addDays } from 'date-fns';
import { cn } from '../lib/utils';

interface Batch {
  id: number;
  product_id: number;
  product_name: string;
  category_id: number;
  description: string;
  min_stock_level: number;
  quantity: number;
  expiry_date: string | null;
  received_at: string;
  category_name: string;
  selling_price: number;
  sku: string;
  purchase_price: number;
}

import { apiFetch } from '../lib/api';

export default function ExpiryAlerts() {
  const [batches, setBatches] = React.useState<Batch[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [filter, setFilter] = React.useState<'all' | 'expired' | 'expiring'>('all');
  const [isFilterBarOpen, setIsFilterBarOpen] = React.useState(false);
  const [dateRange, setDateRange] = React.useState({ from: '', to: '' });
  const [sortConfig, setSortConfig] = React.useState<{ field: string, order: 'asc' | 'desc' }>({
    field: 'expiry_date',
    order: 'asc'
  });

  const [isActionModalOpen, setIsActionModalOpen] = React.useState(false);
  const [isDisposeConfirmOpen, setIsDisposeConfirmOpen] = React.useState(false);
  const [selectedBatch, setSelectedBatch] = React.useState<any>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [disposalReason, setDisposalReason] = React.useState('');
  const [disposalHistory, setDisposalHistory] = React.useState<any[]>([]);
  const [activeTab, setActiveTab] = React.useState<'alerts' | 'history'>('alerts');

  const fetchDisposalHistory = async () => {
    try {
      const response = await apiFetch('/api/disposal-history');
      if (response.ok) {
        const data = await response.json();
        setDisposalHistory(data);
      }
    } catch (error) {
      console.error('Failed to fetch disposal history:', error);
    }
  };

  React.useEffect(() => {
    if (activeTab === 'history') {
      fetchDisposalHistory();
    }
  }, [activeTab]);

  const handleDispose = async () => {
    if (!selectedBatch || !disposalReason.trim()) return;
    
    setIsSubmitting(true);
    try {
      const response = await apiFetch(`/api/batches/${selectedBatch.id}/dispose`, {
        method: 'POST',
        body: JSON.stringify({
          reason: disposalReason,
          quantity: selectedBatch.quantity,
          product_id: selectedBatch.product_id
        }),
      });

      if (response.ok) {
        setIsDisposeConfirmOpen(false);
        setDisposalReason('');
        fetchBatches();
      }
    } catch (error) {
      console.error('Failed to dispose batch:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdatePrice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatch) return;

    setIsSubmitting(true);
    try {
      const response = await apiFetch(`/api/products/${selectedBatch.product_id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: selectedBatch.product_name,
          category_id: selectedBatch.category_id,
          min_stock_level: selectedBatch.min_stock_level,
          sku: selectedBatch.sku,
          description: selectedBatch.description,
          selling_price: parseFloat(selectedBatch.new_price)
        }),
      });

      if (response.ok) {
        setIsActionModalOpen(false);
        fetchBatches();
      }
    } catch (error) {
      console.error('Failed to update price:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const fetchBatches = async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/api/batches');
      const data = await response.json();
      // Only care about items with stock and expiry dates for this page
      setBatches(data.filter((b: Batch) => b.expiry_date !== null && b.quantity > 0));
    } catch (error) {
      console.error('Failed to fetch batches:', error);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchBatches();
  }, []);

  const processedBatches = React.useMemo(() => {
    const now = new Date();

    return batches
      .map(batch => {
        const expiryDate = new Date(batch.expiry_date!);
        const daysUntilExpiry = differenceInDays(expiryDate, now);
        const expired = isPast(expiryDate);
        const expiringSoon = !expired && daysUntilExpiry <= 30;
        const isCritical = !expired && daysUntilExpiry <= 7;

        return {
          ...batch,
          daysUntilExpiry,
          expired,
          expiringSoon,
          isCritical,
        };
      })
      .filter(batch => {
        const matchesSearch = batch.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                             batch.sku.toLowerCase().includes(searchQuery.toLowerCase());
        
        if (!matchesSearch) return false;

        // Date range filter
        if (dateRange.from && new Date(batch.expiry_date!) < new Date(dateRange.from)) return false;
        if (dateRange.to && new Date(batch.expiry_date!) > new Date(dateRange.to)) return false;

        if (filter === 'expired') return batch.expired;
        if (filter === 'expiring') return batch.expiringSoon;
        
        // Default 'all' shows both expired and expiring soon
        return batch.expired || batch.expiringSoon;
      })
      .sort((a, b) => {
        let valA: any = a[sortConfig.field as keyof typeof a];
        let valB: any = b[sortConfig.field as keyof typeof b];
        const order = sortConfig.order === 'asc' ? 1 : -1;

        if (sortConfig.field === 'expiry_date') {
          return (new Date(valA || 0).getTime() - new Date(valB || 0).getTime()) * order;
        }

        if (typeof valA === 'string') {
          return (valA || '').localeCompare(valB || '') * order;
        }

        return ((valA || 0) - (valB || 0)) * order;
      });
  }, [batches, searchQuery, filter, dateRange, sortConfig]);

  const stats = React.useMemo(() => {
    const expired = batches.filter(b => isPast(new Date(b.expiry_date!))).length;
    const expiringSoon = batches.filter(b => {
      const date = new Date(b.expiry_date!);
      return isFuture(date) && differenceInDays(date, new Date()) <= 30;
    }).length;

    return { expired, expiringSoon };
  }, [batches]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('alerts')}
          className={cn(
            "px-4 py-2 rounded-lg text-sm font-bold transition-all",
            activeTab === 'alerts' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
          )}
        >
          Active Alerts
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={cn(
            "px-4 py-2 rounded-lg text-sm font-bold transition-all",
            activeTab === 'history' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
          )}
        >
          Disposal History
        </button>
      </div>

      {activeTab === 'alerts' && (
        <>
          {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-red-50 text-red-600 rounded-xl flex items-center justify-center">
            <AlertCircle size={24} />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Expired Batches</p>
            <p className="text-2xl font-bold text-slate-900">{stats.expired}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-orange-50 text-orange-600 rounded-xl flex items-center justify-center">
            <Clock size={24} />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Expiring Within 30 Days</p>
            <p className="text-2xl font-bold text-slate-900">{stats.expiringSoon}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search products, SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsFilterBarOpen(!isFilterBarOpen)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 border rounded-xl transition-all font-medium text-sm",
              isFilterBarOpen ? "bg-indigo-50 border-indigo-200 text-indigo-600" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
            )}
          >
            <Filter size={18} />
            Filters
            {(dateRange.from || dateRange.to) && (
              <span className="w-2 h-2 bg-indigo-600 rounded-full"></span>
            )}
          </button>

          <div className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl">
            <Filter size={16} className="text-slate-400" />
            <select
              value={`${sortConfig.field}-${sortConfig.order}`}
              onChange={(e) => {
                const [field, order] = e.target.value.split('-');
                setSortConfig({ field, order: order as 'asc' | 'desc' });
              }}
              className="bg-transparent text-slate-600 hover:bg-slate-50 transition-colors font-medium outline-none text-sm"
            >
              <option value="expiry_date-asc">Expiry: Soonest</option>
              <option value="expiry_date-desc">Expiry: Latest</option>
              <option value="quantity-desc">Qty: High to Low</option>
              <option value="quantity-asc">Qty: Low to High</option>
              <option value="product_name-asc">Product: A-Z</option>
              <option value="product_name-desc">Product: Z-A</option>
            </select>
          </div>

          <div className="flex items-center gap-2 bg-white p-1 border border-slate-200 rounded-xl">
            <button
              onClick={() => setFilter('all')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
                filter === 'all' ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
              )}
            >
              All
            </button>
            <button
              onClick={() => setFilter('expired')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
                filter === 'expired' ? "bg-red-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
              )}
            >
              Expired
            </button>
            <button
              onClick={() => setFilter('expiring')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
                filter === 'expiring' ? "bg-orange-500 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
              )}
            >
              Soon
            </button>
          </div>
        </div>
      </div>

      {isFilterBarOpen && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm animate-in slide-in-from-top-2 duration-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">Expiry Date From</label>
              <input
                type="date"
                value={dateRange.from}
                onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">Expiry Date To</label>
              <input
                type="date"
                value={dateRange.to}
                onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none text-sm"
              />
            </div>
          </div>
          <button 
            onClick={() => setDateRange({ from: '', to: '' })}
            className="mt-4 text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
          >
            Clear Date Filter
          </button>
        </div>
      )}

      {/* Alerts List */}
      <div className="space-y-4">
        {processedBatches.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
            <div className="w-16 h-16 bg-green-50 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} />
            </div>
            <h3 className="text-lg font-bold text-slate-900">No Expiry Alerts</h3>
            <p className="text-slate-500">All your stock is currently healthy and within safe dates.</p>
          </div>
        ) : (
          processedBatches.map((batch) => (
            <div 
              key={batch.id}
              className={cn(
                "bg-white border rounded-2xl p-6 transition-all hover:shadow-md flex flex-col md:flex-row md:items-center justify-between gap-6",
                batch.expired ? "border-red-200 bg-red-50/10" : "border-orange-200 bg-orange-50/10"
              )}
            >
              <div className="flex items-start gap-4">
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
                  batch.expired ? "bg-red-100 text-red-600" : "bg-orange-100 text-orange-600"
                )}>
                  {batch.expired ? <AlertTriangle size={24} /> : <Clock size={24} />}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-bold text-slate-900 text-lg">{batch.product_name}</h4>
                    <span className="text-xs font-mono text-slate-400 bg-white px-2 py-0.5 border border-slate-200 rounded uppercase">
                      {batch.sku}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-y-2 gap-x-4 text-sm text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <Package size={14} />
                      {batch.quantity} Units in Batch #{batch.id}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Calendar size={14} />
                      Expires: {format(new Date(batch.expiry_date!), 'MMM dd, yyyy')}
                    </span>
                    <span className="px-2 py-0.5 bg-white border border-slate-200 rounded text-xs font-medium">
                      {batch.category_name}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-end gap-2 shrink-0">
                {batch.isCritical && (
                  <span className="px-2 py-0.5 bg-red-100 text-red-600 text-[10px] font-bold rounded-lg uppercase tracking-wider animate-pulse">
                    Critical: Urgent Action
                  </span>
                )}
                <div className={cn(
                  "px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2",
                  batch.expired 
                    ? "bg-red-600 text-white shadow-lg shadow-red-100" 
                    : batch.isCritical 
                      ? "bg-red-500 text-white shadow-lg shadow-red-100"
                      : "bg-orange-500 text-white shadow-lg shadow-orange-100"
                )}>
                  {batch.expired ? (
                    <>
                      <AlertCircle size={16} />
                      Days Past Expiry: {Math.abs(batch.daysUntilExpiry)}
                    </>
                  ) : (
                    <>
                      <Clock size={16} />
                      {batch.isCritical ? "Expiring in " : "Expires in "} {batch.daysUntilExpiry} days
                    </>
                  )}
                </div>
                <p className="text-xs text-slate-400 font-medium italic">
                  Action required: {batch.expired ? 'Dispose or mark as waste' : batch.isCritical ? 'Immediate Clearance Required' : 'Prioritize for sales'}
                </p>
                <div className="flex gap-2 mt-3">
                  <button 
                    onClick={() => {
                      setSelectedBatch({...batch, new_price: ''});
                      setIsActionModalOpen(true);
                    }}
                    className="flex flex-1 items-center justify-center gap-1.5 px-3 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-all active:scale-95"
                  >
                    <Edit size={14} />
                    Discount Price
                  </button>
                  <button 
                    onClick={() => {
                      setSelectedBatch(batch);
                      setIsDisposeConfirmOpen(true);
                    }}
                    disabled={batch.quantity === 0}
                    className="flex flex-1 items-center justify-center gap-1.5 px-3 py-2 bg-red-50 text-red-600 rounded-xl text-xs font-bold hover:bg-red-100 transition-all active:scale-95 disabled:opacity-50 disabled:grayscale"
                  >
                    <Trash2 size={14} />
                    Dispose Batch
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      {/* Action Modal */}
      {isActionModalOpen && selectedBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className={`p-6 flex items-center justify-between text-white ${selectedBatch.expired ? 'bg-red-600' : 'bg-indigo-600'}`}>
              <div className="flex items-center gap-3">
                <Edit size={24} />
                <h2 className="text-xl font-bold">Adjust Selling Price</h2>
              </div>
              <button onClick={() => setIsActionModalOpen(false)} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleUpdatePrice} className="p-6 space-y-6">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                <p className="text-xs text-slate-400 font-bold uppercase mb-1">Product</p>
                <p className="font-bold text-slate-900">{selectedBatch.product_name}</p>
                <div className="flex justify-between mt-2 text-xs">
                  <span className="text-slate-500">Current Qty: <span className="font-bold">{selectedBatch.quantity}</span></span>
                  <span className="text-slate-500">Cur. Price: <span className="font-bold">₦{selectedBatch.selling_price || '0.00'}</span></span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">New Clearance Price (₦)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₦</span>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={selectedBatch.new_price}
                    onChange={(e) => setSelectedBatch({...selectedBatch, new_price: e.target.value})}
                    placeholder="0.00"
                    className="w-full pl-8 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all font-bold text-indigo-600"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-2 italic">
                  This will update the global selling price for {selectedBatch.product_name}.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsActionModalOpen(false)}
                  className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !selectedBatch.new_price}
                  className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
                >
                  {isSubmitting && <Loader2 size={18} className="animate-spin" />}
                  Update Price
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Disposal Confirmation Modal */}
      {isDisposeConfirmOpen && selectedBatch && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 bg-red-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle size={24} />
                <h2 className="text-xl font-bold">Confirm Disposal</h2>
              </div>
              <button onClick={() => setIsDisposeConfirmOpen(false)} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-5">
              <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                <p className="text-xs text-red-400 font-bold uppercase mb-1">Warning</p>
                <p className="text-sm text-red-700 leading-relaxed font-medium">
                  You are about to dispose of <span className="font-bold underline">{selectedBatch.quantity} units</span> of <span className="font-bold">{selectedBatch.product_name}</span>.
                </p>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-700">Reason for Disposal</label>
                <textarea
                  value={disposalReason}
                  onChange={(e) => setDisposalReason(e.target.value)}
                  placeholder="e.g., Expired, Damaged, Quality issues..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all text-sm min-h-[100px] resize-none"
                />
                <p className="text-[10px] text-slate-400 italic">
                  This action will permanently set the batch quantity to 0 and record it in the audit log.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsDisposeConfirmOpen(false);
                    setDisposalReason('');
                  }}
                  className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDispose}
                  disabled={isSubmitting || !disposalReason.trim()}
                  className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors shadow-lg shadow-red-100 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting && <Loader2 size={18} className="animate-spin" />}
                  Confirm Disposal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )}

      {/* Disposal History Section */}
      {activeTab === 'history' && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-lg font-bold text-slate-900">Disposal Audit Log</h3>
            <p className="text-sm text-slate-500">Historical record of all disposed inventory and reasons.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Date Disposed</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Product</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Qty</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {disposalHistory.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                      No disposal records found.
                    </td>
                  </tr>
                ) : (
                  disposalHistory.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {format(new Date(item.disposed_at), 'MMM dd, yyyy HH:mm')}
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-bold text-slate-900">{item.product_name}</span>
                        <p className="text-[10px] text-slate-400 font-mono">Batch ID: #{item.batch_id}</p>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="px-2 py-1 bg-red-50 text-red-600 rounded-lg text-xs font-bold">
                          -{item.quantity}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-slate-700 leading-relaxed max-w-md">
                          {item.reason}
                        </p>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const CheckCircle = ({ size, className }: { size?: number, className?: string }) => (
  <svg 
    width={size || 24} 
    height={size || 24} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);
