let socket = null;
let isLeader = null;
let state = { video: null, time: 0, paused: false };

function broadcast(message) {
  chrome.tabs.query({ url: '*://*.youtube.com/*' }, (tabs) => {
    tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, message).catch(() => {}));
  });
  // Also send to popup if it's open
  chrome.runtime.sendMessage(message).catch(() => {});
}

function connectSocket() {
  if (socket) socket.close();
  
  chrome.storage.local.get('wsUrl', (data) => {
    if (!data.wsUrl) return;
    socket = new WebSocket(data.wsUrl);

    socket.onopen = () => broadcast({ type: 'connected' });

    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'connection') isLeader = msg.leader;
      if (msg.type === 'sync') state = msg;
      if (msg.type === 'sync_time') state.time = msg.time;
      if (msg.type === 'sync_paused') state.paused = msg.paused;
      broadcast(msg);
    };

    socket.onclose = () => {
      socket = null;
      isLeader = null;
      broadcast({ type: 'disconnected' });
    };
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'socket_info') {
    sendResponse({ 
      connected: socket?.readyState === WebSocket.OPEN, 
      leader: isLeader, 
      state 
    });
  } else if (message.type === 'connect') {
    connectSocket();
  } else if (message.type === 'disconnect') {
    socket?.close();
  } else if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
  return true;
});