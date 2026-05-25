function createBattleDebugRuntime() {
  const MAX_ENTRIES = 600;
  let enabled = true;
  let entries = [];
  let sequence = 0;

  function trimEntries() {
    if (entries.length <= MAX_ENTRIES) {
      return;
    }
    entries = entries.slice(entries.length - MAX_ENTRIES);
  }

  function cloneValue(value) {
    if (value === null || value === undefined) {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map(cloneValue);
    }
    if (typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, cloneValue(inner)]));
    }
    return value;
  }

  function record(type, payload = {}) {
    if (!enabled) {
      return null;
    }

    const now =
      typeof window !== "undefined" && window.performance && typeof window.performance.now === "function"
        ? window.performance.now()
        : Date.now();

    const entry = {
      seq: ++sequence,
      t: Number(now.toFixed(2)),
      type,
      ...cloneValue(payload),
    };
    entries.push(entry);
    trimEntries();
    return entry;
  }

  function enable() {
    enabled = true;
    record("debug-enabled", { href: window.location.href });
    return true;
  }

  function disable() {
    if (enabled) {
      record("debug-disabled");
    }
    enabled = false;
    return false;
  }

  function clear() {
    entries = [];
    sequence = 0;
  }

  function dump(count = 80) {
    const safeCount = Math.max(1, Math.min(MAX_ENTRIES, Number(count) || 80));
    const slice = entries.slice(-safeCount);
    console.groupCollapsed(`[battle-debug] last ${slice.length} entries`);
    slice.forEach((entry) => console.log(entry));
    console.groupEnd();
    return slice;
  }

  function startBattleBuffer(metadata = {}) {
    enabled = true;
    clear();
    record("battle-buffer-start", metadata);
  }

  function formatCapture(payload = {}) {
    return JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        location: window.location.href,
        userAgent: window.navigator.userAgent,
        ...cloneValue(payload),
      },
      null,
      2
    );
  }

  async function copyText(text) {
    if (!text) {
      return false;
    }
    if (!window.isSecureContext || !window.navigator?.clipboard?.writeText) {
      return false;
    }
    await window.navigator.clipboard.writeText(text);
    return true;
  }

  function downloadText(text, filename = "battle-jitter-capture.json") {
    if (!text) {
      return false;
    }
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => {
      window.URL.revokeObjectURL(url);
    }, 0);
    return true;
  }

  record("debug-ready", { autoBuffer: true });

  return {
    get enabled() {
      return enabled;
    },
    enable,
    disable,
    clear,
    copyText,
    downloadText,
    dump,
    formatCapture,
    record,
    getEntries() {
      return entries.slice();
    },
    startBattleBuffer,
  };
}

window.__AUTO_CHESS_BATTLE_DEBUG__ = createBattleDebugRuntime();
