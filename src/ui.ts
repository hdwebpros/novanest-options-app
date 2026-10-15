import { StyleSheet, type PressableStateCallbackType, type StyleProp, type ViewStyle } from 'react-native';

// One palette, one radius, one text scale, one button set for every screen. Camera keeps its own black styles.
// NovaNest brand (site repo app/assets/css/tailwind.css). System fonts for now.
export const c = {
  text: '#090908',
  gray: '#7c7a6b', // brand gray: secondary text
  gray2: '#a3a193', // hints, chevrons
  line: '#e3e1d6', // light tint of brand gray
  bg: '#fff', // cards, rows, inputs
  grouped: '#fcf9ea', // ivory screen background
  primary: '#270010', // .btn-dark
  red: '#ee2a7b', // brand pink: the one accent (errors, required, retake, recording)
  accent: '#ee2a7b',
  green: '#248a3d',
};
export const radius = 10;
export const pad = 16;

// Shared pressed state: style={press(ui.btn)}. Not for Link asChild children (Link flattens function styles away).
export const press =
  (...st: StyleProp<ViewStyle>[]) =>
  ({ pressed }: PressableStateCallbackType) => [...st, pressed && ui.pressed];

export const AUTH_MSG = 'The secret is wrong. Fix it in Settings, the ⚙︎ on the Houses screen.';

export const ui = StyleSheet.create({
  page: { flex: 1, backgroundColor: c.grouped },
  grouped: { flex: 1, backgroundColor: c.grouped },
  form: { padding: pad, paddingBottom: 48, gap: 8 },
  // Empty, loading and error states: short centered message, at most one button.
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16, backgroundColor: c.grouped },
  msg: { fontSize: 17, color: c.text, textAlign: 'center' },
  title: { fontSize: 20, fontWeight: '700', color: c.text },
  body: { fontSize: 17, color: c.text },
  sub: { fontSize: 15, color: c.gray },
  label: { fontSize: 15, fontWeight: '600', color: c.text, marginTop: 12 },
  error: { fontSize: 15, fontWeight: '600', color: c.red },
  ok: { fontSize: 15, fontWeight: '600', color: c.green },
  banner: { paddingHorizontal: pad, paddingVertical: 12 },
  input: { borderWidth: 1, borderColor: c.line, borderRadius: radius, paddingHorizontal: 14, paddingVertical: 12, minHeight: 48, fontSize: 17, color: c.text, backgroundColor: c.bg },
  sectionHeader: { fontSize: 13, color: c.gray, textTransform: 'uppercase', paddingHorizontal: pad, paddingTop: 24, paddingBottom: 6, backgroundColor: c.grouped },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10, paddingLeft: pad, paddingRight: 8, backgroundColor: c.bg, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.line },
  chevron: { fontSize: 22, color: c.gray2, paddingHorizontal: 8 },
  footer: { paddingHorizontal: pad, paddingTop: 12, gap: 8 },
  btn: { minHeight: 52, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: c.primary },
  btnText: { fontSize: 17, fontWeight: '600', color: '#fff', textAlign: 'center' },
  btn2: { backgroundColor: c.bg, borderWidth: 1.5, borderColor: c.primary },
  btn2Text: { color: c.primary },
  icon: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 22, color: c.primary },
  off: { opacity: 0.3 },
  pressed: { opacity: 0.5 },
});
