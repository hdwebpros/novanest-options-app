import { Stack } from 'expo-router';
import { load } from '../src/store';
import { start } from '../src/uploader';
import { c } from '../src/ui';

// Sync read of state.json before the first render, then start the queue.
load();
start();

// Cold start from the settings deep link still has Houses beneath it. (`initialRouteName` is deprecated for `anchor`.)
export const unstable_settings = { anchor: 'index' };

export default function Layout() {
  return <Stack screenOptions={{ headerTintColor: c.primary, contentStyle: { backgroundColor: c.grouped }, headerStyle: { backgroundColor: c.grouped }, headerShadowVisible: false, headerBackTitle: 'Houses' }} />;
}
