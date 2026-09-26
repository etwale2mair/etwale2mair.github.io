"use strict";

document.getElementById("year").textContent = new Date().getFullYear();
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- theme toggle (shares Quartz's localStorage key) ---------- */
const root = document.documentElement;
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

/* ---------- hero: floating particle field + faint links ---------- */
(function field() {
  const canvas = document.getElementById("field");
  if (!canvas || reduceMotion) return;
  const ctx = canvas.getContext("2d");
  let w, h, pts, raf;
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

  function draw() {
    ctx.clearRect(0, 0, w, h);
    const c = accent();
    for (const p of pts) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
    }
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i], b = pts[j];
        const d2 = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
        if (d2 < 120 * 120) {
          ctx.globalAlpha = (1 - d2 / (120 * 120)) * 0.18;
          ctx.strokeStyle = c; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 0.5; ctx.fillStyle = c;
    for (const p of pts) { ctx.beginPath(); ctx.arc(p.x, p.y, 1.4, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(draw);
  }
  resize(); draw();
  addEventListener("resize", () => { cancelAnimationFrame(raf); resize(); draw(); });
})();

/* ---------- hero title: typewriter cycling roles ---------- */
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
    if (!deleting && ci === word.length) { delay = 2200; deleting = true; }
    else if (deleting && ci === 0) { deleting = false; ri = (ri + 1) % roles.length; delay = 400; }
    setTimeout(step, delay);
  }
  setTimeout(step, 900);
})();

/* ---------- reveal on scroll ---------- */
(function reveal() {
  const els = document.querySelectorAll(".reveal");
  if (reduceMotion || !("IntersectionObserver" in window)) { els.forEach((e) => e.classList.add("in")); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e, i) => {
      if (e.isIntersecting) { setTimeout(() => e.target.classList.add("in"), i * 60); io.unobserve(e.target); }
    });
  }, { threshold: 0.15 });
  els.forEach((e) => io.observe(e));
})();

/* ---------- animated counters ---------- */
function animateCount(el) {
  const target = parseInt(el.dataset.count || "0", 10);
  const suffix = el.dataset.suffix || "";
  if (reduceMotion || !target) { el.textContent = target + suffix; return; }
  const dur = 900; const start = performance.now();
  function tick(now) {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(target * eased) + suffix;
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
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
    if (countEl) { countEl.dataset.count = String(data.count); }
    const cards = document.getElementById("cards");
    const items = data.items.slice(0, 4);
    if (!items.length) { cards.innerHTML = '<li class="card"><p>writeups coming soon.</p></li>'; return; }
    cards.innerHTML = items.map((w) => {
      const tags = (w.tags || []).slice(0, 4).map((t) => `<span class="tag">${t}</span>`).join("");
      const meta = [w.section, fmtDate(w.date)].filter(Boolean).map((x) => `<span>${x}</span>`).join("");
      return `<li class="card reveal"><a class="card-link" href="writeups/${w.slug}">
        <h3>${w.title}</h3>
        <div class="meta">${meta}</div>
        ${w.description ? `<p>${w.description}</p>` : ""}
        <div class="tags">${tags}</div>
      </a></li>`;
    }).join("");
    // reveal the freshly-added cards
    cards.querySelectorAll(".reveal").forEach((e, i) => setTimeout(() => e.classList.add("in"), 80 * i));
  })
  .catch(() => {
    document.getElementById("cards").innerHTML = '<li class="card"><p>writeups coming soon.</p></li>';
  });
