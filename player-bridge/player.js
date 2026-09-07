(() => {
  'use strict';

  const version = 1;
  const clientSource = 'pixel-jukebox-sidepanel';
  const serverSource = 'pixel-jukebox-player-bridge';
  const videoIdPattern = /^[A-Za-z0-9_-]{11}$/;
  let parentOrigin = null;
  let apiReady = false;
  let playerReady = false;
  let youtubePlayer = null;
  let activeVideoId = '';
  let autoplayAfterReady = false;

  function validExtensionOrigin(value) {
    if (typeof value !== 'string') return false;
    try {
      const url = new URL(value);
      return url.protocol === 'chrome-extension:' && /^[a-p]{32}$/.test(url.hostname) && (url.pathname === '' || url.pathname === '/');
    } catch {
      return false;
    }
  }

  function sendToParent(type, detail = {}) {
    if (!parentOrigin) return;
    window.parent.postMessage({ source: serverSource, version, type, ...detail }, parentOrigin);
  }

  function announceReady() {
    if (apiReady && parentOrigin) sendToParent('ready');
  }

  function metadata() {
    if (!youtubePlayer || typeof youtubePlayer.getVideoData !== 'function') return null;
    const data = youtubePlayer.getVideoData();
    const videoId = typeof data?.video_id === 'string' && videoIdPattern.test(data.video_id) ? data.video_id : activeVideoId;
    const videoTitle = typeof data?.title === 'string' ? data.title.trim() : '';
    const channelTitle = typeof data?.author === 'string' ? data.author.trim() : '';
    return videoIdPattern.test(videoId) && videoTitle ? { videoId, videoTitle, channelTitle: channelTitle || 'YouTube' } : null;
  }

  function sendMetadata(attempt = 0) {
    const value = metadata();
    if (value) {
      sendToParent('metadata', value);
      return;
    }
    if (attempt < 5) window.setTimeout(() => sendMetadata(attempt + 1), 250 * (attempt + 1));
  }

  async function fetchMetadata(videoId) {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const endpoint = new URL('https://www.youtube.com/oembed');
    endpoint.searchParams.set('url', watchUrl);
    endpoint.searchParams.set('format', 'json');
    try {
      const response = await fetch(endpoint, { referrerPolicy: 'strict-origin-when-cross-origin' });
      if (!response.ok) return;
      const data = await response.json();
      const videoTitle = typeof data?.title === 'string' ? data.title.trim().slice(0, 500) : '';
      const channelTitle = typeof data?.author_name === 'string' ? data.author_name.trim().slice(0, 200) : '';
      if (videoTitle) sendToParent('metadata', { videoId, videoTitle, channelTitle: channelTitle || 'YouTube' });
    } catch {
      sendMetadata();
    }
  }

  function onPlayerReady(event) {
    playerReady = true;
    const iframe = event.target.getIframe();
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
    if (autoplayAfterReady) {
      autoplayAfterReady = false;
      event.target.playVideo();
    }
    sendMetadata();
  }

  function onPlayerStateChange(event) {
    const state = ({ 0: 'ended', 1: 'playing', 2: 'paused', 3: 'buffering', 5: 'paused' })[event.data];
    if (state) sendToParent('state', { state });
    sendMetadata();
  }

  function onPlayerError(event) {
    sendToParent('error', { code: typeof event.data === 'number' ? event.data : 0 });
  }

  function createPlayer(videoId, autoplay) {
    autoplayAfterReady = autoplay;
    youtubePlayer = new window.YT.Player('youtube-player', {
      width: '100%',
      height: '100%',
      videoId,
      playerVars: {
        autoplay: autoplay ? 1 : 0,
        playsinline: 1,
        rel: 0,
        origin: location.origin,
        widget_referrer: location.origin,
      },
      events: {
        onReady: onPlayerReady,
        onStateChange: onPlayerStateChange,
        onError: onPlayerError,
        onAutoplayBlocked: () => sendToParent('state', { state: 'paused' }),
      },
    });
  }

  function loadVideo(videoId, autoplay) {
    activeVideoId = videoId;
    void fetchMetadata(videoId);
    if (!youtubePlayer) {
      createPlayer(videoId, autoplay);
      return;
    }
    if (!playerReady) return;
    if (autoplay) youtubePlayer.loadVideoById(videoId);
    else youtubePlayer.cueVideoById(videoId);
    sendMetadata();
  }

  window.onYouTubeIframeAPIReady = () => {
    apiReady = true;
    announceReady();
  };

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return;
    const message = event.data;
    if (!message || typeof message !== 'object' || message.source !== clientSource || message.version !== version) return;
    if (message.type === 'init' && validExtensionOrigin(event.origin)) {
      if (parentOrigin && event.origin !== parentOrigin) return;
      parentOrigin = event.origin;
      announceReady();
      return;
    }
    if (!parentOrigin || event.origin !== parentOrigin || !apiReady) return;
    if (message.type === 'load' && typeof message.videoId === 'string' && videoIdPattern.test(message.videoId) && typeof message.autoplay === 'boolean') {
      loadVideo(message.videoId, message.autoplay);
      return;
    }
    if (message.type === 'command' && playerReady && (message.action === 'play' || message.action === 'pause')) {
      youtubePlayer[message.action === 'play' ? 'playVideo' : 'pauseVideo']();
    }
  });
})();
