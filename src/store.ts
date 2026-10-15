import { useSyncExternalStore } from 'react';
import { Directory, File, Paths } from 'expo-file-system';
import type { Item, Photo, Reason } from './logic';

export type Property = {
  id: string;
  token?: string;
  address: string;
  county: string;
  type: string;
  occupancy: string;
  finishedSqft?: number;
};
export type State = {
  checklist: Item[] | null;
  property: Property | null;
  photos: Record<string, Photo>;
  skips: Record<string, Reason>;
  notes: { item?: string; text: string }[];
  current?: string; // item key picked in the room list; capture clears it after a photo/skip on it
};

const empty: State = { checklist: null, property: null, photos: {}, skips: {}, notes: [] };
let state = empty;
const listeners = new Set<() => void>();

// Photos live at <document>/photos/<id>.jpg. We store only the id: the iOS container path changes on app updates.
export const photosDir = () => new Directory(Paths.document, 'photos');
export const photoFile = (id: string) => new File(photosDir(), `${id}.jpg`);

export function load() {
  // state.json.tmp is the fallback if the app died between the tmp write and the rename.
  for (const name of ['state.json', 'state.json.tmp']) {
    const f = new File(Paths.document, name);
    if (!f.exists) continue;
    try {
      state = { ...empty, ...JSON.parse(f.textSync()) };
      return;
    } catch {}
  }
}

export const get = () => state;

// Every mutation rewrites the whole file: write tmp, then rename over state.json.
export function set(fn: (s: State) => State) {
  state = fn(state);
  const tmp = new File(Paths.document, 'state.json.tmp');
  tmp.create({ overwrite: true });
  tmp.write(JSON.stringify(state));
  tmp.moveSync(new File(Paths.document, 'state.json'), { overwrite: true });
  listeners.forEach((l) => l());
}

// No-op if the photo is gone (Start over while an upload was in flight).
export function patchPhoto(id: string, patch: Partial<Photo>) {
  set((s) => (s.photos[id] ? { ...s, photos: { ...s.photos, [id]: { ...s.photos[id], ...patch } } } : s));
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const useStore = () => useSyncExternalStore(subscribe, get);
