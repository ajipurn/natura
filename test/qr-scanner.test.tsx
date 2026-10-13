// @vitest-environment happy-dom
// @vitest-environment-options {"url":"https://app.clusternatura.com/"}
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QrScanner } from "@/components/qr-scanner";
import { createScanFeedback } from "@/lib/scan-feedback";

let root: Root;
let container: HTMLDivElement;
let capabilities: MediaTrackCapabilities & { torch?: boolean | boolean[] };
let track: MediaStreamTrack;
let getUserMedia: ReturnType<typeof vi.fn>;
let detect: ReturnType<typeof vi.fn<() => Promise<{ rawValue: string }[]>>>;
let vibrate: ReturnType<typeof vi.fn>;
const mediaDevicesDescriptor = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
const vibrateDescriptor = Object.getOwnPropertyDescriptor(navigator, "vibrate");

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vibrate = vi.fn(() => true);
  Object.defineProperty(navigator, "vibrate", { configurable: true, value: vibrate });
  vi.stubGlobal("AudioContext", undefined);
  detect = vi.fn(async () => []);
  capabilities = { torch: true };
  track = {
    getCapabilities: vi.fn(() => capabilities),
    applyConstraints: vi.fn(async () => {}),
    stop: vi.fn(),
  } as unknown as MediaStreamTrack;
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  getUserMedia = vi.fn(async () => stream);
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  vi.spyOn(HTMLMediaElement.prototype, "srcObject", "set").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "readyState", "get").mockReturnValue(2);
  vi.stubGlobal("BarcodeDetector", class {
    static async getSupportedFormats() { return ["qr_code"]; }
    detect() { return detect(); }
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  if (mediaDevicesDescriptor) Object.defineProperty(navigator, "mediaDevices", mediaDevicesDescriptor);
  else Reflect.deleteProperty(navigator, "mediaDevices");
  if (vibrateDescriptor) Object.defineProperty(navigator, "vibrate", vibrateDescriptor);
  else Reflect.deleteProperty(navigator, "vibrate");
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function render() {
  await act(async () => root.render(<QrScanner paused={false} onDetect={vi.fn()} onClose={vi.fn()} />));
}
const torchButton = () => document.querySelector<HTMLButtonElement>('button[aria-label="Nyalakan senter"]');

describe("Senter QR scanner", () => {
  it("menampilkan senter ketika kamera mendukungnya", async () => {
    await render();
    expect(torchButton()).not.toBeNull();
    await act(async () => torchButton()!.click());
    expect(track.applyConstraints).toHaveBeenCalledWith({ advanced: [{ torch: true }] });
    expect(document.querySelector('button[aria-label="Matikan senter"]')?.getAttribute("aria-pressed")).toBe("true");
  });

  it("menampilkan senter ketika kemampuan kamera baru tersedia setelah kamera mulai berjalan", async () => {
    capabilities = {};
    await render();
    expect(torchButton()).toBeNull();
    expect(track.getCapabilities).toHaveBeenCalledTimes(1);
    capabilities = { torch: true };
    await act(async () => vi.advanceTimersByTimeAsync(1500));
    expect(torchButton()).not.toBeNull();
  });

  it("tetap menyediakan tombol untuk mencoba lagi ketika senter gagal dinyalakan sementara", async () => {
    vi.mocked(track.applyConstraints).mockRejectedValueOnce(new DOMException("Kamera belum siap", "NotReadableError"));
    await render();
    await act(async () => torchButton()!.click());
    expect(torchButton()).not.toBeNull();
    expect(document.body.textContent).toContain("Senter belum bisa dinyalakan. Coba lagi.");
    await act(async () => torchButton()!.click());
    expect(document.querySelector('button[aria-label="Matikan senter"]')).not.toBeNull();
    expect(document.body.textContent).not.toContain("Senter belum bisa dinyalakan");
  });

  it.each([
    { label: "false", torch: false },
    { label: "[false]", torch: [false] },
    { label: "[]", torch: [] },
  ])("tidak menampilkan senter jika kemampuan torch adalah $label", async ({ torch }) => {
    capabilities = { torch };
    await render();
    await act(async () => vi.advanceTimersByTimeAsync(6000));
    expect(torchButton()).toBeNull();
    const checks = vi.mocked(track.getCapabilities).mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(6000));
    expect(track.getCapabilities).toHaveBeenCalledTimes(checks);
  });

  it("mengenali dukungan senter berupa daftar nilai sesuai spesifikasi", async () => {
    capabilities = { torch: [false, true] };
    await render();
    expect(torchButton()).not.toBeNull();
  });

  it("mencoba ulang ketika pembacaan kemampuan kamera belum siap", async () => {
    vi.mocked(track.getCapabilities).mockImplementationOnce(() => { throw new DOMException("Belum siap", "InvalidStateError"); });
    await render();
    expect(torchButton()).toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(1500));
    expect(torchButton()).not.toBeNull();
  });

  it("mencegah permintaan senter ganda selagi perubahan sebelumnya belum selesai", async () => {
    let finish: (() => void) | undefined;
    vi.mocked(track.applyConstraints).mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    await render();
    await act(async () => torchButton()!.click());
    expect(torchButton()?.disabled).toBe(true);
    await act(async () => torchButton()!.click());
    expect(track.applyConstraints).toHaveBeenCalledTimes(1);
    await act(async () => finish!());
    expect(document.querySelector<HTMLButtonElement>('button[aria-label="Matikan senter"]')?.disabled).toBe(false);
  });

  it("tetap bisa mencoba mematikan senter setelah kegagalan sementara", async () => {
    await render();
    await act(async () => torchButton()!.click());
    vi.mocked(track.applyConstraints).mockRejectedValueOnce(new DOMException("Sibuk", "NotReadableError"));
    const onButton = () => document.querySelector<HTMLButtonElement>('button[aria-label="Matikan senter"]');
    await act(async () => onButton()!.click());
    expect(onButton()?.getAttribute("aria-pressed")).toBe("true");
    expect(document.body.textContent).toContain("Senter belum bisa dimatikan. Coba lagi.");
    await act(async () => onButton()!.click());
    expect(torchButton()?.getAttribute("aria-pressed")).toBe("false");
  });

  it("menghentikan kamera dan pemeriksaan senter saat scanner ditutup", async () => {
    capabilities = {};
    await render();
    const checks = vi.mocked(track.getCapabilities).mock.calls.length;
    await act(async () => root.render(null));
    expect(track.stop).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(6000));
    expect(track.getCapabilities).toHaveBeenCalledTimes(checks);
  });

  it("tidak memeriksa senter jika scanner ditutup ketika pemutaran video masih menunggu", async () => {
    let finish: (() => void) | undefined;
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    await render();
    await act(async () => root.render(null));
    await act(async () => finish!());
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(track.getCapabilities).not.toHaveBeenCalled();
  });
});

