// server.js
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 3000 });

var leader = undefined;
var follower = undefined;

var currentVideo = "";
var currentTime = 0;

wss.on('connection', (ws) => {
  console.log('Client connected');

  if (leader == undefined) {
    leader = ws;
    console.log("Leader has been chosen")
    ws.send(JSON.stringify({
      "type":"connection",
      "leader": true
    }))
  } else if (follower == undefined) {
    follower = ws;
    console.log("Follower has been chosen")
    ws.send(JSON.stringify({
      "type":"connection",
      "leader": false
    }))
  }

  ws.on('message', (raw) => {
    const message = JSON.parse(raw);

    if (message.type === 'select_video') {
      currentVideo = message.url
      console.log("video chosen: "+currentVideo)
    }
    if (message.type === 'update_time') {
      currentTime = message.timestamp
    } if (message.type === "get_video") {
      ws.send(JSON.stringify({
        "type": "select_video",
        "url": currentVideo
      }))
    }
  });

  ws.on("close", () => {
    if (ws == leader) {
      leader = follower;
      follower = undefined;
      if (leader) {
        leader.send(JSON.stringify({
          "type":"connection",
          "leader": true
        }))
      }
      console.log("Leader disconnected, promoting follower to leader")
    } else if (ws == follower) {
      follower = undefined;
      console.log("Follower disconnected")
    }
  })
});