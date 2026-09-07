import type { PlayerAction, PlayerSnapshot } from '../shared/track';
import { defaultSettings } from '../shared/settings';
import type { DesignSettings } from '../shared/settings';

export function createPlayer(root: HTMLElement, onCommand: (action: PlayerAction) => void) {
  root.innerHTML = `
    <div class="disc-stage"><div class="disc" data-style="lp" data-playing="false" aria-label="LP 디스크">
      <div class="disc-label"><img class="artwork" alt="현재 영상 썸네일" referrerpolicy="no-referrer" hidden></div><div class="disc-hole"></div>
    </div></div>
    <p class="eyebrow">NOW PLAYING</p>
    <h2 class="track-title">YouTube에서 음악을 재생해주세요.</h2>
    <p class="channel-title"></p>
    <p class="playback-status" role="status" aria-live="polite">연결 대기</p>
    <div class="playback-controls">
      <button class="previous" type="button" aria-label="이전 영상" title="YouTube 이전 영상" disabled><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2h2v12H2zM14 2v12L5 8z"/></svg></button>
      <button class="toggle" type="button" aria-label="재생" disabled><svg viewBox="0 0 16 16" aria-hidden="true"><path class="play-icon" d="M4 2v12l10-6z"/><path class="pause-icon" d="M3 2h4v12H3zM9 2h4v12H9z"/></svg></button>
      <button class="next" type="button" aria-label="다음 영상" title="YouTube 다음 영상" disabled><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M12 2h2v12h-2zM2 2v12l9-6z"/></svg></button>
    </div>`;
  const disc = root.querySelector<HTMLElement>('.disc')!;
  const title = root.querySelector<HTMLElement>('.track-title')!;
  const channel = root.querySelector<HTMLElement>('.channel-title')!;
  const status = root.querySelector<HTMLElement>('.playback-status')!;
  const artwork = root.querySelector<HTMLImageElement>('.artwork')!;
  const buttons = Object.fromEntries(['previous', 'toggle', 'next'].map((action) => [action, root.querySelector<HTMLButtonElement>(`.${action}`)!])) as Record<PlayerAction, HTMLButtonElement>;
  for (const action of ['previous', 'toggle', 'next'] as const) buttons[action].addEventListener('click', () => onCommand(action));
  artwork.addEventListener('error', () => { artwork.hidden = true; });
  let imageUrl = '';
  return {
    render(snapshot: PlayerSnapshot, settings: DesignSettings = defaultSettings, playlistNavigation = { previous: false, next: false }) {
      const track = snapshot.track;
      const playing = track?.playbackState === 'playing';
      disc.dataset.playing = String(playing);
      disc.dataset.style = settings.discStyle;
      artwork.hidden = !settings.artwork || !track?.thumbnail;
      disc.style.setProperty('--disc-accent', settings.accent);
      root.dataset.videoId = track?.videoId ?? '';
      title.textContent = track?.videoTitle ?? 'YouTube에서 음악을 재생해주세요.';
      channel.textContent = track ? `채널 · ${track.channelTitle}` : '';
      status.textContent = snapshot.error ? '재생을 제어하지 못했습니다. YouTube 탭에서 확인해주세요.'
        : track ? ({ playing: '재생 중', paused: '일시정지', buffering: '버퍼링 중', ended: '재생 종료', error: '영상 재생 오류' }[track.playbackState]) : '영상 연결 대기';
      status.classList.toggle('error-text', snapshot.error);
      if ((track?.thumbnail ?? '') !== imageUrl) {
        imageUrl = track?.thumbnail ?? '';
        artwork.hidden = !imageUrl;
        if (imageUrl) artwork.src = imageUrl;
        else artwork.removeAttribute('src');
      }
      buttons.previous.disabled = !track || (!snapshot.previous && !playlistNavigation.previous);
      buttons.next.disabled = !track || (!snapshot.next && !playlistNavigation.next);
      buttons.toggle.disabled = !track;
      buttons.toggle.setAttribute('aria-label', playing || track?.playbackState === 'buffering' ? '일시정지' : '재생');
      buttons.toggle.dataset.playing = String(playing || track?.playbackState === 'buffering');
    },
  };
}
