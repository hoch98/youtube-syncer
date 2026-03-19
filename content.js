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
  // Unlock navigation after a delay to allow page load
  setTimeout(() => { navigating = false; }, 2000);
}

// Resets local tracking variables
function resetState() {
  if (timeInterval) clearInterval(timeInterval);
  timeInterval = null;
  currentRole = null;
  currentVideo = null;
  navigating = false;
}

async function poll() {
  let res;
  try { res = await chrome.runtime.sendMessage({ type: 'socket_info' }); } catch { return; }
  const { connected, leader, state } = res;

  if (!connected) return;

  const onWatchPage = window.location.pathname.startsWith('/watch');

  // --- 1. Leader-Specific Clear Logic ---
  // If leader leaves a video page, tell the server to clear the global state
  if (leader && !onWatchPage && currentVideo !== null) {
    console.log('Leader left watch page, clearing video state');
    chrome.runtime.sendMessage({ type: 'clear_video' });
    resetState();
    return;
  }

  // --- 2. Follower-Specific Navigation ---
  if (!leader) {
    if (state.video && !isSameVideo(window.location.href, state.video)) {
      navigateTo(state.video);
      return;
    }
  }

  if (!onWatchPage) return;

  const roleChanged = currentRole !== (leader ? 'leader' : 'follower');
  const videoChanged = !isSameVideo(currentVideo, window.location.href);

  // --- 3. Drift Correction ---
  if (!roleChanged && !videoChanged) {
    if (!leader) {
      const video = document.querySelector('video');
      if (video && video.readyState >= 3 && !video.seeking) {
        const drift = Math.abs(video.currentTime - state.time);
        if (drift > 1.5) video.currentTime = state.time; 
        if (video.paused !== state.paused) state.paused ? video.pause() : video.play();
      }
    }
    return;
  }

  // --- 4. Initialization ---
  currentRole = leader ? 'leader' : 'follower';
  currentVideo = window.location.href;
  const video = await waitForElement('video');

  if (leader) await initLeader(video);
  else await initFollower(video, state.time, state.paused);
}

// --- 5. Message Listener (Immediate Actions) ---
chrome.runtime.onMessage.addListener((msg) => {
  const video = document.querySelector('video');

  switch (msg.type) {
    case 'sync_paused':
      if (video) msg.paused ? video.pause() : video.play();
      break;

    case 'sync_cleared':
      console.log('Video cleared by server');
      resetState();
      // Redirect follower to home if they're still on a video
      if (window.location.pathname.startsWith('/watch')) {
        window.location.href = 'https://www.youtube.com';
      }
      break;

    case 'sync':
      if (!isSameVideo(window.location.href, msg.video)) {
        navigateTo(msg.video);
      }
      break;
  }
});

setInterval(poll, 500);
poll();