import { create } from 'zustand';
import api from '../services/api';

export const useAuthStore = create((set, get) => ({
  user: JSON.parse(localStorage.getItem('user_info') || 'null'),
  accessToken: localStorage.getItem('access_token') || null,
  isAuthenticated: !!localStorage.getItem('access_token'),
  loading: false,
  error: null,

  login: async (usernameOrEmail, password) => {
    set({ loading: true, error: null });
    try {
      const cleanIdentifier = (usernameOrEmail || '').trim().toLowerCase();
      const res = await api.post('/auth/login', {
        username: cleanIdentifier,
        email: cleanIdentifier,
        password,
      }, {
        timeout: 10000,
      });
      const data = res.data;

      const { access_token, refresh_token, role, full_name, user_id, username } = data;
      const userInfo = { id: user_id, username: username || cleanIdentifier, email: cleanIdentifier, full_name, role };

      try {
        localStorage.setItem('access_token', access_token);
        if (refresh_token) {
          localStorage.setItem('refresh_token', refresh_token);
        }
        localStorage.setItem('user_info', JSON.stringify(userInfo));
      } catch (storageErr) {
        console.warn('LocalStorage write warning:', storageErr);
      }

      set({
        user: userInfo,
        accessToken: access_token,
        isAuthenticated: true,
        loading: false,
        error: null,
      });

      return userInfo;
    } catch (err) {
      let msg = 'Failed to login. Please check your credentials.';
      const detail = err.response?.data?.detail;
      if (typeof detail === 'string') {
        msg = detail;
      } else if (Array.isArray(detail)) {
        msg = detail.map((d) => d.msg || d.message || JSON.stringify(d)).join(', ');
      } else if (detail) {
        msg = JSON.stringify(detail);
      } else if (err.response?.status === 404) {
        msg = 'Account not found. Please register first.';
      } else if (err.response?.status === 401) {
        msg = 'Incorrect password. Please try again.';
      } else if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        msg = 'Connection timed out. Please check your internet connection and try again.';
      } else if (err.message === 'Network Error' || (err.isAxiosError && !err.response)) {
        msg = 'Network Error: Cannot connect to server. Please check your internet connection.';
      } else if (err.message) {
        msg = err.message;
      }

      // Safeguard exact required messages
      if (msg.toLowerCase().includes('account not found') || err.response?.status === 404) {
        msg = 'Account not found. Please register first.';
      } else if (msg.toLowerCase().includes('incorrect password') || (err.response?.status === 401 && !msg.toLowerCase().includes('deactivated'))) {
        msg = 'Incorrect password. Please try again.';
      }

      set({ loading: false, error: msg });
      throw new Error(msg);
    }
  },

  register: async ({ username, full_name, email, phone, password, confirm_password, role = 'USER', admin_code = '' }) => {
    set({ loading: true, error: null });
    try {
      const cleanUsername = (username || '').trim().toLowerCase();
      const cleanEmail = (email || '').trim().toLowerCase();
      const res = await api.post('/auth/register', {
        username: cleanUsername,
        full_name: (full_name || cleanUsername || '').trim(),
        email: cleanEmail,
        phone,
        password,
        confirm_password,
        role,
        admin_code,
      });
      set({ loading: false, error: null });
      return res.data;
    } catch (err) {
      let msg = 'Registration failed. Please check your details and try again.';
      const detail = err.response?.data?.detail;
      if (typeof detail === 'string') {
        msg = detail;
      } else if (Array.isArray(detail)) {
        msg = detail.map((d) => d.msg || d.message || JSON.stringify(d)).join(', ');
      } else if (detail) {
        msg = JSON.stringify(detail);
      } else if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        msg = 'Connection timed out. Please check your internet connection and try again.';
      } else if (err.message === 'Network Error' || (err.isAxiosError && !err.response)) {
        msg = 'Network Error: Cannot connect to server. Please check your internet connection.';
      } else if (err.message) {
        msg = err.message;
      }
      set({ loading: false, error: msg });
      throw new Error(msg);
    }
  },

  // idToken is the Google Sign-In credential (JWT); the server verifies it with Google.
  googleAuth: async ({ idToken }) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post('/auth/google', { id_token: idToken });
      const data = res.data;
      const { access_token, refresh_token, role: userRole, full_name: name, user_id, username } = data;
      const userInfo = { id: user_id, username, full_name: name, role: userRole };

      try {
        localStorage.setItem('access_token', access_token);
        if (refresh_token) {
          localStorage.setItem('refresh_token', refresh_token);
        }
        localStorage.setItem('user_info', JSON.stringify(userInfo));
      } catch (storageErr) {
        console.warn('LocalStorage write warning:', storageErr);
      }

      set({
        user: userInfo,
        accessToken: access_token,
        isAuthenticated: true,
        loading: false,
        error: null,
      });

      return userInfo;
    } catch (err) {
      let msg = 'Google authentication failed. Please try again.';
      const detail = err.response?.data?.detail;
      if (typeof detail === 'string') {
        msg = detail;
      } else if (Array.isArray(detail)) {
        msg = detail.map((d) => d.msg || d.message || JSON.stringify(d)).join(', ');
      } else if (detail) {
        msg = JSON.stringify(detail);
      }
      set({ loading: false, error: msg });
      throw new Error(msg);
    }
  },

  sendPasswordOtp: async (email) => {

    try {
      const cleanEmail = (email || '').trim().toLowerCase();
      const res = await api.post('/auth/send-otp', { email: cleanEmail });
      return res.data;
    } catch (err) {
      let msg = 'Failed to send OTP. Please try again.';
      if (err.response?.data?.detail) {
        msg = typeof err.response.data.detail === 'string' ? err.response.data.detail : JSON.stringify(err.response.data.detail);
      } else if (err.message) {
        msg = err.message;
      }
      throw new Error(msg);
    }
  },

  verifyOtpAndResetPassword: async ({ email, otp, new_password, confirm_password }) => {
    try {
      const cleanEmail = (email || '').trim().toLowerCase();
      const res = await api.post('/auth/verify-otp-reset-password', {
        email: cleanEmail,
        otp: String(otp).trim(),
        new_password,
        confirm_password,
      });
      return res.data;
    } catch (err) {
      let msg = 'Failed to verify OTP and reset password.';
      if (err.response?.data?.detail) {
        msg = typeof err.response.data.detail === 'string' ? err.response.data.detail : JSON.stringify(err.response.data.detail);
      } else if (err.message) {
        msg = err.message;
      }
      throw new Error(msg);
    }
  },

  resetPassword: async ({ email, old_password, new_password, confirm_password }) => {
    set({ loading: true, error: null });
    try {
      const cleanEmail = (email || '').trim().toLowerCase();
      const res = await api.post('/auth/reset-password', {
        email: cleanEmail,
        old_password: old_password || undefined,
        new_password,
        confirm_password: confirm_password || new_password,
      });
      set({ loading: false, error: null });
      return res.data;
    } catch (err) {
      let msg = 'Failed to reset password. Please verify the email address.';
      if (err.response?.data?.detail) {
        if (Array.isArray(err.response.data.detail)) {
          msg = err.response.data.detail.map((d) => d.msg || d.message || JSON.stringify(d)).join(', ');
        } else if (typeof err.response.data.detail === 'string') {
          msg = err.response.data.detail;
        } else {
          msg = JSON.stringify(err.response.data.detail);
        }
      } else if (err.message) {
        msg = err.message;
      }
      set({ loading: false, error: msg });
      throw new Error(msg);
    }
  },

  logout: () => {
    try {
      api.post('/auth/logout').catch(() => { });
    } catch (_) { }
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user_info');
    set({ user: null, accessToken: null, isAuthenticated: false });
  },

  fetchProfile: async () => {
    try {
      const res = await api.get('/auth/me');
      const userInfo = {
        id: res.data.id,
        email: res.data.email,
        full_name: res.data.full_name,
        role: res.data.role,
        phone: res.data.phone,
      };
      localStorage.setItem('user_info', JSON.stringify(userInfo));
      set({ user: userInfo, isAuthenticated: true });
    } catch (err) {
      get().logout();
    }
  },
}));
