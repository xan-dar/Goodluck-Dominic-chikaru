import React from 'react';
import { Bell, Settings, Check, Clock, AlertTriangle, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { format } from 'date-fns';

import { apiFetch } from '../lib/api';

export default function NotificationBell() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [notifications, setNotifications] = React.useState<any[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const [settings, setSettings] = React.useState({
    low_stock_threshold: 10,
    expiry_threshold_days: 7,
    enable_in_app: true,
    enable_email: false,
    email_address: ''
  });

  const fetchNotifications = async () => {
    try {
      const res = await apiFetch('/api/notifications');
      const data = await res.json();
      setNotifications(data);
    } catch (error) {
      console.error('Failed to fetch notifications');
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await apiFetch('/api/settings/notifications');
      const data = await res.json();
      setSettings({
        ...data,
        enable_in_app: !!data.enable_in_app,
        enable_email: !!data.enable_email
      });
    } catch (error) {
      console.error('Failed to fetch settings');
    }
  };

  React.useEffect(() => {
    fetchNotifications();
    fetchSettings();
    const interval = setInterval(fetchNotifications, 60000); // Check for new ones every minute
    return () => clearInterval(interval);
  }, []);

  const markAsRead = async (id: number) => {
    await apiFetch(`/api/notifications/${id}/read`, { method: 'POST' });
    fetchNotifications();
  };

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/settings/notifications', {
      method: 'PUT',
      body: JSON.stringify(settings)
    });
    setIsSettingsOpen(false);
    apiFetch('/api/notifications/refresh', { method: 'POST' }).then(fetchNotifications);
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 hover:bg-slate-100 rounded-lg relative transition-colors"
      >
        <Bell size={20} className="text-slate-600" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full animate-pulse">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-3 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 z-[100] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h3 className="font-bold text-slate-900">Notifications</h3>
            <button 
              onClick={() => {
                setIsSettingsOpen(true);
                setIsOpen(false);
              }}
              className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors"
              title="Settings"
            >
              <Settings size={16} />
            </button>
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <Bell size={32} className="mx-auto mb-2 opacity-20" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {notifications.map((n) => (
                  <div 
                    key={n.id} 
                    className={cn(
                      "p-4 flex gap-3 hover:bg-slate-50 transition-colors group relative",
                      !n.is_read && "bg-indigo-50/30"
                    )}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                      n.type === 'low_stock' ? "bg-orange-100 text-orange-600" : "bg-red-100 text-red-600"
                    )}>
                      {n.type === 'low_stock' ? <Clock size={16} /> : <AlertTriangle size={16} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900 leading-tight">{n.title}</p>
                      <p className="text-xs text-slate-600 mt-1">{n.message}</p>
                      <p className="text-[10px] text-slate-400 mt-2">
                        {format(new Date(n.created_at), 'MMM dd, h:mm a')}
                      </p>
                    </div>
                    {!n.is_read && (
                      <button
                        onClick={() => markAsRead(n.id)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 bg-white shadow-sm border border-slate-100 rounded-lg text-indigo-600 hover:bg-indigo-50 transition-all"
                        title="Mark as read"
                      >
                        <Check size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {isSettingsOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Notification Settings</h2>
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-lg text-slate-400"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={saveSettings} className="p-6 space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Low Stock Threshold</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={settings.low_stock_threshold}
                      onChange={(e) => setSettings({...settings, low_stock_threshold: parseInt(e.target.value)})}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">units</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Expiry Alert Days</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={settings.expiry_threshold_days}
                      onChange={(e) => setSettings({...settings, expiry_threshold_days: parseInt(e.target.value)})}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">days before</span>
                  </div>
                </div>

                <div className="flex items-center justify-between py-2">
                  <div className="space-y-0.5">
                    <label className="text-sm font-semibold text-slate-700">In-App Notifications</label>
                    <p className="text-xs text-slate-500">Show alerts in the top bar</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.enable_in_app}
                    onChange={(e) => setSettings({...settings, enable_in_app: e.target.checked})}
                    className="w-4 h-4 text-indigo-600 rounded"
                  />
                </div>

                <div className="flex items-center justify-between py-2 border-t border-slate-50 pt-4">
                  <div className="space-y-0.5">
                    <label className="text-sm font-semibold text-slate-700">Email Notifications</label>
                    <p className="text-xs text-slate-500">Send alerts to your email</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.enable_email}
                    onChange={(e) => setSettings({...settings, enable_email: e.target.checked})}
                    className="w-4 h-4 text-indigo-600 rounded"
                  />
                </div>

                {settings.enable_email && (
                  <div className="animate-in slide-in-from-top-2">
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Email Address</label>
                    <input
                      type="email"
                      required
                      value={settings.email_address}
                      onChange={(e) => setSettings({...settings, email_address: e.target.value})}
                      placeholder="alerts@example.com"
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm"
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(false)}
                  className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors text-sm shadow-lg shadow-indigo-100"
                >
                  Save Settings
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
