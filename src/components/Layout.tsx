import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LogOut, LayoutDashboard, Package, ShoppingCart, AlertTriangle, Menu, X, History, ShieldCheck } from 'lucide-react';
import { cn } from '../lib/utils';
import NotificationBell from './NotificationBell';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../lib/api';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);
  const location = useLocation();

  const [stats, setStats] = React.useState<any>(null);

  React.useEffect(() => {
    apiFetch('/api/dashboard/stats')
      .then(res => res.json())
      .then(setStats);
  }, []);

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Inventory', path: '/stock', icon: History },
    { name: 'Sales', path: '/sales', icon: ShoppingCart },
    { 
      name: 'Expiry Alerts', 
      path: '/alerts', 
      icon: AlertTriangle,
      badge: stats ? (stats.expiredStock > 0 || stats.expiringSoon > 0 ? stats.expiredStock + stats.expiringSoon : null) : null,
      badgeColor: stats?.expiredStock > 0 ? "bg-red-500" : "bg-orange-500"
    },
    { name: 'Staff Control', path: '/staff', icon: ShieldCheck, adminOnly: true },
  ].filter(item => !item.adminOnly || user?.role === 'admin');

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside
        className={cn(
          "bg-white border-r border-slate-200 transition-all duration-300 flex flex-col",
          isSidebarOpen ? "w-64" : "w-20"
        )}
      >
        <div className="p-6 flex items-center justify-between">
          {isSidebarOpen && <span className="font-bold text-xl text-indigo-600">StockMaster</span>}
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 hover:bg-slate-100 rounded-lg"
          >
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center p-3 rounded-xl transition-colors relative group",
                  isActive
                    ? "bg-indigo-50 text-indigo-600"
                    : "text-slate-600 hover:bg-slate-50"
                )}
              >
                <Icon size={20} className={cn(isActive ? "text-indigo-600" : "text-slate-400")} />
                {isSidebarOpen && <span className="ml-3 font-medium flex-1">{item.name}</span>}
                {item.badge && (
                  <span className={cn(
                    "flex items-center justify-center rounded-full text-[10px] font-bold text-white",
                    isSidebarOpen ? "px-2 py-0.5" : "absolute top-1 right-1 w-4 h-4",
                    item.badgeColor
                  )}>
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center px-8 justify-between">
          <h1 className="text-lg font-semibold text-slate-800">
            {navItems.find(i => i.path === location.pathname)?.name || 'Page'}
          </h1>
          <div className="flex items-center gap-4">
            <NotificationBell />
            <div className="flex items-center gap-3 pl-4 border-l border-slate-100">
              <div className="text-right">
                <p className="text-sm font-bold text-slate-900">{user?.name}</p>
                <p className="text-[10px] text-slate-400 uppercase font-bold">{user?.role}</p>
              </div>
              <button 
                onClick={logout}
                className="w-10 h-10 rounded-xl bg-slate-50 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all flex items-center justify-center border border-slate-200"
                title="Sign Out"
              >
                <LogOut size={20} />
              </button>
            </div>
          </div>
        </header>
        <div className="p-8 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
