// Deck navigation: arrows / PageUp / PageDown / Space / Home / End, click (left third = back), swipe,
// F = fullscreen, N = speaker notes, slide counter, #n in the URL. No network, no dependencies.
(() => {
  const stage = document.querySelector(".stage");
  const slides = [...document.querySelectorAll(".slide")];
  const counter = document.querySelector(".counter");
  const notes = document.querySelector(".notes");
  const modal = document.querySelector(".modal");
  const video = modal.querySelector("video");
  let i = 0;

  function fit() {
    const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.transform = `translate(-50%, -50%) scale(${s})`; // centered, letterboxed
  }
  function show(n) {
    i = Math.max(0, Math.min(slides.length - 1, n));
    slides.forEach((s, k) => {
      s.classList.toggle("is-active", k === i);
      s.setAttribute("aria-hidden", k === i ? "false" : "true");
    });
    counter.textContent = `${i + 1} / ${slides.length}`;
    const src = slides[i].querySelector(".speaker-notes");
    notes.innerHTML = src ? src.innerHTML : "";
    if (location.hash !== `#${i + 1}`) history.replaceState(null, "", `#${i + 1}`);
    document.title = `HashWitness · ${slides[i].dataset.title} (${i + 1}/${slides.length})`;
  }
  const next = () => show(i + 1);
  const prev = () => show(i - 1);

  function openVideo() { modal.classList.add("is-open"); video.currentTime = 0; video.play().catch(() => {}); }
  function closeVideo() { video.pause(); modal.classList.remove("is-open"); }

  document.addEventListener("keydown", (e) => {
    if (modal.classList.contains("is-open")) { if (e.key === "Escape" || e.key === " ") { e.preventDefault(); closeVideo(); } return; }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    switch (e.key) {
      case "ArrowRight": case "ArrowDown": case "PageDown": case " ": case "Enter": e.preventDefault(); next(); break;
      case "ArrowLeft": case "ArrowUp": case "PageUp": case "Backspace": e.preventDefault(); prev(); break;
      case "Home": show(0); break;
      case "End": show(slides.length - 1); break;
      case "f": case "F":
        if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {});
        break;
      case "n": case "N": notes.classList.toggle("is-open"); break;
    }
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-action=play]")) { openVideo(); return; }
    if (e.target.closest(".modal")) { if (e.target.closest("button") || e.target === modal) closeVideo(); return; }
    if (e.target.closest(".notes, a, button")) return;
    if (e.clientX < window.innerWidth / 3) prev(); else next();
  });
  document.addEventListener("keydown", (e) => {
    if ((e.key === "Enter") && document.activeElement?.dataset.action === "play") { e.stopPropagation(); openVideo(); }
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
  window.addEventListener("hashchange", () => show(Number(location.hash.slice(1)) - 1 || 0));

  fit();
  show(Number(location.hash.slice(1)) - 1 || 0);
})();
