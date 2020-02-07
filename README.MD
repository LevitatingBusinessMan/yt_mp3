# YT_MP3
This [NodeJS](https://nodejs.org) command allows you to download youtube playlists in MP3 format complete with ID3 tags.

#### Installation
`npm install yt_mp3_downloader -g`
 
### API key
Since version 2.0.7 you now have to set your Google API key yourself. I understand this is a huge inconvenience for many.
Soon I'll try to rewrite the application to webscrape the video details instead.
Till then, please refer to this page to gather a key: https://developers.google.com/youtube/v3/getting-started

#### Usage
```
Usage: yt_mp3 [options] <ID>

Options:
  -v, --version           output the version number
  --key <key>             set API key
  -s, --streams <amount>  amount of download streams (default: 15)
  -a, --album <name>      specify album name (default is playlist name)
  --no-image              disable ablum covers (thumbnails)
  --no-ID3                disable ID3 tags
  --no-overwrite          disable overwriting existing files
  --playlist <type>       Create playlist for certain media players. Currently supported: cmus
  -h, --help              output usage information
```
The ID supplied might either be a direct playlist ID or a link to a playlist.

The streams option defaults to 15, this can be extremely CPU heavy as each download stream has to be converted to mp3.

#### ID3 tags
```
An ID3 tag is a data container within an MP3 audio file stored in a prescribed format. This data commonly contains the Artist name, Song title, Year and Genre of the current audio file.
```
yt_mp3 can automatically set the artist, song title and album cover for each song. This is done by assuming the format of `artist - title` is followed for each video's title. Otherwise the video title will be used as song title, and the artist tag is set to "unknown". On default the video's thumbnail is set as album cover. The playlists name is saved as album name. ID3 tags can be disabled by using the `--no-ID3` option.
