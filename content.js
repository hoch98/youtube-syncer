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

function getVideoId(url) {
  try {
    return new URL(url).searchParams.get('v');
  } catch {
    return null;
  }
}

function isSameVideo(url1, url2) {
  if (!url1 || !url2) return false;
  const id1 = getVideoId(url1);
  const id2 = getVideoId(url2);
  if (id1 && id2) return id1 === id2;
  return url1 === url2;
}

let timeInterval = null;
let currentRole = null;
let currentVideo = null;
let navigating = false;

async function initLeader(video) {
  console.log('Initializing as leader');
  chrome.runtime.sendMessage({ type: 'select_video', url: window.location.href });

  if (timeInterval) clearInterval(timeInterval);
  timeInterval = setInterval(() => {
    chrome.runtime.sendMessage({ type: 'update_time', time: video.currentTime });
  }, 1000);

  video.addEventListener('pause', () => {
    chrome.runtime.sendMessage({ type: 'update_paused', paused: true });
  });
  video.addEventListener('play', () => {
    chrome.runtime.sendMessage({ type: 'update_paused', paused: false });
  });
}

async function initFollower(video, initialTime, initialPaused) {
  console.log('Initializing as follower, seeking to', initialTime);
  if (initialTime) video.currentTime = initialTime;
  if (initialPaused) video.pause();
  else video.play();
}

function teardown() {
  if (timeInterval) { clearInterval(timeInterval); timeInterval = null; }
  currentRole = null;
  currentVideo = null;
  navigating = false;
}

function navigateTo(url) {
  if (navigating) return;
  navigating = true;
  console.log('Navigating to:', url);
  window.location.href = url;
  setTimeout(() => { navigating = false; }, 5000);
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
    if (state.video && !isSameVideo(window.location.href, state.video)) {
      navigateTo(state.video);
      return;
    }
  }

  const onWatchPage = window.location.pathname.startsWith('/watch');

  if (!onWatchPage) {
    if (leader && currentVideo !== null) {
      currentVideo = null;
      chrome.runtime.sendMessage({ type: 'clear_video' });
    }
    return;
  }

  if (navigating && isSameVideo(window.location.href, state.video)) {
    navigating = false;
  }

  const roleChanged = currentRole !== (leader ? 'leader' : 'follower');
  const videoChanged = !isSameVideo(currentVideo, window.location.href);

  if (!roleChanged && !videoChanged) {
    if (!leader) {
      const video = document.querySelector('video');
      if (video) {
        const drift = Math.abs(video.currentTime - state.time);
        if (drift > 1) {
          console.log(`Drift detected: ${drift.toFixed(2)}s, correcting...`);
          video.currentTime = state.time;
        }
        if (video.paused !== state.paused) {
          state.paused ? video.pause() : video.play();
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
    await initFollower(video, state.time, state.paused);
  }
}

chrome.runtime.onMessage.addListener(async (message) => {
  switch (message.type) {
    case 'connected':
      teardown();
      await poll();
      break;

    case 'disconnected':
      teardown();
      break;

    case 'sync': {
      if (message.video && !isSameVideo(window.location.href, message.video)) {
        navigateTo(message.video);
      } else {
        const video = document.querySelector('video');
        if (video) {
          if (message.paused) video.pause();
          else video.play();
        }
      }
      break;
    }

    case 'sync_cleared': {
      console.log('Video cleared by leader');
      currentRole = null;
      currentVideo = null;
      navigating = false;
      break;
    }

    case 'sync_paused': {
      const video = document.querySelector('video');
      if (!video) break;
      message.paused ? video.pause() : video.play();
      break;
    }

    case 'sync_time': {
      const video = document.querySelector('video');
      if (!video) break;
      const drift = Math.abs(video.currentTime - message.time);
      if (drift > 2) video.currentTime = message.time;
      break;
    }
  }
});

setInterval(poll, 1000);

setInterval(() => {
  if (currentRole === 'follower') poll();
}, 5000);

poll();