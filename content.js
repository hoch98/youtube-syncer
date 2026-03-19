// --- Global State ---
let currentVideo = null;
let currentRole = null;
let syncInterval = null;
let navigating = false;

// --- Helpers ---
const getVideoId = (url) => {
  try {
    return new URL(url).searchParams.get('v');
  } catch {
    return null;
  }
};

const isSameVideo = (url1, url2) => {
  if (!url1 || !url2) return false;
  const id1 = getVideoId(url1);
  const id2 = getVideoId(url2);
  if (id1 && id2) return id1 === id2;
  return url1 === url2;
};

function waitForElement(selector) {
  return new Promise((resolve) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) { observer.disconnect(); resolve(el); }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

// --- Logic ---

function teardown() {
  if (syncInterval) clearInterval(syncInterval);
  syncInterval = null;
  currentVideo = null;
  currentRole = null;
}

async function initLeader(video) {
  console.log('Initializing as Leader');
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
  console.log('Navigating to leader video:', url);
  window.location.href = url;
  // Safety timeout to unlock if navigation fails
  setTimeout(() => { navigating = false; }, 5000);
}

async function poll() {
  const res = await chrome.runtime.sendMessage({ type: 'socket_info' }).catch(() => ({}));
  if (!res || !res.connected) {
    if (currentRole) teardown();
    return;
  }

  const onWatch = window.location.pathname.startsWith('/watch');
  
  // 1. Leader Leave Logic
  if (res.leader && !onWatch && currentVideo) {
    chrome.runtime.sendMessage({ type: 'clear_video' });
    teardown();
    return;
  }

  // 2. Follower Navigation Logic
  if (!res.leader && res.state.video) {
    if (!isSameVideo(window.location.href, res.state.video)) {
      navigateTo(res.state.video);
      return; 
    }
  }

  const video = document.querySelector('video');
  if (!onWatch || !video) return;

  // 3. Sync/Init Logic
  const roleChanged = currentRole !== (res.leader ? 'leader' : 'follower');
  const videoChanged = !isSameVideo(currentVideo, window.location.href);

  if (roleChanged || videoChanged) {
    currentRole = res.leader ? 'leader' : 'follower';
    currentVideo = window.location.href;
    navigating = false; // We have arrived

    if (res.leader) {
      initLeader(video);
    } else {
      // Follower Initial Sync: Only seek if video is ready
      if (video.readyState >= 2) {
        video.currentTime = res.state.time;
        res.state.paused ? video.pause() : video.play();
      }
    }
    return;
  }

  // 4. Drift Correction (Follower Only)
  if (!res.leader && video.readyState >= 3 && !video.seeking) {
    const drift = Math.abs(video.currentTime - res.state.time);
    if (drift > 1.5) {
      console.log(`Drift detected: ${drift}s. Correcting...`);
      video.currentTime = res.state.time;
    }
  }
}

// --- Listeners ---

chrome.runtime.onMessage.addListener((msg) => {
  const video = document.querySelector('video');
  
  switch (msg.type) {
    case 'sync_paused':
      if (video) msg.paused ? video.pause() : video.play();
      break;

    case 'sync_time':
      // Direct sync to reduce delay, only for followers
      if (video && currentRole === 'follower' && !video.seeking) {
        const drift = Math.abs(video.currentTime - msg.time);
        if (drift > 2) video.currentTime = msg.time;
      }
      break;

    case 'sync_cleared':
      teardown();
      if (window.location.pathname.startsWith('/watch')) {
        window.location.href = 'https://www.youtube.com';
      }
      break;
    
    case 'connected':
    case 'disconnected':
      teardown();
      poll();
      break;
  }
});

// Run
setInterval(poll, 1000);
poll();