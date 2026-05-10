import React from 'react';
import { Search, Plus, Filter, Calendar, X, Loader2, History, Edit, ChevronUp, ChevronDown, Scan, ChevronLeft, ChevronRight, AlertTriangle, XCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { apiFetch } from '../lib/api';
import { motion, AnimatePresence } from 'motion/react';
import BarcodeScanner from '../components/BarcodeScanner';

import { useAuth } from '../contexts/AuthContext';

export default function Stock() {
  const { user } = useAuth();
  const [batches, setBatches] = React.useState<any[]>([]);
  const [products, setProducts] = React.useState<any[]>([]);
  const [categories, setCategories] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [editingProduct, setEditingProduct] = React.useState<any>(null);
  const [isScannerOpen, setIsScannerOpen] = React.useState(false);
  const [modalBarcode, setModalBarcode] = React.useState('');

  const [selectedCategory, setSelectedCategory] = React.useState<string>('');
  const [formData, setFormData] = React.useState({
    product_id: '',
    quantity: '',
    purchase_price: '',
    expiry_date: ''
  });

  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedFilter, setSelectedFilter] = React.useState<string>('all');
  const [dateRange, setDateRange] = React.useState({ from: '', to: '' });
  const [stockLevelFilter, setStockLevelFilter] = React.useState('all');
  const [isFilterBarOpen, setIsFilterBarOpen] = React.useState(false);

  const [sortConfig, setSortConfig] = React.useState<{ field: string, order: 'asc' | 'desc' }>({
    field: 'expiry_date',
    order: 'asc'
  });

  const [currentPage, setCurrentPage] = React.useState(1);
  const itemsPerPage = 50;

  const fetchData = async () => {
    setLoading(true);
    const [batchesRes, productsRes, categoriesRes] = await Promise.all([
      apiFetch('/api/batches'),
      apiFetch('/api/inventory'),
      apiFetch('/api/categories')
    ]);
    const batchesData = await batchesRes.json();
    const productsData = await productsRes.json();
    const categoriesData = await categoriesRes.json();
    setBatches(batchesData);
    setProducts(productsData);
    setCategories(categoriesData);
    setLoading(false);
  };

  React.useEffect(() => {
    fetchData();
  }, []);

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const isStaffModel = user?.role !== 'admin';
      
      const updateData = {
        id: editingProduct.id,
        name: editingProduct.name,
        category_id: parseInt(editingProduct.category_id),
        min_stock_level: parseInt(editingProduct.min_stock_level),
        sku: editingProduct.sku,
        description: editingProduct.description,
        selling_price: parseFloat(editingProduct.selling_price)
      };

      if (isStaffModel) {
        const response = await apiFetch('/api/staff/approvals/request', {
          method: 'POST',
          body: JSON.stringify({
            type: 'product_update',
            data: updateData,
            requester_id: user?.id || 2
          }),
        });
        if (response.ok) {
          setIsEditModalOpen(false);
          setEditingProduct(null);
          alert('Product update request submitted for approval!');
          fetchData();
        }
      } else {
        const [productRes, batchRes] = await Promise.all([
          apiFetch(`/api/products/${editingProduct.id}`, {
            method: 'PUT',
            body: JSON.stringify(updateData),
          }),
          editingProduct.batch_id ? apiFetch(`/api/batches/${editingProduct.batch_id}`, {
            method: 'PUT',
            body: JSON.stringify({
              expiry_date: editingProduct.expiry_date || null,
              purchase_price: editingProduct.purchase_price,
              quantity: editingProduct.quantity
            }),
          }) : Promise.resolve({ ok: true })
        ]);

        if (productRes.ok && batchRes.ok) {
          setIsEditModalOpen(false);
          setEditingProduct(null);
          fetchData();
        }
      }
    } catch (error) {
      console.error('Failed to update record:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const isStaffModel = true; // Assume staff for this demo
      const url = isStaffModel ? '/api/staff/approvals/request' : '/api/stock/incoming';
      const body = isStaffModel ? {
        type: 'stock_intake',
        data: {
          ...formData,
          product_id: parseInt(formData.product_id),
          quantity: parseInt(formData.quantity),
          purchase_price: parseFloat(formData.purchase_price)
        },
        requester_id: 2 // Staff ID
      } : {
        ...formData,
        product_id: parseInt(formData.product_id),
        quantity: parseInt(formData.quantity),
        purchase_price: parseFloat(formData.purchase_price)
      };

      const response = await apiFetch(url, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (response.ok) {
        setIsModalOpen(false);
        setModalBarcode('');
        setFormData({ product_id: '', quantity: '', purchase_price: '', expiry_date: '' });
        alert(isStaffModel ? 'Approval request submitted!' : 'Stock added successfully!');
        fetchData();
      }
    } catch (error) {
      console.error('Failed to add stock:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleScan = (decodedText: string) => {
    setModalBarcode(decodedText);
    const product = products.find(p => p.sku === decodedText);
    if (product) {
      setFormData({
        ...formData,
        product_id: product.id.toString()
      });
      setSelectedCategory(product.category_id.toString());
      setIsScannerOpen(false);
    } else {
      alert(`No product found with SKU/Barcode: ${decodedText}`);
    }
  };

  const handleSort = (field: string) => {
    setSortConfig(prev => ({
      field,
      order: prev.field === field && prev.order === 'asc' ? 'desc' : 'asc'
    }));
  };

  const filteredAndSortedBatches = React.useMemo(() => {
    setCurrentPage(1); // Reset to first page on filter change
    return batches
      .filter(batch => {
        const matchesSearch = batch.product_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                             batch.product_sku?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                             batch.id.toString().includes(searchQuery);
        
        if (!matchesSearch) return false;

        // Status Filter
        if (selectedFilter !== 'all') {
          const now = new Date();
          const expiryDate = batch.expiry_date ? new Date(batch.expiry_date) : null;
          const isExpired = expiryDate && expiryDate < now;
          const diffDays = expiryDate ? Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;

          if (selectedFilter === 'expired' && !isExpired) return false;
          if (selectedFilter === 'expiring' && !(diffDays !== null && diffDays <= 7 && !isExpired)) return false;
          if (selectedFilter === 'stable' && !(!isExpired && (diffDays === null || diffDays > 7))) return false;
        }

        // Date Received Range
        if (dateRange.from) {
          const fromDate = new Date(dateRange.from);
          if (new Date(batch.received_at) < fromDate) return false;
        }
        if (dateRange.to) {
          const toDate = new Date(dateRange.to);
          toDate.setHours(23, 59, 59, 999);
          if (new Date(batch.received_at) > toDate) return false;
        }

        // Stock Level Filter
        if (stockLevelFilter !== 'all') {
          const totalStock = batch.total_product_quantity;
          const minStock = batch.min_stock_level;
          if (stockLevelFilter === 'low' && totalStock >= minStock) return false;
          if (stockLevelFilter === 'out' && totalStock > 0) return false;
          if (stockLevelFilter === 'ample' && totalStock <= minStock) return false;
        }
        
        return true;
      })
      .sort((a, b) => {
        const field = sortConfig.field;
        const order = sortConfig.order === 'asc' ? 1 : -1;

        let valA = a[field];
        let valB = b[field];

        // Handle nulls for dates
        if (field === 'expiry_date') {
          if (!valA) return 1; // Non-perishable at the end
          if (!valB) return -1;
        }

        if (valA < valB) return -1 * order;
        if (valA > valB) return 1 * order;
        return 0;
      });
  }, [batches, searchQuery, selectedFilter, sortConfig]);

  const totalPages = Math.ceil(filteredAndSortedBatches.length / itemsPerPage);

  const paginatedBatches = React.useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredAndSortedBatches.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredAndSortedBatches, currentPage]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search batches, products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
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
            {(dateRange.from || dateRange.to || stockLevelFilter !== 'all') && (
              <span className="w-2 h-2 bg-indigo-600 rounded-full"></span>
            )}
          </button>
          <div className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl">
            <History size={16} className="text-slate-400" />
            <select
              value={selectedFilter}
              onChange={(e) => setSelectedFilter(e.target.value)}
              className="bg-transparent text-slate-600 hover:bg-slate-50 transition-colors font-medium outline-none text-sm"
            >
              <option value="all">Product Health: All</option>
              <option value="expired">Expired</option>
              <option value="expiring">Expiring Soon (7d)</option>
              <option value="stable">Stable Stock</option>
            </select>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl">
            <History size={16} className="text-slate-400" />
            <select
              value={`${sortConfig.field}-${sortConfig.order}`}
              onChange={(e) => {
                const [field, order] = e.target.value.split('-');
                setSortConfig({ field, order: order as 'asc' | 'desc' });
              }}
              className="bg-transparent text-slate-600 hover:bg-slate-50 transition-colors font-medium outline-none text-sm"
            >
              <option value="expiry_date-asc">Expiry: Soonest First</option>
              <option value="expiry_date-desc">Expiry: Latest First</option>
              <option value="product_name-asc">Name: A-Z</option>
              <option value="product_name-desc">Name: Z-A</option>
              <option value="total_product_quantity-asc">Stock: Low to High</option>
              <option value="total_product_quantity-desc">Stock: High to Low</option>
            </select>
          </div>
          <button 
            onClick={() => {
              setModalBarcode('');
              setFormData({ product_id: '', quantity: '', purchase_price: '', expiry_date: '' });
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-medium shadow-sm"
          >
            <Plus size={18} />
            New Arrival
          </button>
        </div>
      </div>

      {isFilterBarOpen && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-6 animate-in slide-in-from-top-2 duration-200">
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">Stock Levels</label>
            <select
              value={stockLevelFilter}
              onChange={(e) => setStockLevelFilter(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none text-sm"
            >
              <option value="all">All Levels</option>
              <option value="low">Low Stock (Below Min)</option>
              <option value="out">Out of Stock</option>
              <option value="ample">Ample Stock (Above Min)</option>
            </select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-bold text-slate-700">Date Received Range</label>
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="date"
                  value={dateRange.from}
                  onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none text-sm"
                />
              </div>
              <span className="text-slate-400 font-medium">to</span>
              <div className="relative flex-1">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="date"
                  value={dateRange.to}
                  onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none text-sm"
                />
              </div>
              <button 
                onClick={() => {
                  setDateRange({ from: '', to: '' });
                  setStockLevelFilter('all');
                }}
                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                title="Clear Filters"
              >
                <X size={20} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          {isScannerOpen && (
            <BarcodeScanner 
              onScan={handleScan} 
              onClose={() => setIsScannerOpen(false)} 
            />
          )}
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Add Newly Arrived Stock</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Barcode / SKU</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Scan className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      type="text"
                      placeholder="Enter barcode..."
                      value={modalBarcode}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-sm font-medium text-slate-900"
                      onChange={(e) => {
                        setModalBarcode(e.target.value);
                        const product = products.find(p => p.sku === e.target.value);
                        if (product) {
                          setFormData({ ...formData, product_id: product.id.toString() });
                          setSelectedCategory(product.category_id.toString());
                        }
                      }}
                    />
                  </div>
                  <button 
                    type="button"
                    onClick={() => setIsScannerOpen(true)}
                    className="px-4 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-colors flex items-center gap-2 border border-indigo-100 whitespace-nowrap font-semibold text-sm"
                  >
                    <Scan size={18} />
                    Scan
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Category</label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => {
                      setSelectedCategory(e.target.value);
                      setFormData({ ...formData, product_id: '' });
                    }}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-sm"
                  >
                    <option value="">All Categories</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Product Name</label>
                  <select
                    required
                    value={formData.product_id}
                    onChange={(e) => setFormData({ ...formData, product_id: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-sm"
                  >
                    <option value="">Select product...</option>
                    {products
                      .filter(p => !selectedCategory || p.category_id === parseInt(selectedCategory))
                      .map(item => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Quantity</label>
                  <div className="relative">
                    <input
                      type="number"
                      required
                      min="1"
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-sm"
                      placeholder="0"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">units</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Cost Price (₦)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₦</span>
                    <input
                      type="number"
                      step="0.01"
                      required
                      min="0"
                      value={formData.purchase_price}
                      onChange={(e) => setFormData({ ...formData, purchase_price: e.target.value })}
                      className="w-full pl-7 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-sm"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Expiry Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="date"
                    value={formData.expiry_date}
                    onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-sm"
                  />
                </div>
                <p className="mt-1.5 text-[10px] text-slate-400 italic">Leave blank for non-perishable items</p>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
                >
                  {isSubmitting && <Loader2 size={18} className="animate-spin" />}
                  Register Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Product Modal */}
      {isEditModalOpen && editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Edit Product</h2>
              <button onClick={() => setIsEditModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleEditSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Product Name</label>
                <input
                  type="text"
                  required
                  value={editingProduct.name}
                  onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Category</label>
                  <select
                    value={editingProduct.category_id}
                    onChange={(e) => setEditingProduct({ ...editingProduct, category_id: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-sm"
                  >
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Min Stock Level</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={editingProduct.min_stock_level}
                    onChange={(e) => setEditingProduct({ ...editingProduct, min_stock_level: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">SKU</label>
                  <input
                    type="text"
                    required
                    value={editingProduct.sku}
                    onChange={(e) => setEditingProduct({ ...editingProduct, sku: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Selling Price (₦)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₦</span>
                    <input
                      type="number"
                      step="0.01"
                      required
                      min="0"
                      value={editingProduct.selling_price}
                      onChange={(e) => setEditingProduct({ ...editingProduct, selling_price: e.target.value })}
                      className="w-full pl-7 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-sm"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Batch Expiry Date</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      type="date"
                      value={editingProduct.expiry_date}
                      onChange={(e) => setEditingProduct({ ...editingProduct, expiry_date: e.target.value })}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-sm"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingProduct({ ...editingProduct, expiry_date: '' })}
                    className="px-4 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-colors flex items-center gap-2 border border-slate-200 font-semibold text-sm"
                    title="Mark as non-perishable"
                  >
                    <X size={16} />
                    Clear
                  </button>
                </div>
                <p className="mt-1.5 text-[10px] text-slate-400 italic">Clear date to mark as non-perishable</p>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
                >
                  {isSubmitting && <Loader2 size={18} className="animate-spin" />}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th 
                className="px-6 py-4 text-sm font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors"
                onClick={() => handleSort('product_name')}
              >
                <div className="flex items-center gap-2">
                  Product
                  {sortConfig.field === 'product_name' && (sortConfig.order === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                </div>
              </th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-600">Category</th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-600">Barcode</th>
              <th 
                className="px-6 py-4 text-sm font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors"
                onClick={() => handleSort('total_product_quantity')}
              >
                <div className="flex items-center gap-2">
                  Total Stock
                  {sortConfig.field === 'total_product_quantity' && (sortConfig.order === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                </div>
              </th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-600">Cost Price</th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-600">Selling Price</th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-600">Date Received</th>
              <th 
                className="px-6 py-4 text-sm font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors"
                onClick={() => handleSort('expiry_date')}
              >
                <div className="flex items-center gap-2">
                  Expiry Date
                  {sortConfig.field === 'expiry_date' && (sortConfig.order === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                </div>
              </th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-600">Product Status</th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-600 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={8} className="px-6 py-12 text-center text-slate-500">Loading inventory records...</td></tr>
            ) : filteredAndSortedBatches.length === 0 ? (
              <tr><td colSpan={8} className="px-6 py-12 text-center text-slate-500">No inventory items found matching your criteria.</td></tr>
            ) : (
              paginatedBatches.map((batch, index) => {
                const now = new Date();
                const expiryDate = batch.expiry_date ? new Date(batch.expiry_date) : null;
                const isExpired = expiryDate && expiryDate < now;
                
                let statusText = 'Stable';
                let statusColor = 'bg-green-50 text-green-600';
                
                let isExpiringSoon = false;
                
                if (expiryDate) {
                  if (isExpired) {
                    statusText = 'Expired';
                    statusColor = 'bg-red-50 text-red-600';
                  } else {
                    const diffTime = expiryDate.getTime() - now.getTime();
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    isExpiringSoon = diffDays <= 7;
                    statusText = `${diffDays} days left`;
                    statusColor = isExpiringSoon ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600';
                  }
                }

                return (
                  <tr key={batch.id} className={cn(
                    "hover:bg-slate-100/50 transition-colors",
                    index % 2 === 1 ? "bg-slate-50/40" : "bg-white",
                    isExpiringSoon && "!bg-orange-50/40",
                    isExpired && "!bg-red-50/40"
                  )}>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-medium text-slate-900">{batch.product_name}</span>
                        <span className="text-xs text-slate-500">{batch.quantity} units</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-md text-xs font-medium w-fit">
                        {batch.category_name}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600 font-mono text-sm">
                      {batch.product_sku || 'No Barcode'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "font-bold",
                          batch.total_product_quantity < batch.min_stock_level ? "text-red-600" : "text-slate-900"
                        )}>
                          {batch.total_product_quantity}
                        </span>
                        <span className="text-slate-400 text-xs">/ {batch.min_stock_level} min</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-slate-600 font-medium">₦{batch.purchase_price.toLocaleString()}</span>
                        <span className="text-[10px] text-slate-400 uppercase font-bold">Cost</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-indigo-600 font-bold">₦{batch.selling_price.toLocaleString()}</span>
                        <span className="text-[10px] text-slate-400 uppercase font-bold">Selling</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-sm">{format(new Date(batch.received_at), 'MMM dd, yyyy')}</td>
                    <td className="px-6 py-4 text-slate-500 text-sm">
                      <div className="flex items-center gap-2">
                        {batch.expiry_date ? (
                          <>
                            {format(new Date(batch.expiry_date), 'MMM dd, yyyy')}
                            {isExpiringSoon && (
                              <AlertTriangle size={14} className="text-orange-500 animate-pulse" />
                            )}
                          </>
                        ) : (
                          'Non-perishable'
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                        statusColor
                      )}>
                        {statusText}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => {
                          const product = products.find(p => p.id === batch.product_id);
                          if (product) {
                            setEditingProduct({ 
                              ...product, 
                              batch_id: batch.id, 
                              expiry_date: batch.expiry_date || '',
                              purchase_price: batch.purchase_price,
                              quantity: batch.quantity
                            });
                            setIsEditModalOpen(true);
                          }
                        }}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                        title={user?.role === 'admin' ? "Edit Product" : "Request Product Update"}
                      >
                        {user?.role === 'admin' ? <Edit size={18} /> : <History size={18} />}
                      </button>
                      <button
                        onClick={async () => {
                          if (confirm(`Request disposal for ${batch.product_name}? This will remove all units in this batch.`)) {
                            try {
                              const res = await apiFetch('/api/staff/approvals/request', {
                                method: 'POST',
                                body: JSON.stringify({
                                  type: 'disposal',
                                  data: {
                                    batch_id: batch.id,
                                    product_name: batch.product_name,
                                    product_id: batch.product_id,
                                    quantity: batch.quantity,
                                    reason: 'Expired or Damaged'
                                  },
                                  requester_id: user?.id || 2
                                })
                              });
                              if (res.ok) alert('Disposal request submitted for approval!');
                            } catch (error) {
                              console.error('Disposal request failed:', error);
                            }
                          }
                        }}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                        title="Dispose Batch"
                      >
                        <XCircle size={18} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-4 bg-white border border-t-0 border-slate-200 rounded-b-2xl shadow-sm">
          <p className="text-sm text-slate-500">
            Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium">{Math.min(currentPage * itemsPerPage, filteredAndSortedBatches.length)}</span> of <span className="font-medium">{filteredAndSortedBatches.length}</span> results
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
    </div>
  );
}
