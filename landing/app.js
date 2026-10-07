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

/* ---------- copy sealed hash (delegated, works on injected cards) ---------- */
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".copy-hash");
  if (!btn) return;
  e.preventDefault();
  const hash = btn.dataset.hash || "";
  navigator.clipboard?.writeText(hash).then(() => {
    const was = btn.textContent;
    btn.textContent = "Copied";
    setTimeout(() => { btn.textContent = was; }, 1200);
  }).catch(() => {});
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
  let rz;
  addEventListener("resize", () => {
    clearTimeout(rz);
    rz = setTimeout(() => { cancelAnimationFrame(raf); resize(); draw(); }, 150);
  });
})();

/* ---------- hero title typewriter ---------- */
(function typer() {
  const el = document.getElementById("title-type");
  if (!el) return;
  const roles = ["Offensive security engineer", "AI red teamer", "Web & AD pentester"];
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

/* ---------- scroll reveal: scope by scope, items in DOM order ---------- */
const STAGGER_CAP = 8;
function ownItems(scope) {
  return [...scope.querySelectorAll("[data-reveal]")]
    .filter((el) => el.closest("[data-reveal-scope]") === scope);
}
function showScope(scope) {
  ownItems(scope).forEach((el, i) => {
    el.style.setProperty("--i", Math.min(i, STAGGER_CAP));
    el.classList.add("in");
    el.querySelectorAll("[data-count]").forEach(animateCount);
  });
}
const revealIO = !reduceMotion && "IntersectionObserver" in window
  ? new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        showScope(e.target);
        revealIO.unobserve(e.target);
      }
    }, { rootMargin: "0px 0px -12% 0px" })
  : null;
function watchScope(scope) {
  if (revealIO) revealIO.observe(scope);
  else showScope(scope);
}
document.querySelectorAll("[data-reveal-scope]").forEach(watchScope);

