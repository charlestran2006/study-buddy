const SOUND_FILES = {
  click: "sounds/click.wav",
  correct: "sounds/correct.wav",
  incorrect: "sounds/incorrect.wav",
  ready: "sounds/ready.wav",
  tick: "sounds/tick.wav",
};

let audioCache = {};

Object.entries(SOUND_FILES).forEach(([name, src]) => {
  let audio = new Audio(src);
  audio.preload = "auto";
  audioCache[name] = audio;
});

let params = new URLSearchParams(location.search);
let muted = params.get("mute") === "1";

function syncMuteQueryParam() {
  let url = new URL(location.href);
  if (muted) url.searchParams.set("mute", "1");
  else url.searchParams.delete("mute");
  history.replaceState(null, "", url);
}

export function playSound(name) {
  if (muted) return;
  let base = audioCache[name];
  if (!base) return;

  // Clone so rapid/overlapping plays (e.g. quick clicks) don't cut each
  // other off. The clone reuses the already-preloaded resource.
  let instance = base.cloneNode();
  instance.volume = 0.6;
  instance.play().catch(() => {});
}

export function isMuted() {
  return muted;
}

let muteButton = document.getElementById("mute-toggle-button");

function updateMuteButton() {
  if (!muteButton) return;
  muteButton.textContent = muted ? "🔇" : "🔊";
  muteButton.setAttribute("aria-pressed", String(muted));
  muteButton.setAttribute("aria-label", muted ? "Unmute sound" : "Mute sound");
  muteButton.title = muted ? "Unmute sound" : "Mute sound";
}

if (muteButton) {
  updateMuteButton();
  muteButton.addEventListener("click", () => {
    muted = !muted;
    updateMuteButton();
    syncMuteQueryParam();
    if (!muted) playSound("click");
  });
}
