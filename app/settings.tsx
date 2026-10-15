import { useEffect, useState } from 'react';
import { Stack, router } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { api } from '../src/api';
import { set } from '../src/store';
import { kick } from '../src/uploader';

export default function Settings() {
  const [secret, setSecret] = useState('');
  const [result, setResult] = useState('');

  useEffect(() => {
    SecureStore.getItemAsync('secret').then((v) => setSecret(v ?? ''));
  }, []);

  async function save() {
    await SecureStore.setItemAsync('secret', secret.trim());
    setResult('Saved');
    kick();
  }

  async function test() {
    setResult('Testing…');
    await SecureStore.setItemAsync('secret', secret.trim());
    try {
      const res = await api('/api/options/pending');
      setResult(res.status === 200 ? 'OK' : String(res.status));
      if (res.status === 200) kick();
    } catch {
      setResult('No connection');
    }
  }

  function startOver() {
    Alert.alert('Start over?', 'Clears the current property, photos list and skips on this phone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Start over',
        style: 'destructive',
        onPress: () => {
          // ponytail: photo files stay in documents/photos (never deleted this slice); add cleanup when storage matters.
          set((s) => ({ ...s, property: null, photos: {}, skips: {}, notes: [] }));
          if (router.canDismiss()) router.dismissAll();
          router.replace('/');
        },
      },
    ]);
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
      <Pressable style={[s.button, s.danger]} onPress={startOver}>
        <Text style={s.buttonText}>Start over</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  page: { padding: 16, gap: 12 },
  label: { fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, fontSize: 16 },
  row: { flexDirection: 'row', gap: 12 },
  button: { flex: 1, backgroundColor: '#111', borderRadius: 10, padding: 14, alignItems: 'center' },
  danger: { flex: 0, marginTop: 40, backgroundColor: '#b00020' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  result: { fontSize: 16, minHeight: 22 },
});