/* ---------- small helpers for injected content ---------- */
function esc(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}
function chip(t) { return `<span class="chip">${esc(t)}</span>`; }
function tag(t) { return `<span class="tag">${esc(t)}</span>`; }
function plist(points) {
  return points && points.length
    ? `<ul class="plist">${points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`
    : "";
}
function fmtDate(d) {
  if (!d) return "";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
function shortHash(h) { return h ? `${h.slice(0, 4)}…${h.slice(-4)}` : ""; }

function normalCard(w) {
  const tags = (w.tags || []).slice(0, 4).map(tag).join("");
  const meta = [w.section, fmtDate(w.date)].filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join("");
  return `<li class="card" data-reveal><a class="card-link" href="writeups/${esc(w.slug)}">
    <h3>${esc(w.title)}</h3>
    <div class="meta">${meta}</div>
    ${w.description ? `<p>${esc(w.description)}</p>` : ""}
    <div class="tags">${tags}</div>
  </a></li>`;
}

// active HTB box: proof, never spoilers
function lockedCard(w) {
  const h = w.htb || {};
  const facts = ["Owned " + esc(h.owned || ""), h.os && esc(h.os), h.difficulty && esc(h.difficulty)]
    .filter(Boolean).join(" · ");
  const verified = h.achievement
    ? `<a class="verified" href="${esc(h.achievement)}" rel="noopener">Verified on Hack The Box ↗</a>` : "";
  const sealed = w.sealed && w.sealed.hash
    ? `<span class="sealed"><span class="lbl">Sealed</span> <code title="${esc(w.sealed.hash)}">${esc(shortHash(w.sealed.hash))}</code><button class="copy-hash" type="button" data-hash="${esc(w.sealed.hash)}" aria-label="copy full hash">Copy</button></span>` : "";
  return `<li class="card locked" data-reveal>
    <a class="card-link" href="writeups/${esc(w.slug)}">
      <div class="lock-row"><span class="lockglyph" aria-hidden="true">◆</span><h3>${esc(w.title)}</h3></div>
      <div class="meta">${facts}</div>
    </a>
    <div class="lock-proof">${verified}${sealed}</div>
  </li>`;
}

/* ---------- writeups: featured + latest list (from writeups.json) ---------- */
fetch("writeups.json")
  .then((r) => (r.ok ? r.json() : Promise.reject()))
  .then((data) => {
    const unlockedCount = data.items.filter((w) => !w.locked).length;

    // featured (never a locked item)
    const featured = data.items.find((w) => w.featured && !w.locked);
    const featEl = document.getElementById("featured");
    if (featured && featEl) {
      const tags = (featured.tags || []).slice(0, 5).map(tag).join("");
      const meta = [featured.section, fmtDate(featured.date)].filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join("");
      featEl.innerHTML = `<a class="feat-panel" data-reveal href="writeups/${esc(featured.slug)}">
        <span class="feat-label">Featured</span>
        <h3>${esc(featured.title)}</h3>
        <div class="feat-meta">${meta}</div>
        ${featured.description ? `<p class="desc">${esc(featured.description)}</p>` : ""}
        <div class="feat-foot"><div class="tags">${tags}</div><span class="feat-read">Read the writeup →</span></div>
      </a>`;
      featEl.hidden = false;
      watchScope(featEl);
    }

    // latest list (drop the featured one only when there are enough unlocked others)
    let list = data.items;
    if (unlockedCount > 2 && featured) list = list.filter((w) => !w.featured);
    list = list.slice(0, 6);

    const cards = document.getElementById("cards");
    if (!list.length) {
      cards.innerHTML = '<li class="card" data-reveal><p>Writeups coming soon.</p></li>';
      watchScope(cards);
      return;
    }
    cards.innerHTML = list.map((w) => (w.locked ? lockedCard(w) : normalCard(w))).join("");
    watchScope(cards);
  })
  .catch(() => {
    const cards = document.getElementById("cards");
    cards.innerHTML = '<li class="card" data-reveal><p>Writeups coming soon.</p></li>';
    watchScope(cards);
  });

/* ---------- live Root-Me / HTB counters (data/stats.json) ---------- */
function setStat(id, value) {
  const el = document.getElementById(id);
  if (!el || typeof value !== "number") return;
  el.dataset.count = String(value);
  const stat = el.closest(".stat");
  if (stat && stat.classList.contains("in")) {
    el.textContent = String(value) + (el.dataset.suffix || ""); // already revealed, no second animation
  } // otherwise the reveal animates to the new data-count
}
fetch("data/stats.json")
  .then((r) => (r.ok ? r.json() : Promise.reject()))
  .then((s) => {
    if (s.rootme) setStat("stat-rootme", s.rootme.solved);
    if (s.htb) setStat("stat-htb", s.htb.machines);
    const rm = document.getElementById("stat-rootme");
    if (rm && s.rootme && s.rootme.updated) rm.closest(".stat")?.setAttribute("title", "updated " + s.rootme.updated.slice(0, 10));
  })
  .catch(() => {});

/* ---------- profile sections (projects, experience, skills, currently) ---------- */
fetch("data/profile.json")
  .then((r) => (r.ok ? r.json() : Promise.reject()))
  .then((p) => {
    const pg = document.getElementById("projects-grid");
    if (pg && p.projects) {
      pg.innerHTML = p.projects.map((pr) => `<article class="panel project" data-reveal>
        <h3>${esc(pr.name)}</h3>
        <p class="summary">${esc(pr.summary)}</p>
        ${plist(pr.points)}
        <div class="stack">${(pr.stack || []).map(chip).join("")}</div>
        ${pr.status ? `<div class="status">${esc(pr.status)}</div>` : ""}
      </article>`).join("");
      watchScope(pg);
    }

    const eb = document.getElementById("experience-body");
    if (eb) {
      const exp = (p.experience || []).map((e) => `<div class="exp" data-reveal>
        <div class="period">${esc(e.period)}</div>
        <h3>${esc(e.role)} · <span class="org">${esc(e.org)}</span></h3>
        <p class="summary">${esc(e.summary)}</p>
        ${plist(e.points)}
      </div>`).join("");
      const edu = (p.education || []).map((ed) => `<div class="edu-item" data-reveal>
        <span class="e-title">${esc(ed.title)}</span>
        <span class="e-org">${esc(ed.org)}</span>
        <span class="e-period">${esc(ed.period)}</span>
      </div>`).join("");
      eb.innerHTML = `<div class="timeline">${exp}</div>` + (edu ? `<div class="edu"><div class="edu-label">Education</div>${edu}</div>` : "");
      watchScope(eb);
    }

    const sg = document.getElementById("skills-grid");
    if (sg && p.skills) {
      sg.innerHTML = p.skills.map((s) => `<article class="panel skill" data-reveal>
        <h3>${esc(s.group)}</h3>
        <div class="stack">${(s.tools || []).map(chip).join("")}</div>
        ${s.focus ? `<p class="focus">${esc(s.focus)}</p>` : ""}
      </article>`).join("");
      watchScope(sg);
    }

    const cu = document.getElementById("currently");
    if (cu && p.currently && p.currently.length) {
      cu.innerHTML = `<div class="lbl" data-reveal>Currently</div><ul class="plist">${p.currently.map((c) => `<li data-reveal>${esc(c)}</li>`).join("")}</ul>`;
      watchScope(cu);
    }
  })
  .catch(() => {
    ["projects", "experience", "skills"].forEach((id) => { const el = document.getElementById(id); if (el) el.hidden = true; });
    const cu = document.getElementById("currently"); if (cu) cu.hidden = true;
  });
