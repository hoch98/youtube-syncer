function updateUI({ connected, leader }) {
  document.getElementById("socketInfo").innerText = `Socket: ${connected ? 'open' : 'closed'}`;
  document.getElementById("leaderInfo").innerText = `Leader: ${connected ? leader : '~~~'}`;
}

document.getElementById("connectButton").onclick = async () => {
  // Get the current active YouTube tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.url?.includes('youtube.com')) {
    alert('Please open a YouTube tab first');
    return;
  }

  // Inject content script into this specific tab
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content.js']
  });

  // Connect the socket
  chrome.runtime.sendMessage({ type: 'connect', tabId: tab.id });
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