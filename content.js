let currentVideo = null;
let currentRole = null;
let timeInterval = null;

const isSameVideo = (url1, url2) => {
  if (!url1 || !url2) return false;
  const getV = (u) => { try { return new URL(u).searchParams.get('v'); } catch { return null; } };
  const id1 = getV(url1); const id2 = getV(url2);
  return (id1 && id2) ? id1 === id2 : url1 === url2;
};

async function initLeader(video) {
  chrome.runtime.sendMessage({ type: 'select_video', url: window.location.href });
  if (timeInterval) clearInterval(timeInterval);
  timeInterval = setInterval(() => {
    chrome.runtime.sendMessage({ type: 'update_time', time: video.currentTime });
  }, 500);

  video.onpause = () => chrome.runtime.sendMessage({ type: 'update_paused', paused: true });
  video.onplay = () => chrome.runtime.sendMessage({ type: 'update_paused', paused: false });
}

function teardown() {
  if (timeInterval) clearInterval(timeInterval);
  timeInterval = null;
  currentRole = null;
  currentVideo = null;
}

async function poll() {
  const res = await chrome.runtime.sendMessage({ type: 'socket_info' }).catch(() => ({}));
  if (!res.connected) return;

  const onWatch = window.location.pathname.startsWith('/watch');
  const video = document.querySelector('video');

  // Handle Leader leaving a video
  if (res.leader && !onWatch && currentVideo) {
    chrome.runtime.sendMessage({ type: 'clear_video' });
    teardown();
    return;
  }

  // Handle Follower navigation
  if (!res.leader && res.state.video && !isSameVideo(window.location.href, res.state.video)) {
    window.location.href = res.state.video;
    return;
  }

  if (!onWatch || !video) return;

  // Initialization/Sync Logic
  const roleChanged = currentRole !== (res.leader ? 'leader' : 'follower');
  const videoChanged = !isSameVideo(currentVideo, window.location.href);

  if (roleChanged || videoChanged) {
    currentRole = res.leader ? 'leader' : 'follower';
    currentVideo = window.location.href;
    if (res.leader) {
      initLeader(video);
    } else {
      // Follower initial sync: wait for video data to prevent looping at 0
      if (video.readyState >= 2) {
        video.currentTime = res.state.time;
        res.state.paused ? video.pause() : video.play();
      }
    }
    return;
  }

  // Drift Correction for Followers
  if (!res.leader && video.readyState >= 3 && !video.seeking) {
    const drift = Math.abs(video.currentTime - res.state.time);
    if (drift > 1.5) video.currentTime = res.state.time;
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  const video = document.querySelector('video');
  if (msg.type === 'sync_paused' && video) {
    msg.paused ? video.pause() : video.play();
  } else if (msg.type === 'sync_cleared') {
    teardown();
    if (window.location.pathname.startsWith('/watch')) {
      window.location.href = 'https://www.youtube.com';
    }
  } else if (msg.type === 'sync_time' && video && !currentRole === 'leader') {
     const drift = Math.abs(video.currentTime - msg.time);
     if (drift > 2) video.currentTime = msg.time;
  }
});

setInterval(poll, 1000);
poll();