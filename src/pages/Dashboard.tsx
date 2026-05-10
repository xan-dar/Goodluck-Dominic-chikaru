import React from 'react';
import { Package, CheckCircle, AlertCircle, Calendar, AlertTriangle, Clock, Plus, ShoppingCart, X, Loader2, Trash2, ChevronRight, Scan } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { motion, AnimatePresence } from 'motion/react';
import BarcodeScanner from '../components/BarcodeScanner';

const GaugeChart = ({ value, total, label, color }: { value: number, total: number, label: string, color: string }) => {
  const data = [
    { name: label, value: value },
    { name: 'Remaining', value: Math.max(0, total - value) },
  ];

  return (
    <div className="flex flex-col items-center justify-center bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">{label}</h3>
      <div className="h-48 w-full relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="80%"
              startAngle={180}
              endAngle={0}
              innerRadius={60}
              outerRadius={80}
              paddingAngle={0}
              dataKey="value"
            >
              <Cell fill={color} />
              <Cell fill="#f1f5f9" />
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-center">
          <span className="text-3xl font-bold text-slate-900">{value}</span>
          <p className="text-xs text-slate-400 font-medium">Units</p>
        </div>
      </div>
    </div>
  );
};

export default function Dashboard() {
  const [stats, setStats] = React.useState<any>(null);
  const [isSaleModalOpen, setIsSaleModalOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [products, setProducts] = React.useState<any[]>([]);
  const [saleItems, setSaleItems] = React.useState<any[]>([{ product_id: '', quantity: 1, unit_price: 0 }]);
  const [customerName, setCustomerName] = React.useState('');

  const [isScannerOpen, setIsScannerOpen] = React.useState(false);

  const fetchStats = () => {
    apiFetch('/api/dashboard/stats')
      .then(res => res.json())
      .then(setStats);
  };

  const fetchProducts = () => {
    apiFetch('/api/inventory')
      .then(res => res.json())
      .then(setProducts);
  };

  React.useEffect(() => {
    fetchStats();
    fetchProducts();
  }, []);

  const handleAddSaleItem = (productId?: string, price?: number) => {
    setSaleItems([...saleItems, { product_id: productId || '', quantity: 1, unit_price: price || 0 }]);
  };

  const handleScan = (decodedText: string) => {
    const product = products.find(p => p.sku === decodedText);
    if (product) {
      // If the first item is empty, update it. Otherwise add new.
      if (saleItems.length === 1 && !saleItems[0].product_id) {
        handleUpdateSaleItem(0, 'product_id', product.id.toString());
      } else {
        handleAddSaleItem(product.id.toString(), product.selling_price);
      }
      setIsScannerOpen(false);
    } else {
      alert(`No product found with SKU/Barcode: ${decodedText}`);
    }
  };

  const handleRemoveSaleItem = (index: number) => {
    const newItems = saleItems.filter((_, i) => i !== index);
    setSaleItems(newItems.length ? newItems : [{ product_id: '', quantity: 1, unit_price: 0 }]);
  };

  const handleUpdateSaleItem = (index: number, field: string, value: any) => {
    const newItems = [...saleItems];
    newItems[index] = { ...newItems[index], [field]: value };
    
    if (field === 'product_id') {
      const product = products.find(p => p.id === parseInt(value));
      if (product) {
        newItems[index].unit_price = product.selling_price || 0; 
      }
    }

    if (field === 'line_total') {
      const qty = parseFloat(newItems[index].quantity) || 1;
      newItems[index].unit_price = parseFloat(value) / qty;
      return setSaleItems(newItems);
    }
    
    setSaleItems(newItems);
  };

  const handleSaleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const response = await apiFetch('/api/sales', {
        method: 'POST',
        body: JSON.stringify({
          customer_name: customerName,
          items: saleItems.map(item => ({
            ...item,
            product_id: parseInt(item.product_id),
            quantity: parseInt(item.quantity),
            unit_price: parseFloat(item.unit_price)
          }))
        }),
      });

      if (response.ok) {
        setIsSaleModalOpen(false);
        setSaleItems([{ product_id: '', quantity: 1, unit_price: 0 }]);
        setCustomerName('');
        fetchStats();
        fetchProducts();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to complete sale');
      }
    } catch (error) {
      console.error('Failed to complete sale:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!stats) return <div className="flex items-center justify-center h-full">Loading...</div>;

  const cards = [
    { title: 'Total Stock', value: stats.totalStock, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
  ];

  const maxStock = Math.max(stats.totalStock * 1.2, 100);
  const totalSaleAmount = saleItems.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

  return (
    <div className="space-y-8 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Warehouse Overview</h1>
          <p className="text-slate-500 text-sm">Real-time stock and sales metrics</p>
        </div>
        <button 
          onClick={() => setIsSaleModalOpen(true)}
          className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all font-bold shadow-lg shadow-indigo-200 active:scale-95"
        >
          <ShoppingCart size={20} />
          Take Order
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <GaugeChart 
          value={stats.healthyStock} 
          total={stats.totalStock || 1} 
          label="Healthy Stock" 
          color="#10b981" 
        />
        <GaugeChart 
          value={stats.expiredStock} 
          total={stats.totalStock || 1} 
          label="Expired Stock" 
          color="#ef4444" 
        />
      </div>

      <div className="grid grid-cols-1 gap-6">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.title} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className={cn("p-3 rounded-xl", card.bg)}>
                  <Icon className={card.color} size={24} />
                </div>
              </div>
              <p className="text-slate-500 text-sm font-medium">{card.title}</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">{card.value}</h3>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Low Stock Details */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-orange-50/30">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 text-orange-600 rounded-lg">
                <AlertTriangle size={20} />
              </div>
              <h3 className="font-bold text-slate-900">Low Stock Details</h3>
            </div>
            <span className="px-2.5 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-bold">
              {stats.lowStockItems.length} Items
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Product</th>
                  <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Current</th>
                  <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Min Required</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats.lowStockItems.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-8 text-center text-slate-400 text-sm italic">
                      All stock levels are healthy
                    </td>
                  </tr>
                ) : (
                  stats.lowStockItems.map((item: any) => (
                    <tr key={item.sku} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-900">{item.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono uppercase">{item.sku}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-red-600 font-bold">{item.quantity}</span>
                      </td>
                      <td className="px-6 py-4 text-slate-500 font-medium">
                        {item.min_stock_level}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Expiring Soon Details */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-red-50/30">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 text-red-600 rounded-lg">
                <Clock size={20} />
              </div>
              <h3 className="font-bold text-slate-900">Expiring Soon Details</h3>
            </div>
            <div className="flex items-center gap-3">
              <span className="px-2.5 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold">
                {stats.expiringSoonItems.length} Batches
              </span>
              <Link to="/alerts" className="text-xs font-bold text-red-600 hover:text-red-700 flex items-center gap-0.5">
                View All
                <ChevronRight size={14} />
              </Link>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Product</th>
                  <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Qty</th>
                  <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Expiry Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats.expiringSoonItems.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-8 text-center text-slate-400 text-sm italic">
                      No items expiring within 30 days
                    </td>
                  </tr>
                ) : (
                  stats.expiringSoonItems.map((item: any) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="font-semibold text-slate-900">{item.name}</span>
                      </td>
                      <td className="px-6 py-4 text-slate-600 font-medium">
                        {item.quantity}
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-red-600 font-bold text-sm">
                          {format(new Date(item.expiry_date), 'MMM dd, yyyy')}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* New Sale Modal */}
      {isSaleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          {isScannerOpen && (
            <BarcodeScanner 
              onScan={handleScan} 
              onClose={() => setIsScannerOpen(false)} 
            />
          )}
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-indigo-600 text-white">
              <div className="flex items-center gap-3">
                <ShoppingCart size={24} />
                <h2 className="text-xl font-bold">New Order</h2>
              </div>
              <button onClick={() => setIsSaleModalOpen(false)} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaleSubmit} className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Customer Name</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                  placeholder="Enter customer name or 'Walk-in'"
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Sale Items</h3>
                  <div className="flex items-center gap-4">
                    <button 
                      type="button"
                      onClick={() => setIsScannerOpen(true)}
                      className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-2 py-1 rounded-lg"
                    >
                      <Scan size={14} />
                      Scan Barcode
                    </button>
                    <button 
                      type="button"
                      onClick={() => handleAddSaleItem()}
                      className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700"
                    >
                      <Plus size={14} />
                      Add Item
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  {saleItems.map((item, index) => (
                    <div key={index} className="flex gap-3 items-end bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <div className="flex-1">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Product</label>
                        <select
                          required
                          value={item.product_id}
                          onChange={(e) => handleUpdateSaleItem(index, 'product_id', e.target.value)}
                          className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm outline-none"
                        >
                          <option value="">Select Product</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id} disabled={p.total_quantity <= 0}>
                              {p.name} ({p.total_quantity || 0} available)
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="w-24">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Qty</label>
                        <input
                          type="number"
                          required
                          min="1"
                          max={products.find(p => p.id === parseInt(item.product_id))?.total_quantity || undefined}
                          value={item.quantity}
                          onChange={(e) => handleUpdateSaleItem(index, 'quantity', e.target.value)}
                          className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm outline-none"
                        />
                      </div>
                      <div className="w-32">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Total (₦)</label>
                        <input
                          type="number"
                          required
                          min="0"
                          step="0.01"
                          value={(item.quantity * item.unit_price).toFixed(2)}
                          onChange={(e) => handleUpdateSaleItem(index, 'line_total', e.target.value)}
                          className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm outline-none font-semibold text-indigo-600"
                        />
                        <p className="text-[9px] text-slate-400 mt-1 text-right">
                          ₦{Number(item.unit_price).toFixed(2)} / unit
                        </p>
                      </div>
                      <button 
                        type="button"
                        onClick={() => handleRemoveSaleItem(index)}
                        className="p-2 text-slate-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
                <div className="text-slate-500">
                  <p className="text-xs uppercase font-bold tracking-wider">Total Amount</p>
                  <p className="text-2xl font-bold text-slate-900">₦{totalSaleAmount.toLocaleString()}</p>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsSaleModalOpen(false)}
                    className="px-6 py-2.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-colors font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || saleItems.some(i => !i.product_id)}
                    className="px-8 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-semibold shadow-lg shadow-indigo-200 disabled:opacity-50 flex items-center gap-2"
                  >
                    {isSubmitting && <Loader2 size={18} className="animate-spin" />}
                    Complete Sale
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
