// Kayıttaki zaman damgalı kareleri sabit 30 fps'lik kare dizisine çevirir; kesilen beklemeleri atar.
// Ses olaylarını video zamanına çevirip <klasör>/sfx.json'a yazar (music.py okur).
// Kullanım: node promo/kullanim-demosu/assemble.mjs <çalışma klasörü> [fps]
import fs from "node:fs";
import path from "node:path";

const DIR = process.argv[2];
const FPS = Number(process.argv[3] ?? 30);
const tl = JSON.parse(fs.readFileSync(path.join(DIR, "timeline.json"), "utf8"));
const cuts = tl.cuts.filter(([a, b]) => b > tl.start && a < tl.end).sort((x, y) => x[0] - y[0]);

/** duvar saati → video saniyesi (kesilen aralıklar çıkarılır) */
function toVideo(t) {
  let removed = 0;
  for (const [a, b] of cuts) {
    if (t >= b) removed += b - a;
    else if (t > a) removed += t - a;
  }
  return (t - tl.start - removed) / 1000;
}
/** video saniyesi → duvar saati */
function toWall(v) {
  let t = tl.start + v * 1000;
  for (const [a, b] of cuts) if (t >= a) t += b - a;
  return t;
}

const duration = toVideo(tl.end);
const frames = tl.frames.filter((f) => f.t <= tl.end).sort((a, b) => a.t - b.t);
const out = path.join(DIR, "frames");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
const n = Math.round(duration * FPS);
let j = 0;
for (let i = 0; i < n; i++) {
  const w = toWall(i / FPS);
  while (j + 1 < frames.length && frames[j + 1].t <= w) j++;
  fs.linkSync(path.join(DIR, "raw", frames[j].file), path.join(out, `${String(i).padStart(6, "0")}.jpg`));
}
const sfx = tl.events.filter((e) => e.t >= tl.start && e.t <= tl.end).map((e) => ({ ...e, t: Math.round(toVideo(e.t) * 1000) / 1000 }));
fs.writeFileSync(path.join(DIR, "sfx.json"), JSON.stringify({ duration, events: sfx }, null, 1));
console.log(`✓ ${n} kare (${duration.toFixed(1)} sn, ${FPS} fps), ${sfx.length} ses olayı`);
for (const e of sfx.filter((e) => e.type === "chapter")) console.log(`  ${e.t.toFixed(1).padStart(5)} sn  ${e.n} ${e.title}`);
