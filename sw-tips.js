console.log('Service worker started');

let socket = null;
let isLeader = null;
let state = { video: null, time: 0, paused: false };

function broadcastToYoutubeTabs(message) {
  chrome.tabs.query({ url: '*://*.youtube.com/*' }, (tabs) => {
    tabs.forEach(tab =>
      chrome.tabs.sendMessage(tab.id, message).catch(() => {})
    );
  });
}

function connectSocket() {
  if (socket?.readyState === WebSocket.OPEN) return;

  socket = new WebSocket('ws://192.168.1.6:3000');

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
      // in socket message handler
      case 'sync_cleared':
        state.video = null;
        state.time = 0;
        state.paused = false;
        broadcastToYoutubeTabs({ type: 'sync_cleared' });
        break;

      // in chrome.runtime.onMessage handler
      case 'clear_video':
        sendResponse({ ok: socketSend(message) });
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

    case 'select_video':
    case 'update_time':
    case 'update_paused':
      sendResponse({ ok: socketSend(message) });
      break;
  }

  return true;
});