// Deck engine: speaker-paced builds, navigation, static mode. No network, no dependencies.
//   → / Space / PageDown / click (right two thirds) / swipe left : next build, then next slide
//   ← / PageUp / Backspace / click (left third) / swipe right    : previous build, then previous slide
//   Home / End, F fullscreen, N speaker notes, A static mode (every build shown, no motion).
//   Static mode is also on with ?static in the URL, with prefers-reduced-motion, and while printing (PDF).
(() => {
  const root = document.documentElement;
  const stage = document.querySelector(".stage");
  const slides = [...document.querySelectorAll(".slide")];
  const counter = document.querySelector(".counter");
  const dots = document.querySelector(".dots");
  const progress = document.querySelector(".progress");
  const toast = document.querySelector(".toast");
  const notes = document.querySelector(".notes");
  const modal = document.querySelector(".modal");
  const video = modal.querySelector("video");
  const STAG = 80;

  // Real results of the three attacks, read from the app's own screens (submission/screens, build/assets/shots).
  const LAB_DATA = {
    tamper: { naive: "Read 3 messages in 170 ms. No cross-check.", l1: "166 ms", l2: "591 ms", l3: "88 ms", label: "✕ Forged history",
      d3: "altered", d4: "missing", ai: "Tampering", conf: "95%", att: "#38" },
    replay: { naive: "Read 2 messages in 190 ms. No cross-check.", l1: "186 ms", l2: "206 ms", l3: "86 ms", label: "✕ Stale view",
      d3: "missing", d4: "missing", ai: "Replay (stale view)", conf: "90%", att: "#39" },
    equivocate: { naive: "Read 3 messages in 173 ms. No cross-check.", l1: "150 ms", l2: "224 ms", l3: "92 ms", label: "✕ Two-faced",
      d3: "altered, to other clients", d4: "missing, to other clients", ai: "Equivocation", conf: "95%", att: "#40" },
  };

  const steps = slides.map((s) => Math.max(0, ...[...s.querySelectorAll("[data-build]")].map((e) => Number(e.dataset.build))));
  let i = 0;
  let b = 0;
  let timers = [];
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let isStatic = /(^|[?&])static\b/.test(location.search) || reduced.matches;
  root.classList.toggle("static", isStatic);

  function fit() {
    const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.transform = `translate(-50%, -50%) scale(${s})`;
  }

  // count-up for numbers that appear with a build (text only; the final value is in the markup)
  function countUp(el, delay) {
    const to = Number(el.dataset.count);
    if (!to) return;
    const t0 = performance.now() + delay;
    const dur = 700;
    el.textContent = "0";
    const tick = (now) => {
      const p = Math.min(1, Math.max(0, (now - t0) / dur));
      el.textContent = String(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1 && el.isConnected) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function apply(slide, step, animate) {
    for (const el of slide.querySelectorAll("[data-build]")) {
      const on = Number(el.dataset.build) <= step;
      const was = el.classList.contains("is-shown");
      el.classList.toggle("is-shown", on);
      for (const c of el.querySelectorAll("[data-count]")) {
        if (on && !was && animate && !isStatic) countUp(c, (Number(getComputedStyle(el).getPropertyValue("--d")) || 0) * STAG + 150);
        else if (!on || isStatic) c.textContent = c.dataset.count;
      }
    }
    for (const el of slide.querySelectorAll("[data-state]")) el.classList.toggle("is-on", Number(el.dataset.state) <= step);
  }

  function chrome() {
    const n = steps[i];
    counter.textContent = `${i + 1} / ${slides.length}`;
    dots.innerHTML = isStatic || !n ? "" : Array.from({ length: n }, (_, k) => `<i class="${k < b ? "on" : ""}"></i>`).join("");
    const frac = (i + (n ? b / n : 1)) / slides.length;
    progress.style.transform = `scaleX(${frac})`;
    const src = slides[i].querySelector(".speaker-notes");
    notes.innerHTML = src ? src.innerHTML : "";
  }

  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  function show(n, step = 0) {
    clearTimers();
    const changed = n !== i || !slides[n].classList.contains("is-active");
    i = Math.max(0, Math.min(slides.length - 1, n));
    b = isStatic ? steps[i] : Math.max(0, Math.min(steps[i], step));
    slides.forEach((s, k) => {
      const active = k === i;
      s.classList.toggle("is-active", active);
      s.setAttribute("aria-hidden", active ? "false" : "true");
      if (!active) s.classList.remove("is-entered");
    });
    const s = slides[i];
    if (isStatic) slides.forEach((sl, k) => apply(sl, steps[k], false)); // every slide final (print shows them all)
    else apply(s, b, false);
    if (changed || isStatic) {
      s.classList.remove("is-entered");
      if (isStatic) s.classList.add("is-entered");
      else { void s.offsetWidth; requestAnimationFrame(() => s.classList.add("is-entered")); }
    }
    if (location.hash !== `#${i + 1}`) history.replaceState(null, "", `#${i + 1}${location.search ? "" : ""}`);
    document.title = `HashWitness · ${s.dataset.title} (${i + 1}/${slides.length})`;
    chrome();
  }

  function next() {
    if (!isStatic && b < steps[i]) { clearTimers(); b++; apply(slides[i], b, true); chrome(); return; }
    if (i < slides.length - 1) show(i + 1, 0);
  }
  function prev() {
    if (!isStatic && b > 0) { clearTimers(); b--; apply(slides[i], b, false); chrome(); return; }
    if (i > 0) show(i - 1, steps[i - 1]);
  }

  function setStatic(on, say) {
    isStatic = on;
    root.classList.toggle("static", on);
    show(i, on ? steps[i] : b);
    if (say) {
      toast.textContent = on ? "Static mode: every step shown, no motion (A to switch back)" : "Animated mode (A for static)";
      toast.classList.add("is-on");
      setTimeout(() => toast.classList.remove("is-on"), 1600);
    }
  }

  // slide 4: replay the Attack Lab with the chosen attack's real results
  const lab = document.querySelector("[data-lab]");
  function setAttack(name) {
    const d = LAB_DATA[name];
    for (const el of lab.querySelectorAll("[data-slot]")) el.textContent = d[el.dataset.slot];
    for (const c of lab.querySelectorAll("[data-attack]")) c.classList.toggle("is-active", c.dataset.attack === name);
  }
  function replay(name) {
    setAttack(name);
    const k = slides.indexOf(lab);
    if (i !== k) show(k, 0);
    if (isStatic) return;
    clearTimers();
    b = 0; apply(lab, 0, false); chrome();
    [[1, 120], [2, 900], [3, 2000]].forEach(([step, t]) => timers.push(setTimeout(() => {
      if (i === k) { b = step; apply(lab, step, true); chrome(); }
    }, t)));
  }

  function openVideo() { modal.classList.add("is-open"); video.currentTime = 0; video.play().catch(() => {}); }
  function closeVideo() { video.pause(); modal.classList.remove("is-open"); }

  document.addEventListener("keydown", (e) => {
    if (modal.classList.contains("is-open")) { if (e.key === "Escape" || e.key === " ") { e.preventDefault(); closeVideo(); } return; }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest && e.target.closest("button, [data-action]") && (e.key === "Enter" || e.key === " ")) return; // let focused controls work
    switch (e.key) {
      case "ArrowRight": case "ArrowDown": case "PageDown": case " ": case "Enter": e.preventDefault(); next(); break;
      case "ArrowLeft": case "ArrowUp": case "PageUp": case "Backspace": e.preventDefault(); prev(); break;
      case "Home": show(0, 0); break;
      case "End": show(slides.length - 1, steps[slides.length - 1]); break;
      case "f": case "F":
        if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {});
        break;
      case "n": case "N": notes.classList.toggle("is-open"); break;
      case "a": case "A": setStatic(!isStatic, true); break;
    }
  });
  document.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-attack]");
    if (chip) { replay(chip.dataset.attack); return; }
    if (e.target.closest("[data-action=play]")) { openVideo(); return; }
    if (e.target.closest(".modal")) { if (e.target.closest("button") || e.target === modal) closeVideo(); return; }
    if (e.target.closest(".notes, a, button")) return;
    if (e.clientX < window.innerWidth / 3) prev(); else next();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && document.activeElement?.dataset.action === "play") { e.stopPropagation(); openVideo(); }
  }, true);
  let x0 = null;
  document.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  document.addEventListener("touchend", (e) => {
    if (x0 === null || modal.classList.contains("is-open")) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 40) (dx < 0 ? next : prev)();
    x0 = null;
  }, { passive: true });
  window.addEventListener("resize", fit);
  window.addEventListener("hashchange", () => {
    const n = Number(location.hash.slice(1)) - 1;
    if (n >= 0 && n !== i) show(n, 0);
  });
  reduced.addEventListener?.("change", (e) => { if (e.matches) setStatic(true, false); });
  // printing / PDF export always shows the final state
  let wasStatic = isStatic;
  window.addEventListener("beforeprint", () => { wasStatic = isStatic; if (!isStatic) setStatic(true, false); });
  window.addEventListener("afterprint", () => { if (!wasStatic) setStatic(false, false); });

  // test hook for the build scripts (read-only state)
  window.__deck = { get slide() { return i; }, get step() { return b; }, steps, next, prev, show, setStatic, replay };

  fit();
  setAttack("tamper");
  show(Math.max(0, Number(location.hash.slice(1)) - 1 || 0), 0);
})();
