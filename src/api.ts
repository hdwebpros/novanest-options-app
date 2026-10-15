import * as SecureStore from 'expo-secure-store';
import type { Item } from './logic';
import type { Property } from './store';

export const BASE = 'https://www.novanest.homes';

export const getSecret = () => SecureStore.getItemAsync('secret');
export const saveSecret = (v: string) => SecureStore.setItemAsync('secret', v);

export async function authHeaders(): Promise<Record<string, string>> {
  return { Authorization: `Bearer ${(await getSecret()) ?? ''}` };
}

export async function api(path: string, init: RequestInit = {}) {
  return fetch(BASE + path, { ...init, headers: { ...(await authHeaders()), ...(init.headers as Record<string, string>) } });
}

// Same id => same token server-side, so this is safe to retry forever.
export async function createProperty(p: Property): Promise<string> {
  const { token: _, ...body } = p;
  const res = await api('/api/options/field', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`create ${res.status}`);
  return (await res.json()).token;
}

export async function fetchChecklist(): Promise<Item[]> {
  const res = await api('/api/options/field/checklist');
  if (!res.ok) throw new Error(`checklist ${res.status}`);
  return (await res.json()).items;
}

// Safe to retry: once submitted the site just returns the current status. Caller reads the status (409 = no photos).
export function submitProperty(token: string, body: { notes: { item?: string; text: string }[]; skipped: { item: string; reason: string }[] }) {
  return api(`/api/options/field/${encodeURIComponent(token)}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
