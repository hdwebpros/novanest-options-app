// Pure helpers, no RN/Expo imports, so `node --test src/logic.test.ts` can run them.
export type Item = { key: string; section: string; label: string; instruction: string; required: boolean; category: string };
export type Reason = 'not_there' | 'no_access' | 'unsafe';
export type Photo = { id: string; item: string; uploaded: boolean; attempts: number; at: number; error?: number };

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
