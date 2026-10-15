import { Stack, router } from 'expo-router';
import { ActionSheetIOS, Alert, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { counts, day } from '../src/logic';
import { removeHouse, set, useStore, type House } from '../src/store';
import { AUTH_MSG, press, ui } from '../src/ui';

export default function Houses() {
  const { houses, checklist, authFailed } = useStore();
  const insets = useSafeAreaInsets();
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
      waiting > 0 && `${waiting} to upload`,
      failed > 0 && `${failed} didn't upload`,
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

  function more(h: House) {
    ActionSheetIOS.showActionSheetWithOptions(
      { title: h.property.address, options: ['Remove from phone', 'Cancel'], destructiveButtonIndex: 0, cancelButtonIndex: 1 },
      (i) => {
        if (i === 0) remove(h);
      },
    );
  }

  return (
    <View style={ui.grouped}>
      <Stack.Screen
        options={{
          title: 'The Deal Room',
          headerRight: () => (
            <Pressable style={press(ui.icon)} onPress={() => router.push('/settings')} accessibilityLabel="Settings">
              <Text style={ui.iconText}>⚙︎</Text>
            </Pressable>
          ),
        }}
      />
      {authFailed && <Text style={[ui.error, ui.banner]}>{AUTH_MSG}</Text>}
      <SectionList
        sections={sections}
        keyExtractor={(h) => h.property.id}
        contentContainerStyle={!sections.length && s.fill}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={<Text style={[ui.sub, s.by]}>by NovaNest</Text>}
        renderSectionHeader={({ section }) => <Text style={ui.sectionHeader}>{section.title}</Text>}
        renderItem={({ item: h }) => (
          <Pressable style={press(ui.row)} onPress={() => open(h.property.id)} onLongPress={() => remove(h)}>
            <View style={s.text}>
              <Text style={s.address} numberOfLines={1}>
                {h.property.address}
              </Text>
              <Text style={ui.sub}>{line(h)}</Text>
            </View>
            <Pressable style={press(ui.icon)} onPress={() => more(h)} accessibilityLabel="More options">
              <Text style={ui.chevron}>⋯</Text>
            </Pressable>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={[ui.center, s.empty]}>
            <Text style={ui.title}>No houses yet</Text>
            <Text style={[ui.msg, ui.sub]}>Tap New house to start one.</Text>
          </View>
        }
      />
      <View style={[ui.footer, { paddingBottom: insets.bottom + 8 }]}>
        <Pressable style={press(ui.btn)} onPress={() => router.push('/new')}>
          <Text style={ui.btnText}>New house</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flexGrow: 1 },
  by: { paddingHorizontal: 16, paddingTop: 4 },
  empty: { backgroundColor: 'transparent', gap: 8 },
  text: { flex: 1, gap: 2 },
  address: { fontSize: 17, fontWeight: '600' },
});
