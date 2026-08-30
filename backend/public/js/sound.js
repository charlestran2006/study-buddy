const SOUND_FILES = {
  click: "sounds/click.wav",
  correct: "sounds/correct.wav",
  incorrect: "sounds/incorrect.wav",
  ready: "sounds/ready.wav",
  tick: "sounds/tick.wav",
  whoosh: "sounds/whoosh.mp3",
};

const BGM_FILES = [
  "sounds/Carefree.mp3",
  "sounds/Duck.mp3",
  "sounds/Moneys.mp3",
  "sounds/TheBuilder.mp3",
  "sounds/wallpaper.mp3"
];

let audioCache = {};
let bgmCache = [];
let currentBgm = null;
let lastBgmIndex = null;

Object.entries(SOUND_FILES).forEach(([name, src]) => {
  let audio = new Audio(src);
  audio.preload = "auto";
  audioCache[name] = audio;
});

BGM_FILES.forEach((src) => {
  let audio = new Audio(src);
  audio.preload = "auto";
  audio.loop = true;
  audio.volume = 0.35;
  bgmCache.push(audio);
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

  let instance = base.cloneNode();
  instance.volume = 0.6;
  instance.play().catch(() => {});
}

export function playRandomBGM() {
  stopBGM();
  if (muted || bgmCache.length === 0) return;

  let randomIndex = Math.floor(Math.random() * bgmCache.length);
  // Avoid picking the same track twice in a row when more than one is available,
  // otherwise a repeat looks (and sounds) like the track never got replaced.
  while (bgmCache.length > 1 && randomIndex === lastBgmIndex) {
    randomIndex = Math.floor(Math.random() * bgmCache.length);
  }
  lastBgmIndex = randomIndex;

  currentBgm = bgmCache[randomIndex];
  currentBgm.currentTime = 0;
  currentBgm.play().catch(() => {});
}

export function stopBGM() {
  if (currentBgm) {
    currentBgm.pause();
    currentBgm.currentTime = 0;
    currentBgm = null;
  }
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
    
    if (muted) {
      if (currentBgm) currentBgm.pause();
    } else {
      playSound("click");
      if (currentBgm) currentBgm.play().catch(() => {});
    }
  });
}