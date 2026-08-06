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

export const api = {
  get: <T>(path: string) => request<T>(path),
  
  post: <T>(path: string, data: unknown) => 
    request<T>(path, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  put: <T>(path: string, data: unknown) => 
    request<T>(path, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  
  delete: <T>(path: string) => 
    request<T>(path, { method: 'DELETE' }),
}

export default api