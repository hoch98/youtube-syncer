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
  if (!res || !res.connected) return;

  const video = document.querySelector('video');
  const onWatch = window.location.pathname.startsWith('/watch');

  if (!onWatch || !video) return;

  // INITIAL SYNC (Role or Video changed)
  if (currentRole !== (res.leader ? 'leader' : 'follower') || !isSameVideo(currentVideo, window.location.href)) {
    currentRole = res.leader ? 'leader' : 'follower';
    currentVideo = window.location.href;

    if (res.leader) {
      initLeader(video);
    } else {
      // THE FIX: Wait for metadata/ready before seeking to prevent the start-loop
      if (video.readyState >= 2) { 
        video.currentTime = res.state.time;
        res.state.paused ? video.pause() : video.play();
      }
    }
  }

  // DRIFT CORRECTION (Only if not seeking)
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