// Audio management for the engine

import { parseAudioCommands, AudioCommand } from '../shared/utils';
import type { AssetManager } from './assets';
import { getAssetUrl } from './assets';

export interface AudioManager {
  musicElement: HTMLAudioElement | null;
  sfxElements: HTMLAudioElement[];
  ambientElement: HTMLAudioElement | null;
  currentMusic: string | null;
  currentAmbient: string | null;
  volume: number;
  muted: boolean;
}

/**
 * Create audio manager
 */
export function createAudioManager(): AudioManager {
  return {
    musicElement: null,
    sfxElements: [],
    ambientElement: null,
    currentMusic: null,
    currentAmbient: null,
    volume: 0.7,
    muted: false
  };
}

/**
 * Initialize audio elements
 */
export function initAudio(manager: AudioManager): void {
  // Create music element
  manager.musicElement = document.createElement('audio');
  manager.musicElement.volume = manager.volume;

  // Create ambient element
  manager.ambientElement = document.createElement('audio');
  manager.ambientElement.volume = manager.volume * 0.5; // Ambient at half volume
  manager.ambientElement.loop = true;
}

/**
 * Process audio commands in text
 */
export async function processAudioCommands(
  text: string,
  manager: AudioManager,
  assetManager: AssetManager
): Promise<void> {
  const commands = parseAudioCommands(text);

  for (const command of commands) {
    await executeAudioCommand(command, manager, assetManager);
  }
}

/**
 * Execute a single audio command
 */
async function executeAudioCommand(
  command: AudioCommand,
  manager: AudioManager,
  assetManager: AssetManager
): Promise<void> {
  if (manager.muted) return;

  switch (command.type) {
    case 'music':
      await playMusic(manager, assetManager, command.file, command.loop);
      break;

    case 'sfx':
      await playSfx(manager, assetManager, command.file);
      break;

    case 'ambient':
      await playAmbient(manager, assetManager, command.file);
      break;

    case 'stop':
      if (command.file === 'music' || command.file === 'all') {
        stopMusic(manager);
      }
      if (command.file === 'ambient' || command.file === 'all') {
        stopAmbient(manager);
      }
      if (command.file === 'sfx' || command.file === 'all') {
        stopAllSfx(manager);
      }
      break;
  }
}

/**
 * Play background music
 */
export async function playMusic(
  manager: AudioManager,
  assetManager: AssetManager,
  file: string,
  loop: boolean = false
): Promise<void> {
  if (!manager.musicElement) return;

  // Stop current music if different
  if (manager.currentMusic !== file) {
    stopMusic(manager);
  } else if (!manager.musicElement.paused) {
    return; // Already playing this track
  }

  const url = await getAssetUrl(assetManager, file);
  if (!url) return;

  manager.musicElement.src = url;
  manager.musicElement.loop = loop;
  manager.musicElement.volume = manager.volume;
  manager.currentMusic = file;

  try {
    await manager.musicElement.play();
  } catch (e) {
    console.warn('Audio autoplay blocked:', e);
  }
}

/**
 * Stop music
 */
export function stopMusic(manager: AudioManager): void {
  if (!manager.musicElement) return;

  manager.musicElement.pause();
  manager.musicElement.currentTime = 0;
  manager.currentMusic = null;
}

/**
 * Play sound effect
 */
export async function playSfx(
  manager: AudioManager,
  assetManager: AssetManager,
  file: string
): Promise<void> {
  const url = await getAssetUrl(assetManager, file);
  if (!url) return;

  const audio = document.createElement('audio');
  audio.src = url;
  audio.volume = manager.volume;

  // Clean up after playing
  audio.addEventListener('ended', () => {
    const index = manager.sfxElements.indexOf(audio);
    if (index > -1) {
      manager.sfxElements.splice(index, 1);
    }
  });

  manager.sfxElements.push(audio);

  try {
    await audio.play();
  } catch (e) {
    console.warn('SFX autoplay blocked:', e);
  }
}

/**
 * Stop all sound effects
 */
export function stopAllSfx(manager: AudioManager): void {
  for (const audio of manager.sfxElements) {
    audio.pause();
    audio.currentTime = 0;
  }
  manager.sfxElements = [];
}

/**
 * Play ambient sound
 */
