import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 3000 });

let leader = null;
let state = { video: "", time: 0 };

const send = (ws, data) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(data));
const broadcast = (data, exclude = null) => wss.clients.forEach(c => c !== exclude && send(c, data));

wss.on('connection', (ws) => {
  const isLeader = leader === null;
  if (isLeader) leader = ws;

  console.log(`Client connected as ${isLeader ? 'leader' : 'follower'}`);

  send(ws, { type: 'connection', leader: isLeader });

  if (!isLeader && state.video) {
    send(ws, { type: 'sync', video: state.video, time: state.time });
  }

  ws.on('message', (raw) => {
    let message;
    try { message = JSON.parse(raw); }
    catch { return; }

    switch (message.type) {
      case 'select_video':
        state.video = message.url;
        state.time = 0;
        console.log('Video selected:', state.video);
        broadcast({ type: 'sync', video: state.video, time: state.time }, ws);
        break;

      case 'update_time':
        state.time = message.time;
        broadcast({ type: 'sync_time', time: state.time }, ws);
        break;
    }
  });

  ws.on('close', () => {
    console.log(`${ws === leader ? 'Leader' : 'Follower'} disconnected`);
    if (ws === leader) {
      leader = [...wss.clients][0] ?? null;
      if (leader) {
        send(leader, { type: 'connection', leader: true });
        console.log('Promoted new leader');
      }
    }
  });
});

console.log('Socket server running on ws://localhost:3000');