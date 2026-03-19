function codeToUrl(code) {
  // If the code contains a colon (like 192.168.1.5:3000), it's a local IP
  if (code.includes(':')) {
    return `ws://${code}`;
  }
  // Otherwise, treat it as an ngrok ID
  return `wss://${code}.ngrok-free.app`;
}

function updateUI(data) {
  if (data.connected) {
    document.getElementById("joinView").style.display = 'none';
    document.getElementById("connectedView").style.display = 'block';
    document.getElementById("socketInfo").innerText = 'Socket: connected';
    document.getElementById("leaderInfo").innerText = `Role: ${data.leader ? 'Leader' : 'Follower'}`;
  } else {
    document.getElementById("joinView").style.display = 'block';
    document.getElementById("connectedView").style.display = 'none';
    document.getElementById("socketInfo").innerText = 'Socket: disconnected';
    document.getElementById("leaderInfo").innerText = 'Role: ---';
  }
}

// Check status on popup open
chrome.runtime.sendMessage({ type: 'socket_info' }, (data) => {
  if (data) updateUI(data);
});

document.getElementById("joinButton").onclick = () => {
  const code = document.getElementById("sessionCode").value.trim();
  if (!code) return;

  const url = codeToUrl(code);
  chrome.storage.local.set({ sessionCode: code, wsUrl: url }, () => {
    chrome.runtime.sendMessage({ type: 'connect' });
  });
};

document.getElementById("disconnectButton").onclick = () => {
  chrome.runtime.sendMessage({ type: 'disconnect' });
};

// Listen for real-time updates while popup is open
chrome.runtime.onMessage.addListener((message) => {
  if (['connected', 'disconnected', 'connection'].includes(message.type)) {
    chrome.runtime.sendMessage({ type: 'socket_info' }, (data) => {
      if (data) updateUI(data);
    });
  }
});