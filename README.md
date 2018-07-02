# yt_playlist_downloader_mp3
This script is specificially for youtube music playlists.
It uses the standard syntax of `author - title` to define ID3 tags.

Before usage please edit the Youtube API key found in `key.js`.
A document about this can be found [here](https://developers.google.com/youtube/registering_an_application).

Usage:
```
node . playlist_id directory name
```

Normally the script adds the thumbnail of the video as album cover to the mp3's. To prevent this you can use the `-noimage` tag
