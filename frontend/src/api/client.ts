const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export function getStoredToken(): string | null {
  return localStorage.getItem('cravora_token');
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem('cravora_token', token);
  } else {
    localStorage.removeItem('cravora_token');
  }
}

export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errMessage = `Request failed (${response.status})`;
    try {
      const errBody = await response.json();
      if (typeof errBody.detail === 'string') {
        errMessage = errBody.detail;
      } else if (Array.isArray(errBody.detail)) {
        errMessage = errBody.detail.map((e: any) => e.msg || JSON.stringify(e)).join(', ');
      }
    } catch {
      // ignore json parse error
    }
    throw new Error(errMessage);
  }

  return response.json() as Promise<T>;
}

export function formatPKR(amount: number): string {
  return `Rs. ${Math.round(amount).toLocaleString('en-PK')}`;
}
