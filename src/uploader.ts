import { AppState } from 'react-native';
import * as Network from 'expo-network';
import { UploadType } from 'expo-file-system';
import { BASE, authHeaders, createProperty, getSecret } from './api';
import { nextPending } from './logic';
import { get, patchPhoto, photoFile, set } from './store';

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

function retryLater() {
  clearTimeout(timer);
  timer = setTimeout(kick, BACKOFF[Math.min(failures, BACKOFF.length - 1)]);
  failures++;
}

async function run() {
  const skip = new Set<string>(); // poison photos given up on for this run only
  while (true) {
    const { property, photos, checklist } = get();
    if (!property || !(await getSecret())) return;
    try {
      if (!property.token) {
        const token = await createProperty(property);
        set((s) => (s.property?.id === property.id ? { ...s, property: { ...s.property, token } } : s));
        continue;
      }
      const photo = nextPending(photos, skip);
      if (!photo) {
        failures = 0;
        return;
      }
      const category = checklist?.find((i) => i.key === photo.item)?.category ?? photo.item;
      const url =
        `${BASE}/api/options/photos?token=${encodeURIComponent(property.token)}` +
        `&category=${encodeURIComponent(category)}&id=${encodeURIComponent(photo.id)}`;
      const file = photoFile(photo.id);
      if (!file.exists) {
        skip.add(photo.id); // should never happen; don't let it wedge the queue
        continue;
      }
      patchPhoto(photo.id, { attempts: photo.attempts + 1 });
      // Multipart filename comes from the file itself: <photoId>.jpg.
      const res = await file.upload(url, {
        uploadType: UploadType.MULTIPART,
        fieldName: 'photo',
        mimeType: 'image/jpeg',
        headers: await authHeaders(),
      });
      if (res.status >= 200 && res.status < 300) {
        patchPhoto(photo.id, { uploaded: true, error: undefined });
        failures = 0;
      } else if (res.status === 401 || res.status === 403) {
        return; // bad secret: every photo would fail; wait for the next kick (foreground / settings)
      } else if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        patchPhoto(photo.id, { error: res.status });
        skip.add(photo.id);
      } else {
        throw new Error(`upload ${res.status}`);
      }
    } catch {
      // network failure, 5xx, 408/429, or create failed: stop and back off. Same ids on retry.
      retryLater();
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
