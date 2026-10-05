/** PIN 4 angka acak, bukan yang mudah ditebak (1111, 1234, 4321). */
export function randomPin(): string {
  for (;;) {
    const pin = String(crypto.getRandomValues(new Uint32Array(1))[0] % 10_000).padStart(4, "0");
    const digits = [...pin].map(Number);
    const steps = new Set(digits.slice(1).map((d, i) => d - digits[i]));
    if (steps.size > 1 || ![0, 1, -1].includes([...steps][0])) return pin;
  }
}
