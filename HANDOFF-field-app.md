# Hand-off: NovaNest field capture app (iPhone)

Written 2026-10-15. Audience: a Claude Code session building the app, plus Ryan. Background: `~/Work/novanest/HANDOFF-options.md` (the site repo, github.com/hdwebpros/novanest). This app is a new front door to the same Options pipeline. Never change the site from this repo.

## One paragraph

Emily walks a property with her iPhone. The app tells her which shot is next, she taps once, the photo saves on the phone, uploads in the background, and the app moves to the next shot. She can record a voice note anywhere. When she's done she taps Submit. The house lands in the existing Options queue, Stevie researches it on his hourly poll, and Emily reviews it on novanest.homes/options/admin like any other assessment. The app holds no numbers and does no analysis. All brains stay on the site.

Background: Emily's "Deal Room" scope (`~/Downloads/NovaNest_Deal_Room_Developer_Package.zip`, 2026-10-15) asked for a lot more. The camera-first mockup in it is the design to follow. Everything not listed under "In" below is cut until Emily has used this for real.

## Decisions (2026-10-15, Ryan)

| Topic | Decision |
|---|---|
| Platform | iPhone only for now (Emily switches this weekend). Android later if a partner needs it. |
| Stack | Expo (React Native, TypeScript). Not Flutter: nobody here knows Dart. |
| Distribution | TestFlight. No App Store listing. Apple Developer account ($99/yr) under NovaNest. |
| Auth | The shared bearer secret `NUXT_OFFERS_API_SECRET` (same one Stevie uses). Typed once into the app's settings screen, kept in `expo-secure-store`. Never baked into the build. No user accounts. |
| EXIF | Kept. Whatever file the app uploads is stored byte-for-byte with its EXIF and GPS. Done on the site already (see "Site side, done"). |
| Photo size | Small. Capture at about 2000px on the long edge, JPEG quality around 0.8, so each photo is roughly 0.5 to 1 MB. No giant images. Pick the size at capture (`expo-camera` `pictureSize`) instead of resizing after: resizing with `expo-image-manipulator` throws away EXIF. iOS doesn't write GPS into camera captures on its own, so pass the current location in `additionalExif`. |
| Upload | Each photo uploads as it's taken. One small "submit" call at the end. Never one big payload. |
| Offline | Photos save to the app's own storage first, then a queue uploads them. The queue survives app kill and reboot. |
| Voice | Record audio, transcribe on the phone (iOS speech recognition), upload the text as a note. Audio file stays on the phone. |
| Checklist | Lives on the site, app fetches it. Changing the list never needs an app release. |

## In (v1)

1. **Settings screen.** Paste the secret once. Button to test it (calls `GET /api/options/pending`, expects 200).
2. **New property.** Address (plain text field, no autocomplete), county, property type, occupancy, finished sqft optional. Creates the assessment on the site.
3. **Capture screen** (mockup variant 1, camera-first). Live camera fills the top. Under it: the next required shot, one line of instruction, progress ("Exterior, 8 of 21"). Big Take photo button at the bottom. Skip and mic buttons either side. One tap saves, gives a short haptic, queues upload, advances.
4. **Skip with a reason.** Not there, can't get to it, unsafe. One tap each.
5. **Room list** (mockup variant 3) as the secondary view: sections with counts, tap one to jump there. Same screen shows the upload queue ("7 uploaded, 1 waiting").
6. **Voice note.** Mic button, tap to start, tap to stop. Transcript attaches to the current checklist item.
7. **Submit.** Lists anything required with no photo and no skip reason. Blocks until each has one. Waits for the queue to drain, then calls submit.

## Out (v1)

Roles, invites, Rachel's own login, Google Drive/Sheets/Docs generation, audit log, template editor UI, video, saving audio files, agent/seller summaries, address autocomplete, Android. Add each one when Emily asks for it after using the app.

## Site side, done (2026-10-15)

All bearer routes use `Authorization: Bearer <NUXT_OFFERS_API_SECRET>`. Contract lives in `server/utils/options/field.ts`.

- `GET /api/options/field/checklist` returns `{ items: [{ key, section, label, instruction, required, category }] }`. 36 items, 28 required. `category` is what the photo upload takes.
- `POST /api/options/field` with `{ id?, address, county, type, occupancy, finishedSqft? }` returns `{ token }`. `type` and `occupancy` use the same keys as the homeowner form. Send the app's own local `id` (8 to 64 chars): retrying with the same id returns the same token, so an offline retry never makes a duplicate house. Status starts `capturing`, hidden from Stevie.
- `POST /api/options/photos?token=…&category=…` (multipart, field `photo`, JPEG) with the bearer header is a field upload: keeps the untouched original with EXIF/GPS, no rate limit, up to 200 photos, works while `capturing`.
- `POST /api/options/field/:token/submit` with `{ notes?: [{ item?, text }], skipped?: [{ item, reason: "not_there" | "no_access" | "unsafe" }] }` flips to `needs_research`. 409 if no photos yet. Safe to retry: once submitted it just returns the current status. Notes and skips show on the admin page; Stevie never sees them.
- Admin list and page show a **Field** badge. Field houses have no goals, so the pathways show unranked (score column blank). They never expire.
- Photo retries: add `&id=<app's photo id>` (8 to 64 chars, letters, digits, `-`, `_`; a UUID works) to the upload URL. A retry with the same id returns the first upload instead of making a copy.
- iPhone shoots HEIC by default and the server's `sharp` can't read it. The app must capture JPEG.

## Gotchas

- Expo Go can't do the background upload queue reliably. Use a development build (`eas build --profile development`) from day one.
- Ask for camera, microphone and speech permissions on first launch, not mid-walkthrough.
- Gemini runs on a prepaid Google AI Studio project. On 2026-10-15 it returned 402 "prepayment credits are depleted" (Ryan restocking). When credits run out photos still upload; findings come back as "analysis failed".
- Small photos keep every upload well under Vercel's 4.5 MB request limit, so the existing upload route works as is. If anyone raises the capture size, that limit is the first thing to break.
- Never log photo contents, GPS, or the secret.

## Done means

On Emily's actual iPhone, with the phone in airplane mode, she captures 25 photos and two voice notes, kills the app, turns airplane mode off, reopens, and everything uploads once with no duplicates. Then she submits, the house shows up on the admin page with every original downloadable and EXIF intact, and Stevie picks it up on his next poll.
