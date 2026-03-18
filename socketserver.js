import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 3000 });

let leader = null;
let state = { video: "", time: 0, paused: false };

const send = (ws, data) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(data));
const broadcast = (data, exclude = null) => wss.clients.forEach(c => c !== exclude && send(c, data));

wss.on('connection', (ws) => {
  const isLeader = leader === null;
  if (isLeader) leader = ws;

  console.log(`Client connected as ${isLeader ? 'leader' : 'follower'}`);

  send(ws, { type: 'connection', leader: isLeader });

  if (!isLeader && state.video) {
    send(ws, { type: 'sync', video: state.video, time: state.time, paused: state.paused });
  }

  ws.on('message', (raw) => {
    let message;
    try { message = JSON.parse(raw); }
    catch { return; }

    switch (message.type) {
      case 'select_video':
        state.video = message.url;
        state.time = 0;
        state.paused = false;
        console.log('Video selected:', state.video);
        broadcast({ type: 'sync', video: state.video, time: state.time, paused: state.paused }, ws);
        break;

      case 'update_time':
        state.time = message.time;
        broadcast({ type: 'sync_time', time: state.time }, ws);
        break;

      case 'update_paused':
        state.paused = message.paused;
        console.log('Paused:', state.paused);
        broadcast({ type: 'sync_paused', paused: state.paused }, ws);
        break;

      case 'clear_video':
        state.video = null;
        state.time = 0;
        state.paused = false;
        console.log('Video cleared');
        broadcast({ type: 'sync_cleared' }, ws);
        break;

      case 'ping':
        // Reflect ping straight back so client can measure RTT
        send(ws, { type: 'pong', id: message.id });
        break;

      case 'rtt_report':
        // Leader reports follower RTT so we can tell leader to delay
        if (ws === leader) {
          send(ws, { type: 'start_delay', delay: message.rtt / 2 });
        }
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