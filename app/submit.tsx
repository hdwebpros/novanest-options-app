import { useEffect, useState } from 'react';
import { Stack, router } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { submitProperty } from '../src/api';
import { counts } from '../src/logic';
import { patchHouse, useHouse, useStore } from '../src/store';
import { kick } from '../src/uploader';

export default function Submit() {
  const { checklist, authFailed } = useStore();
  const house = useHouse();
  const [result, setResult] = useState<'sending' | 'done' | string>('');
  const { photos = {}, skips = {}, notes = [], property } = house ?? {};
  const all = Object.values(photos);
  const { waiting, failed, shot } = counts(photos, skips, checklist ?? null);
  const missing = (checklist ?? []).filter((i) => i.required && !shot.has(i.key) && !skips[i.key]);

  // ponytail: kicking every 5s overrides the uploader's 60s backoff while this screen is open; fine for one phone.
  useEffect(() => {
    if ((!waiting && property?.token) || authFailed) return;
    kick();
    const t = setInterval(kick, 5000);
    return () => clearInterval(t);
  }, [waiting, property?.token, authFailed]);

  async function submit() {
    if (!property?.token) return;
    setResult('sending');
    try {
      const res = await submitProperty(property.token, {
        notes,
        skipped: Object.entries(skips).map(([item, reason]) => ({ item, reason })),
      });
      if (res.ok) {
        patchHouse(property.id, { submittedAt: Date.now() });
        setResult('done');
      } else if (res.status === 409) setResult('The site has no photos for this house yet.');
      else setResult(`Submit failed (${res.status}). Try again.`);
    } catch {
      setResult('No connection. Try again.');
    }
  }

  const screen = <Stack.Screen options={{ title: 'Submit' }} />;

  if (result === 'done')
    return (
      <ScrollView contentContainerStyle={s.page}>
        {screen}
        <Text style={s.big}>Submitted. Emily's house is in the Options queue.</Text>
        <Pressable style={s.button} onPress={() => router.dismissAll()}>
          <Text style={s.buttonText}>Done</Text>
        </Pressable>
      </ScrollView>
    );

  if (!checklist)
    return (
      <ScrollView contentContainerStyle={s.page}>
        {screen}
        <Text>Checklist not loaded yet.</Text>
      </ScrollView>
    );

  if (missing.length)
    return (
      <ScrollView contentContainerStyle={s.page}>
        {screen}
        <Text style={s.big}>Still needed (photo or skip):</Text>
        {missing.map((i) => (
          <Text key={i.key} style={s.missing}>
            {i.section} · {i.label}
          </Text>
        ))}
        <Pressable style={s.button} onPress={() => router.dismissTo('/capture')}>
          <Text style={s.buttonText}>Back to capture</Text>
        </Pressable>
      </ScrollView>
    );

  const ready = waiting === 0 && !!property?.token && result !== 'sending';
  const confirm = () =>
    failed
      ? Alert.alert(`${failed} photo${failed > 1 ? 's' : ''} failed to upload`, 'Submit without them?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Submit', onPress: submit },
        ])
      : submit();
  return (
    <ScrollView contentContainerStyle={s.page}>
      {screen}
      <Text style={s.big}>{property?.address}</Text>
      <Text>
        {all.length} photos · {Object.keys(skips).length} skipped · {notes.length} notes
      </Text>
      <Text>{waiting ? `Uploading… ${waiting} left` : `${all.length - failed} uploaded`}</Text>
      {!property?.token && <Text>Creating the house on the site…</Text>}
      {authFailed && <Text style={s.error}>Secret is wrong. Tap the gear.</Text>}
      {failed > 0 && (
        <Pressable onPress={kick}>
          <Text style={s.error}>
            {failed} photo{failed > 1 ? 's' : ''} failed to upload, tap to retry
          </Text>
        </Pressable>
      )}
      <Pressable style={[s.button, !ready && s.disabled]} disabled={!ready} onPress={confirm}>
        <Text style={s.buttonText}>{result === 'sending' ? 'Submitting…' : 'Submit'}</Text>
      </Pressable>
      {result && result !== 'sending' && <Text style={s.error}>{result}</Text>}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: 16, gap: 10 },
  big: { fontSize: 18, fontWeight: '700' },
  missing: { fontSize: 16, color: '#d97706' },
  error: { color: '#b00020', fontWeight: '600' },
  button: { marginTop: 20, backgroundColor: '#111', borderRadius: 10, padding: 16, alignItems: 'center' },
  disabled: { opacity: 0.3 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
