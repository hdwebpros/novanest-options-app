import { useEffect, useRef, useState } from 'react';
import { Link, Stack } from 'expo-router';
import { ActionSheetIOS, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Camera, CameraView } from 'expo-camera';
import { File } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { fetchChecklist } from '../src/api';
import { nextItem, pickSize, progress, type Reason } from '../src/logic';
import { photoFile, photosDir, set, useStore } from '../src/store';
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
  const { checklist, photos, skips, property } = useStore();
  const [perm, setPerm] = useState<'asking' | 'ok' | 'denied'>('asking');
  const [loadFailed, setLoadFailed] = useState(false);
  const [pictureSize, setPictureSize] = useState<string>();
  const [busy, setBusy] = useState(false);
  const cam = useRef<CameraView>(null);

  // Permission gate: ask everything once, up front. Only camera is blocking.
  useEffect(() => {
    (async () => {
      const c = await Camera.requestCameraPermissionsAsync();
      await Camera.requestMicrophonePermissionsAsync();
      const l = await Location.requestForegroundPermissionsAsync();
      if (l.granted) Location.getCurrentPositionAsync().catch(() => {}); // warm up last-known position
      setPerm(c.granted ? 'ok' : 'denied');
    })();
  }, []);

  function loadChecklist() {
    setLoadFailed(false);
    fetchChecklist()
      .then((items) => set((s) => ({ ...s, checklist: items })))
      .catch(() => setLoadFailed(true));
  }
  useEffect(loadChecklist, []);

  const all = Object.values(photos);
  const uploaded = all.filter((p) => p.uploaded).length;
  const header = `${uploaded} uploaded, ${all.length - uploaded} waiting${property?.token ? '' : ' · house not created yet'}`;
  const screen = (
    <Stack.Screen
      options={{
        title: header,
        headerTitleStyle: { fontSize: 14 },
        headerRight: () => (
          <Link href="/settings" style={s.gear}>
            ⚙︎
          </Link>
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
        <Text style={s.msg}>{loadFailed ? 'Need internet once to load the checklist.' : 'Loading checklist…'}</Text>
        {loadFailed && (
          <Pressable style={s.small} onPress={loadChecklist}>
            <Text style={s.smallText}>Try again</Text>
          </Pressable>
        )}
      </View>
    );

  const item = nextItem(checklist, photos, skips);

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
      set((st) => ({ ...st, photos: { ...st.photos, [id]: { id, item: item.key, uploaded: false, attempts: 0, at: Date.now() } } }));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      kick();
    } finally {
      setBusy(false);
    }
  }

  function skip() {
    if (!item) return;
    ActionSheetIOS.showActionSheetWithOptions(
      { options: [...SKIPS.map(([label]) => label), 'Cancel'], cancelButtonIndex: SKIPS.length, title: item.label },
      (i) => {
        if (i < SKIPS.length) set((st) => ({ ...st, skips: { ...st.skips, [item.key]: SKIPS[i][1] } }));
      },
    );
  }

  return (
    <View style={s.page}>
      {screen}
      {item ? (
        <>
          <CameraView ref={cam} style={s.camera} onCameraReady={onReady} pictureSize={pictureSize} />
          <View style={s.info}>
            <Text style={s.progress}>{progress(checklist, item)}</Text>
            <Text style={s.itemLabel}>{item.label}</Text>
            <Text style={s.instruction} numberOfLines={1}>
              {item.instruction}
            </Text>
          </View>
          <View style={s.controls}>
            <Pressable style={s.side} onPress={skip}>
              <Text style={s.sideText}>Skip</Text>
            </Pressable>
            <Pressable style={[s.shutter, busy && s.dim]} onPress={shoot} disabled={busy} accessibilityLabel="Take photo" />
            <View style={[s.side, s.dim]}>
              <Text style={s.sideText}>Mic</Text>
              <Text style={s.soon}>soon</Text>
            </View>
          </View>
        </>
      ) : (
        <View style={s.center}>
          <Text style={s.msg}>All done. Submit comes next slice.</Text>
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
  sideText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  soon: { color: '#aaa', fontSize: 11 },
  shutter: { width: 84, height: 84, borderRadius: 42, backgroundColor: '#fff', borderWidth: 6, borderColor: '#888' },
  dim: { opacity: 0.35 },
  gear: { fontSize: 22, paddingHorizontal: 8 },
});
