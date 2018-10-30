//TODO:
//Take a look at file and folder naming
//The console log here should maybe be an event manager for API use. The bin file will log to console


const ffmpeg = require("fluent-ffmpeg"),
    axios = require("axios")
    NodeID3 = require("node-id3"),
    path = require("path"),
    fs = require("fs"),
    ytdl = require("ytdl-core"),
    {getVideos, getPlaylistInfo} = require(path.join(__dirname, "yt-playlists.js"))("AIzaSyAueEP0JLjzPSBcIxZYP6kmHFHYMFXkf5E");

/**
 * 
 * @param {string} ID - ID of youtube playlist
 * @param {integer} streamCount - Number of streams allowed
 * @param {boolean} ID3 - If ID3 tags should be applied to mp3 files
 * @param {string} album - Name of album and directory
 * @param {boolean} image - If an image should be included in the ID3 tags
 */
module.exports = async (ID, streamCount, ID3, album, image) => {
    ffmpeg.setFfmpegPath(path.join(__dirname, "/node_modules/ffmpeg-binaries/bin/ffmpeg.exe"));

    //Retrieve playlists videos
    const PL = await getVideos(ID);
    await PL.items.fetchAll();

    //If no album name is set, use the playlists title
    const dir = album ? album : (await getPlaylistInfo(ID)).snippet.title;

    //Create folder
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir);
    
    let streams = 0;
    let amount = PL.items.length;
    let finished = 0;
    const failed = [];
    function Stream(video) {
        streams++;
        const title = video.snippet.title.split(" - ")[1] ? video.snippet.title.split(" - ")[1] : video.snippet.title;
        const artist = video.snippet.title.split(" - ")[1] ? video.snippet.title.split(" - ")[0] : "uknown";

        let image;
        axios.get(video.snippet.thumbnails.best.url , {
            responseType: "arraybuffer"
        }).then(results => {image = results.data;})
        //Should be a catch here

        const path_ = path.join(dir, title.replace(/[/\\?%*:|"<>]/g, "#") + ".mp3");

        const ytdl_stream = ytdl("http://www.youtube.com/watch?v=" + video.snippet.resourceId.videoId, { filter: "audioonly" })
            .on("error", error)
            .on("finish", writeID3);

        const stream = ffmpeg(ytdl_stream)
                .on("error", error)
                .toFormat("mp3")
                .pipe(fs.createWriteStream(path_).on("error", error));
        
        function error(e) {
            if (e.message = "Output stream closed")
                return;
            console.error(`Error at: ${video.snippet.title}\n${e}`);
            failed.push(video.snippet.title);
            streams--;
            finished++;
        }

        function writeID3() {
            if (ID3)
                NodeID3.write({
                    title,
                    artist,
                    image,
                    album: dir,
                    trackNumber: video.snippet.position +1
                }, path_, finish);
            else finish();
        }
        
        function finish(err) {
            if (err)
                return error(e);
            
            streams--;
            finished++;
            console.log(`${title} - ${Math.floor((finished/amount)*100)}%`)
        }
    }

    let videos = new Array(...PL.items);
    setInterval(() => {
        if (streams < streamCount && videos.length)
            Stream(videos.splice(0,1)[0])
        
        //Done
        else if(!streams && !videos.length) {
            if (failed.length) {
                console.log("\nFinished download. Failed songs:");
                failed.forEach(console.log);
                process.exit();
            } else {
                console.log("\n Downloaded all songs succesfully");
                process.exit();
            }
        }
    }, 100)
    
    console.log(`Started downloading ${videos.length} songs`);
};
