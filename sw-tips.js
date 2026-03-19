let socket = null;
let isLeader = null;
let state = { video: null, time: 0, paused: false };

function broadcast(message) {
  chrome.tabs.query({ url: '*://*.youtube.com/*' }, (tabs) => {
    tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, message).catch(() => {}));
  });
  chrome.runtime.sendMessage(message).catch(() => {});
}

function connectSocket() {
  if (socket) socket.close();
  chrome.storage.local.get('wsUrl', (data) => {
    const url = data.wsUrl || 'ws://localhost:3000';
    socket = new WebSocket(url);

    socket.onopen = () => broadcast({ type: 'connected' });

    socket.onmessage = (event) => {
      let data = null;
      try { data = JSON.parse(event.data); } catch { return; }

      switch (data.type) {
        case 'connection':
          isLeader = data.leader;
          break;
        case 'sync':
          state = { video: data.video, time: data.time, paused: data.paused };
          break;
        case 'sync_time':
          state.time = data.time;
          break;
        case 'sync_paused':
          state.paused = data.paused;
          break;
        case 'sync_cleared':
          state = { video: null, time: 0, paused: false };
          break;
      }
      broadcast(data);
    };

    socket.onclose = () => {
      socket = null;
      isLeader = null;
      broadcast({ type: 'disconnected' });
    };
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'connect':
      connectSocket();
      break;
    case 'disconnect':
      socket?.close();
      break;
    case 'socket_info':
      sendResponse({ connected: socket?.readyState === 1, leader: isLeader, state });
      break;
    default:
      if (socket?.readyState === 1) socket.send(JSON.stringify(message));
      break;
  }
  return true;
});