export async function playAmbient(
  manager: AudioManager,
  assetManager: AssetManager,
  file: string
): Promise<void> {
  if (!manager.ambientElement) return;

  if (manager.currentAmbient !== file) {
    stopAmbient(manager);
  } else if (!manager.ambientElement.paused) {
    return;
  }

  const url = await getAssetUrl(assetManager, file);
  if (!url) return;

  manager.ambientElement.src = url;
  manager.ambientElement.loop = true;
  manager.ambientElement.volume = manager.volume * 0.5;
  manager.currentAmbient = file;

  try {
    await manager.ambientElement.play();
  } catch (e) {
    console.warn('Ambient autoplay blocked:', e);
  }
}

/**
 * Stop ambient sound
 */
export function stopAmbient(manager: AudioManager): void {
  if (!manager.ambientElement) return;

  manager.ambientElement.pause();
  manager.ambientElement.currentTime = 0;
  manager.currentAmbient = null;
}

/**
 * Set volume
 */
export function setVolume(manager: AudioManager, volume: number): void {
  manager.volume = Math.max(0, Math.min(1, volume));

  if (manager.musicElement) {
    manager.musicElement.volume = manager.volume;
  }

  if (manager.ambientElement) {
    manager.ambientElement.volume = manager.volume * 0.5;
  }

  for (const sfx of manager.sfxElements) {
    sfx.volume = manager.volume;
  }
}

/**
 * Mute/unmute
 */
export function setMuted(manager: AudioManager, muted: boolean): void {
  manager.muted = muted;

  if (manager.musicElement) {
    manager.musicElement.muted = muted;
  }

  if (manager.ambientElement) {
    manager.ambientElement.muted = muted;
  }

  for (const sfx of manager.sfxElements) {
    sfx.muted = muted;
  }
}

/**
 * Toggle mute
 */
export function toggleMute(manager: AudioManager): boolean {
  setMuted(manager, !manager.muted);
  return manager.muted;
}

/**
 * Stop all audio
 */
export function stopAllAudio(manager: AudioManager): void {
  stopMusic(manager);
  stopAmbient(manager);
  stopAllSfx(manager);
}

/**
 * Get current audio state for UI
 */
export function getAudioState(manager: AudioManager): {
  musicPlaying: string | null;
  ambientPlaying: string | null;
  volume: number;
  muted: boolean;
} {
  return {
    musicPlaying: manager.currentMusic,
    ambientPlaying: manager.currentAmbient,
    volume: manager.volume,
    muted: manager.muted
  };
}

/**
 * Create audio controls UI
 */
export function createAudioControls(
  manager: AudioManager,
  onVolumeChange: (volume: number) => void,
  onMuteToggle: () => void
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'audio-controls';
  container.innerHTML = `
    <button id="mute-btn" title="Toggle mute">
      ${manager.muted ? '🔇' : '🔊'}
    </button>
    <input type="range" id="volume-slider"
           min="0" max="100" value="${manager.volume * 100}"
           title="Volume">
  `;

  const muteBtn = container.querySelector('#mute-btn') as HTMLButtonElement;
  const volumeSlider = container.querySelector('#volume-slider') as HTMLInputElement;

  muteBtn.onclick = () => {
    onMuteToggle();
    muteBtn.textContent = manager.muted ? '🔇' : '🔊';
  };

  volumeSlider.oninput = () => {
    const volume = parseInt(volumeSlider.value) / 100;
    onVolumeChange(volume);
  };

  return container;
}

/**
 * Create now playing indicator
 */
export function createNowPlaying(manager: AudioManager): HTMLElement {
  const container = document.createElement('div');
  container.className = 'audio-player';

  function update() {
    if (manager.currentMusic || manager.currentAmbient) {
      container.classList.add('visible');
      container.innerHTML = `
        <span class="audio-title">${manager.currentMusic || manager.currentAmbient}</span>
        <button id="audio-stop">⏹</button>
      `;

      const stopBtn = container.querySelector('#audio-stop') as HTMLButtonElement;
      stopBtn.onclick = () => stopAllAudio(manager);
    } else {
      container.classList.remove('visible');
    }
  }

  // Update periodically
  setInterval(update, 1000);
  update();

  return container;
}
