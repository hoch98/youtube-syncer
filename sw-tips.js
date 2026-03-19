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
    socket = new WebSocket(data.wsUrl || 'ws://localhost:3000');
    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case 'connection': isLeader = msg.leader; break;
        case 'sync': state = msg; break;
        case 'sync_time': state.time = msg.time; break;
        case 'sync_paused': state.paused = msg.paused; break;
        case 'sync_cleared': state = { video: null, time: 0, paused: false }; break;
      }
      broadcast(msg);
    };
    socket.onclose = () => { socket = null; isLeader = null; broadcast({ type: 'disconnected' }); };
    socket.onopen = () => broadcast({ type: 'connected' });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'socket_info') {
    sendResponse({ connected: socket?.readyState === 1, leader: isLeader, state });
  } else if (message.type === 'connect') {
    connectSocket();
  } else if (message.type === 'disconnect') {
    socket?.close();
  } else if (socket?.readyState === 1) {
    socket.send(JSON.stringify(message));
  }
  return true;
});