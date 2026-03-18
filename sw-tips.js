console.log('Service worker started');

let socket = null;
let isLeader = null;
let state = { video: null, time: 0, paused: false };
let pendingPings = {};

function broadcastToYoutubeTabs(message) {
  chrome.tabs.query({ url: '*://*.youtube.com/*' }, (tabs) => {
    tabs.forEach(tab =>
      chrome.tabs.sendMessage(tab.id, message).catch(() => {})
    );
  });
}

function measureRTT() {
  return new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2);
    const start = Date.now();
    pendingPings[id] = { resolve, start };
    socketSend({ type: 'ping', id });
    // Timeout after 3s
    setTimeout(() => {
      if (pendingPings[id]) {
        delete pendingPings[id];
        resolve(300); // fallback to 300ms if no response
      }
    }, 3000);
  });
}

function connectSocket() {
  if (socket?.readyState === WebSocket.OPEN) return;

  socket = new WebSocket('ws://localhost:3000');

  socket.addEventListener('open', () => {
    console.log('Socket connected');
    broadcastToYoutubeTabs({ type: 'connected' });
    chrome.runtime.sendMessage({ type: 'connected' }).catch(() => {});
  });

  socket.addEventListener('message', (event) => {
    let data = null;
    try { data = JSON.parse(event.data); }
    catch { return; }
    if (!data) return;

    switch (data.type) {
      case 'connection':
        isLeader = data.leader;
        console.log('Role assigned:', isLeader ? 'leader' : 'follower');
        chrome.runtime.sendMessage({ type: 'connection', leader: isLeader }).catch(() => {});
        break;

      case 'sync':
        state.video = data.video;
        state.time = data.time;
        state.paused = data.paused;
        broadcastToYoutubeTabs({ type: 'sync', video: state.video, time: state.time, paused: state.paused });
        break;

      case 'sync_time':
        state.time = data.time;
        break;

      case 'sync_paused':
        state.paused = data.paused;
        broadcastToYoutubeTabs({ type: 'sync_paused', paused: state.paused });
        break;

      case 'sync_cleared':
        state.video = null;
        state.time = 0;
        state.paused = false;
        broadcastToYoutubeTabs({ type: 'sync_cleared' });
        break;

      case 'pong':
        if (pendingPings[data.id]) {
          const rtt = Date.now() - pendingPings[data.id].start;
          pendingPings[data.id].resolve(rtt);
          delete pendingPings[data.id];
        }
        break;

      case 'start_delay':
        broadcastToYoutubeTabs({ type: 'start_delay', delay: data.delay });
        break;
    }
  });

  socket.addEventListener('close', () => {
    console.log('Socket disconnected');
    socket = null;
    isLeader = null;
    broadcastToYoutubeTabs({ type: 'disconnected' });
    chrome.runtime.sendMessage({ type: 'disconnected' }).catch(() => {});
  });
}

function socketSend(data) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(data));
    return true;
  }
  return false;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'connect':
      connectSocket();
      sendResponse({ ok: true });
      break;

    case 'disconnect':
      socket?.close();
      sendResponse({ ok: true });
      break;

    case 'socket_info':
      if (socket?.readyState === WebSocket.OPEN && isLeader === null) {
        const handler = (event) => {
          let data = null;
          try { data = JSON.parse(event.data); }
          catch { return; }
          if (!data) return;

          if (data.type === 'connection') isLeader = data.leader;
          if (data.type === 'sync') {
            state.video = data.video;
            state.time = data.time;
            state.paused = data.paused;
          }

          if (isLeader !== null) {
            socket.removeEventListener('message', handler);
            sendResponse({ connected: true, leader: isLeader, state });
          }
        };
        socket.addEventListener('message', handler);
      } else {
        sendResponse({
          connected: socket?.readyState === WebSocket.OPEN,
          leader: isLeader,
          state
        });
      }
      break;

    case 'measure_rtt':
      measureRTT().then((rtt) => {
        console.log('RTT measured:', rtt + 'ms');
        sendResponse({ rtt });
      });
      break;

    case 'select_video':
    case 'update_time':
    case 'update_paused':
    case 'clear_video':
    case 'rtt_report':
      sendResponse({ ok: socketSend(message) });
      break;
  }

  return true;
});