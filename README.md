# Youtube-sync

Extension that allows for syncing two people's YouTube videos for streaming using a socket server.

First person that connects is set as leader, rest are set as followers. When the leader plays a video, followers load it and sync to the leader's timestamp.

When the leader pauses, so does the followers.

Use the youtube-syncer server to host parties.