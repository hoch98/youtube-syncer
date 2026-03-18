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

let timeInterval = null;
let pollInterval = null;
let currentRole = null;
let currentVideo = null;

async function initLeader(video) {
  console.log('Initializing as leader');
  chrome.runtime.sendMessage({ type: 'select_video', url: window.location.href });

  if (timeInterval) clearInterval(timeInterval);
  timeInterval = setInterval(() => {
    chrome.runtime.sendMessage({ type: 'update_time', time: video.currentTime });
  }, 1000);
}

async function initFollower(video, initialTime) {
  console.log('Initializing as follower, seeking to', initialTime);
  if (initialTime) video.currentTime = initialTime;
}

function teardown() {
  if (timeInterval) { clearInterval(timeInterval); timeInterval = null; }
  currentRole = null;
  currentVideo = null;
}

async function poll() {
  let res;
  try {
    res = await chrome.runtime.sendMessage({ type: 'socket_info' });
  } catch {
    return;
  }

  const { connected, leader, state } = res;

  if (!connected) {
    teardown();
    return;
  }

  if (!leader) {
    if (state.video && window.location.href !== state.video) {
      console.log('Follower navigating to:', state.video);
      window.location.href = state.video;
      return;
    }
  }

  const onWatchPage = window.location.pathname.startsWith('/watch');
  if (!onWatchPage) return;

  const roleChanged = currentRole !== (leader ? 'leader' : 'follower');
  const videoChanged = currentVideo !== window.location.href;

  if (!roleChanged && !videoChanged) {
    // Sync check — only for follower, every 5 seconds
    if (!leader) {
      const video = document.querySelector('video');
      if (video) {
        const drift = Math.abs(video.currentTime - state.time);
        if (drift > 1) {
          console.log(`Drift detected: ${drift.toFixed(2)}s, correcting...`);
          video.currentTime = state.time;
        }
      }
    }
    return;
  }

  currentRole = leader ? 'leader' : 'follower';
  currentVideo = window.location.href;

  if (timeInterval) { clearInterval(timeInterval); timeInterval = null; }

  const video = await waitForElement('video');

  if (leader) {
    await initLeader(video);
  } else {
    await initFollower(video, state.time);
  }
}

// 1 second poll for navigation/role changes
pollInterval = setInterval(poll, 1000);

// 5 second poll for drift correction
setInterval(() => {
  if (currentRole === 'follower') poll();
}, 5000);

poll();