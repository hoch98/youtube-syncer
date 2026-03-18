function updateUI({ connected, leader }) {
  document.getElementById("socketInfo").innerText = `Socket: ${connected ? 'open' : 'closed'}`;
  document.getElementById("leaderInfo").innerText = `Leader: ${connected ? leader : '~~~'}`;
}

// Load saved URL on popup open
chrome.storage.local.get('wsUrl', (data) => {
  document.getElementById("wsUrl").value = data.wsUrl || 'ws://192.168.1.6:3000';
});

document.getElementById("saveUrl").onclick = () => {
  const url = document.getElementById("wsUrl").value.trim();
  chrome.storage.local.set({ wsUrl: url }, () => {
    document.getElementById("saveUrl").innerText = 'Saved!';
    setTimeout(() => document.getElementById("saveUrl").innerText = 'Save URL', 1000);
  });
};

document.getElementById("connectButton").onclick = () => {
  chrome.runtime.sendMessage({ type: 'connect' });
};

document.getElementById("disconnectButton").onclick = () => {
  chrome.runtime.sendMessage({ type: 'disconnect' });
};

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'connected') updateUI({ connected: true, leader: null });
  if (message.type === 'disconnected') updateUI({ connected: false, leader: null });
  if (message.type === 'connection') updateUI({ connected: true, leader: message.leader });
});

chrome.runtime.sendMessage({ type: 'socket_info' }).then((data) => {
  updateUI({ connected: data.connected, leader: data.leader });
});