# Quscer Chat — Desktop App (v1 shell)

A native desktop wrapper around the existing Quscer OS chat experience
(`Frontend/src/app/(tenant)/chat/page.tsx`). No backend or frontend code
changes are required for this v1 — every feature that already works in
the browser (avatars, voice notes, pinning, desktop notifications, the
info modal) works identically here, because it's the same web app running
in a dedicated window instead of a browser tab.

## What this gives you over "just open it in Chrome"
- Its own icon in the dock/taskbar, separate from the browser
- Stays logged in between launches (persistent session, like a real profile)
- Runs in the system tray — closing the window doesn't kill it, so you keep
  getting real-time messages and native notifications in the background
- Native OS notifications instead of browser-tab notifications (your
  existing `useChatSocket` notification code needs zero changes — Electron
  implements the standard Web Notification API)
- Microphone access explicitly allowed for voice notes (Electron denies
  all permissions by default; this is granted in `src/main.js`)
- External links (shared in chat) open in the person's normal browser
  instead of hijacking the app window

## Setup

```bash
cd quscer-chat-desktop
npm install
```

Point it at your real deployment before running — edit `src/config.js`,
or set an environment variable:

```bash
QUSCER_BASE_URL=https://app.quscer.com npm start
```

## Run in development

```bash
npm start
```

This opens a window loading `${QUSCER_BASE_URL}/chat` and logs in exactly
like the browser version (same login page, same cookies/JWT flow).

## Icons (required before building installers)

Add these to `build/`:
- `icon.png` — 512x512, used for Linux and the tray fallback
- `icon.icns` — macOS icon (convert from a 1024x1024 PNG)
- `icon.ico` — Windows icon
- `trayIcon.png` — small (16x16–32x32) monochrome-friendly tray icon

Tools like [electron-icon-builder](https://www.npmjs.com/package/electron-icon-builder)
can generate all three formats from one source PNG.

## Build installers

```bash
npm run dist:mac    # .dmg / .zip
npm run dist:win    # .exe (NSIS installer)
npm run dist:linux  # AppImage / .deb
```

Output lands in `release/`.

## When the standalone, module-gated chat route ships

Change one line — `CHAT_PATH` in `src/config.js` — from `/chat` to
whichever route the standalone chat-only product uses (e.g. `/chat-app`).
Nothing else in this project needs to change: the shell doesn't care what
the page does, only where it points.

## Native features added
- **Edit/View/Window menu** — without this, Cmd/Ctrl+C, +V, +A silently do
  nothing in the message input on some platforms. Now wired via standard
  Electron menu roles.
- **Unread badge** — dock badge on macOS, taskbar overlay icon on Windows,
  tray tooltip fallback on Linux. Best-effort: it parses a leading
  `(3) Team Chat`-style count from the page `<title>`, the common pattern
  for browser-tab unread counts. If your chat page doesn't set its title
  that way, this does nothing automatically — **more reliable option:**
  call `window.quscerDesktop.setUnreadCount(n)` from your existing unread-count
  logic in `chat.ts` (only exists when running inside this desktop app —
  check `window.quscerDesktop?.isDesktopApp` first so the web version
  doesn't break).
- **Launch at startup** — toggle from the tray icon's right-click menu,
  off by default, persisted between launches.
- **Runs from the tray** — closing the window hides it rather than quitting,
  so real-time messages and notifications keep arriving in the background,
  same as Slack/Teams.

## Auto-update (now wired up, needs real setup to activate)
`electron-updater` is now active and checks for updates on launch and every
4 hours, but it needs three things to actually do anything:

1. **A real GitHub repo for releases.** `package.json`'s `build.publish`
   field is set to `theQuestTech/quscer-chat-desktop` — change this if
   that's not where you'll actually publish desktop builds.
2. **Code signing** (see below) — most OSes refuse to silently install an
   unsigned auto-update.
3. **Actually publishing releases.** `npm run dist` alone does NOT publish
   anywhere — you need `electron-builder --publish always` with a
   `GH_TOKEN` environment variable (a GitHub personal access token with
   repo permissions), typically run in CI (GitHub Actions) rather than by
   hand from your machine.

Until all three are true, the update check runs safely and just never
finds anything — no errors, no crashes, nothing breaks. It's a real,
working no-op until the pipeline exists.

## Code signing
- **macOS**: needs an Apple Developer Program membership ($99/year) and a
  "Developer ID Application" certificate. Set `CSC_LINK` (path or base64 of
  the .p12 cert) and `CSC_KEY_PASSWORD` as environment variables when
  running `npm run dist:mac`. Notarization (Apple's separate malware scan)
  is also expected for distribution outside your own team — a further step
  beyond signing itself.
- **Windows**: needs a code-signing certificate from a CA (e.g. DigiCert,
  SSL.com — typically $100–400/year, or a cheaper "OV" cert vs. pricier
  "EV" one that skips SmartScreen warnings faster). Set `CSC_LINK` and
  `CSC_KEY_PASSWORD` the same way for `npm run dist:win`.
- Without these, `npm run dist:*` still produces working installers — they
  just trigger an "unknown publisher" warning on install, which is fine
  for internal testing but not for handing this to real customers.

## Known limitations still open
- `build/badge.png` is referenced for the Windows taskbar overlay icon but
  not included — add a small (16x16–32x32) red-dot-style PNG there, or the
  overlay badge silently no-ops on Windows (macOS dock badge and the tray
  tooltip fallback don't need this file)
- **Token expiry mid-session**: if the web app's access token expires while
  this desktop app is open, the chat socket will disconnect and currently
  does NOT automatically reconnect with a refreshed token — the person
  would need to restart the app. This is actually a fix that belongs in the
  web app's `chat.ts` (the same file wrapped here), not in this Electron
  shell, since the shell just displays that page. Worth doing, but needs
  the actual token-refresh endpoint/flow your web app already uses
  elsewhere to be reused correctly rather than reinvented.
- This wraps the full tenant app login, not a chat-only auth flow — that's
  intentional until the module-gating/standalone route work is done
