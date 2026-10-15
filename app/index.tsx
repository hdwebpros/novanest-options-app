import { Link, Stack, router } from 'expo-router';
import { Alert, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { counts, day } from '../src/logic';
import { removeHouse, set, useStore, type House } from '../src/store';

export default function Houses() {
  const { houses, checklist, authFailed } = useStore();
  const all = Object.values(houses);
  const sections = [
    { title: 'In progress', data: all.filter((h) => !h.submittedAt).sort((a, b) => b.createdAt - a.createdAt) },
    { title: 'Submitted', data: all.filter((h) => h.submittedAt).sort((a, b) => b.submittedAt! - a.submittedAt!) },
  ].filter((x) => x.data.length);

  function line(h: House) {
    const n = Object.keys(h.photos).length;
    const { waiting, failed, done } = counts(h.photos, h.skips, checklist);
    return [
      h.submittedAt ? `Submitted ${day(h.submittedAt)} · ${n} photos` : checklist ? `${done} of ${checklist.length} shots` : `${n} photos`,
      waiting > 0 && `${waiting} waiting`,
      failed > 0 && `${failed} failed`,
    ]
      .filter(Boolean)
      .join(' · ');
  }

  function open(id: string) {
    set((s) => ({ ...s, active: id }));
    router.push('/rooms');
  }

  function remove(h: House) {
    const left = Object.values(h.photos).filter((p) => !p.uploaded).length;
    Alert.alert(
      'Remove this house from the phone?',
      'Photos already uploaded stay on the site.' + (left ? ` ${left} not uploaded yet will be lost.` : ''),
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => removeHouse(h.property.id) },
      ],
    );
  }

  return (
    <View style={s.page}>
      <Stack.Screen
        options={{
          title: 'Houses',
          headerRight: () => (
            <Link href="/settings" style={s.gear}>
              ⚙︎
            </Link>
          ),
        }}
      />
      {authFailed && <Text style={s.auth}>Secret is wrong. Tap the gear.</Text>}
      <SectionList
        sections={sections}
        keyExtractor={(h) => h.property.id}
        renderSectionHeader={({ section }) => <Text style={s.header}>{section.title}</Text>}
        renderItem={({ item: h }) => (
          <Pressable style={s.row} onPress={() => open(h.property.id)} onLongPress={() => remove(h)}>
            <Text style={s.address} numberOfLines={1}>
              {h.property.address}
            </Text>
            <Text style={s.sub}>{line(h)}</Text>
          </Pressable>
        )}
        ListEmptyComponent={<Text style={s.empty}>No houses yet.</Text>}
      />
      <Link href="/new" asChild>
        <Pressable style={s.button}>
          <Text style={s.buttonText}>New house</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fff' },
  header: { backgroundColor: '#f2f2f2', paddingVertical: 8, paddingHorizontal: 12, fontWeight: '700' },
  row: { padding: 14, gap: 2, borderBottomWidth: 1, borderColor: '#eee' },
  address: { fontSize: 16, fontWeight: '600' },
  sub: { color: '#555' },
  empty: { textAlign: 'center', color: '#888', fontSize: 16, marginTop: 48 },
  button: { margin: 16, marginBottom: 32, backgroundColor: '#111', borderRadius: 10, padding: 16, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  gear: { fontSize: 22, paddingHorizontal: 8 },
  auth: { padding: 12, color: '#b00020', fontWeight: '600' },
});
