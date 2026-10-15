import { useEffect, useRef, useState } from 'react';
import { Link, Stack, router } from 'expo-router';
import { ActionSheetIOS, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Camera, CameraView } from 'expo-camera';
import { File } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { ExpoSpeechRecognitionModule as Speech, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { fetchChecklist } from '../src/api';
import { nextItem, pickSize, progress, type Reason } from '../src/logic';
import { get, photoFile, photosDir, set, useStore } from '../src/store';
import { kick } from '../src/uploader';

const SKIPS: [string, Reason][] = [
  ['Not there', 'not_there'],
  ["Can't get to it", 'no_access'],
  ['Unsafe', 'unsafe'],
];

// Flat GPS* keys with signed values: expo-camera's iOS code (CameraPhotoCapture.swift createGPSDict) builds the
// {GPS} dictionary itself, taking abs() and deriving the N/S, E/W refs from the sign. Never log these.
async function gpsExif(): Promise<Record<string, unknown>> {
  try {
    const loc =
      (await Location.getLastKnownPositionAsync({ maxAge: 120000 })) ??
      (await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise<null>((r) => setTimeout(() => r(null), 3000)),
      ]));
    if (!loc) return {};
    const iso = new Date(loc.timestamp).toISOString(); // UTC, as EXIF GPS wants
    return {
      GPSLatitude: loc.coords.latitude,
      GPSLongitude: loc.coords.longitude,
      ...(loc.coords.altitude != null && { GPSAltitude: loc.coords.altitude }),
      GPSDateStamp: iso.slice(0, 10).replace(/-/g, ':'),
      GPSTimeStamp: iso.slice(11, 19),
    };
  } catch {
    return {};
  }
}

