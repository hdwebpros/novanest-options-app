import { useState } from 'react';
import { Stack, router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { set } from '../src/store';
import { kick } from '../src/uploader';
import { c, press, radius, ui } from '../src/ui';

const TYPES = [
  ['single_family', 'Single-family house'],
  ['townhome', 'Townhome'],
  ['condo', 'Condo'],
  ['duplex', 'Duplex'],
  ['triplex', 'Triplex'],
  ['fourplex', 'Fourplex'],
];
const OCCUPANCY = [
  ['owner', 'The owner'],
  ['tenant', 'A tenant'],
  ['vacant', 'Nobody'],
];

function Chips({ options, value, onChange }: { options: string[][]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={s.chips}>
      {options.map(([key, label]) => (
        <Pressable key={key} onPress={() => onChange(key)} style={press(s.chip, value === key && s.chipOn)} accessibilityState={{ selected: value === key }}>
          <Text style={[ui.body, value === key && s.chipTextOn]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function NewHouse() {
  const [address, setAddress] = useState('');
  const [county, setCounty] = useState('');
  const [type, setType] = useState('');
  const [occupancy, setOccupancy] = useState('');
  const [sqft, setSqft] = useState('');

  const sqftNum = sqft ? parseInt(sqft, 10) : undefined;
  const ok = address.trim() && county.trim() && type && occupancy && (sqft === '' || (sqftNum! > 0 && /^\d+$/.test(sqft)));

  function create() {
    // Saved locally first; the uploader does the POST (now, or later when online) with this same id.
    const id = expo.uuidv4();
    set((st) => ({
      ...st,
      active: id,
      houses: {
        ...st.houses,
        [id]: {
          property: { id, address: address.trim(), county: county.trim(), type, occupancy, finishedSqft: sqftNum },
          photos: {},
          skips: {},
          notes: [],
          createdAt: Date.now(),
        },
      },
    }));
    kick();
    // Houses -> Checklist -> Camera, so Camera's back button lands on the Checklist.
    router.replace('/rooms');
    router.push('/capture');
  }

  return (
    <ScrollView style={ui.page} contentContainerStyle={ui.form} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'New house' }} />
      <Text style={ui.label}>Address</Text>
      <TextInput style={ui.input} value={address} onChangeText={setAddress} placeholder="123 Main St, City" placeholderTextColor={c.gray2} />
      <Text style={ui.label}>County</Text>
      <TextInput style={ui.input} value={county} onChangeText={setCounty} />
      <Text style={ui.label}>Type</Text>
      <Chips options={TYPES} value={type} onChange={setType} />
      <Text style={ui.label}>Who lives there</Text>
      <Chips options={OCCUPANCY} value={occupancy} onChange={setOccupancy} />
      <Text style={ui.label}>Finished square feet (optional)</Text>
      <TextInput style={ui.input} value={sqft} onChangeText={setSqft} keyboardType="number-pad" />
      <Pressable style={press(ui.btn, s.create, !ok && ui.off)} disabled={!ok} onPress={create}>
        <Text style={ui.btnText}>Create house</Text>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: c.line, backgroundColor: c.bg, borderRadius: radius, paddingVertical: 10, paddingHorizontal: 14 },
  chipOn: { backgroundColor: c.primary, borderColor: c.primary },
  chipTextOn: { color: '#fff' },
  create: { marginTop: 24 },
});
