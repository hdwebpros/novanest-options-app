import { AppState } from 'react-native';
import * as Network from 'expo-network';
import { UploadType } from 'expo-file-system';
import { BASE, authHeaders, createProperty, getSecret } from './api';
import { nextPending } from './logic';
import { get, patchHouse, patchPhoto, photoFile, setAuthFailed } from './store';

const BACKOFF = [5000, 15000, 60000];
let running = false;
let again = false;
let failures = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

// Safe to call any time; at most one loop runs. A kick during a run causes one more pass after it.
export function kick() {
  if (running) {
    again = true;
    return;
  }
  clearTimeout(timer);
  running = true;
  again = false;
  run().finally(() => {
    running = false;
    if (again) kick();
  });
}

async function run() {
  const skip = new Set<string>(); // poison photos given up on for this run only
  while (true) {
    const { houses, checklist } = get();
    if (!(await getSecret())) return;
    // Next house with work: not created on the site yet, or a photo still to upload.
    const house = Object.values(houses).find((h) => !h.property.token || nextPending(h.photos, skip));
    if (!house) {
      failures = 0;
      return;
    }
    const { property } = house;
    try {
      if (!property.token) {
        const token = await createProperty(property);
        patchHouse(property.id, (h) => ({ property: { ...h.property, token } }));
        setAuthFailed(false);
        continue;
      }
      const photo = nextPending(house.photos, skip)!;
      const category = checklist?.find((i) => i.key === photo.item)?.category ?? photo.item;
      const url =
        `${BASE}/api/options/photos?token=${encodeURIComponent(property.token)}` +
        `&category=${encodeURIComponent(category)}&id=${encodeURIComponent(photo.id)}`;
      const file = photoFile(photo.id);
      if (!file.exists) {
        // should never happen; mark failed so it doesn't count as waiting forever or wedge the queue
        patchPhoto(property.id, photo.id, { error: -1 });
        skip.add(photo.id);
        continue;
      }
      patchPhoto(property.id, photo.id, { attempts: photo.attempts + 1 });
      // Multipart filename comes from the file itself: <photoId>.jpg.
      const res = await file.upload(url, {
        uploadType: UploadType.MULTIPART,
        fieldName: 'photo',
        mimeType: 'image/jpeg',
        headers: await authHeaders(),
      });
      if (res.status >= 200 && res.status < 300) {
        patchPhoto(property.id, photo.id, { uploaded: true, error: undefined });
        setAuthFailed(false);
        failures = 0;
      } else if (res.status === 401 || res.status === 403) {
        setAuthFailed(true);
        return; // bad secret: every photo would fail; wait for the next kick (foreground / settings)
      } else if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        patchPhoto(property.id, photo.id, { error: res.status });
        skip.add(photo.id);
      } else {
        throw new Error(`upload ${res.status}`);
      }
    } catch (e) {
      if (/^create 40[13]$/.test((e as Error).message)) {
        setAuthFailed(true);
        return; // same as a photo 401/403
      }
      // network failure, 5xx, 408/429, or create failed: stop and back off. Same ids on retry.
      clearTimeout(timer);
      timer = setTimeout(kick, BACKOFF[Math.min(failures++, BACKOFF.length - 1)]);
      return;
    }
  }
}

// Called once from the root layout.
export function start() {
  AppState.addEventListener('change', (s) => s === 'active' && kick());
  Network.addNetworkStateListener((e) => e.isInternetReachable && kick());
  kick();
}
