function codeToUrl(code) {
  return `wss://${code}.ngrok-free.app`;
}

function showJoinView() {
  document.getElementById("joinView").style.display = 'block';
  document.getElementById("connectedView").style.display = 'none';
  document.getElementById("socketInfo").innerText = 'Socket: closed';
  document.getElementById("leaderInfo").innerText = 'Leader: ~~~';
}

function showConnectedView({ leader }) {
  document.getElementById("joinView").style.display = 'none';
  document.getElementById("connectedView").style.display = 'block';
  document.getElementById("socketInfo").innerText = 'Socket: open';
  document.getElementById("leaderInfo").innerText = `Leader: ${leader ?? '...'}`;
}

// Load saved session code
chrome.storage.local.get(['sessionCode', 'wsUrl'], (data) => {
  if (data.sessionCode) {
    document.getElementById("sessionCode").value = data.sessionCode;
  }
});

// Set initial UI state based on socket
chrome.runtime.sendMessage({ type: 'socket_info' }).then((data) => {
  if (data.connected) {
    showConnectedView({ leader: data.leader });
  } else {
    showJoinView();
  }
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

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'connected') showConnectedView({ leader: null });
  if (message.type === 'disconnected') showJoinView();
  if (message.type === 'connection') showConnectedView({ leader: message.leader });
});