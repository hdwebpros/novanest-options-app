import { Stack, router } from 'expo-router';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { counts, day, SKIPS, type Item, type Reason } from '../src/logic';
import { patchHouse, useHouse, useStore } from '../src/store';
import { kick } from '../src/uploader';
import { c, press, ui } from '../src/ui';

const REASON = Object.fromEntries(SKIPS.map(([label, r]) => [r, label])) as Record<Reason, string>;

export default function Rooms() {
  const { checklist } = useStore();
  const house = useHouse();
  const insets = useSafeAreaInsets();
  if (!house) return null;
  const { photos, skips, property, submittedAt } = house;
  const all = Object.values(photos);
  const { uploaded, waiting, failed } = counts(photos, skips, checklist);
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
    patchHouse(property.id, { current: key });
    router.push('/capture');
  }

  return (
    <View style={ui.grouped}>
      <Stack.Screen options={{ title: property.address }} />
      <View style={[ui.banner, s.queue]}>
        <Text style={ui.sub}>
          {uploaded} uploaded · {waiting} to upload
        </Text>
        {failed > 0 && (
          <Pressable style={press(s.retry)} onPress={kick}>
            <Text style={ui.error}>{failed} didn’t upload. Tap to try again.</Text>
          </Pressable>
        )}
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(i) => i.key}
        stickySectionHeadersEnabled
        renderSectionHeader={({ section }) => (
          <Text style={ui.sectionHeader}>
            {section.title} · {section.data.filter((i) => count[i.key] || skips[i.key]).length} of {section.data.length} done
          </Text>
        )}
        renderItem={({ item: i }) => {
          const n = count[i.key];
          const skip = skips[i.key];
          return (
            <Pressable style={press(ui.row)} onPress={() => pick(i.key)}>
              <Text style={[ui.body, s.label]}>{i.label}</Text>
              {n ? (
                <Text style={ui.ok}>✓ {n}</Text>
              ) : skip ? (
                <Text style={ui.sub}>Skipped: {REASON[skip].toLowerCase()}</Text>
              ) : (
                i.required && <Text style={s.req}>Required</Text>
              )}
              <Text style={ui.chevron}>›</Text>
            </Pressable>
          );
        }}
      />
      <View style={[ui.footer, { paddingBottom: insets.bottom + 8 }]}>
        {submittedAt ? (
          <Text style={[ui.msg, ui.sub, s.done]}>Submitted {day(submittedAt)}</Text>
        ) : (
          <Pressable style={press(ui.btn)} onPress={() => router.push('/submit')}>
            <Text style={ui.btnText}>Submit</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  queue: { gap: 4, backgroundColor: c.bg, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.line },
  retry: { minHeight: 44, justifyContent: 'center' },
  label: { flex: 1 },
  req: { fontSize: 15, fontWeight: '600', color: c.accent },
  done: { paddingVertical: 14 },
});
