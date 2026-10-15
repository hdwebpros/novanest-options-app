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
export type House = {
  property: Property;
  photos: Record<string, Photo>;
  skips: Record<string, Reason>;
  notes: { item?: string; text: string }[];
  current?: string; // item key picked in the room list; capture clears it after a photo/skip on it
  submittedAt?: number;
  createdAt: number;
};
// Houses are keyed by property.id.
export type State = { checklist: Item[] | null; houses: Record<string, House>; active?: string };

const empty: State = { checklist: null, houses: {} };
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
      const raw = JSON.parse(f.textSync());
      state = { checklist: raw.checklist ?? null, houses: raw.houses ?? {}, active: raw.active };
      // Old one-house shape: wrap it into a house and make it active. Old keys are dropped on the next write.
      if (raw.property) {
        const { property, photos = {}, skips = {}, notes = [], current } = raw;
        state.houses[property.id] = { property, photos, skips, notes, current, createdAt: Date.now() };
        state.active = property.id;
      }
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

// No-op if the house is gone (removed while an upload was in flight).
export function patchHouse(id: string, patch: Partial<House> | ((h: House) => Partial<House>)) {
  set((s) => {
    const h = s.houses[id];
    return h ? { ...s, houses: { ...s.houses, [id]: { ...h, ...(typeof patch === 'function' ? patch(h) : patch) } } } : s;
  });
}

// No-op if the photo is gone (retake or remove while an upload was in flight).
export function patchPhoto(houseId: string, photoId: string, patch: Partial<Photo>) {
  patchHouse(houseId, (h) => (h.photos[photoId] ? { photos: { ...h.photos, [photoId]: { ...h.photos[photoId], ...patch } } } : {}));
}

// Drop a house from the phone, with its photo files. Photos already uploaded stay on the site.
export function removeHouse(id: string) {
  for (const pid of Object.keys(state.houses[id]?.photos ?? {})) {
    try {
      photoFile(pid).delete();
    } catch {}
  }
  set((s) => {
    const houses = { ...s.houses };
    delete houses[id];
    return { ...s, houses, active: s.active === id ? undefined : s.active };
  });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const useStore = () => useSyncExternalStore(subscribe, get);
export const useHouse = (): House | undefined => {
  const s = useStore();
  return s.active ? s.houses[s.active] : undefined;
};
