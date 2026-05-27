// Central API base configuration
export const API_BASE = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:8090';

export function apiUrl(path: string) {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}

// Simple GET helper returning parsed JSON
export async function get(path: string) {
  const url = apiUrl(path);
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

// GET with optional Bearer token
export async function getAuth(path: string, token?: string) {
  const url = apiUrl(path);
  const headers: Record<string, string> = {};
  let t = token ? String(token).trim() : undefined;
  // If caller didn't provide a token, attempt to read from storage (sessionStorage preferred)
  if (!t) {
    try {
      t = sessionStorage.getItem('authToken') || localStorage.getItem('authToken') || undefined;
    } catch {}
  }
  if (t) {
    // strip surrounding quotes if any
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
      t = t.slice(1, -1);
    }
    // if token already contains Bearer prefix, remove it to avoid double prefixing
    if (t.toLowerCase().startsWith('bearer ')) {
      t = t.slice(7).trim();
    }
    headers['Authorization'] = `Bearer ${t}`;
  }
  // Debug: log whether auth header is present and a short token fingerprint
  // eslint-disable-next-line no-console
  console.debug('[API] GET', url, 'hasAuth:', !!t, 'token_snippet:', t ? `${t.slice(0,8)}...${t.slice(-6)}` : '');
  const res = await fetch(url, { credentials: 'include', headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

// POST with optional Bearer token
export async function postAuth(path: string, body: any, token?: string | null) {
  const url = apiUrl(path);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  let t = token ? String(token).trim() : undefined;
  // If caller didn't provide a token, attempt to read from storage
  if (!t) {
    try {
      t = sessionStorage.getItem('authToken') || localStorage.getItem('authToken') || undefined;
    } catch {}
  }
  if (t) {
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
      t = t.slice(1, -1);
    }
    if (t.toLowerCase().startsWith('bearer ')) {
      t = t.slice(7).trim();
    }
    headers['Authorization'] = `Bearer ${t}`;
  }
  // eslint-disable-next-line no-console
  console.debug('[API] POST', url, 'hasAuth:', !!t);
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

// Alias for consumers wanting a named builder
export const buildUrl = apiUrl;