document.getElementById("connectButton").onclick = function() {
  chrome.runtime.sendMessage({ type: 'connect'});
}

document.getElementById("disconnectButton").onclick = function() {
  chrome.runtime.sendMessage({ type: 'disconnect'});
}

setInterval(async () => {
  chrome.runtime.sendMessage({ type: 'socket_info' }).then((data) => {

    if (data.socket) {
      document.getElementById("socketInfo").innerText = "Socket: open"
      document.getElementById("leaderInfo").innerText = "Leader: "+data.leader
    } else {
      document.getElementById("socketInfo").innerText = "Socket: closed"
      document.getElementById("leaderInfo").innerText = "Leader: ~~~"
    }
  })
}, 1000)