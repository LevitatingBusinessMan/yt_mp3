# yt_playlist_downloader_mp3
This script is specificially for youtube music playlists.
It uses the standard syntax of `author - title` to define ID3 tags.
(requires [nodejs](https://nodejs.org))

This script requires ffmepg to work.
This can be installed with `npm i ffmpeg-binaries -g`

Before usage please edit the Youtube API key found in `key.js`.
A document about this can be found [here](https://developers.google.com/youtube/registering_an_application).

Usage:
```
node . playlist_id directory name
```

Tags:
`-noimage`: Prevent the script from adding thumbnails
`-s <number>`: Define the download/write streams allowed at the same time. Increasing this can cause stability issues. Default: 15
