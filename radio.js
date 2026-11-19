// =============================================================================
// RADIO — playlist, stazioni e controlli
// =============================================================================

export const radioStations = {
  PulseFM: {
    name: "PULSE FM",
    playlist: [
      { title: "PULSE // Broken Ones", url: "https://raw.githubusercontent.com/JGenius626/Algorhythm/main/PulseFM/songs/Broken%20Ones.mp3" },
      { title: "PULSE // Carry All The Weight", url: "https://raw.githubusercontent.com/JGenius626/Algorhythm/main/PulseFM/songs/Carry%20All%20The%20Weight.mp3" },
      { title: "PULSE // Feel Alright", url: "https://raw.githubusercontent.com/JGenius626/Algorhythm/main/PulseFM/songs/Feel%20Alright.mp3" },
      { title: "PULSE // Good Tonight", url: "https://raw.githubusercontent.com/JGenius626/Algorhythm/main/PulseFM/songs/Good%20Tonight.mp3" },
      { title: "PULSE // High", url: "https://raw.githubusercontent.com/JGenius626/Algorhythm/main/PulseFM/songs/High.mp3" },
      { title: "PULSE // Only For Show", url: "https://raw.githubusercontent.com/JGenius626/Algorhythm/main/PulseFM/songs/Only%20For%20Show.mp3" },
      { title: "PULSE // Spinning Like A Top", url: "https://raw.githubusercontent.com/JGenius626/Algorhythm/main/PulseFM/songs/Spinning%20Like%20A%20Top.mp3" },
      { title: "PULSE // That's the Song I Sing", url: "https://raw.githubusercontent.com/JGenius626/Algorhythm/main/PulseFM/songs/That's%20the%20Song%20I%20Sing.mp3" }
    ]
  },
  NeonReggaeton: {
    name: "NEON REGGAETON",
    playlist: [
      { title: "NEON // Algo Que Decirte", url: "https://raw.githubusercontent.com/JGenius626/Algorhythm/main/Neon%20Reggaeton/songs/Algo%20Que%20Decirte.mp3" },
      { title: "NEON // Aun", url: "https://raw.githubusercontent.com/JGenius626/Algorhythm/main/Neon%20Reggaeton/songs/Aun.mp3" },
      { title: "NEON // Bailamos Lento", url: "https://raw.githubusercontent.com/JGenius626/Algorhythm/main/Neon%20Reggaeton/songs/Bailamos%20Lento.mp3" },
      { title: "NEON // Dime que vas a hacer", url: "https://raw.githubusercontent.com/JGenius626/Algorhythm/main/Neon%20Reggaeton/songs/Dime%20que%20vas%20a%20hacer.mp3" },
      { title: "NEON // Escuela Secundaria", url: "https://raw.githubusercontent.com/JGenius626/Algorhythm/main/Neon%20Reggaeton/songs/Escuela%20Secundaria.mp3" },
      { title: "NEON // Linda y Libre", url: "https://raw.githubusercontent.com/JGenius626/Algorhythm/main/Neon%20Reggaeton/songs/Linda%20y%20Libre.mp3" },
      { title: "NEON // Mala de mente", url: "https://raw.githubusercontent.com/JGenius626/Algorhythm/main/Neon%20Reggaeton/songs/Mala%20de%20mente.mp3" },
      { title: "NEON // No Te Hagas El Importante", url: "https://raw.githubusercontent.com/JGenius626/Algorhythm/main/Neon%20Reggaeton/songs/No%20Te%20Hagas%20El%20Importante.mp3" },
      { title: "NEON // No Vas A Ser Fácil", url: "https://raw.githubusercontent.com/JGenius626/Algorhythm/main/Neon%20Reggaeton/songs/No%20Vas%20A%20Ser%20F%C3%A1cil.mp3" },
      { title: "NEON // Toma", url: "https://raw.githubusercontent.com/JGenius626/Algorhythm/main/Neon%20Reggaeton/songs/Toma.mp3" }
    ]
  },
  HazeWave: {
    name: "HAZE WAVE",
    playlist: [
      { title: "HAZE // Attention and Devotion", url: "https://raw.githubusercontent.com/JGenius626/Algorhythm/main/Haze%20Wave/songs/Attention%20and%20Devotion.mp3" },
      { title: "HAZE // Blackford", url: "https://raw.githubusercontent.com/JGenius626/Algorhythm/main/Haze%20Wave/songs/Blackford.mp3" },
      { title: "HAZE // Cattive Vibes", url: "https://raw.githubusercontent.com/JGenius626/Algorhythm/main/Haze%20Wave/songs/Cattive%20Vibes.mp3" },
      { title: "HAZE // Cielo Che Cambia Tono", url: "https://raw.githubusercontent.com/JGenius626/Algorhythm/main/Haze%20Wave/songs/Cielo%20Che%20Cambia%20Tono.mp3" },
      { title: "HAZE // FUORI", url: "https://raw.githubusercontent.com/JGenius626/Algorhythm/main/Haze%20Wave/songs/FUORI.mp3" },
      { title: "HAZE // Hey Hey Hey", url: "https://raw.githubusercontent.com/JGenius626/Algorhythm/main/Haze%20Wave/songs/Hey%20Hey%20Hey.mp3" },
      { title: "HAZE // Master in Psicologia", url: "https://raw.githubusercontent.com/JGenius626/Algorhythm/main/Haze%20Wave/songs/Master%20in%20Psicologia.mp3" },
      { title: "HAZE // Night Shift", url: "https://raw.githubusercontent.com/JGenius626/Algorhythm/main/Haze%20Wave/songs/Night%20Shift.mp3" },
      { title: "HAZE // Sunday Light", url: "https://raw.githubusercontent.com/JGenius626/Algorhythm/main/Haze%20Wave/songs/Sunday%20Light.mp3" },
      { title: "HAZE // Trust The Process", url: "https://raw.githubusercontent.com/JGenius626/Algorhythm/main/Haze%20Wave/songs/Trust%20The%20Process.mp3" },
      { title: "HAZE // You Don't Have To", url: "https://raw.githubusercontent.com/JGenius626/Algorhythm/main/Haze%20Wave/songs/You%20Don't%20Have%20To.mp3" }
    ]
  }
};