export default function Capture() {
  const { checklist, photos, skips, property, notes, current } = useStore();
  const [perm, setPerm] = useState<'asking' | 'ok' | 'denied'>('asking');
  const [loadFailed, setLoadFailed] = useState<string>();
  const [pictureSize, setPictureSize] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<{ id: string; item: string; label: string }>(); // "✓ Saved: <label>" flash + Retake
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(savedTimer.current), []);
  const cam = useRef<CameraView>(null);
  const [speechOk, setSpeechOk] = useState(true);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  // The item is fixed at start (a photo mid-note advances the item). finals = finished chunks, interim = chunk in progress.
  const voice = useRef({ item: '', finals: '', interim: '' });
  function saveNote() {
    const { item, finals, interim } = voice.current;
    voice.current = { item: '', finals: '', interim: '' };
    const text = (finals + interim).trim();
    if (item && text) set((st) => ({ ...st, notes: [...st.notes, { item, text }] }));
  }

  // Never log transcript text.
  useSpeechRecognitionEvent('result', (e) => {
    const t = e.results[0]?.transcript ?? '';
    if (e.isFinal) {
      voice.current.finals += t;
      voice.current.interim = '';
    } else voice.current.interim = t;
    setInterim(voice.current.interim);
  });
  useSpeechRecognitionEvent('error', (e) => {
    if (e.error === 'not-allowed') setSpeechOk(false);
    setListening(false);
  });
  // 'end' fires after stop, error or abort: save whatever was heard.
  useSpeechRecognitionEvent('end', () => {
    setListening(false);
    setInterim('');
    saveNote();
  });
  // Leaving the screen mid-note: keep what was heard, then stop listening.
  useEffect(
    () => () => {
      saveNote();
      Speech.abort();
    },
    [],
  );

  // Permission gate: ask everything once, up front. Only camera is blocking.
  useEffect(() => {
    (async () => {
      const c = await Camera.requestCameraPermissionsAsync();
      await Camera.requestMicrophonePermissionsAsync();
      const l = await Location.requestForegroundPermissionsAsync();
      setSpeechOk((await Speech.requestPermissionsAsync()).granted);
      if (l.granted) Location.getCurrentPositionAsync().catch(() => {}); // warm up last-known position
      setPerm(c.granted ? 'ok' : 'denied');
    })();
  }, []);

  function loadChecklist() {
    setLoadFailed(undefined);
    fetchChecklist()
      .then((items) => set((s) => ({ ...s, checklist: items })))
      .catch((e: Error) =>
        setLoadFailed(/40[13]/.test(e.message) ? 'Secret is missing or wrong. Tap the gear and Test it.' : 'Need internet once to load the checklist.'),
      );
  }
  useEffect(loadChecklist, []);

  const all = Object.values(photos);
  const failed = all.filter((p) => !p.uploaded && p.error).length;
  const waiting = all.filter((p) => !p.uploaded).length - failed;
  const header = [
    waiting > 0 && `${waiting} waiting to upload`,
    failed > 0 && `${failed} failed`,
    waiting > 0 && !property?.token && 'house not created yet',
  ]
    .filter(Boolean)
    .join(' · ');
  const screen = (
    <Stack.Screen
      options={{
        headerBackTitle: 'Checklist',
        headerTitle: () => (
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
              {property?.address ?? 'NovaNest'}
            </Text>
            {!!header && <Text style={{ fontSize: 12, color: '#666' }}>{header}</Text>}
          </View>
        ),
      }}
    />
  );

  if (perm === 'asking') return <View style={s.center}>{screen}</View>;
  if (perm === 'denied')
    return (
      <View style={s.center}>
        {screen}
        <Text style={s.msg}>Camera access is off.</Text>
        <Pressable style={s.small} onPress={() => Linking.openSettings()}>
          <Text style={s.smallText}>Open Settings</Text>
        </Pressable>
      </View>
    );
  if (!checklist)
    return (
      <View style={s.center}>
        {screen}
        <Text style={s.msg}>{loadFailed ?? 'Loading checklist…'}</Text>
        {loadFailed && (
          <Pressable style={s.small} onPress={loadChecklist}>
            <Text style={s.smallText}>Try again</Text>
          </Pressable>
        )}
      </View>
    );

  const item = nextItem(checklist, photos, skips, current);
  const itemNotes = item ? notes.filter((n) => n.item === item.key).length : 0;
  const done = checklist.filter((i) => skips[i.key] || all.some((p) => p.item === i.key)).length;

  async function onReady() {
    const sizes = (await cam.current?.getAvailablePictureSizesAsync()) ?? [];
    const size = pickSize(sizes);
    console.log('pictureSize', size, 'from', sizes);
    setPictureSize(size);
  }

  async function shoot() {
    if (!item || busy || !cam.current) return;
    setBusy(true);
    try {
      // exif:true goes through CGImageDestination with UTType.jpeg on iOS, so the file is JPEG even though
      // the sensor captures HEVC (CameraPhotoCapture.swift / ExpoCameraUtils.data).
      const pic = await cam.current.takePictureAsync({ quality: 0.8, exif: true, additionalExif: await gpsExif() });
      const id = expo.uuidv4();
      photosDir().create({ intermediates: true, idempotent: true });
      new File(pic.uri).moveSync(photoFile(id));
      set((st) => ({ ...st, current: undefined, photos: { ...st.photos, [id]: { id, item: item.key, uploaded: false, attempts: 0, at: Date.now() } } }));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setSaved({ id, item: item.key, label: item.label });
      clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(undefined), 5000);
      if (listening && !nextItem(checklist!, get().photos, skips)) Speech.stop(); // last shot: end the note so it saves
      kick();
    } finally {
      setBusy(false);
    }
  }

  // Not uploaded: drop the photo and its file. Uploaded: no delete API, so just go back to that item for another shot.
  // The uploader's patchPhoto is a no-op for a removed id, so an upload finishing late can't bring it back.
  function retake() {
    if (!saved) return;
    clearTimeout(savedTimer.current);
    setSaved(undefined);
    const p = get().photos[saved.id];
    if (p && !p.uploaded) {
      set((st) => {
        const photos = { ...st.photos };
        delete photos[p.id];
        return { ...st, photos, current: p.item };
      });
      try {
        photoFile(p.id).delete();
      } catch {}
    } else set((st) => ({ ...st, current: saved.item }));
  }

  function mic() {
    if (!speechOk) return Linking.openSettings();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (listening) return Speech.stop();
    if (!item) return;
    voice.current = { item: item.key, finals: '', interim: '' };
    setListening(true);
    // No recordingOptions: audio is never written to disk.
    Speech.start({ lang: 'en-US', interimResults: true, continuous: true, requiresOnDeviceRecognition: true });
  }

  function skip() {
    if (!item) return;
    ActionSheetIOS.showActionSheetWithOptions(
      { options: [...SKIPS.map(([label]) => label), 'Cancel'], cancelButtonIndex: SKIPS.length, title: item.label },
      (i) => {
        if (i < SKIPS.length) set((st) => ({ ...st, current: undefined, skips: { ...st.skips, [item.key]: SKIPS[i][1] } }));
      },
    );
  }

  return (
    <View style={s.page}>
      {screen}
      {item ? (
        <>
          <CameraView ref={cam} style={s.camera} onCameraReady={onReady} pictureSize={pictureSize} />
          <View style={s.bar}>
            <View style={[s.barFill, { width: `${(done / checklist.length) * 100}%` }]} />
          </View>
          <View style={s.info}>
            {saved ? (
              <View style={s.savedRow}>
                <Text style={s.saved}>✓ Saved: {saved.label}</Text>
                <Pressable onPress={retake} hitSlop={12}>
                  <Text style={s.retake}>{photos[saved.id]?.uploaded ? 'Shoot again' : 'Retake'}</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => router.back()}>
                <Text style={s.progress}>{progress(checklist, item)}   See all ›</Text>
              </Pressable>
            )}
            <Text style={s.itemLabel}>{item.label}</Text>
            <Text style={s.instruction} numberOfLines={3}>
              {item.instruction}
            </Text>
            {listening ? (
              <Text style={s.interim} numberOfLines={2}>
                {interim || 'Listening…'}
              </Text>
            ) : (
              itemNotes > 0 && <Text style={s.progress}>{itemNotes === 1 ? '1 note' : `${itemNotes} notes`}</Text>
            )}
          </View>
          <View style={s.controls}>
            <Pressable style={s.side} onPress={skip}>
              <Text style={s.sideText}>Skip</Text>
            </Pressable>
            <Pressable style={[s.shutter, busy && s.dim]} onPress={shoot} disabled={busy} accessibilityLabel="Take photo" />
            <Pressable style={[s.side, listening && s.rec, !speechOk && s.dim]} onPress={mic}>
              <Text style={s.sideText}>{listening ? 'Stop note' : speechOk ? 'Voice note' : 'Speech off'}</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <View style={s.center}>
          <Link href="/submit" asChild>
            <Pressable style={s.button}>
              <Text style={s.buttonText}>Review and submit</Text>
            </Pressable>
          </Link>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16, backgroundColor: '#fff' },
  msg: { fontSize: 17, textAlign: 'center' },
  small: { backgroundColor: '#111', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 18 },
  smallText: { color: '#fff', fontWeight: '600' },
  camera: { flex: 6 },
  info: { flex: 2, padding: 14, gap: 4, justifyContent: 'center' },
  progress: { color: '#aaa', fontSize: 13 },
  itemLabel: { color: '#fff', fontSize: 20, fontWeight: '700' },
  instruction: { color: '#ddd', fontSize: 15 },
  controls: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingBottom: 20 },
  side: { width: 70, height: 70, alignItems: 'center', justifyContent: 'center' },
  sideText: { color: '#fff', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  interim: { color: '#f66', fontSize: 14, fontStyle: 'italic' },
  rec: { backgroundColor: '#d00', borderRadius: 35 },
  shutter: { width: 84, height: 84, borderRadius: 42, backgroundColor: '#fff', borderWidth: 6, borderColor: '#888' },
  dim: { opacity: 0.35 },
  bar: { height: 3, backgroundColor: '#333' },
  barFill: { height: 3, backgroundColor: '#fff' },
  saved: { color: '#6c6', fontSize: 13, fontWeight: '600' },
  savedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  retake: { color: '#fff', fontSize: 13, fontWeight: '600' },
  button: { alignSelf: 'stretch', margin: 16, backgroundColor: '#111', borderRadius: 10, padding: 16, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
