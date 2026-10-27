import type { ReplaySpeed } from '../position/replaySource';
import { formatElapsed } from './format';
import { $ } from './menu';

/** The Replay controls in the top-right corner: IGC file, play/pause, speed and a timeline to jump in. */
export function createReplayPanel(handlers: {
  onFile: (file: File) => void;
  onPlayPause: () => void;
  onSpeed: (speed: ReplaySpeed) => void;
  onSeek: (time: number) => void;
}) {
  const panel = $('replay-panel');
  const play = $<HTMLButtonElement>('replay-play');
  const timeline = $<HTMLInputElement>('replay-timeline');
  const speedButtons = [...$('replay-speed').querySelectorAll<HTMLButtonElement>('button')];
  let start = 0;
  let dragging = false;

  $<HTMLInputElement>('replay-file').addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) handlers.onFile(file);
  });
  play.addEventListener('click', handlers.onPlayPause);
  for (const button of speedButtons) {
    button.addEventListener('click', () => {
      for (const b of speedButtons) b.setAttribute('aria-pressed', String(b === button));
      handlers.onSpeed(Number(button.dataset.speed) as ReplaySpeed);
    });
  }

  const showElapsed = (time: number) => ($('replay-elapsed').textContent = formatElapsed(time - start));
  timeline.addEventListener('pointerdown', () => (dragging = true));
  window.addEventListener('pointerup', () => (dragging = false));
  timeline.addEventListener('input', () => {
    showElapsed(Number(timeline.value));
    handlers.onSeek(Number(timeline.value));
  });

  return {
    get speed(): ReplaySpeed {
      return Number(speedButtons.find((b) => b.getAttribute('aria-pressed') === 'true')?.dataset.speed ?? 1) as ReplaySpeed;
    },
    show(visible: boolean) {
      panel.hidden = !visible;
    },
    load(fileName: string, startTime: number, endTime: number) {
      start = startTime;
      $('replay-file-name').textContent = fileName;
      $('replay-total').textContent = formatElapsed(endTime - startTime);
      timeline.min = String(startTime);
      timeline.max = String(endTime);
      timeline.disabled = false;
      play.disabled = false;
      this.setTime(startTime);
    },
    setPlaying(playing: boolean) {
      play.textContent = playing ? '❚❚' : '▶';
      play.title = playing ? 'Pause' : 'Play';
    },
    setTime(time: number) {
      if (dragging) return;
      timeline.value = String(time);
      showElapsed(time);
    },
  };
}
