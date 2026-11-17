/// <reference types="node" />
// Run: node --test src/logic.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyExif, counts, nextItem, nextPending, pickSize, progress, type Item, type Photo } from './logic.ts';

const item = (key: string, section: string): Item => ({ key, section, label: key, instruction: '', required: true, category: 'c' });
const list = [item('a', 'Exterior'), item('b', 'Exterior'), item('c', 'Kitchen')];
const photo = (id: string, it: string, at: number, uploaded = false): Photo => ({ id, item: it, at, uploaded, attempts: 0 });

test('nextItem skips shot and skipped items, null when done', () => {
  assert.equal(nextItem(list, {}, {})?.key, 'a');
  assert.equal(nextItem(list, { p: photo('p', 'a', 1) }, {})?.key, 'b');
  assert.equal(nextItem(list, { p: photo('p', 'a', 1) }, { b: 'unsafe' })?.key, 'c');
  assert.equal(nextItem(list, { p: photo('p', 'a', 1), q: photo('q', 'c', 2) }, { b: 'unsafe' }), null);
});

test('nextItem returns current even when done, ignores unknown current', () => {
  const p = { p: photo('p', 'a', 1) };
  assert.equal(nextItem(list, p, {}, 'a')?.key, 'a');
  assert.equal(nextItem(list, p, { c: 'unsafe' }, 'c')?.key, 'c');
  assert.equal(nextItem(list, p, {}, 'gone')?.key, 'b');
  assert.equal(nextItem(list, p, {}, undefined)?.key, 'b');
});

test('progress is overall position, then position within section', () => {
  assert.equal(progress(list, list[1]), 'Shot 2 of 3 · Exterior 2 of 2');
  assert.equal(progress(list, list[2]), 'Shot 3 of 3 · Kitchen 1 of 1');
});

test('nextPending is oldest unuploaded, honours skip set', () => {
  const photos = { z: photo('z', 'a', 3), y: photo('y', 'b', 1), x: photo('x', 'c', 0, true) };
  assert.equal(nextPending(photos, new Set())?.id, 'y');
  assert.equal(nextPending(photos, new Set(['y']))?.id, 'z');
  assert.equal(nextPending(photos, new Set(['y', 'z'])), null);
});

test('pickSize prefers ~2000 long edge, >=1600', () => {
  const ios = ['3840x2160', '1920x1080', '1280x720', '640x480', '352x288', 'Photo', 'High', 'Medium', 'Low'];
  assert.equal(pickSize(ios), '1920x1080');
  assert.equal(pickSize(['4000x3000', '2048x1536', '1600x1200']), '2048x1536');
  assert.equal(pickSize(['1280x720', '640x480']), '1280x720');
  assert.equal(pickSize(['Photo']), undefined);
});

test('counts splits uploaded / waiting / failed, done = shot or skipped', () => {
  const photos = { u: photo('u', 'a', 1, true), w: photo('w', 'a', 2), f: { ...photo('f', 'c', 3), error: -1 } };
  const { shot, ...rest } = counts(photos, { b: 'unsafe' }, list);
  assert.deepEqual(rest, { uploaded: 1, waiting: 1, failed: 1, done: 3 });
  assert.deepEqual([...shot].sort(), ['a', 'c']);
});

test('copyExif moves EXIF into the resized JPEG and sets Orientation to 1', () => {
  // FFD8, APP1 "Exif\0\0" + little-endian TIFF with one IFD0 entry: Orientation (0x0112) = 6
  const tiff = [0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0];
  const body = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const src = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, body.length + 2, ...body, 0xff, 0xda, 9]);
  const dst = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 1, 2, 0xff, 0xda, 7]);
  const out = copyExif(src, dst);
  assert.deepEqual([...out.subarray(0, 4)], [0xff, 0xd8, 0xff, 0xe1]);
  assert.equal(out[4 + 2 + 6 + 18], 1); // Orientation value now 1
  assert.deepEqual([...out.subarray(-7)], [0xff, 0xe0, 0, 4, 1, 2, 0xff, 0xda, 7].slice(-7));
  assert.equal(copyExif(dst, dst), dst); // no EXIF in source: unchanged
});
