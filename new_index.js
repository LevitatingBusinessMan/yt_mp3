//TODO:
//Take a look at file and folder naming

const ffmpeg = require("fluent-ffmpeg"),
    NodeID3 = require("node-id3"),
    path = require("path"),
    fs = require("fs"),
    ytdl = require("ytdl-core"),
    {getVideos, getPlaylistInfo} = require(path.join(__dirname, "yt-playlists.js"))("AIzaSyAueEP0JLjzPSBcIxZYP6kmHFHYMFXkf5E");
    //getPlayList = require("yt-playlists")("AIzaSyAueEP0JLjzPSBcIxZYP6kmHFHYMFXkf5E");

module.exports = async (ID, streams, ID3, album, image) => {
    ffmpeg.setFfmpegPath(path.join(__dirname, "/node_modules/ffmpeg-binaries/bin/ffmpeg.exe"));

    //Retrieve playlists videos
    const PL = await getVideos(ID);
    await PL.items.fetchAll();

    //If no album name is set, use the playlists title
    const dir = album ? album : await getPlaylistInfo(ID).snippet.title;

    //Create folder
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir);

    class Stream {
        constructor(video) {
            this.title = video.title.split(" - ")[1] ? video.title.split(" - ")[1] : video.title;
            this.artist = video.title.split(" - ")[1] ? video.title.split(" - ")[0] : "uknown";
        }
    }
};
