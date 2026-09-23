/* Harmonograph: draws Lissajous figures and harmonograph pendulum drawings
   as SVG, from the frequency ratios of musical intervals. The figure can be
   drawn as a pen would trace it, animated, heard (Web Audio, one pendulum
   per ear), and saved as PNG or SVG. Plain JS, no dependencies.

   Lissajous:     x = sin(2π a t + δ)        y = sin(2π b t)
   Harmonograph:  two damped lateral pendulums, one per axis, plus an
                  optional rotary pendulum that swings the paper in a circle:
                  x = e^(-dt) [ sin(2π a t + δ) + m sin(2π r t + ρ) ]
                  y = e^(-dt) [ sin(2π b' t)    + m cos(2π r t + ρ) ]
                  with b' = b (1 + detune). */

const $ = (id) => document.getElementById(id);

const INTERVALS = [
  { id: "1:1", a: 1, b: 1, label: "Unison 1:1" },
  { id: "1:2", a: 1, b: 2, label: "Octave 1:2" },
  { id: "2:3", a: 2, b: 3, label: "Fifth 2:3" },
  { id: "3:4", a: 3, b: 4, label: "Fourth 3:4" },
  { id: "4:5", a: 4, b: 5, label: "Major third 4:5" },
  { id: "5:6", a: 5, b: 6, label: "Minor third 5:6" },
  { id: "3:5", a: 3, b: 5, label: "Major sixth 3:5" },
  { id: "5:8", a: 5, b: 8, label: "Minor sixth 5:8" },
  { id: "8:9", a: 8, b: 9, label: "Whole tone 8:9" },
  { id: "1:3", a: 1, b: 3, label: "Twelfth 1:3" },
];
const MODES = [
  { id: "harmonograph", label: "Harmonograph" },
  { id: "lissajous", label: "Lissajous" },
];
const LOOKS = [
  { id: "paper", label: "Ink on paper", bg: "#f6f1e4", ink: ["#1d2a44"] },
  { id: "gold", label: "Gold", bg: "#101218", ink: ["#f3d58a", "#c98b2e"] },
  { id: "neon", label: "Neon", bg: "#07070f", ink: ["#28e0ff", "#b04dff", "#ff4fa3"] },
  { id: "spectrum", label: "Spectrum", bg: "#0e1020", ink: ["#ff5a5a", "#ffb13b", "#f5e663", "#4fd67a", "#3db8ff", "#7a6bff", "#e05ad6"] },
  { id: "blueprint", label: "Blueprint", bg: "#123a6b", ink: ["#e8f1ff"] },
];

const DEFAULTS = {
  mode: "harmonograph",
  a: 2,
  b: 3,
  phase: 90, // degrees
  detune: 0.4, // percent
  damping: 0.35, // per 10 time units
  rotary: 0.35,
  rotFreq: 1.0, // as a multiple of a
  duration: 60, // time units (cycles of a 1-Hz pendulum)
  width: 1.1,
  look: "gold",
  tone: 220,
};
let S = { ...DEFAULTS };
try {
  Object.assign(S, JSON.parse(localStorage.getItem("harmonograph-settings") || "{}"));
} catch (e) {}
const save = () => {
  try {
    localStorage.setItem("harmonograph-settings", JSON.stringify(S));
  } catch (e) {}
};

const TAU = Math.PI * 2;
const V = 300; // half size of the drawing
const f1 = (v) => v.toFixed(1);

// ---------------------------------------------------------------- curves

