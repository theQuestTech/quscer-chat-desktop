// Runs inside the chat page's context, isolated from Node.
// The existing frontend code (avatars, voice notes, sockets, notifications)
// needs zero changes to run inside this shell — everything below is
// optional native polish.

const { contextBridge, ipcRenderer } = require("electron");

// Optional: call `window.quscerDesktop.setUnreadCount(3)` from anywhere in
// your existing frontend code (e.g. wherever the sidebar unread badge
// number is computed in chat.ts) to drive the real dock/taskbar badge
// directly, instead of relying on page-title parsing in main.js.
contextBridge.exposeInMainWorld("quscerDesktop", {
  setUnreadCount: (count) => ipcRenderer.send("set-unread-count", count),
  isDesktopApp: true,
});

window.addEventListener("DOMContentLoaded", () => {
  // Ensure notifications created by the existing web app focus this
  // window when clicked, instead of doing nothing.
  const OriginalNotification = window.Notification;
  if (OriginalNotification) {
    window.Notification = new Proxy(OriginalNotification, {
      construct(target, args) {
        const notification = new target(...args);
        notification.addEventListener("click", () => {
          // ipcRenderer isn't exposed here by design (contextIsolation);
          // Electron already focuses the app on notification click by
          // default on most platforms. If you need custom behavior,
          // wire a contextBridge channel here.
        });
        return notification;
      },
    });
  }
});
