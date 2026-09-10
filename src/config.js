// ---------------------------------------------------------------------------
// Quscer Chat Desktop — configuration
//
// This is the single place you change when:
//  1) Pointing this shell at your real production Vercel URL
//  2) Later swapping to the standalone, module-gated chat-only route once
//     it exists (e.g. https://app.quscer.com/chat-app instead of the full
//     tenant shell) — just change CHAT_URL below, nothing else in this repo
//     needs to know the difference.
// ---------------------------------------------------------------------------

module.exports = {
  // Base URL of your deployed frontend. Point this at your Vercel
  // production domain. The app will load `${BASE_URL}${CHAT_PATH}`.
  BASE_URL: process.env.QUSCER_BASE_URL || "https://app.quscer.com",

  // Path to the chat experience. Today this is the tenant chat page
  // (requires normal Quscer OS login). Swap this to the future
  // standalone/chat-only route when it ships.
  CHAT_PATH: process.env.QUSCER_CHAT_PATH || "/chat",

  // Window defaults
  WINDOW_TITLE: "Quscer Chat",
  MIN_WIDTH: 900,
  MIN_HEIGHT: 600,
  DEFAULT_WIDTH: 1280,
  DEFAULT_HEIGHT: 800,
};
