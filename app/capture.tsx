import { useEffect, useRef, useState } from 'react';
import { Stack, router } from 'expo-router';
import { ActionSheetIOS, ActivityIndicator, Linking, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, CameraView } from 'expo-camera';
import { File } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { ExpoSpeechRecognitionModule as Speech, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { fetchChecklist } from '../src/api';
import { counts, nextItem, pickSize, progress, SKIPS } from '../src/logic';
import { get, patchHouse, photoFile, photosDir, set, useHouse, useStore } from '../src/store';
import { kick } from '../src/uploader';
import { AUTH_MSG, c, press, ui } from '../src/ui';

const MAX = 1.3; // Dynamic Type cap for the camera overlay, where space is tight

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
  const { checklist, authFailed } = useStore();
  const house = useHouse();
  const [perm, setPerm] = useState<'asking' | 'ok' | 'denied'>('asking');
  const [loadFailed, setLoadFailed] = useState<string>();
  const [pictureSize, setPictureSize] = useState<string>();
  const [busy, setBusy] = useState(false);
  const shooting = useRef(false); // state updates are async; a fast double-tap can get past `busy`
  const [saved, setSaved] = useState<{ id: string; item: string; label: string }>(); // "✓ Saved: <label>" flash + Retake
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(savedTimer.current), []);
  const cam = useRef<CameraView>(null);
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const fs = Math.min(fontScale, MAX);
  const [speechOk, setSpeechOk] = useState(true);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  // House and item are fixed at start (a photo mid-note advances the item). finals = finished chunks, interim = chunk in progress.
  const voice = useRef({ house: '', item: '', finals: '', interim: '' });
  function saveNote() {
    const { house, item, finals, interim } = voice.current;
    voice.current = { house: '', item: '', finals: '', interim: '' };
    const text = (finals + interim).trim();
    if (item && text) patchHouse(house, (h) => ({ notes: [...h.notes, { item, text }] }));
  }

  // Never log transcript text.
  useSpeechRecognitionEvent('result', (e) => {
    const t = e.results[0]?.transcript ?? '';
    if (e.isFinal) {
      voice.current.finals += t + ' ';
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
        setLoadFailed(/40[13]/.test(e.message) ? AUTH_MSG : 'No connection. The checklist needs internet the first time.'),
      );
  }
  useEffect(loadChecklist, []);

  if (!house) return null;
  const { photos, skips, property, notes, current, submittedAt } = house;
  const hid = property.id;

  const { waiting, failed, done } = counts(photos, skips, checklist);
  const header = [
    authFailed && 'The secret is wrong',
    waiting > 0 && `${waiting} to upload`,
    failed > 0 && `${failed} didn't upload`,
    waiting > 0 && !property.token && 'house not on the site yet',
  ]
    .filter(Boolean)
    .join(' · ');
  const screen = (
    <Stack.Screen
      options={{
        headerBackTitle: 'Checklist',
        headerTitle: () => (
          <View style={[s.head, { maxWidth: width - 160 }]}>
            <Text style={s.headTitle} numberOfLines={1}>
              {property.address}
            </Text>
            {!!header && (
              <Text style={[s.headSub, authFailed && { color: c.red }]} numberOfLines={1}>
                {header}
              </Text>
            )}
          </View>
        ),
      }}
    />
  );

  if (perm === 'asking') return <View style={ui.center}>{screen}</View>;
  if (perm === 'denied')
    return (
      <View style={ui.center}>
        {screen}
        <Text style={ui.msg}>The camera is turned off for this app. Turn it on in the iPhone Settings app.</Text>
        <Pressable style={press(ui.btn, s.wide)} onPress={() => Linking.openSettings()}>
          <Text style={ui.btnText}>Open Settings</Text>
        </Pressable>
      </View>
    );
  if (!checklist)
    return (
      <View style={ui.center}>
        {screen}
        {!loadFailed && <ActivityIndicator color={c.gray} />}
        <Text style={ui.msg}>{loadFailed ?? 'Loading the checklist…'}</Text>
        {loadFailed && (
          <Pressable style={press(ui.btn, s.wide)} onPress={loadChecklist}>
            <Text style={ui.btnText}>Try again</Text>
          </Pressable>
        )}
      </View>
    );

  const item = nextItem(checklist, photos, skips, current);
  const itemNotes = item ? notes.filter((n) => n.item === item.key).length : 0;

  async function onReady() {
    const sizes = (await cam.current?.getAvailablePictureSizesAsync()) ?? [];
    setPictureSize(pickSize(sizes));
  }

  async function shoot() {
    if (!item || busy || shooting.current || !cam.current) return;
    shooting.current = true;
    setBusy(true);
    try {
      // exif:true goes through CGImageDestination with UTType.jpeg on iOS, so the file is JPEG even though
      // the sensor captures HEVC (CameraPhotoCapture.swift / ExpoCameraUtils.data).
      const pic = await cam.current.takePictureAsync({ quality: 0.8, exif: true, additionalExif: await gpsExif() });
      const id = expo.uuidv4();
      photosDir().create({ intermediates: true, idempotent: true });
      new File(pic.uri).moveSync(photoFile(id));
      patchHouse(hid, (h) => ({ current: undefined, photos: { ...h.photos, [id]: { id, item: item.key, uploaded: false, attempts: 0, at: Date.now() } } }));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setSaved({ id, item: item.key, label: item.label });
      clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(undefined), 5000);
      if (listening && !nextItem(checklist!, get().houses[hid]?.photos ?? {}, skips)) Speech.stop(); // last shot: end the note so it saves
      kick();
    } finally {
      shooting.current = false;
      setBusy(false);
    }
  }

  // Never started uploading: drop the photo and its file. Otherwise the site may already have it (no delete API),
  // so just go back to that item for another shot.
  const deletable = (id: string) => {
    const p = get().houses[hid]?.photos[id];
    return !!p && !p.uploaded && !p.attempts;
  };
  function retake() {
    if (!saved) return;
    clearTimeout(savedTimer.current);
    setSaved(undefined);
    const { id, item: key } = saved;
    if (deletable(id)) {
      patchHouse(hid, (h) => {
        const photos = { ...h.photos };
        delete photos[id];
        return { photos, current: key };
      });
      try {
        photoFile(id).delete();
      } catch {}
    } else patchHouse(hid, { current: key });
  }

  function mic() {
    if (!speechOk) return Linking.openSettings();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (listening) return Speech.stop();
    if (!item) return;
    voice.current = { house: hid, item: item.key, finals: '', interim: '' };
    setListening(true);
    // No recordingOptions: audio is never written to disk.
    Speech.start({ lang: 'en-US', interimResults: true, continuous: true, requiresOnDeviceRecognition: true });
  }

  function skip() {
    if (!item) return;
    ActionSheetIOS.showActionSheetWithOptions(
      { options: [...SKIPS.map(([label]) => label), 'Cancel'], cancelButtonIndex: SKIPS.length, title: item.label },
      (i) => {
        if (i < SKIPS.length) patchHouse(hid, (h) => ({ current: undefined, skips: { ...h.skips, [item.key]: SKIPS[i][1] } }));
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
              <View style={s.top}>
                <Text style={[s.saved, s.grow]} numberOfLines={1} maxFontSizeMultiplier={MAX}>
                  ✓ Saved: {saved.label}
                </Text>
                <Pressable style={press(s.retake)} onPress={retake}>
                  <Text style={s.retakeText} maxFontSizeMultiplier={MAX}>
                    {deletable(saved.id) ? 'Retake' : 'Shoot again'}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <Pressable style={press(s.top)} onPress={() => router.back()}>
                <Text style={[s.progress, s.grow]} numberOfLines={1} maxFontSizeMultiplier={MAX}>
                  {progress(checklist, item)}
                </Text>
                <Text style={s.seeAll} maxFontSizeMultiplier={MAX}>
                  See all ›
                </Text>
              </Pressable>
            )}
            <Text style={s.itemLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={MAX}>
              {item.label}
            </Text>
            <Text style={[s.instruction, { minHeight: 3 * 20 * fs }]} numberOfLines={3} maxFontSizeMultiplier={MAX}>
              {item.instruction}
            </Text>
            <Text
              style={[listening ? s.interim : s.progress, { minHeight: 18 * fs }]}
              numberOfLines={1}
              ellipsizeMode="head"
              maxFontSizeMultiplier={MAX}
            >
              {listening ? interim || 'Listening…' : itemNotes ? (itemNotes === 1 ? '1 note' : `${itemNotes} notes`) : ''}
            </Text>
          </View>
          <View style={[s.controls, { paddingBottom: insets.bottom + 12 }]}>
            <Pressable style={press(s.side)} onPress={skip}>
              <Text style={s.sideText} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={MAX}>
                Skip
              </Text>
            </Pressable>
            <Pressable style={press(s.shutter, busy && s.dim)} onPress={shoot} disabled={busy} accessibilityLabel="Take photo">
              <View style={s.shutterInner} />
            </Pressable>
            {submittedAt ? (
              <View style={[s.side, s.hidden]} /> // the site ignores notes after submit
            ) : (
              <Pressable style={press(s.side, listening && s.rec, !speechOk && s.dim)} onPress={mic}>
                <Text style={s.sideText} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={MAX}>
                  {listening ? 'Stop note' : speechOk ? 'Voice note' : 'Voice off'}
                </Text>
              </Pressable>
            )}
          </View>
        </>
      ) : (
        <View style={ui.center}>
          {submittedAt ? (
            <Text style={ui.msg}>All shots done.</Text>
          ) : (
            <>
              <Text style={ui.msg}>All shots done.</Text>
              <Pressable style={press(ui.btn, s.wide)} onPress={() => router.push('/submit')}>
                <Text style={ui.btnText}>Review and submit</Text>
              </Pressable>
            </>
          )}
        </View>
      )}
    </View>
  );
}

