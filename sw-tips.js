let socket = null;
let isLeader = null;
let state = { video: null, time: 0, paused: false };

function broadcast(message) {
  chrome.tabs.query({ url: '*://*.youtube.com/*' }, (tabs) => {
    tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, message).catch(() => {}));
  });
}

function connectSocket() {
  if (socket?.readyState === WebSocket.OPEN) return;

  chrome.storage.local.get('wsUrl', (data) => {
    socket = new WebSocket(data.wsUrl || 'ws://192.168.1.6:3000');

    socket.onopen = () => broadcast({ type: 'connected' });
    
    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      switch (data.type) {
        case 'connection':
          isLeader = data.leader;
          break;
        case 'sync':
          state = { video: data.video, time: data.time, paused: data.paused };
          broadcast(data);
          break;
        case 'sync_time':
          state.time = data.time;
          break;
        case 'sync_paused':
          state.paused = data.paused;
          broadcast(data);
          break;
        // Inside socket.onmessage switch block:
        case 'sync_cleared':
          state.video = null;
          state.time = 0;
          state.paused = false;
          broadcast({ type: 'sync_cleared' }); // Tell all tabs to reset
          break;
      }
    };

    socket.onclose = () => { socket = null; isLeader = null; };
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'socket_info') {
    sendResponse({ connected: socket?.readyState === WebSocket.OPEN, leader: isLeader, state });
  } else if (['select_video', 'update_time', 'update_paused'].includes(message.type)) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  } else if (message.type === 'connect') {
    connectSocket();
  }
  return true;
});