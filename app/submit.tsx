import { useEffect, useState } from 'react';
import { Stack, router } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { submitProperty } from '../src/api';
import { counts } from '../src/logic';
import { patchHouse, useHouse, useStore } from '../src/store';
import { kick } from '../src/uploader';
import { AUTH_MSG, c, press, radius, ui } from '../src/ui';

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
      else setResult(`Couldn't submit (error ${res.status}). Try again.`);
    } catch {
      setResult('No connection. Try again.');
    }
  }

  const screen = <Stack.Screen options={{ title: 'Submit', headerBackTitle: 'Back' }} />;

  if (result === 'done')
    return (
      <View style={ui.center}>
        {screen}
        <Text style={ui.title}>Submitted</Text>
        <Text style={ui.msg}>The house is on the site, ready for review.</Text>
        <Pressable style={press(ui.btn, s.wide)} onPress={() => router.dismissAll()}>
          <Text style={ui.btnText}>Done</Text>
        </Pressable>
      </View>
    );

  if (!checklist)
    return (
      <View style={ui.center}>
        {screen}
        <Text style={ui.msg}>The checklist hasn’t loaded yet. Open the camera once with internet on.</Text>
      </View>
    );

  if (missing.length)
    return (
      <ScrollView style={ui.page} contentContainerStyle={ui.form}>
        {screen}
        <Text style={ui.title}>These still need a photo or a skip</Text>
        <View style={s.card}>
          {missing.map((i) => (
            <Text key={i.key} style={[ui.body, s.missing]}>
              {i.section} · {i.label}
            </Text>
          ))}
        </View>
        <Pressable style={press(ui.btn, s.gap)} onPress={() => router.dismissTo('/capture')}>
          <Text style={ui.btnText}>Back to camera</Text>
        </Pressable>
      </ScrollView>
    );

  const ready = waiting === 0 && !!property?.token && result !== 'sending';
  const confirm = () =>
    failed
      ? Alert.alert(`${failed} photo${failed > 1 ? 's' : ''} didn't upload`, 'Submit without them?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Submit', onPress: submit },
        ])
      : submit();
  return (
    <ScrollView style={ui.page} contentContainerStyle={ui.form}>
      {screen}
      <Text style={ui.title}>{property?.address}</Text>
      <Text style={ui.sub}>
        {all.length} photos · {Object.keys(skips).length} skipped · {notes.length} notes
      </Text>
      <View style={s.status}>
        {waiting > 0 && <ActivityIndicator color={c.gray} />}
        <Text style={ui.body}>{waiting ? `Uploading, ${waiting} left…` : `${all.length - failed} uploaded`}</Text>
      </View>
      {!property?.token && <Text style={ui.sub}>Adding the house to the site…</Text>}
      {authFailed && <Text style={ui.error}>{AUTH_MSG}</Text>}
      {failed > 0 && (
        <Pressable style={press(s.retry)} onPress={kick}>
          <Text style={ui.error}>
            {failed} photo{failed > 1 ? 's' : ''} didn’t upload. Tap to try again.
          </Text>
        </Pressable>
      )}
      <Pressable style={press(ui.btn, s.gap, !ready && ui.off)} disabled={!ready} onPress={confirm}>
        <Text style={ui.btnText}>{result === 'sending' ? 'Submitting…' : 'Submit'}</Text>
      </Pressable>
      {result && result !== 'sending' && <Text style={ui.error}>{result}</Text>}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wide: { alignSelf: 'stretch' },
  gap: { marginTop: 20 },
  card: { backgroundColor: c.bg, borderRadius: radius, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, paddingHorizontal: 16, paddingVertical: 4 },
  missing: { color: c.accent, paddingVertical: 10 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  retry: { minHeight: 44, justifyContent: 'center' },
});
