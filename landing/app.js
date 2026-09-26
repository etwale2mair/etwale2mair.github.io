"use strict";

document.getElementById("year").textContent = new Date().getFullYear();
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const root = document.documentElement;

/* ---------- theme toggle (shares Quartz's localStorage key) ---------- */
function currentTheme() {
  if (root.dataset.theme) return root.dataset.theme;
  return matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}
document.querySelectorAll(".theme-toggle").forEach((btn) => {
  btn.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch {}
  });
});

/* ---------- topbar shadow + scroll progress ---------- */
const topbar = document.querySelector(".topbar");
const progress = document.getElementById("progress");
function onScroll() {
  const y = window.scrollY;
  topbar.classList.toggle("scrolled", y > 40);
  const h = document.documentElement.scrollHeight - window.innerHeight;
  progress.style.width = (h > 0 ? (y / h) * 100 : 0) + "%";
}
addEventListener("scroll", onScroll, { passive: true });
onScroll();

/* ---------- E. film grain (generated once, tiled) ---------- */
(function grain() {
  const layer = document.querySelector(".grain");
  if (!layer || reduceMotion) return;
  const s = 120, c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d");
  const img = g.createImageData(s, s);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = (Math.random() * 255) | 0;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  layer.style.backgroundImage = `url(${c.toDataURL("image/png")})`;
})();

/* ---------- A. decode the handle letter by letter ---------- */
(function decode() {
  const el = document.getElementById("handle");
  if (!el) return;
  const word = "etwale";
  const glyphs = "!<>-_\\/[]{}=+*^?#________";
  el.textContent = "";
  const spans = [...word].map((ch) => {
    const s = document.createElement("span");
    s.className = "ch";
    s.textContent = ch;
    el.appendChild(s);
    return { s, ch };
  });
  if (reduceMotion) return;

  spans.forEach(({ s, ch }, i) => {
    const start = 120 + i * 90;      // stagger left to right
    const dur = 420;                 // scramble time per letter
    setTimeout(() => {
      s.classList.add("scrambling");
      const iv = setInterval(() => {
        s.textContent = glyphs[(Math.random() * glyphs.length) | 0];
      }, 45);
      setTimeout(() => {
        clearInterval(iv);
        s.textContent = ch;
        s.classList.remove("scrambling");
      }, dur);
    }, start);
  });
})();

/* ---------- B. cursor spotlight + light parallax (desktop, pointer) ---------- */
(function spotlight() {
  const hero = document.querySelector(".hero");
  const spot = document.querySelector(".spotlight");
  const inner = document.getElementById("hero-inner");
  if (!hero || !spot || reduceMotion) return;
  if (!matchMedia("(pointer: fine)").matches) return;

  hero.addEventListener("pointermove", (e) => {
    const r = hero.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    spot.style.setProperty("--mx", x + "px");
    spot.style.setProperty("--my", y + "px");
    spot.style.opacity = "1";
    const dx = (x / r.width - 0.5) * -14;
    const dy = (y / r.height - 0.5) * -10;
    inner.style.transform = `translate(${dx}px, ${dy}px)`;
    if (window.__field) window.__field.setPointer(x, y);
  });
  hero.addEventListener("pointerleave", () => {
    spot.style.opacity = "0";
    inner.style.transform = "";
    if (window.__field) window.__field.setPointer(null, null);
  });
})();

/* ---------- C. hero fades / drifts up on scroll ---------- */
(function heroExit() {
  const inner = document.getElementById("hero-inner");
  const cue = document.querySelector(".scroll-cue");
  if (!inner || reduceMotion) return;
  let ticking = false;
  function upd() {
    const vh = window.innerHeight;
    const p = Math.min(1, window.scrollY / (vh * 0.8));
    inner.style.opacity = String(1 - p);
    inner.style.transform = `translateY(${-p * 40}px)`;
    if (cue) cue.style.opacity = String(1 - Math.min(1, window.scrollY / 200));
    ticking = false;
  }
  addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(upd); } }, { passive: true });
})();

