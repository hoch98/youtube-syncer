# Youtube-sync

Extension that allows for syncing two people's YouTube videos for streaming using a socket server.

First person that connects is set as leader, rest are set as followers. When the leader plays a video, followers load it and sync to the leader's timestamp.

When the leader pauses, so does the followers.

Host websocket server using ngrok:
ngrok ws 3000

tcp://0.tcp.ap.ngrok.io:16858 -> ws://0.tcp.ap.ngrok.io:16858