export const stationKeys = ['PulseFM', 'NeonReggaeton', 'HazeWave'];
export let stationIndex = 0;
export let currentStationKey = stationKeys[stationIndex];
export let radioOn = false;
export let shuffledQueue = [];
export let queueIndex = 0;

export const volumeSteps = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
export let volumeStepIndex = 7;
let volumeDisplayTimeout = null;

const audioElement = document.getElementById('game-audio');
const radioDisplay = document.getElementById('radio-display');
const knobPwr = document.getElementById('knob-pwr');
const knobStation = document.getElementById('knob-station');
const knobVol = document.getElementById('knob-vol');

export let lastPlayedUrl = null;
export let currentTrackDisplay = '[ RADIO OFF ]';

/** Callback opzionale: game.js può registrare un aggiornamento del monitor Algorhythm */
export let onRadioDisplayUpdate = null;

export function updateAllRadioDisplays(text) {
  currentTrackDisplay = text;
  if (radioDisplay) radioDisplay.textContent = text;
  if (typeof onRadioDisplayUpdate === 'function') {
    onRadioDisplayUpdate();
  }
}

function generateShuffledQueue(stationKey, avoidUrl = null) {
  const playlist = [...radioStations[stationKey].playlist];
  for (let i = playlist.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [playlist[i], playlist[j]] = [playlist[j], playlist[i]];
  }
  if (avoidUrl && playlist.length > 1 && playlist[0].url === avoidUrl) {
    const swapIdx = 1 + Math.floor(Math.random() * (playlist.length - 1));
    [playlist[0], playlist[swapIdx]] = [playlist[swapIdx], playlist[0]];
  }
  return playlist;
}

export function loadAndPlayCurrentTrack() {
  if (!radioOn) return;
  if (shuffledQueue.length === 0 || queueIndex >= shuffledQueue.length) {
    shuffledQueue = generateShuffledQueue(currentStationKey, lastPlayedUrl);
    queueIndex = 0;
  }
  const track = shuffledQueue[queueIndex];
  lastPlayedUrl = track.url;
  audioElement.src = track.url;
  updateAllRadioDisplays(track.title);
  audioElement.volume = volumeSteps[volumeStepIndex] / 100;
  audioElement.play().catch(() => {});
}

if (audioElement) {
  audioElement.addEventListener('ended', () => {
    queueIndex++;
    loadAndPlayCurrentTrack();
  });
}

export function toggleRadioPower() {
  radioOn = !radioOn;
  if (knobPwr) {
    knobPwr.classList.toggle('active', radioOn);
    knobPwr.textContent = radioOn ? 'ON' : 'OFF';
    knobPwr.style.transform = radioOn ? 'rotate(0deg)' : 'rotate(-45deg)';
  }
  if (!radioOn) {
    audioElement.pause();
    if (volumeDisplayTimeout) clearTimeout(volumeDisplayTimeout);
    updateAllRadioDisplays('[ RADIO OFF ]');
  } else {
    loadAndPlayCurrentTrack();
  }
}

export function setStation(stationKey) {
  currentStationKey = stationKey;
  stationIndex = stationKeys.indexOf(stationKey);
  lastPlayedUrl = null;
  shuffledQueue = generateShuffledQueue(stationKey);
  queueIndex = 0;

  if (radioOn) {
    loadAndPlayCurrentTrack();
  } else {
    updateAllRadioDisplays(`[ ${radioStations[stationKey].name} ]`);
  }
}

export function cycleVolume() {
  volumeStepIndex = (volumeStepIndex + 1) % volumeSteps.length;
  const newVol = volumeSteps[volumeStepIndex];
  audioElement.volume = newVol / 100;
  if (knobVol) knobVol.textContent = newVol;

  if (radioOn) {
    updateAllRadioDisplays(`[ VOLUME: ${newVol}% ]`);
    if (volumeDisplayTimeout) clearTimeout(volumeDisplayTimeout);
    volumeDisplayTimeout = setTimeout(() => {
      if (radioOn && shuffledQueue.length > 0 && shuffledQueue[queueIndex]) {
        updateAllRadioDisplays(shuffledQueue[queueIndex].title);
      }
    }, 2000);
  } else {
    if (typeof onRadioDisplayUpdate === 'function') {
      onRadioDisplayUpdate();
    }
  }
}

/** Reset radio allo stato iniziale (es. all'avvio del gioco) */
export function resetRadioUI() {
  radioOn = false;
  if (knobPwr) {
    knobPwr.classList.remove('active');
    knobPwr.textContent = 'OFF';
    knobPwr.style.transform = 'rotate(-45deg)';
  }
  if (audioElement) audioElement.pause();
  updateAllRadioDisplays('[ RADIO OFF ]');
}

// Bind knobs
if (knobPwr) knobPwr.addEventListener('click', toggleRadioPower);
if (knobStation) {
  knobStation.addEventListener('click', () => {
    stationIndex = (stationIndex + 1) % stationKeys.length;
    setStation(stationKeys[stationIndex]);
  });
}
if (knobVol) knobVol.addEventListener('click', cycleVolume);
