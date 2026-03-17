function waitForElement(selector) {
  console.log("waiting of relement")
  return new Promise((resolve) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        console.log("resolved")
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  });
}

var currentTime = 0;
var isLeader = undefined;

(async () => {
  if (isLeader == undefined) return;

  if (window.location.pathname.startsWith('/watch') && isLeader) {
    const video = await waitForElement('video');
    console.log("Video found, starting time tracking...");

    await chrome.runtime.sendMessage({ type: 'select_video', url: window.location.href });

    // Log current time every second
    setInterval(() => {
      currentTime = video.currentTime
      // console.log(`Current time: ${video.currentTime.toFixed(2)}s`);

      //chrome.runtime.sendMessage({ type: 'update_time', url: currentTime });

    }, 1000);
  } else {
    setInterval(() => {
      currentTime = video.currentTime
      // console.log(`Current time: ${video.currentTime.toFixed(2)}s`);

      //chrome.runtime.sendMessage({ type: 'update_time', url: currentTime });

    }, 1000);
  }
})();

chrome.runtime.sendMessage({ type: 'socket_info' }).then(async (data) => {

  if (data.socket) {
    isLeader = data.leader;
    if (window.location.pathname.startsWith('/watch')) {
      const video = await waitForElement('video');
      console.log("Video found, starting time tracking...");

      chrome.runtime.sendMessage({ type: 'select_video', url: window.location.href });

      // Log current time every second
      setInterval(() => {
        currentTime = video.currentTime
        // console.log(`Current time: ${video.currentTime.toFixed(2)}s`);

        //chrome.runtime.sendMessage({ type: 'update_time', url: currentTime });

      }, 1000);
    }
  } else {
    isLeader = undefined;
  }
})