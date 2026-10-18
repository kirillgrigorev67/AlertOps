const API_BASE = '/api'

function getToken(): string | null {
  return localStorage.getItem('alertops_token')
}

async function request<T>(path: string, options?: RequestInit & { skipRedirect?: boolean }): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  
  const token = getToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...options?.headers,
    },
  })
  
  if (response.status === 401 && !options?.skipRedirect) {
    // Token expired or invalid — clear and redirect to login
    localStorage.removeItem('alertops_token')
    localStorage.removeItem('alertops_user')
    window.location.href = '/login'
    throw new Error('Session expired')
  }
  
  if (!response.ok) {
    let detail = response.statusText
    try {
      const err = await response.json()
      detail = err.detail || detail
    } catch {}
    throw new Error(`HTTP ${response.status}: ${detail}`)
  }
  
  return response.json()
}

export interface NotificationChannel {
  id: string;
  name: string;
  channel_type: "telegram" | "webhook";
  enabled: boolean;
  config: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface User {
  id: string;
  username: string;
  role: "admin" | "user";
  active: boolean;
  folders: string[];
  created_at?: string;
  updated_at?: string;
  is_default?: boolean;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  
  post: <T>(path: string, data?: unknown) => 
    request<T>(path, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    }),
  
  put: <T>(path: string, data: unknown) => 
    request<T>(path, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  
  delete: <T>(path: string) => 
    request<T>(path, { method: 'DELETE' }),
  
  // Auth
  auth: {
    login: (username: string, password: string) => 
      request<{ access_token: string; token_type: string; role: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
        skipRedirect: true,
      }),
    me: () => request<{ username: string; role: string; folders?: string[] }>('/auth/me'),
    status: () => request<{ enabled: boolean }>('/auth/status'),
  },
  
  // Users (admin only)
  users: {
    list: () => request<User[]>('/users'),
    create: (data: { username: string; password: string; role: string; folders?: string[] }) => 
      request<User>('/users', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { role?: string; active?: boolean; password?: string; folders?: string[] }) => 
      request<User>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request<{ status: string }>(`/users/${id}`, { method: 'DELETE' }),
  },
  
  // Notification Channels
  channels: {
    list: () => request<NotificationChannel[]>("/notification-channels"),
    create: (data: Omit<NotificationChannel, "id" | "created_at" | "updated_at">) => request<NotificationChannel>("/notification-channels", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Omit<NotificationChannel, "id" | "created_at" | "updated_at">) => request<NotificationChannel>(`/notification-channels/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => request<{ status: string }>(`/notification-channels/${id}`, { method: "DELETE" }),
    test: (id: string) => request<{ status: string }>(`/notification-channels/${id}/test`, { method: "POST" }),
  },
}

export default api
