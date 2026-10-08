import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// Public pages
import LandingPage from './pages/LandingPage';
import RegisterPage from './pages/auth/RegisterPage';
import LoginPage from './pages/auth/LoginPage';



// User pages
import UserDashboard from './pages/dashboard/UserDashboard';
import ShopsPage from './pages/shops/ShopsPage';
import WebsiteShopsPage from './pages/shops/WebsiteShopsPage';
import NoWebsiteShopsPage from './pages/shops/NoWebsiteShopsPage';
import GoodWebsitesPage from './pages/shops/GoodWebsitesPage';
import NeedsImprovementPage from './pages/shops/NeedsImprovementPage';
import ShopDetailPage from './pages/shops/ShopDetailPage';
import ChatPage from './pages/chat/ChatPage';
import WhatsAppHubPage from './pages/whatsapp/WhatsAppHubPage';

// Admin pages
import { AdminLayout } from './components/layout/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminBusinesses from './pages/admin/AdminBusinesses';
import AdminWebsiteRequests from './pages/admin/AdminWebsiteRequests';
import AdminReports from './pages/admin/AdminReports';

import { useEffect } from 'react';
import { ProtectedRoute } from './components/common/ProtectedRoute';
import { useAuthStore } from './store/authStore';
import api from './services/api';
import WhatsAppSentConfirmToast from './components/common/WhatsAppSentConfirmToast';

/**
 * Root entry point handler:
 * When users open localhost:5173 or the Vercel link directly:
 * - If not authenticated: shows the landing page (its buttons lead to /login and /register)
 * - If authenticated as ADMIN: navigates to /admin/dashboard
 * - If authenticated as regular USER: navigates to /dashboard
 */
function RootRoute() {
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated) {
    return <LandingPage />;
  }

  if (user?.role === 'ADMIN') {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return <Navigate to="/dashboard" replace />;
}

export default function App() {
  useEffect(() => {
    // Proactively ping backend to wake up free tier container immediately
    api.get('/health').catch(() => {});
  }, []);

  return (
    <>
      <Routes>
      {/* Root Route: Automatically directs to /login when opened, or /dashboard if logged in */}
      <Route path="/" element={<RootRoute />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/landing" element={<Navigate to="/" replace />} />



      {/* Normal User Protected Routes */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <UserDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/shops"
        element={
          <ProtectedRoute>
            <ShopsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/shops/websites"
        element={
          <ProtectedRoute>
            <WebsiteShopsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/shops/no-websites"
        element={
          <ProtectedRoute>
            <NoWebsiteShopsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/shops/good-websites"
        element={
          <ProtectedRoute>
            <GoodWebsitesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/shops/needs-improvement"
        element={
          <ProtectedRoute>
            <NeedsImprovementPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/shop/:id"
        element={
          <ProtectedRoute>
            <ShopDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/shop/:id/chat"
        element={
          <ProtectedRoute>
            <ChatPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/whatsapp"
        element={
          <ProtectedRoute>
            <WhatsAppHubPage />
          </ProtectedRoute>
        }
      />

      {/* Admin Protected Routes */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute requireAdmin={true}>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="businesses" element={<AdminBusinesses />} />
        <Route path="website-requests" element={<AdminWebsiteRequests />} />
        <Route path="reports" element={<AdminReports />} />
      </Route>

      {/* Fallback Route */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    <WhatsAppSentConfirmToast />
  </>
  );
}

