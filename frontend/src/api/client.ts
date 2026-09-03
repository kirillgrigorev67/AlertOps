const API_BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
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
