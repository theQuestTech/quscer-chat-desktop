const { app, BrowserWindow, Tray, Menu, session, shell, ipcMain, nativeImage } = require("electron");
const path = require("path");
const Store = require("electron-store");
const { autoUpdater } = require("electron-updater");
const config = require("./config");

const store = new Store();
const SESSION_PARTITION = "persist:quscer-chat"; // keeps login cookies across restarts, like a real browser profile

let mainWindow = null;
let tray = null;
let isQuitting = false;
let currentUnreadCount = 0;

const CHAT_URL = `${config.BASE_URL}${config.CHAT_PATH}`;

function isMac() {
  return process.platform === "darwin";
}

// --------------------------------------------------------------------------
// Standard native menu. Without this, keyboard shortcuts like Cmd/Ctrl+C,
// Cmd/Ctrl+V and Cmd/Ctrl+A silently do nothing in the chat input box —
// Electron doesn't wire those up for free the way a real browser does.
// --------------------------------------------------------------------------
function buildAppMenu() {
  const template = [
    ...(isMac()
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "close" }],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// --------------------------------------------------------------------------
// Unread badge on the dock (mac) / taskbar overlay (win) / tray tooltip
// (linux, as a fallback since Linux has no standard overlay-icon API).
//
// This is best-effort: it watches the page title for a leading unread
// count, which is the common pattern chat web apps use for the browser
// tab title (e.g. "(3) Team Chat"). If your chat page doesn't already set
// its title that way, this silently does nothing — add a title update in
// useChatSocket (or wherever unread state lives) to light it up, or use
// the IPC channel below to set it explicitly and skip title-parsing.
// --------------------------------------------------------------------------
function setUnreadCount(count) {
  currentUnreadCount = count;

  if (isMac()) {
    app.dock.setBadge(count > 0 ? String(count) : "");
  } else if (process.platform === "win32" && mainWindow) {
    if (count > 0) {
      const overlay = nativeImage.createFromPath(
        path.join(__dirname, "..", "build", "badge.png")
      );
      mainWindow.setOverlayIcon(
        overlay.isEmpty() ? null : overlay,
        `${count} unread`
      );
    } else {
      mainWindow.setOverlayIcon(null, "");
    }
  }

  if (tray) {
    tray.setToolTip(count > 0 ? `Quscer Chat — ${count} unread` : "Quscer Chat");
  }
}

function parseUnreadFromTitle(title) {
  const match = title.match(/^\((\d+)\)/);
  return match ? parseInt(match[1], 10) : 0;
}

function createWindow() {
  const bounds = store.get("windowBounds") || {
    width: config.DEFAULT_WIDTH,
    height: config.DEFAULT_HEIGHT,
  };

  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: config.MIN_WIDTH,
    minHeight: config.MIN_HEIGHT,
    title: config.WINDOW_TITLE,
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: {
      partition: SESSION_PARTITION,
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadURL(CHAT_URL);

  // Remember window size/position between launches
  ["resize", "move"].forEach((evt) => {
    mainWindow.on(evt, () => {
      store.set("windowBounds", mainWindow.getBounds());
    });
  });

  // Keep the app running in the tray instead of fully quitting on close,
  // same pattern as Slack/Teams — chat should stay "live" for notifications.
  mainWindow.on("close", (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  // Any link that isn't part of your app domain should open in the
  // system browser, not inside the app window (e.g. links shared in chat).
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(config.BASE_URL)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(config.BASE_URL)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Best-effort unread badge from the page title (see parseUnreadFromTitle above)
  mainWindow.on("page-title-updated", (event, title) => {
    setUnreadCount(parseUnreadFromTitle(title));
  });

  mainWindow.on("focus", () => {
    // Clear the badge once they're actually looking at the app — matches
    // the "not actively looking at that chat" logic your notifications
    // already use.
    setUnreadCount(0);
  });
}

function createTray() {
  const trayIcon = nativeImage.createFromPath(
    path.join(__dirname, "..", "build", "trayIcon.png")
  );
  tray = new Tray(trayIcon.isEmpty() ? nativeImage.createEmpty() : trayIcon);
  tray.setToolTip("Quscer Chat");

  rebuildTrayMenu();

  tray.on("click", () => {
    mainWindow.isVisible() ? mainWindow.focus() : mainWindow.show();
  });
}

function rebuildTrayMenu() {
  const launchAtLogin = store.get("launchAtLogin", false);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Open Quscer Chat",
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      },
    },
    { type: "separator" },
    {
      label: "Launch at startup",
      type: "checkbox",
      checked: launchAtLogin,
      click: (menuItem) => {
        store.set("launchAtLogin", menuItem.checked);
        app.setLoginItemSettings({ openAtLogin: menuItem.checked });
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

function setupLoginItem() {
  // Respect whatever was last saved (defaults to off — don't surprise
  // people by adding yourself to startup without them opting in).
  const launchAtLogin = store.get("launchAtLogin", false);
  app.setLoginItemSettings({ openAtLogin: launchAtLogin });
}

// --------------------------------------------------------------------------
// Auto-update via electron-updater + GitHub Releases. This checks the
// "publish" config in package.json (owner/repo) for new releases.
//
// REQUIRES, before this does anything useful:
//   1. A GitHub repo at the owner/repo set in package.json's "publish" field
//      (currently theQuestTech/quscer-chat-desktop — change if that's not
//      the real repo you'll publish releases to).
//   2. Code signing set up for both mac and win (see README) — most
//      platforms refuse to silently auto-install an unsigned update.
//   3. Actually publishing built installers as GitHub Releases — running
//      `npm run dist` alone does NOT publish; that needs `electron-builder
//      --publish always` with a GH_TOKEN environment variable set, usually
//      done in CI, not by hand.
//
// Until all three are true, this checks safely (no errors, no crashes) but
// will simply never find an update to install — which is the correct
// no-op behavior until the release pipeline is actually set up.
function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-downloaded", () => {
    // Install on next quit rather than forcing an immediate restart —
    // less disruptive for someone mid-conversation in chat.
    if (tray) tray.setToolTip("Quscer Chat — update ready, will install on next restart");
  });

  autoUpdater.on("error", (err) => {
    console.error("Auto-update check failed:", err?.message || err);
  });

  // Check on launch, then every 4 hours — frequent enough to roll out fixes
  // reasonably fast, infrequent enough not to hammer GitHub's API.
  autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  }, 4 * 60 * 60 * 1000);
}

