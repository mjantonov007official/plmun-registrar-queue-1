/** Short two-tone chime using Web Audio. Safe to call on the server (no-op). */
export function playChime() {
  if (typeof window === "undefined") return;
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const notes = [880, 659.25];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.35;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.35, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.65);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch {
    // audio not available
  }
}

/** Speak an announcement, e.g. "Now serving E 0 0 1 at Window 2". */
export function announce(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.92;
  u.lang = "en-US";
  window.speechSynthesis.speak(u);
}

/** Turns "E-001" into a speakable "E, 1". */
export function speakableCode(code: string) {
  const [prefix, num] = code.split("-");
  return `${prefix ?? ""}, ${Number(num ?? 0)}`;
}
