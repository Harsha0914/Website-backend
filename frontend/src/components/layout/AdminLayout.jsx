import React, { useState } from 'react';
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Building2,
  FileSpreadsheet,
  FileCode2,
  MessageSquare,
  ShieldCheck,
  LogOut,
  ArrowLeft,
  Menu,
  X,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useDailyLimit } from '../../services/dailyLimit';
import { todayIST } from '../../utils/time';

export function AdminLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const dailyLimit = useDailyLimit();   // the shared count: contacts messaged today by every account together
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sideShown, setSideShown] = useState(false);   // desktop: the sidebar slides in when the mouse is at the left edge

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/admin/dashboard', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/admin/businesses', label: 'Businesses', icon: Building2 },
    { to: '/admin/users', label: 'User Accounts', icon: Users },
    { to: '/admin/messages', label: 'Message Counts', icon: MessageSquare },
    { to: '/admin/website-requests', label: 'Website Requests', icon: FileCode2 },
    { to: '/admin/reports', label: 'Reports & Export', icon: FileSpreadsheet },
  ];

  const NavList = ({ onClose }) => (
    <nav className="flex-1 px-3 space-y-1 overflow-y-auto py-2">
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3.5 py-3 sm:py-2.5 rounded-xl text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900'
              }`
            }
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col md:flex-row admin-light">

      {/* ── Mobile Top Bar ─────────────────────────────────── */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800 sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-amber-500/20 text-amber-400 rounded-lg border border-amber-500/30">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <span className="text-sm font-bold text-white">Admin Portal</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleLogout}
            title="Sign Out"
            className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-950/40 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* ── Mobile Slide-Down Nav ───────────────────────────── */}
      {sidebarOpen && (
        <div className="md:hidden bg-slate-950 border-b border-slate-800 px-2 pb-3 z-40">
          <Link
            to="/dashboard"
            onClick={() => setSidebarOpen(false)}
            className="flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800/60 rounded-xl transition-colors mb-1 mt-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to User App</span>
          </Link>
          <NavList onClose={() => setSidebarOpen(false)} />
        </div>
      )}

      {/* ── Desktop Sidebar ─────────────────────────────────── */}
      <aside
        className={`admin-side hidden md:flex w-64 bg-slate-950 border-r border-slate-800 flex-col shrink-0 ${sideShown ? 'is-open' : ''}`}
        onMouseEnter={() => setSideShown(true)}
        onMouseLeave={() => setSideShown(false)}
        onFocus={() => setSideShown(true)}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setSideShown(false); }}
      >
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="admin-side-text">
              <h2 className="text-sm font-bold text-white tracking-tight">Admin Portal</h2>
              <p className="text-[10px] text-slate-400">ShopPresence Management</p>
            </div>
          </div>
        </div>

        <div className="p-3">
          <Link
            to="/dashboard"
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800/60 rounded-xl transition-colors mb-2"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span>Back to User App</span>
          </Link>
        </div>

        <NavList onClose={() => {}} />

        {/* Bottom user box */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between">
          <div className="truncate admin-side-text">
            <p className="text-xs font-bold text-white truncate">{user?.full_name}</p>
            <p className="text-[10px] text-amber-400 font-mono">ROLE: {user?.role}</p>
          </div>
          <button
            onClick={handleLogout}
            title="Sign Out"
            className="admin-side-out p-2 text-slate-400 hover:text-red-400 hover:bg-red-950/40 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* ── Main Content Area ──────────────────────────────── */}
      <main className="flex-1 bg-slate-900 min-h-screen overflow-y-auto p-4 sm:p-6 lg:p-8">
        {dailyLimit.available && dailyLimit.limit > 0 && (
          <div className="admin-count-row">
            <Link
              to={`/whatsapp?day=${todayIST()}&span=1`}
              className={`nav-count ${dailyLimit.reached ? 'is-full' : (dailyLimit.warnAt > 0 && dailyLimit.sentToday >= dailyLimit.warnAt) ? 'is-warn' : ''}`}
              title={`${dailyLimit.sentToday} of ${dailyLimit.limit} contacts messaged today by all accounts together`}
            >
              <span className="nav-count-dot" aria-hidden="true" />
              <b>{dailyLimit.sentToday}</b>
              <span>/ {dailyLimit.limit} today</span>
            </Link>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
