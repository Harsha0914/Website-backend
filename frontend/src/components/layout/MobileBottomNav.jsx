import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Search,
  List,
  MessageCircle,
  LogIn,
  UserPlus,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

/**
 * MobileBottomNav – fixed bottom navigation bar visible only on small screens.
 * Hidden on md+ (Tailwind `md:hidden`).
 */
export default function MobileBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuthStore();

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const items = isAuthenticated
    ? [
        { path: '/dashboard', icon: Search,        label: 'Find shops' },
        { path: '/shops',     icon: List,          label: 'Results' },
        { path: '/whatsapp',  icon: MessageCircle, label: 'WhatsApp' },
      ]
    : [
        { path: '/login',     icon: LogIn,         label: 'Sign in' },
        { path: '/register',  icon: UserPlus,      label: 'Create account' },
      ];

  return (
    <nav className="mobile-bottom-nav md:hidden" aria-label="Mobile navigation">
      {items.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.path);
        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={`mobile-bottom-nav-item no-min-tap ${active ? 'active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <Icon
              style={{
                width: 22,
                height: 22,
                strokeWidth: active ? 2.5 : 1.8,
              }}
            />
            <span>{item.label}</span>
            {active && <span className="mobile-bottom-nav-dot" />}
          </button>
        );
      })}
    </nav>
  );
}
