if (typeof startGameApp === "function" && !window.__AUTO_CHESS_APP_STARTED) {
  window.__AUTO_CHESS_APP_STARTED = true;
  window.__AUTO_CHESS_APP__ = startGameApp();
}