const points = () => {
  const pts = [];
  const d = S.phase * (Math.PI / 180);
  if (S.mode === "lissajous") {
    // one full period when a and b are whole numbers (plus detune drift)
    const T = S.detune > 0 ? Math.min(S.duration, 40) : 1;
    const n = Math.round(Math.max(800, 1600 * T * Math.max(S.a, S.b) ** 0.5));
    const bb = S.b * (1 + S.detune / 100);
    for (let i = 0; i <= n; i++) {
      const t = (T * i) / n;
      pts.push([Math.sin(TAU * S.a * t + d), Math.sin(TAU * bb * t)]);
    }
    return pts;
  }
  const T = S.duration;
  const n = Math.round(Math.min(24000, 260 * T * Math.max(S.a, S.b, S.rotFreq * S.a) ** 0.7));
  const bb = S.b * (1 + S.detune / 100);
  const r = S.rotFreq * S.a;
  const k = S.damping / 10;
  const m = S.rotary;
  const scale = 1 / (1 + m);
  for (let i = 0; i <= n; i++) {
    const t = (T * i) / n;
    const e = Math.exp(-k * t) * scale;
    pts.push([
      e * (Math.sin(TAU * S.a * t + d) + m * Math.sin(TAU * r * t + d / 2)),
      e * (Math.sin(TAU * bb * t) + m * Math.cos(TAU * r * t + d / 2)),
    ]);
  }
  return pts;
};

const lookOf = () => LOOKS.find((l) => l.id === S.look) || LOOKS[0];

// Split the curve into runs so the color can change along its length
const figureSVG = (forExport) => {
  const c = lookOf();
  const pts = points();
  const R = V - 18;
  const runs = c.ink.length > 1 ? 90 : 1;
  const per = Math.ceil(pts.length / runs);
  const mix = (i) => {
    // color along the curve, blending through the look's inks
    const u = (i / Math.max(1, runs - 1)) * (c.ink.length - 1);
    const j = Math.min(c.ink.length - 2, Math.floor(u));
    if (c.ink.length === 1) return c.ink[0];
    const f = u - j;
    const h = (s) => [1, 3, 5].map((k) => parseInt(s.slice(k, k + 2), 16));
    const A = h(c.ink[j]), B = h(c.ink[j + 1]);
    return "#" + A.map((v, q) => Math.round(v + (B[q] - v) * f).toString(16).padStart(2, "0")).join("");
  };
  let o = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-V} ${-V} ${2 * V} ${2 * V}"${forExport ? "" : ' class="plain"'} role="img" aria-label="${S.mode === "lissajous" ? "Lissajous figure" : "Harmonograph drawing"} for the ratio ${S.a}:${S.b}">`;
  o += `<rect x="${-V}" y="${-V}" width="${2 * V}" height="${2 * V}" fill="${c.bg}"/>`;
  o += `<g id="figure" fill="none" stroke-width="${S.width}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${S.mode === "lissajous" ? 0.95 : 0.85}">`;
  for (let r = 0; r < runs; r++) {
    const seg = pts.slice(r * per, Math.min(pts.length, (r + 1) * per + 1));
    if (seg.length < 2) continue;
    const d = "M" + seg.map(([x, y]) => `${f1(x * R)} ${f1(-y * R)}`).join("L");
    o += `<path d="${d}" stroke="${mix(r)}"/>`;
  }
  o += `</g>`;
  if (!forExport) o += `<circle id="pen" r="3.5" fill="${c.ink[c.ink.length - 1]}" style="display:none"/>`;
  return o + "</svg>";
};

// ---------------------------------------------------------------- drawing animation

let raf = null;
const stopDraw = () => {
  if (raf) cancelAnimationFrame(raf);
  raf = null;
  $("draw").textContent = "Draw it";
  const pen = document.getElementById("pen");
  if (pen) pen.style.display = "none";
  document.querySelectorAll("#figure path").forEach((p) => {
    p.style.strokeDasharray = "";
    p.style.strokeDashoffset = "";
  });
};
const drawIt = () => {
  if (raf) return stopDraw();
  const paths = [...document.querySelectorAll("#figure path")];
  const lens = paths.map((p) => p.getTotalLength());
  const total = lens.reduce((s, v) => s + v, 0);
  paths.forEach((p, i) => {
    p.style.strokeDasharray = `${lens[i]} ${lens[i]}`;
    p.style.strokeDashoffset = lens[i];
  });
  const pen = document.getElementById("pen");
  pen.style.display = "";
  $("draw").textContent = "Stop";
  const secs = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0.01 : S.mode === "lissajous" ? 4 : 12;
  const t0 = performance.now();
  const step = (now) => {
    const done = Math.min(1, (now - t0) / 1000 / secs);
    let left = done * total;
    paths.forEach((p, i) => {
      const L = lens[i];
      const drawn = Math.max(0, Math.min(L, left));
      p.style.strokeDashoffset = L - drawn;
      if (drawn > 0 && drawn < L) {
        const q = p.getPointAtLength(drawn);
        pen.setAttribute("cx", q.x);
        pen.setAttribute("cy", q.y);
      }
      left -= L;
    });
    if (done < 1) raf = requestAnimationFrame(step);
    else stopDraw();
  };
  raf = requestAnimationFrame(step);
};

