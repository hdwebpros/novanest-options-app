import { Link, Stack, router } from 'expo-router';
import { Alert, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import type { Item } from '../src/logic';
import { set, startOver, useStore } from '../src/store';
import { kick } from '../src/uploader';

const REASON = { not_there: 'not there', no_access: "can't get to it", unsafe: 'unsafe' };

export default function Rooms() {
  const { checklist, photos, skips, property } = useStore();
  const all = Object.values(photos);
  const uploaded = all.filter((p) => p.uploaded).length;
  const failed = all.filter((p) => !p.uploaded && p.error).length;
  const count: Record<string, number> = {};
  for (const p of all) count[p.item] = (count[p.item] ?? 0) + 1;

  // Sections in checklist order.
  const sections: { title: string; data: Item[] }[] = [];
  for (const i of checklist ?? []) {
    const sec = sections.find((x) => x.title === i.section);
    if (sec) sec.data.push(i);
    else sections.push({ title: i.section, data: [i] });
  }

  function pick(key: string) {
    set((s) => ({ ...s, current: key }));
    router.push('/capture');
  }

  return (
    <View style={s.page}>
      <Stack.Screen
        options={{
          title: property?.address ?? 'Checklist',
          headerRight: () => (
            <Link href="/settings" style={s.gear}>
              ⚙︎
            </Link>
          ),
        }}
      />
      <View style={s.queue}>
        <Text>
          {uploaded} uploaded, {all.length - uploaded - failed} waiting
        </Text>
        {failed > 0 && (
          <Pressable onPress={kick}>
            <Text style={s.failed}>{failed} failed (tap to retry)</Text>
          </Pressable>
        )}
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(i) => i.key}
        stickySectionHeadersEnabled
        renderSectionHeader={({ section }) => (
          <Text style={s.header}>
            {section.title} · {section.data.filter((i) => count[i.key] || skips[i.key]).length} of {section.data.length} done
          </Text>
        )}
        renderItem={({ item: i }) => {
          const n = count[i.key];
          const status = n ? `✓ ${n}` : skips[i.key] ? `skipped: ${REASON[skips[i.key]]}` : '';
          const missing = i.required && !status;
          return (
            <Pressable style={[s.row, missing && s.missing]} onPress={() => pick(i.key)}>
              <Text style={s.label}>
                {i.label}
                {missing && <Text style={s.req}> required</Text>}
              </Text>
              <Text style={s.status}>{status}</Text>
            </Pressable>
          );
        }}
      />
      <Link href="/submit" asChild>
        <Pressable style={s.button}>
          <Text style={s.buttonText}>Submit</Text>
        </Pressable>
      </Link>
      <Pressable
        onPress={() =>
          Alert.alert('Start over?', 'Drops this house on the phone. Photos already uploaded stay on the site.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Start over', style: 'destructive', onPress: startOver },
          ])
        }
      >
        <Text style={s.leave}>Not this house? Start over</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fff' },
  queue: { padding: 12, gap: 4, borderBottomWidth: 1, borderColor: '#eee' },
  failed: { color: '#b00020', fontWeight: '600' },
  header: { backgroundColor: '#f2f2f2', paddingVertical: 8, paddingHorizontal: 12, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderColor: '#eee' },
  missing: { borderLeftWidth: 4, borderLeftColor: '#d97706' },
  label: { flex: 1, fontSize: 16 },
  req: { color: '#d97706', fontSize: 12, fontWeight: '600' },
  status: { color: '#555' },
  button: { margin: 16, backgroundColor: '#111', borderRadius: 10, padding: 16, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  leave: { textAlign: 'center', color: '#b00020', paddingBottom: 24 },
  gear: { fontSize: 22, paddingHorizontal: 8 },
});
