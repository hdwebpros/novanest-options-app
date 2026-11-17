// Pure helpers, no RN/Expo imports, so `node --test src/logic.test.ts` can run them.
export type Item = { key: string; section: string; label: string; instruction: string; required: boolean; category: string };
export type Reason = 'not_there' | 'no_access' | 'unsafe';
export type Photo = { id: string; item: string; uploaded: boolean; attempts: number; at: number; error?: number };

export const SKIPS: [string, Reason][] = [
  ['Not there', 'not_there'],
  ["Can't get to it", 'no_access'],
  ['Unsafe', 'unsafe'],
];

// Upload queue and checklist totals for one house. failed = gave up (error set); waiting = not uploaded, not failed.
// shot = item keys with at least one photo; done = checklist items shot or skipped.
export function counts(photos: Record<string, Photo>, skips: Record<string, Reason>, checklist: Item[] | null) {
  const all = Object.values(photos);
  const uploaded = all.filter((p) => p.uploaded).length;
  const failed = all.filter((p) => !p.uploaded && p.error).length;
  const shot = new Set(all.map((p) => p.item));
  const done = (checklist ?? []).filter((i) => shot.has(i.key) || skips[i.key]).length;
  return { uploaded, waiting: all.length - uploaded - failed, failed, done, shot };
}

// The item picked in the room list (even if already shot: a second photo is fine), else the first item
// with no photo and no skip, or null when all are done.
export function nextItem(
  checklist: Item[],
  photos: Record<string, Photo>,
  skips: Record<string, Reason>,
  current?: string,
): Item | null {
  const picked = current && checklist.find((i) => i.key === current);
  if (picked) return picked;
  const shot = new Set(Object.values(photos).map((p) => p.item));
  return checklist.find((i) => !shot.has(i.key) && !skips[i.key]) ?? null;
}

// "Shot 3 of 36 · Exterior 3 of 15": position in the whole checklist, then within its section.
export function progress(checklist: Item[], item: Item): string {
  const sec = checklist.filter((i) => i.section === item.section);
  return `Shot ${checklist.indexOf(item) + 1} of ${checklist.length} · ${item.section} ${sec.indexOf(item) + 1} of ${sec.length}`;
}

// Oldest not-yet-uploaded photo, ignoring ids already given up on this run.
export function nextPending(photos: Record<string, Photo>, skip: Set<string>): Photo | null {
  return Object.values(photos).filter((p) => !p.uploaded && !skip.has(p.id)).sort((a, b) => a.at - b.at)[0] ?? null;
}

// Pick the "WxH" size whose long edge is closest to 2000, preferring >= 1600. Non-numeric presets ("Photo") are ignored.
export function pickSize(sizes: string[]): string | undefined {
  const parsed = sizes
    .map((s) => ({ s, edge: Math.max(...s.split('x').map(Number)) }))
    .filter((x) => Number.isFinite(x.edge) && x.edge > 0);
  const big = parsed.filter((x) => x.edge >= 1600);
  const pool = big.length ? big : parsed;
  return pool.sort((a, b) => Math.abs(a.edge - 2000) - Math.abs(b.edge - 2000))[0]?.s;
}

// "Oct 15"
export const day = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// Copy the EXIF block (dates, GPS) from one JPEG into a resized copy of it. The resized pixels are already upright,
// so Orientation is set to 1. Returns `dst` unchanged when `src` has no EXIF.
export function copyExif(src: Uint8Array, dst: Uint8Array): Uint8Array {
  const app1 = (b: Uint8Array) => {
    for (let i = 2; i + 4 < b.length && b[i] === 0xff && b[i + 1] !== 0xda; i += 2 + ((b[i + 2] << 8) | b[i + 3])) {
      if (b[i + 1] === 0xe1 && String.fromCharCode(...b.subarray(i + 4, i + 8)) === 'Exif') return [i, 2 + ((b[i + 2] << 8) | b[i + 3])];
    }
  };
  const s = app1(src);
  if (!s) return dst;
  const exif = src.slice(s[0], s[0] + s[1]);
  const t = 10; // TIFF header starts after FFE1, length, "Exif\0\0"
  const le = exif[t] === 0x49;
  const u16 = (o: number) => (le ? exif[o] | (exif[o + 1] << 8) : (exif[o] << 8) | exif[o + 1]);
  const ifd = t + (le ? u16(t + 4) | (u16(t + 6) << 16) : (u16(t + 4) << 16) | u16(t + 6));
  for (let e = ifd + 2, n = 0; n < u16(ifd) && e + 10 <= exif.length; n++, e += 12) {
    if (u16(e) === 0x0112) [exif[e + 8], exif[e + 9]] = le ? [1, 0] : [0, 1];
  }
  const d = app1(dst);
  const parts = [dst.subarray(0, 2), exif, ...(d ? [dst.subarray(2, d[0]), dst.subarray(d[0] + d[1])] : [dst.subarray(2)])];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  parts.reduce((at, p) => (out.set(p, at), at + p.length), 0);
  return out;
}