/* ---------- hero particle field ---------- */
(function field() {
  const canvas = document.getElementById("field");
  if (!canvas || reduceMotion) return;
  const ctx = canvas.getContext("2d");
  let w, h, pts, raf, px = null, py = null, slow = 1;
  const accent = () => getComputedStyle(root).getPropertyValue("--accent").trim() || "#f5a524";

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.min(70, Math.floor((w * h) / 16000));
    pts = Array.from({ length: n }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.28, vy: (Math.random() - 0.5) * 0.28,
    }));
  }
  // C: slow the field as the hero scrolls away
  addEventListener("scroll", () => {
    slow = Math.max(0.15, 1 - window.scrollY / (window.innerHeight * 0.9));
  }, { passive: true });

  window.__field = { setPointer(x, y) { px = x; py = y; } };

  function draw() {
    ctx.clearRect(0, 0, w, h);
    const c = accent();
    for (const p of pts) {
      p.x += p.vx * slow; p.y += p.vy * slow;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
    }
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i], b = pts[j];
        const d2 = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
        if (d2 < 120 * 120) {
          ctx.globalAlpha = (1 - d2 / (120 * 120)) * 0.18 * slow;
          ctx.strokeStyle = c; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    }
    // B: near the pointer, link points more strongly
    if (px != null) {
      for (const p of pts) {
        const d2 = (p.x - px) ** 2 + (p.y - py) ** 2;
        if (d2 < 150 * 150) {
          ctx.globalAlpha = (1 - d2 / (150 * 150)) * 0.5 * slow;
          ctx.strokeStyle = c; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(px, py); ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 0.5 * slow; ctx.fillStyle = c;
    for (const p of pts) { ctx.beginPath(); ctx.arc(p.x, p.y, 1.4, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(draw);
  }
  resize(); draw();
  addEventListener("resize", () => { cancelAnimationFrame(raf); resize(); draw(); });
})();

/* ---------- hero title typewriter ---------- */
(function typer() {
  const el = document.getElementById("title-type");
  if (!el) return;
  const roles = ["offensive security engineer", "AI red teamer", "web & AD pentester"];
  if (reduceMotion) { el.textContent = roles[0]; return; }
  let ri = 0, ci = 0, deleting = false;
  el.textContent = "";
  function step() {
    const word = roles[ri];
    ci += deleting ? -1 : 1;
    el.textContent = word.slice(0, ci);
    let delay = deleting ? 40 : 75;
    if (!deleting && ci === word.length) { delay = 2400; deleting = true; }
    else if (deleting && ci === 0) { deleting = false; ri = (ri + 1) % roles.length; delay = 400; }
    setTimeout(step, delay);
  }
  setTimeout(step, 1400);
})();

/* ---------- reveal on scroll ---------- */
function reveal(el) {
  el.classList.add("in");
  // stagger children that opt in
  el.querySelectorAll(".tag").forEach((t, i) => t.style.setProperty("--t", i));
  el.querySelectorAll(".chip").forEach((t, i) => t.style.setProperty("--t", i));
}
(function watch() {
  const els = document.querySelectorAll(".reveal, .reveal-group");
  if (reduceMotion || !("IntersectionObserver" in window)) { els.forEach(reveal); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { reveal(e.target); io.unobserve(e.target); } });
  }, { threshold: 0.15 });
  els.forEach((e) => io.observe(e));
})();

/* ---------- animated counters ---------- */
function animateCount(el) {
  const target = parseInt(el.dataset.count || "0", 10);
  const suffix = el.dataset.suffix || "";
  if (reduceMotion || !target) { el.textContent = target + suffix; return; }
  const dur = 900, start = performance.now();
  (function tick(now) {
    const t = Math.min(1, (now - start) / dur);
    el.textContent = Math.round(target * (1 - Math.pow(1 - t, 3))) + suffix;
    if (t < 1) requestAnimationFrame(tick);
  })(start);
}
(function counters() {
  const nums = document.querySelectorAll(".stat .num[data-count]");
  if (!("IntersectionObserver" in window)) { nums.forEach(animateCount); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { animateCount(e.target); io.unobserve(e.target); } });
  }, { threshold: 0.5 });
  nums.forEach((n) => io.observe(n));
})();

/* ---------- latest writeups (from generated writeups.json) ---------- */
function fmtDate(d) {
  if (!d) return "";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
fetch("writeups.json")
  .then((r) => (r.ok ? r.json() : Promise.reject()))
  .then((data) => {
    const countEl = document.getElementById("stat-writeups");
    if (countEl) countEl.dataset.count = String(data.count);
    const cards = document.getElementById("cards");
    const items = data.items.slice(0, 4);
    if (!items.length) { cards.innerHTML = '<li class="card"><p>writeups coming soon.</p></li>'; return; }
    cards.innerHTML = items.map((w, i) => {
      const tags = (w.tags || []).slice(0, 4).map((t) => `<span class="tag">${t}</span>`).join("");
      const meta = [w.section, fmtDate(w.date)].filter(Boolean).map((x) => `<span>${x}</span>`).join("");
      return `<li class="card reveal" style="--i:${i}"><a class="card-link" href="writeups/${w.slug}">
        <h3>${w.title}</h3>
        <div class="meta">${meta}</div>
        ${w.description ? `<p>${w.description}</p>` : ""}
        <div class="tags">${tags}</div>
      </a></li>`;
    }).join("");
    const newCards = cards.querySelectorAll(".reveal");
    if (reduceMotion || !("IntersectionObserver" in window)) { newCards.forEach(reveal); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { reveal(e.target); io.unobserve(e.target); } });
    }, { threshold: 0.15 });
    newCards.forEach((c) => io.observe(c));
  })
  .catch(() => {
    document.getElementById("cards").innerHTML = '<li class="card"><p>writeups coming soon.</p></li>';
  });
