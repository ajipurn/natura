import { APP_TIMEZONE } from "./dates";

export const DEFAULT_RECORDING_WINDOW = { recordingStart: "20:00", recordingEnd: "00:00" };
export const RECORDING_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
export type RecordingWindow = typeof DEFAULT_RECORDING_WINDOW;

/** Cache lama di HP belum memiliki pengaturan jam. */
export function recordingWindow(settings: Partial<RecordingWindow> = {}): RecordingWindow {
  return {
    recordingStart: settings.recordingStart ?? DEFAULT_RECORDING_WINDOW.recordingStart,
    recordingEnd: settings.recordingEnd ?? DEFAULT_RECORDING_WINDOW.recordingEnd,
  };
}

const minutes = (time: string) => {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
};

/** Awal inklusif, akhir eksklusif; mendukung jam selesai selepas tengah malam. */
export function isRecordingTime(at: Date, settings: Partial<RecordingWindow> = {}): boolean {
  const { recordingStart, recordingEnd } = recordingWindow(settings);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIMEZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(at);
  const now = minutes(time);
  const start = minutes(recordingStart);
  const end = minutes(recordingEnd);
  return start < end ? now >= start && now < end : start > end && (now >= start || now < end);
}

export function recordingHoursLabel(settings: Partial<RecordingWindow> = {}): string {
  const { recordingStart, recordingEnd } = recordingWindow(settings);
  return `${recordingStart.replace(":", ".")}–${recordingEnd.replace(":", ".")} WIB`;
}
