import { useState } from 'react';
import { Link, Redirect, Stack, router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { set, useStore } from '../src/store';
import { kick } from '../src/uploader';

const TYPES = [
  ['single_family', 'Single-family house'],
  ['townhome', 'Townhome'],
  ['condo', 'Condo'],
  ['duplex', 'Duplex'],
  ['triplex', 'Triplex'],
  ['fourplex', 'Fourplex'],
];
const OCCUPANCY = [
  ['owner', 'I live there'],
  ['tenant', 'A tenant lives there'],
  ['vacant', 'Nobody lives there'],
];

function Chips({ options, value, onChange }: { options: string[][]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={s.chips}>
      {options.map(([key, label]) => (
        <Pressable key={key} onPress={() => onChange(key)} style={[s.chip, value === key && s.chipOn]}>
          <Text style={value === key ? s.chipTextOn : undefined}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function NewProperty() {
  const { property } = useStore();
  const [address, setAddress] = useState('');
  const [county, setCounty] = useState('');
  const [type, setType] = useState('');
  const [occupancy, setOccupancy] = useState('');
  const [sqft, setSqft] = useState('');

  if (property) return <Redirect href="/capture" />;

  const sqftNum = sqft ? parseInt(sqft, 10) : undefined;
  const ok = address.trim() && county.trim() && type && occupancy && (sqft === '' || (sqftNum! > 0 && /^\d+$/.test(sqft)));

  function create() {
    // Saved locally first; the uploader does the POST (now, or later when online) with this same id.
    set((st) => ({
      ...st,
      property: {
        id: expo.uuidv4(),
        address: address.trim(),
        county: county.trim(),
        type,
        occupancy,
        finishedSqft: sqftNum,
      },
    }));
    kick();
    router.replace('/capture');
  }

  return (
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <Stack.Screen
        options={{
          title: 'New property',
          headerRight: () => (
            <Link href="/settings" style={s.gear}>
              ⚙︎
            </Link>
          ),
        }}
      />
      <Text style={s.label}>Address</Text>
      <TextInput style={s.input} value={address} onChangeText={setAddress} placeholder="123 Main St, City" />
      <Text style={s.label}>County</Text>
      <TextInput style={s.input} value={county} onChangeText={setCounty} />
      <Text style={s.label}>Type</Text>
      <Chips options={TYPES} value={type} onChange={setType} />
      <Text style={s.label}>Who lives there</Text>
      <Chips options={OCCUPANCY} value={occupancy} onChange={setOccupancy} />
      <Text style={s.label}>Finished sqft (optional)</Text>
      <TextInput style={s.input} value={sqft} onChangeText={setSqft} keyboardType="number-pad" />
      <Pressable style={[s.button, !ok && s.disabled]} disabled={!ok} onPress={create}>
        <Text style={s.buttonText}>Create</Text>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: 16, gap: 8 },
  label: { marginTop: 12, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, fontSize: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#999', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14 },
  chipOn: { backgroundColor: '#111', borderColor: '#111' },
  chipTextOn: { color: '#fff' },
  button: { marginTop: 24, backgroundColor: '#111', borderRadius: 10, padding: 16, alignItems: 'center' },
  disabled: { opacity: 0.3 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  gear: { fontSize: 22, paddingHorizontal: 8 },
});
