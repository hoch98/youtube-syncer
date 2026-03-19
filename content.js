// --- Helper Functions ---
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

function isSameVideo(url1, url2) {
  if (!url1 || !url2) return false;
  const getV = (u) => { try { return new URL(u).searchParams.get('v'); } catch { return null; } };
  const id1 = getV(url1); const id2 = getV(url2);
  return (id1 && id2) ? id1 === id2 : url1 === url2;
}

// --- State Variables ---
let timeInterval = null;
let currentRole = null;
let currentVideo = null;
let navigating = false;

async function initLeader(video) {
  console.log('Role: Leader');
  chrome.runtime.sendMessage({ type: 'select_video', url: window.location.href });

  if (timeInterval) clearInterval(timeInterval);
  timeInterval = setInterval(() => {
    // High frequency update (250ms) for low delay
    chrome.runtime.sendMessage({ type: 'update_time', time: video.currentTime });
  }, 250);

  video.onpause = () => chrome.runtime.sendMessage({ type: 'update_paused', paused: true });
  video.onplay = () => chrome.runtime.sendMessage({ type: 'update_paused', paused: false });
}

async function initFollower(video, initialTime, initialPaused) {
  console.log('Role: Follower. Syncing to:', initialTime);
  if (initialTime) video.currentTime = initialTime;
  initialPaused ? video.pause() : video.play();
}

function navigateTo(url) {
  if (navigating) return;
  navigating = true;
  window.location.href = url;
}

async function poll() {
  let res;
  try { res = await chrome.runtime.sendMessage({ type: 'socket_info' }); } catch { return; }
  const { connected, leader, state } = res;

  if (!connected) return;

  // 1. Navigation Logic
  if (!leader && state.video && !isSameVideo(window.location.href, state.video)) {
    navigateTo(state.video);
    return;
  }

  const onWatchPage = window.location.pathname.startsWith('/watch');
  if (!onWatchPage) return;

  const roleChanged = currentRole !== (leader ? 'leader' : 'follower');
  const videoChanged = !isSameVideo(currentVideo, window.location.href);

  // 2. Drift Correction (Follower Only)
  if (!roleChanged && !videoChanged) {
    if (!leader) {
      const video = document.querySelector('video');
      // readyState >= 3 means the video has enough data to seek/play
      if (video && video.readyState >= 3 && !video.seeking) {
        const drift = Math.abs(video.currentTime - state.time);
        if (drift > 1.5) video.currentTime = state.time; 
        if (video.paused !== state.paused) state.paused ? video.pause() : video.play();
      }
    }
    return;
  }

  // 3. Initialization
  currentRole = leader ? 'leader' : 'follower';
  currentVideo = window.location.href;
  const video = await waitForElement('video');

  if (leader) await initLeader(video);
  else await initFollower(video, state.time, state.paused);
}

// Listen for direct sync messages from Service Worker
chrome.runtime.onMessage.addListener((msg) => {
  const video = document.querySelector('video');
  if (!video || video.readyState < 3) return;

  if (msg.type === 'sync_paused') {
    msg.paused ? video.pause() : video.play();
  } else if (msg.type === 'sync' && !isSameVideo(window.location.href, msg.video)) {
    navigateTo(msg.video);
  }
});

setInterval(poll, 500); // Check status every half second
poll();