// Black camera screen: its own styles, shared palette.
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#000' },
  wide: { alignSelf: 'stretch' },
  head: { alignItems: 'center' },
  headTitle: { fontSize: 17, fontWeight: '600', color: c.text },
  headSub: { fontSize: 12, color: c.gray },
  camera: { flex: 1 },
  bar: { height: 4, backgroundColor: '#3a3a3c' },
  barFill: { height: 4, backgroundColor: '#fff' },
  info: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8, gap: 2 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  grow: { flex: 1 },
  progress: { color: '#c7c7cc', fontSize: 14 },
  seeAll: { color: '#fff', fontSize: 14, fontWeight: '600' },
  saved: { color: '#30d158', fontSize: 15, fontWeight: '700' },
  retake: { minHeight: 44, minWidth: 88, paddingHorizontal: 16, borderRadius: 999, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
  retakeText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  itemLabel: { color: '#fff', fontSize: 22, fontWeight: '700' },
  instruction: { color: '#e5e5ea', fontSize: 16, lineHeight: 20 },
  interim: { color: '#ff8fbd', fontSize: 14, fontStyle: 'italic' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12 },
  side: { width: 104, minHeight: 56, paddingHorizontal: 10, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  sideText: { color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  hidden: { backgroundColor: 'transparent' },
  rec: { backgroundColor: c.accent },
  shutter: { width: 80, height: 80, borderRadius: 40, borderWidth: 5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#fff' },
  dim: { opacity: 0.35 },
});
