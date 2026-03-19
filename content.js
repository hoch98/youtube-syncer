let currentVideo = null;
let currentRole = null;
let syncInterval = null;
let navigating = false;

const isSameVideo = (url1, url2) => {
  if (!url1 || !url2) return false;
  const getV = (u) => { try { return new URL(u).searchParams.get('v'); } catch { return null; } };
  return getV(url1) === getV(url2);
};

function teardown() {
  if (syncInterval) clearInterval(syncInterval);
  syncInterval = null;
  currentVideo = null;
  currentRole = null;
  navigating = false;
}

function initLeader(video) {
  chrome.runtime.sendMessage({ type: 'select_video', url: window.location.href });
  if (syncInterval) clearInterval(syncInterval);
  syncInterval = setInterval(() => {
    chrome.runtime.sendMessage({ type: 'update_time', time: video.currentTime });
  }, 500);
  video.onpause = () => chrome.runtime.sendMessage({ type: 'update_paused', paused: true });
  video.onplay = () => chrome.runtime.sendMessage({ type: 'update_paused', paused: false });
}

async function poll() {
  const res = await chrome.runtime.sendMessage({ type: 'socket_info' }).catch(() => ({}));
  if (!res || !res.connected) return;

  // 1. If server state is cleared, stop everything
  if (!res.state.video) {
    if (currentVideo !== null) teardown();
    return;
  }

  const onWatch = window.location.pathname.startsWith('/watch');

  // 2. Leader Leave Logic
  if (res.leader && !onWatch && currentVideo) {
    chrome.runtime.sendMessage({ type: 'clear_video' });
    teardown();
    return;
  }

  // 3. Follower Navigation Logic
  if (!res.leader && res.state.video && !isSameVideo(window.location.href, res.state.video)) {
    if (!navigating) {
      navigating = true;
      window.location.href = res.state.video;
    }
    return;
  }

  const video = document.querySelector('video');
  if (!onWatch || !video) return;

  // 4. Sync/Init Logic
  if (currentRole !== (res.leader ? 'leader' : 'follower') || !isSameVideo(currentVideo, window.location.href)) {
    currentRole = res.leader ? 'leader' : 'follower';
    currentVideo = window.location.href;
    navigating = false;

    if (res.leader) {
      initLeader(video);
    } else if (video.readyState >= 2) {
      video.currentTime = res.state.time;
      res.state.paused ? video.pause() : video.play();
    }
  }

  // 5. Follower Drift Correction
  if (!res.leader && video.readyState >= 3 && !video.seeking) {
    const drift = Math.abs(video.currentTime - res.state.time);
    if (drift > 1.5) video.currentTime = res.state.time;
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  const video = document.querySelector('video');
  switch (msg.type) {
    case 'sync_paused':
      if (video) msg.paused ? video.pause() : video.play();
      break;
    case 'sync_time':
      if (video && currentRole === 'follower' && !video.seeking) {
        if (Math.abs(video.currentTime - msg.time) > 2) video.currentTime = msg.time;
      }
      break;
    case 'sync_cleared':
      teardown();
      if (window.location.pathname.startsWith('/watch')) {
        window.location.href = 'https://www.youtube.com';
      }
      break;
  }
});

setInterval(poll, 1000);
poll();