// ---------------------------------------------------------------- phase animation (Lissajous)

let spinRaf = null;
const stopSpin = () => {
  if (spinRaf) cancelAnimationFrame(spinRaf);
  spinRaf = null;
  $("spin").textContent = "Turn the phase";
};
const spin = () => {
  if (spinRaf) return stopSpin();
  stopDraw();
  $("spin").textContent = "Stop";
  let last = performance.now();
  const step = (now) => {
    S.phase = (S.phase + ((now - last) / 1000) * 30) % 360;
    last = now;
    $("phase").value = Math.round(S.phase);
    render(true);
    spinRaf = requestAnimationFrame(step);
  };
  spinRaf = requestAnimationFrame(step);
};

// ---------------------------------------------------------------- sound

let ctx = null, voices = null;
const soundOn = () => !!voices;
const startSound = () => {
  ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
  ctx.resume();
  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(ctx.destination);
  const make = (pan) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    g.gain.value = 0.22;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) {
      p.pan.value = pan;
      o.connect(g).connect(p).connect(out);
    } else o.connect(g).connect(out);
    o.start();
    return o;
  };
  voices = { out, x: make(-0.7), y: make(0.7) };
  tune();
  out.gain.setTargetAtTime(0.9, ctx.currentTime, 0.15);
  $("listen").textContent = "Silence";
  $("listen").setAttribute("aria-pressed", "true");
};
const stopSound = () => {
  if (!voices) return;
  const v = voices;
  voices = null;
  v.out.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
  setTimeout(() => { v.x.stop(); v.y.stop(); v.out.disconnect(); }, 600);
  $("listen").textContent = "Listen";
  $("listen").setAttribute("aria-pressed", "false");
};
// The x pendulum in the left ear, the y pendulum in the right, an octave-safe
// pitch: the lower of the two frequencies sits on the base tone.
const tune = () => {
  if (!voices) return;
  const low = Math.min(S.a, S.b);
  const fx = (S.tone * S.a) / low;
  const fy = ((S.tone * S.b) / low) * (1 + S.detune / 100);
  voices.x.frequency.setTargetAtTime(fx, ctx.currentTime, 0.03);
  voices.y.frequency.setTargetAtTime(fy, ctx.currentTime, 0.03);
};

// ---------------------------------------------------------------- UI

const gcd = (x, y) => (y ? gcd(y, x % y) : x);

const setPressed = (id, items, cur) => {
  document.querySelectorAll(`#${id} button`).forEach((b, i) => {
    const on = items[i].id === cur;
    b.className = on ? "selected" : "";
    b.setAttribute("aria-pressed", on);
  });
};

const CTLS = [
  // id, key, format
  ["a", "a", (v) => v],
  ["b", "b", (v) => v],
  ["phase", "phase", (v) => Math.round(v) + "°"],
  ["detune", "detune", (v) => (+v).toFixed(1) + "%"],
  ["damping", "damping", (v) => (+v).toFixed(2)],
  ["rotary", "rotary", (v) => Math.round(v * 100) + "%"],
  ["rotFreq", "rotFreq", (v) => (+v).toFixed(2) + "×"],
  ["duration", "duration", (v) => v],
  ["width", "width", (v) => (+v).toFixed(1)],
  ["tone", "tone", (v) => v + " Hz"],
];

