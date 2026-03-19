let currentVideo = null;
let currentRole = null;
let syncInterval = null;
let navigating = false;

const getVideoId = (url) => {
  try { return new URL(url).searchParams.get('v'); } catch { return null; }
};

const isSameVideo = (url1, url2) => {
  if (!url1 || !url2) return false;
  const id1 = getVideoId(url1);
  const id2 = getVideoId(url2);
  return (id1 && id2) ? id1 === id2 : url1 === url2;
};

function teardown() {
  if (syncInterval) clearInterval(syncInterval);
  syncInterval = null;
  currentVideo = null;
  currentRole = null;
}

async function initLeader(video) {
  chrome.runtime.sendMessage({ type: 'select_video', url: window.location.href });
  if (syncInterval) clearInterval(syncInterval);
  syncInterval = setInterval(() => {
    chrome.runtime.sendMessage({ type: 'update_time', time: video.currentTime });
  }, 500);

  video.onpause = () => chrome.runtime.sendMessage({ type: 'update_paused', paused: true });
  video.onplay = () => chrome.runtime.sendMessage({ type: 'update_paused', paused: false });
}

function navigateTo(url) {
  if (navigating) return;
  navigating = true;
  window.location.href = url;
  setTimeout(() => { navigating = false; }, 5000); // Unlock after 5s
}

async function poll() {
  const res = await chrome.runtime.sendMessage({ type: 'socket_info' }).catch(() => ({}));
  if (!res || !res.connected) {
    if (currentRole) teardown();
    return;
  }

  const onWatch = window.location.pathname.startsWith('/watch');

  // 1. Navigation: If follower is on wrong page
  if (!res.leader && res.state.video && !isSameVideo(window.location.href, res.state.video)) {
    navigateTo(res.state.video);
    return;
  }

  // 2. Clear Logic: If leader leaves watch page
  if (res.leader && !onWatch && currentVideo) {
    chrome.runtime.sendMessage({ type: 'clear_video' });
    teardown();
    return;
  }

  const video = document.querySelector('video');
  if (!onWatch || !video) return;

  // 3. Sync Initialization
  const roleChanged = currentRole !== (res.leader ? 'leader' : 'follower');
  const videoChanged = !isSameVideo(currentVideo, window.location.href);

  if (roleChanged || videoChanged) {
    currentRole = res.leader ? 'leader' : 'follower';
    currentVideo = window.location.href;
    navigating = false;

    if (res.leader) {
      initLeader(video);
    } else if (video.readyState >= 2) {
      video.currentTime = res.state.time;
      res.state.paused ? video.pause() : video.play();
    }
    return;
  }

  // 4. Drift Correction
  if (!res.leader && video.readyState >= 3 && !video.seeking) {
    const drift = Math.abs(video.currentTime - res.state.time);
    if (drift > 1.5) video.currentTime = res.state.time;
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  const video = document.querySelector('video');
  if (msg.type === 'sync_paused' && video) {
    msg.paused ? video.pause() : video.play();
  } else if (msg.type === 'sync_time' && video && currentRole === 'follower') {
    if (Math.abs(video.currentTime - msg.time) > 2) video.currentTime = msg.time;
  } else if (msg.type === 'sync_cleared') {
    teardown();
    if (window.location.pathname.startsWith('/watch')) window.location.href = 'https://www.youtube.com';
  }
});

setInterval(poll, 1000);
poll();