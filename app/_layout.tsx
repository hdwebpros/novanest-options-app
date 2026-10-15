import { Stack } from 'expo-router';
import { load } from '../src/store';
import { start } from '../src/uploader';

// Sync read of state.json before the first render, then start the queue.
load();
start();

export default function Layout() {
  return <Stack />;
}
