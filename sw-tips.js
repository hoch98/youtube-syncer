let socket = null;
let isLeader = null;
let state = { video: null, time: 0, paused: false };

function broadcast(message) {
  chrome.tabs.query({ url: '*://*.youtube.com/*' }, (tabs) => {
    tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, message).catch(() => {}));
  });
}

function connectSocket() {
  if (socket) return;
  chrome.storage.local.get('wsUrl', (data) => {
    socket = new WebSocket(data.wsUrl || 'ws://localhost:3000');

    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case 'connection':
          isLeader = msg.leader;
          break;
        case 'sync':
          state = { video: msg.video, time: msg.time, paused: msg.paused };
          broadcast(msg);
          break;
        case 'sync_time':
          state.time = msg.time;
          broadcast(msg);
          break;
        case 'sync_paused':
          state.paused = msg.paused;
          broadcast(msg);
          break;
        case 'sync_cleared':
          state = { video: null, time: 0, paused: false };
          broadcast(msg);
          break;
      }
    };

    socket.onclose = () => { socket = null; isLeader = null; };
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'socket_info') {
    sendResponse({ connected: socket?.readyState === 1, leader: isLeader, state });
  } else if (message.type === 'connect') {
    connectSocket();
  } else if (socket?.readyState === 1) {
    socket.send(JSON.stringify(message));
  }
  return true;
});