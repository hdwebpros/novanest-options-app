import { useEffect, useState } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, getSecret, saveSecret } from '../src/api';
import { setAuthFailed } from '../src/store';
import { kick } from '../src/uploader';
import { c, press, ui } from '../src/ui';

export default function Settings() {
  const [secret, setSecret] = useState('');
  const [result, setResult] = useState<{ text: string; tone?: 'ok' | 'error' }>({ text: '' });
  // Deep link novanest-field://settings?secret=... (QR code on the laptop) fills the field; still tap Save or Test.
  const { secret: fromLink } = useLocalSearchParams<{ secret?: string }>();

  useEffect(() => {
    if (fromLink) return setSecret(fromLink);
    getSecret().then((v) => setSecret(v ?? ''));
  }, [fromLink]);

  async function save() {
    await saveSecret(secret.trim());
    setResult({ text: 'Saved.', tone: 'ok' });
    setAuthFailed(false);
    kick();
  }

  async function test() {
    setResult({ text: 'Checking…' });
    await saveSecret(secret.trim());
    try {
      const res = await api('/api/options/pending');
      setResult(
        res.status === 200
          ? { text: 'The secret works.', tone: 'ok' }
          : res.status === 401 || res.status === 403
            ? { text: 'The secret is wrong. Check it and try again.', tone: 'error' }
            : { text: `The site didn't answer (error ${res.status}). Try again later.`, tone: 'error' },
      );
      if (res.status === 200) {
        setAuthFailed(false);
        kick();
      }
    } catch {
      setResult({ text: 'No connection. Try again.', tone: 'error' });
    }
  }

  return (
    <ScrollView style={ui.page} contentContainerStyle={ui.form} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Settings' }} />
      <Text style={ui.label}>Secret</Text>
      <TextInput
        style={ui.input}
        value={secret}
        onChangeText={setSecret}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Paste the secret"
        placeholderTextColor={c.gray2}
      />
      <Text style={ui.sub}>You only need to enter this once.</Text>
      <View style={s.row}>
        <Pressable style={press(ui.btn, s.button)} onPress={save}>
          <Text style={ui.btnText}>Save</Text>
        </Pressable>
        <Pressable style={press(ui.btn, ui.btn2, s.button)} onPress={test}>
          <Text style={[ui.btnText, ui.btn2Text]}>Test</Text>
        </Pressable>
      </View>
      <Text style={result.tone ? ui[result.tone] : ui.sub}>{result.text}</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, marginTop: 12 },
  button: { flex: 1 },
});
