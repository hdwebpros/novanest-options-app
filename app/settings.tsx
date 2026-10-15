import { useEffect, useState } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { api } from '../src/api';
import { setAuthFailed } from '../src/store';
import { kick } from '../src/uploader';

export default function Settings() {
  const [secret, setSecret] = useState('');
  const [result, setResult] = useState('');
  // Deep link novanest-field://settings?secret=... (QR code on the laptop) fills the field; still tap Save or Test.
  const { secret: fromLink } = useLocalSearchParams<{ secret?: string }>();

  useEffect(() => {
    if (fromLink) return setSecret(fromLink);
    SecureStore.getItemAsync('secret').then((v) => setSecret(v ?? ''));
  }, [fromLink]);

  async function save() {
    await SecureStore.setItemAsync('secret', secret.trim());
    setResult('Saved');
    setAuthFailed(false);
    kick();
  }

  async function test() {
    setResult('Testing…');
    await SecureStore.setItemAsync('secret', secret.trim());
    try {
      const res = await api('/api/options/pending');
      setResult(res.status === 200 ? 'OK' : String(res.status));
      if (res.status === 200) {
        setAuthFailed(false);
        kick();
      }
    } catch {
      setResult('No connection');
    }
  }

  return (
    <View style={s.page}>
      <Stack.Screen options={{ title: 'Settings' }} />
      <Text style={s.label}>Secret</Text>
      <TextInput
        style={s.input}
        value={secret}
        onChangeText={setSecret}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Paste secret"
      />
      <View style={s.row}>
        <Pressable style={s.button} onPress={save}>
          <Text style={s.buttonText}>Save</Text>
        </Pressable>
        <Pressable style={s.button} onPress={test}>
          <Text style={s.buttonText}>Test</Text>
        </Pressable>
      </View>
      <Text style={s.result}>{result}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  page: { padding: 16, gap: 12 },
  label: { fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, fontSize: 16 },
  row: { flexDirection: 'row', gap: 12 },
  button: { flex: 1, backgroundColor: '#111', borderRadius: 10, padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  result: { fontSize: 16, minHeight: 22 },
});