function setupIpc() {
  // Lets the web app set the unread count explicitly instead of relying
  // on title-parsing, if you wire up a small bridge in preload.js
  // (contextBridge.exposeInMainWorld) later. Safe to leave unused for now.
  ipcMain.on("set-unread-count", (event, count) => {
    if (typeof count === "number") setUnreadCount(count);
  });
}

function setupPermissions() {
  // Voice notes rely on MediaRecorder/getUserMedia — must explicitly allow
  // microphone access inside Electron's default-deny permission model.
  const ses = session.fromPartition(SESSION_PARTITION);
  ses.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ["media", "notifications", "clipboard-read"];
    callback(allowed.includes(permission));
  });
}

function setupNotifications() {
  // Electron implements the standard Web Notification API automatically —
  // the existing useChatSocket desktop-notification code will work as-is
  // and render as real native OS notifications. We just make sure clicking
  // one brings the window forward.
  app.on("browser-window-created", () => {
    // no-op placeholder: native Notification click handling is wired
    // per-notification below via a renderer-side hook if you want custom
    // click behavior beyond the OS default (see preload.js note).
  });
}

app.whenReady().then(() => {
  buildAppMenu();
  setupPermissions();
  setupLoginItem();
  setupIpc();
  createWindow();
  createTray();
  setupNotifications();
  setupAutoUpdater();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow.show();
  });
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("window-all-closed", () => {
  // Don't quit on close — app lives in the tray (see mainWindow "close" handler).
  // On Linux/Windows some setups still expect this; keep it explicit but inert
  // since we already prevent the close event above.
  if (process.platform === "darwin") return;
});
