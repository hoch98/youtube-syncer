console.log("tips")

// service-worker.js
let socket = null;
let leader = null;
let currentVideo = null;

function connectSocket() {
  socket = new WebSocket('ws://localhost:3000');

  socket.addEventListener('open', () => {
    console.log('Socket connected');
  });

  socket.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    if (data.type == "connection") {
      leader = data.leader;
    } if (data.type == "get_video") {
      currentVideo = data.video
    }
  });

  socket.addEventListener('close', () => {
    console.log('Socket disconnected');
    socket = null
    leader = null;
  });
}

// connectSocket();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // if (!socket || socket.readyState !== WebSocket.OPEN) {
  //   connectSocket();
  // }
  if (message.type == "socket_info") {
    sendResponse({"socket": (socket != undefined), "leader": leader})
  } if (message.type == "connect") {
    connectSocket();
  } if (message.type == "disconnect") {
    if (socket != null) {
      socket.close()
    }
  } else {
    socket.send(JSON.stringify(message));
  }

  return true;

});