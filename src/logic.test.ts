/// <reference types="node" />
// Run: node --test src/logic.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextItem, nextPending, pickSize, progress, type Item, type Photo } from './logic.ts';

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

test('progress is position within section', () => {
  assert.equal(progress(list, list[1]), 'Exterior, 2 of 2');
  assert.equal(progress(list, list[2]), 'Kitchen, 1 of 1');
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
