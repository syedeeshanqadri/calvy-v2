// Generates public/sounds/new-booking.wav: a short, bright, loud two-note "ding-ding" (about 1 s), normalised to -0.2 dBFS.
//   node scripts/make-chime.mjs
// No dependencies; 16-bit mono PCM at 44.1 kHz so every browser (including iOS Safari) plays it.
import fs from "node:fs";

const RATE = 44100, DURATION = 1.05;
const samples = new Float64Array(Math.floor(RATE * DURATION));

// Each note: fundamental + overtones that give a bell-like attack, with a fast attack and an exponential decay.
function note(freq, start, length, gain) {
  const harmonics = [[1, 1.0], [2, 0.55], [3, 0.3], [4.2, 0.18], [5.4, 0.08]]; // slightly inharmonic overtones = bell, not organ
  const first = Math.floor(start * RATE);
  for (let i = 0; i < Math.floor(length * RATE) && first + i < samples.length; i++) {
    const t = i / RATE;
    const attack = Math.min(1, t / 0.004);
    const decay = Math.exp(-t * 5.2);
    let v = 0;
    for (const [m, a] of harmonics) v += a * Math.sin(2 * Math.PI * freq * m * t) * Math.exp(-t * (m - 1) * 1.4);
    samples[first + i] += gain * attack * decay * v;
  }
}
note(1318.5, 0.0, 0.7, 1.0);   // E6
note(1760.0, 0.17, 0.88, 1.0); // A6, a fourth above: reads as "new!"
note(2637.0, 0.17, 0.5, 0.25); // sparkle

let peak = 0;
for (const s of samples) peak = Math.max(peak, Math.abs(s));
const scale = 0.977 / peak; // -0.2 dBFS: as loud as a normalised file gets
const fade = Math.floor(0.02 * RATE);
const pcm = Buffer.alloc(samples.length * 2);
samples.forEach((s, i) => {
  const tail = Math.min(1, (samples.length - i) / fade); // 20 ms fade-out: no click at the end
  pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s * scale * tail)) * 32767), i * 2);
});

const header = Buffer.alloc(44);
header.write("RIFF", 0); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVE", 8); header.write("fmt ", 12);
header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(RATE, 24);
header.writeUInt32LE(RATE * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
fs.writeFileSync("public/sounds/new-booking.wav", Buffer.concat([header, pcm]));
console.log(`public/sounds/new-booking.wav: ${(pcm.length + 44) / 1024 | 0} KB, ${DURATION}s, peak ${(20 * Math.log10(0.977)).toFixed(1)} dBFS`);