const render = (quick) => {
  if (!quick) stopDraw();
  $("figure-box").innerHTML = figureSVG(false);
  CTLS.forEach(([id, k, fmt]) => ($(id + "-val").textContent = fmt(S[k])));
  const g = gcd(S.a, S.b);
  const cur = `${S.a / g}:${S.b / g}`;
  setPressed("interval-chips", INTERVALS, INTERVALS.some((i) => i.id === cur) ? cur : null);
  setPressed("mode-chips", MODES, S.mode);
  setPressed("look-chips", LOOKS, S.look);
  document.body.classList.toggle("is-lissajous", S.mode === "lissajous");
  const iv = INTERVALS.find((i) => i.id === cur);
  $("ratio-note").textContent =
    `${S.a}:${S.b}` +
    (iv ? `, ${iv.label.replace(/ \d+:\d+$/, "").toLowerCase()}` : "") +
    (g > 1 ? ` (the same as ${cur})` : "") +
    (S.detune > 0 ? `, detuned by ${S.detune.toFixed(1)}%` : ", in perfect tune");
  tune();
};

const randomize = () => {
  const iv = INTERVALS[1 + Math.floor(Math.random() * (INTERVALS.length - 1))];
  Object.assign(S, {
    a: iv.a,
    b: iv.b,
    phase: Math.round(Math.random() * 180),
    detune: +(Math.random() * 1.5).toFixed(1),
    damping: +(0.1 + Math.random() * 0.4).toFixed(2),
    rotary: S.mode === "harmonograph" ? +(Math.random() * 0.6).toFixed(2) : S.rotary,
    rotFreq: [0.5, 1, 1, 1.5, 2][Math.floor(Math.random() * 5)],
  });
  syncInputs();
  save();
  render();
};

const syncInputs = () => CTLS.forEach(([id, k]) => ($(id).value = S[k]));

const chips = (id, items, pick) => {
  const box = $(id);
  box.innerHTML = "";
  items.forEach((it) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = it.label;
    b.onclick = () => pick(it);
    box.appendChild(b);
  });
};

// ---------------------------------------------------------------- export

const download = (blob, name) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
const fileName = (ext) => `${S.mode}-${S.a}-${S.b}.${ext}`;
const exportSVG = () => download(new Blob([figureSVG(true)], { type: "image/svg+xml" }), fileName("svg"));
const exportPNG = () => {
  const px = 2400;
  const svg = figureSVG(true).replace("<svg ", `<svg width="${px}" height="${px}" `);
  const img = new Image();
  img.onload = () => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = px;
    cv.getContext("2d").drawImage(img, 0, 0, px, px);
    cv.toBlob((b) => download(b, fileName("png")));
  };
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
};

const initHarmonograph = () => {
  if (!MODES.some((m) => m.id === S.mode)) S.mode = DEFAULTS.mode;
  if (!LOOKS.some((l) => l.id === S.look)) S.look = DEFAULTS.look;
  chips("mode-chips", MODES, (m) => { stopSpin(); S.mode = m.id; save(); render(); });
  chips("interval-chips", INTERVALS, (iv) => { S.a = iv.a; S.b = iv.b; syncInputs(); save(); render(!!spinRaf); });
  chips("look-chips", LOOKS, (l) => { S.look = l.id; save(); render(!!spinRaf); });
  syncInputs();
  CTLS.forEach(([id, k]) => {
    const el = $(id);
    el.oninput = () => {
      S[k] = +el.value;
      save();
      if (k === "tone") {
        $("tone-val").textContent = S.tone + " Hz";
        tune();
      } else render(!!spinRaf);
    };
  });
  $("draw").onclick = () => { stopSpin(); drawIt(); };
  $("spin").onclick = spin;
  $("random").onclick = randomize;
  $("listen").onclick = () => (soundOn() ? stopSound() : startSound());
  $("export-png").onclick = exportPNG;
  $("export-svg").onclick = exportSVG;
  render();
};
