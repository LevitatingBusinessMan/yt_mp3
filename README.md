# yt_mp3
This script is made specificially for youtube music playlists.
It uses the standard syntax of `author - title` to define ID3 tags.
(requires [nodejs](https://nodejs.org))

#### Installation:
`npm install yt_mp3_downloader -g`

#### Usage:

```
yt_mp3 <playlistID> <dir>
```

##### Changing the API key:
If for whatever reason the default Youtube API key gets rejected you can use your own with:
`yt_mp3 -key <key>`


##### Tags:<br/>
`-noimage`: Prevent the script from adding thumbnails<br/>
`-s <number>`: Define the download/write streams allowed at the same time. Increasing this can cause stability issues. Default: 15