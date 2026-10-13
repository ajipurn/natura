export type ScanFeedback = ReturnType<typeof createScanFeedback>;

/** Dibuat dari tombol buka scanner agar bunyi cadangan diizinkan oleh browser, termasuk Safari. */
export function createScanFeedback() {
  let audio: AudioContext | null = null;
  let disposed = false;
  try {
    if (typeof window.AudioContext === "function") {
      audio = new window.AudioContext();
      void audio.resume().catch(() => {});
    }
  } catch {
    // Feedback visual tetap tersedia jika perangkat menolak audio.
  }

  async function beep() {
    const context = audio;
    if (!context || disposed) return;
    try {
      if (context.state !== "running") await context.resume();
      if (disposed || context.state !== "running") return;
      const tone = context.createOscillator(), gain = context.createGain();
      const start = context.currentTime;
      tone.frequency.value = 1046;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.06, start + 0.005);
      gain.gain.linearRampToValueAtTime(0, start + 0.09);
      tone.connect(gain); gain.connect(context.destination);
      tone.onended = () => { tone.disconnect(); gain.disconnect(); };
      tone.start(start); tone.stop(start + 0.09);
    } catch {
      // Getar/bunyi tidak boleh menggagalkan pembacaan QR atau membuka rumah.
    }
  }

  return {
    play() {
      if (disposed) return;
      try {
        if (navigator.vibrate?.([60, 40, 60])) return;
      } catch {
        // Browser bisa menyediakan API tetapi menolak penggunaannya.
      }
      void beep();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      void audio?.close().catch(() => {});
    },
  };
}
