import React from 'react';
import { Search, Printer, CheckCircle, Clock, MoreVertical, Download, ChevronDown, ChevronUp, AlertCircle, Loader2, X, Plus, ShoppingCart, DollarSign, Package, User, Filter, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { format } from 'date-fns';

import { apiFetch } from '../lib/api';

export default function Sales() {
  const [sales, setSales] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [expandedSales, setExpandedSales] = React.useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [dateRange, setDateRange] = React.useState({ from: '', to: '' });
  const [amountRange, setAmountRange] = React.useState({ min: '', max: '' });
  const [isFilterBarOpen, setIsFilterBarOpen] = React.useState(false);
  const [isNewSaleModalOpen, setIsNewSaleModalOpen] = React.useState(false);
  const [isSubmitConfirmOpen, setIsSubmitConfirmOpen] = React.useState(false);
  const [products, setProducts] = React.useState<any[]>([]);
  const [newSaleItems, setNewSaleItems] = React.useState<any[]>([]);
  const [customerName, setCustomerName] = React.useState('');
  const [confirmModal, setConfirmModal] = React.useState<{ isOpen: boolean, saleId: number | null, status: string }>({
    isOpen: false,
    saleId: null,
    status: ''
  });

  const [currentPage, setCurrentPage] = React.useState(1);
  const itemsPerPage = 50;

  const fetchSales = () => {
    setLoading(true);
    apiFetch('/api/sales')
      .then(res => res.json())
      .then(data => {
        setSales(data);
        setLoading(false);
      });
  };

  const fetchProducts = () => {
    apiFetch('/api/inventory')
      .then(res => res.json())
      .then(data => setProducts(data));
  };

  React.useEffect(() => {
    fetchSales();
    fetchProducts();
  }, []);

  const toggleExpand = (id: number) => {
    const newExpanded = new Set(expandedSales);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedSales(newExpanded);
  };

  const handleUpdateStatusClick = (id: number, status: string) => {
    setConfirmModal({ isOpen: true, saleId: id, status });
  };

  const confirmUpdateStatus = async () => {
    if (!confirmModal.saleId) return;
    
    setIsSubmitting(true);
    await apiFetch('/api/sales/status', {
      method: 'POST',
      body: JSON.stringify({ id: confirmModal.saleId, status: confirmModal.status }),
    });
    setConfirmModal({ isOpen: false, saleId: null, status: '' });
    setIsSubmitting(false);
    fetchSales();
  };

  const handleNewSaleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newSaleItems.length === 0) return;
    setIsSubmitConfirmOpen(true);
  };

  const confirmNewSaleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const response = await apiFetch('/api/sales', {
        method: 'POST',
        body: JSON.stringify({
          customer_name: customerName,
          items: newSaleItems.map(item => ({
            product_id: item.product_id,
            quantity: item.quantity,
            unit_price: item.unit_price
          }))
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to complete sale');
      }

      setIsSubmitConfirmOpen(false);
      setIsNewSaleModalOpen(false);
      setNewSaleItems([]);
      setCustomerName('');
      fetchSales();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const addItemToSale = (productId: number) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const existingItem = newSaleItems.find(item => item.product_id === productId);
    if (existingItem) {
      setNewSaleItems(newSaleItems.map(item => 
        item.product_id === productId ? { ...item, quantity: item.quantity + 1 } : item
      ));
    } else {
      setNewSaleItems([...newSaleItems, {
        product_id: product.id,
        product_name: product.name,
        quantity: 1,
        unit_price: product.selling_price || 0,
        max_quantity: product.total_quantity
      }]);
    }
  };

  const updateItemQuantity = (productId: number, quantity: number) => {
    const item = newSaleItems.find(i => i.product_id === productId);
    if (!item) return;
    
    const newQty = Math.max(1, Math.min(quantity, item.max_quantity));
    setNewSaleItems(newSaleItems.map(i => 
      i.product_id === productId ? { ...i, quantity: newQty } : i
    ));
  };

  const updateItemPrice = (productId: number, price: number) => {
    setNewSaleItems(newSaleItems.map(i => 
      i.product_id === productId ? { ...i, unit_price: Math.max(0, price) } : i
    ));
  };

  const removeItemFromSale = (productId: number) => {
    setNewSaleItems(newSaleItems.filter(item => item.product_id !== productId));
  };

  const filteredSales = React.useMemo(() => {
    return sales.filter(sale => {
      const matchesSearch = 
        sale.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        `#SAL-${sale.id}`.toLowerCase().includes(searchQuery.toLowerCase());
      
      if (!matchesSearch) return false;

      const matchesStatus = statusFilter === 'all' || sale.status === statusFilter;
      if (!matchesStatus) return false;

      // Date Range
      if (dateRange.from) {
        const fromDate = new Date(dateRange.from);
        if (new Date(sale.created_at) < fromDate) return false;
      }
      if (dateRange.to) {
        const toDate = new Date(dateRange.to);
        toDate.setHours(23, 59, 59, 999);
        if (new Date(sale.created_at) > toDate) return false;
      }

      // Amount Range
      if (amountRange.min && sale.total_amount < parseFloat(amountRange.min)) return false;
      if (amountRange.max && sale.total_amount > parseFloat(amountRange.max)) return false;
      
      return true;
    });
  }, [sales, searchQuery, statusFilter, dateRange, amountRange]);

  const totalPages = Math.ceil(filteredSales.length / itemsPerPage);

  const paginatedSales = React.useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredSales.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredSales, currentPage]);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, dateRange, amountRange]);

  const stats = {
    totalRevenue: sales.reduce((sum, s) => sum + s.total_amount, 0),
    totalSales: sales.length,
    pendingSales: sales.filter(s => s.status === 'pending').length,
    completedSales: sales.filter(s => s.status === 'completed').length
  };

  const printInvoice = (sale: any) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const itemsHtml = sale.items?.map((item: any) => `
      <tr>
        <td>${item.product_name}</td>
        <td>${item.quantity}</td>
        <td>₦${item.unit_price.toFixed(2)}</td>
        <td>₦${(item.quantity * item.unit_price).toFixed(2)}</td>
      </tr>
    `).join('') || '<tr><td colspan="4">No items recorded</td></tr>';

    printWindow.document.write(`
      <html>
        <head>
          <title>Invoice #${sale.id}</title>
          <style>
            body { font-family: sans-serif; padding: 40px; color: #333; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #eee; padding-bottom: 20px; }
            .details { margin: 40px 0; }
            .table { width: 100%; border-collapse: collapse; }
            .table th, .table td { padding: 12px; border-bottom: 1px solid #eee; text-align: left; }
            .total { text-align: right; margin-top: 40px; font-size: 1.2em; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1>INVOICE</h1>
              <p>StockMaster Pro Warehouse</p>
            </div>
            <div style="text-align: right">
              <p>Invoice #: ${sale.id}</p>
              <p>Date: ${format(new Date(sale.created_at), 'MMM dd, yyyy')}</p>
            </div>
          </div>
          <div class="details">
            <p><strong>Customer:</strong> ${sale.customer_name || 'N/A'}</p>
            <p><strong>Status:</strong> ${sale.status.toUpperCase()}</p>
          </div>
          <table class="table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Qty</th>
                <th>Unit Price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
          <div class="total">
            Total Amount: ₦${sale.total_amount.toFixed(2)}
          </div>
          <script>window.print();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const exportToCSV = () => {
    if (sales.length === 0) return;
    
    const headers = ['Sale ID', 'Customer', 'Amount', 'Date', 'Status', 'Items'];
    const rows = filteredSales.map(sale => {
      const items = sale.items?.map((i: any) => `${i.product_name} (x${i.quantity})`).join('; ');
      return [
        `#SAL-${sale.id}`,
        sale.customer_name || 'Walk-in Customer',
        sale.total_amount,
        format(new Date(sale.created_at), 'yyyy-MM-dd'),
        sale.status,
        `"${items}"`
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `sales_report_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
              <DollarSign size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Total Revenue</p>
              <p className="text-2xl font-bold text-slate-900">₦{stats.totalRevenue.toLocaleString()}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
              <ShoppingCart size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Total Sales</p>
              <p className="text-2xl font-bold text-slate-900">{stats.totalSales}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-orange-50 text-orange-600 rounded-xl flex items-center justify-center">
              <Clock size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Pending Orders</p>
              <p className="text-2xl font-bold text-slate-900">{stats.pendingSales}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
              <CheckCircle size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Completed Sales</p>
              <p className="text-2xl font-bold text-slate-900">{stats.completedSales}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search customer, ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-600"
          />
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsFilterBarOpen(!isFilterBarOpen)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 border rounded-xl transition-all font-medium",
              isFilterBarOpen ? "bg-indigo-50 border-indigo-200 text-indigo-600" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
            )}
          >
            <Filter size={18} />
            Filters
            {(dateRange.from || dateRange.to || amountRange.min || amountRange.max || statusFilter !== 'all') && (
              <span className="w-2 h-2 bg-indigo-600 rounded-full"></span>
            )}
          </button>
          <button 
            onClick={exportToCSV}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors font-medium text-sm"
          >
            <Download size={18} />
            Export CSV
          </button>
          <button 
            onClick={() => setIsNewSaleModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-medium shadow-sm text-sm"
          >
            <Plus size={18} />
            Record New Sale
          </button>
        </div>
      </div>

      {isFilterBarOpen && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-6 animate-in slide-in-from-top-2 duration-200">
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">Sale Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none text-sm"
            >
              <option value="all">All Statuses</option>
              <option value="completed">Completed Only</option>
              <option value="pending">Pending Only</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">Amount Range (₦)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                placeholder="Min"
                value={amountRange.min}
                onChange={(e) => setAmountRange({ ...amountRange, min: e.target.value })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none text-sm"
              />
              <span className="text-slate-400 font-medium">-</span>
              <input
                type="number"
                placeholder="Max"
                value={amountRange.max}
                onChange={(e) => setAmountRange({ ...amountRange, max: e.target.value })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none text-sm"
              />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-slate-700">Sale Date Range</label>
              <button 
                onClick={() => {
                  setDateRange({ from: '', to: '' });
                  setAmountRange({ min: '', max: '' });
                  setStatusFilter('all');
                }}
                className="text-[10px] uppercase font-bold text-slate-400 hover:text-red-500"
              >
                Clear All
              </button>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  type="date"
                  value={dateRange.from}
                  onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
                  className="w-full pl-8 pr-2 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none text-[12px]"
                />
              </div>
              <div className="relative flex-1">
                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  type="date"
                  value={dateRange.to}
                  onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
                  className="w-full pl-8 pr-2 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none text-[12px]"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="w-10 px-6 py-4"></th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-600">Sale ID</th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-600">Customer</th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-600">Amount</th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-600">Date</th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-600">Status</th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-600 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-500">Loading sales records...</td></tr>
            ) : filteredSales.length === 0 ? (
              <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-500">No sales found matching your criteria.</td></tr>
            ) : (
              paginatedSales.map((sale, index) => (
                <React.Fragment key={sale.id}>
                  <tr className={cn(
                    "hover:bg-slate-100/50 transition-colors",
                    index % 2 === 1 ? "bg-slate-50/40" : "bg-white",
                    expandedSales.has(sale.id) && "!bg-indigo-50/30"
                  )}>
                    <td className="px-6 py-4">
                      <button 
                        onClick={() => toggleExpand(sale.id)}
                        className="p-1 hover:bg-slate-200 rounded text-slate-400"
                      >
                        {expandedSales.has(sale.id) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </td>
                    <td className="px-6 py-4 font-mono text-sm text-indigo-600 font-bold">#SAL-{sale.id}</td>
                    <td className="px-6 py-4 text-slate-900 font-medium">{sale.customer_name || 'Walk-in Customer'}</td>
                    <td className="px-6 py-4 text-slate-900 font-bold">₦{sale.total_amount.toLocaleString()}</td>
                    <td className="px-6 py-4 text-slate-500 text-sm">{format(new Date(sale.created_at), 'MMM dd, yyyy')}</td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center w-fit gap-1",
                        sale.status === 'completed' ? "bg-green-50 text-green-600" : "bg-orange-50 text-orange-600"
                      )}>
                        {sale.status === 'completed' ? <CheckCircle size={10} /> : <Clock size={10} />}
                        {sale.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {sale.status === 'pending' && (
                          <button 
                            onClick={() => handleUpdateStatusClick(sale.id, 'completed')}
                            className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700"
                          >
                            Complete
                          </button>
                        )}
                        <button 
                          onClick={() => printInvoice(sale)}
                          className="p-2 hover:bg-slate-100 rounded-lg text-slate-400" 
                          title="Print Invoice"
                        >
                          <Printer size={18} />
                        </button>
                        <button className="p-2 hover:bg-slate-100 rounded-lg text-slate-400">
                          <MoreVertical size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedSales.has(sale.id) && (
                    <tr className="bg-slate-50/30">
                      <td colSpan={7} className="px-12 py-4">
                        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Items in this sale</h4>
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-slate-500 border-b border-slate-100">
                                <th className="text-left py-2 font-semibold">Product Name</th>
                                <th className="text-center py-2 font-semibold">Quantity</th>
                                <th className="text-right py-2 font-semibold">Unit Price</th>
                                <th className="text-right py-2 font-semibold">Subtotal</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              {sale.items?.map((item: any) => (
                                <tr key={item.id}>
                                  <td className="py-2 text-slate-700 font-medium">{item.product_name}</td>
                                  <td className="py-2 text-center text-slate-600">{item.quantity}</td>
                                  <td className="py-2 text-right text-slate-600">₦{item.unit_price.toFixed(2)}</td>
                                  <td className="py-2 text-right text-slate-900 font-semibold">₦{(item.quantity * item.unit_price).toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-4 bg-white border border-t-0 border-slate-200 rounded-b-2xl shadow-sm">
          <p className="text-sm text-slate-500">
            Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium">{Math.min(currentPage * itemsPerPage, filteredSales.length)}</span> of <span className="font-medium">{filteredSales.length}</span> results
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="p-2 border border-slate-200 rounded-lg text-slate-400 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={cn(
                  "w-10 h-10 rounded-lg text-sm font-medium transition-colors",
                  currentPage === page 
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-100" 
                    : "text-slate-600 hover:bg-slate-50"
                )}
              >
                {page}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="p-2 border border-slate-200 rounded-lg text-slate-400 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* New Sale Modal */}
      {isNewSaleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <ShoppingCart className="text-indigo-600" size={24} />
                Record New Sale
              </h3>
              <button onClick={() => setIsNewSaleModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleNewSaleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <User size={16} className="text-slate-400" />
                  Customer Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. John Doe (Optional)"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <Package size={16} className="text-slate-400" />
                    Sale Items
                  </label>
                  <div className="relative">
                    <select 
                      onChange={(e) => {
                        if (e.target.value) {
                          addItemToSale(Number(e.target.value));
                          e.target.value = '';
                        }
                      }}
                      className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg border-none focus:ring-0 cursor-pointer hover:bg-indigo-100 transition-colors"
                    >
                      <option value="">+ Add Product</option>
                      {products.filter(p => p.total_quantity > 0).map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.total_quantity} in stock)</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="border border-slate-100 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
                      <tr>
                        <th className="text-left px-4 py-2">Product</th>
                        <th className="text-center px-4 py-2 w-24">Qty</th>
                        <th className="text-right px-4 py-2 w-32">Price (₦)</th>
                        <th className="text-right px-4 py-2 w-32">Total</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {newSaleItems.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-slate-400 italic">No items added to sale yet.</td>
                        </tr>
                      ) : (
                        newSaleItems.map((item) => (
                          <tr key={item.product_id}>
                            <td className="px-4 py-3 font-medium text-slate-700">{item.product_name}</td>
                            <td className="px-4 py-3">
                              <input
                                type="number"
                                value={item.quantity}
                                onChange={(e) => updateItemQuantity(item.product_id, Number(e.target.value))}
                                className="w-full px-2 py-1 border border-slate-200 rounded text-center focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="number"
                                value={item.unit_price}
                                onChange={(e) => updateItemPrice(item.product_id, Number(e.target.value))}
                                className="w-full px-2 py-1 border border-slate-200 rounded text-right focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-slate-900">
                              ₦{(item.quantity * item.unit_price).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button 
                                type="button"
                                onClick={() => removeItemFromSale(item.product_id)}
                                className="text-slate-300 hover:text-red-500 transition-colors"
                              >
                                <X size={16} />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {newSaleItems.length > 0 && (
                      <tfoot className="bg-slate-50/50 font-bold">
                        <tr>
                          <td colSpan={3} className="px-4 py-3 text-right text-slate-500">Grand Total:</td>
                          <td className="px-4 py-3 text-right text-indigo-600 text-lg">
                            ₦{newSaleItems.reduce((sum, i) => sum + (i.quantity * i.unit_price), 0).toLocaleString()}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </form>

            <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3">
              <button
                type="button"
                onClick={() => setIsNewSaleModalOpen(false)}
                className="flex-1 px-4 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-100 transition-colors font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleNewSaleSubmit}
                disabled={isSubmitting || newSaleItems.length === 0}
                className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-semibold shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSubmitting && <Loader2 size={18} className="animate-spin" />}
                Complete Sale
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-sm overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-orange-50 text-orange-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Confirm Status Update</h3>
              <p className="text-slate-500 text-sm mb-6">
                Are you sure you want to mark sale <span className="font-bold text-slate-700">#SAL-{confirmModal.saleId}</span> as <span className="font-bold text-slate-700">{confirmModal.status}</span>? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })}
                  className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-colors font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmUpdateStatus}
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-semibold shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 size={18} className="animate-spin" />}
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Sale Submission Confirmation Modal */}
      {isSubmitConfirmOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <ShoppingCart size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Confirm Sale Placement</h3>
              <p className="text-slate-500 text-sm mb-6">
                You are about to record a sale for <span className="font-bold text-slate-700">{customerName || 'Walk-in Customer'}</span> totaling <span className="font-bold text-indigo-600">₦{newSaleItems.reduce((sum, i) => sum + (i.quantity * i.unit_price), 0).toLocaleString()}</span>. 
                <br /><br />
                This will deduct stock from the inventory. Do you want to proceed?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setIsSubmitConfirmOpen(false)}
                  className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-colors font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmNewSaleSubmit}
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-semibold shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 size={18} className="animate-spin" />}
                  Confirm Sale
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