function mockAudio() {
  const tone = { frequency: { value: 0 }, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() };
  const gain = { gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() };
  const audio = { state: "running", currentTime: 0, destination: {}, resume: vi.fn(async () => {}), close: vi.fn(async () => {}), createOscillator: vi.fn(() => tone), createGain: vi.fn(() => gain) };
  vi.stubGlobal("AudioContext", class { constructor() { return audio; } });
  return { audio, tone };
}

describe("Feedback hasil scan", () => {
  it("getar sekali untuk QR baru, tanpa berulang ketika QR tetap di depan kamera", async () => {
    const onDetect = vi.fn();
    detect.mockResolvedValue([{ rawValue: "QR1" }]);
    await act(async () => root.render(<QrScanner paused={false} onDetect={onDetect} onClose={vi.fn()} />));
    expect(vibrate).toHaveBeenCalledWith([60, 40, 60]);
    expect(document.body.textContent).toContain("QR terbaca");
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(vibrate).toHaveBeenCalledTimes(1); expect(onDetect).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toContain("QR terbaca");
    detect.mockResolvedValue([{ rawValue: "QR2" }]);
    await act(async () => vi.advanceTimersByTimeAsync(120));
    expect(vibrate).toHaveBeenCalledTimes(2); expect(onDetect).toHaveBeenLastCalledWith("QR2");
  });

  it("tidak memberi feedback saat dijeda dan baru memberi feedback saat scan diterima", async () => {
    const onDetect = vi.fn();
    detect.mockResolvedValue([{ rawValue: "QR1" }]);
    await act(async () => root.render(<QrScanner paused onDetect={onDetect} onClose={vi.fn()} />));
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(vibrate).not.toHaveBeenCalled(); expect(onDetect).not.toHaveBeenCalled();
    await act(async () => root.render(<QrScanner paused={false} onDetect={onDetect} onClose={vi.fn()} />));
    await act(async () => vi.advanceTimersByTimeAsync(120));
    expect(vibrate).toHaveBeenCalledTimes(1); expect(onDetect).toHaveBeenCalledTimes(1);
  });

  it.each(["absent", "denied", "throws"])("tetap membuka hasil scan dengan bunyi cadangan ketika getar %s", async (mode) => {
    const { audio, tone } = mockAudio(), onDetect = vi.fn();
    if (mode === "absent") Object.defineProperty(navigator, "vibrate", { configurable: true, value: undefined });
    if (mode === "denied") vibrate.mockReturnValue(false);
    if (mode === "throws") vibrate.mockImplementation(() => { throw new Error("Vibration blocked"); });
    detect.mockResolvedValue([{ rawValue: "QR1" }]);
    await act(async () => root.render(<QrScanner paused={false} onDetect={onDetect} onClose={vi.fn()} />));
    expect(onDetect).toHaveBeenCalledWith("QR1");
    expect(tone.start).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain("QR terbaca");
    await act(async () => root.render(null));
    expect(audio.close).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(tone.start).toHaveBeenCalledTimes(1);
  });

  it("tetap membaca QR dan memberi feedback visual ketika getar dan audio ditolak", async () => {
    const { audio } = mockAudio(), onDetect = vi.fn();
    vibrate.mockReturnValue(false); audio.state = "suspended";
    audio.resume.mockRejectedValue(new Error("Audio blocked"));
    detect.mockResolvedValue([{ rawValue: "QR1" }]);
    await act(async () => root.render(<QrScanner paused={false} onDetect={onDetect} onClose={vi.fn()} />));
    expect(onDetect).toHaveBeenCalledWith("QR1");
    expect(document.body.textContent).toContain("QR terbaca");
    expect(audio.createOscillator).not.toHaveBeenCalled();
  });

  it("feedback yang disiapkan lewat tombol tetap aktif pada StrictMode", async () => {
    const { audio, tone } = mockAudio(), onDetect = vi.fn();
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: undefined });
    const feedback = createScanFeedback();
    detect.mockResolvedValue([{ rawValue: "QR1" }]);
    await act(async () => root.render(<StrictMode><QrScanner paused={false} onDetect={onDetect} onClose={vi.fn()} feedback={feedback} /></StrictMode>));
    expect(onDetect).toHaveBeenCalledTimes(1); expect(tone.start).toHaveBeenCalledTimes(1);
    expect(audio.close).not.toHaveBeenCalled();
    await act(async () => root.render(null));
    feedback.dispose();
    expect(audio.close).toHaveBeenCalledTimes(1);
  });
});
