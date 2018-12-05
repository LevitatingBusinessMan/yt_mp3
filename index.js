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
 * @param {boolean} imageTag - If an image should be included in the ID3 tags
 * @param {boolean} overwrite - If existing files should be overwritten
 */
module.exports = async (ID, streamCount, ID3, album, imageTag, overwrite) => {
    ffmpeg.setFfmpegPath(path.join(__dirname, "/node_modules/ffmpeg-binaries/bin/ffmpeg.exe"));

    if (!ID)
        return console.log("No playlist ID")

    //Retrieve playlists videos
    const PL = await getVideos(ID).catch(() => {
        console.error("Error retrieving playlist data");
        process.exit()
    });
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

        if (imageTag) {
            var image;
            axios.get(video.snippet.thumbnails.best.url , {
                responseType: "arraybuffer"
            }).then(results => {image = results.data;})
            //Should be a catch here
        }

        const path_ = path.join(dir, title.replace(/[/\\?%*:|"<>]/g, "#") + ".mp3");

        const ytdl_stream = ytdl("http://www.youtube.com/watch?v=" + video.snippet.resourceId.videoId, { filter: "audioonly" })
            .on("error", e => error(e, "ytdl"))
            .on("finish", writeID3);

        const stream = ffmpeg(ytdl_stream)
                .on("error", e => error(e, "ffmpeg"))
                .toFormat("mp3")
                .pipe(fs.createWriteStream(path_, {flags: !overwrite ? "wx" : "w"}).on("error", e => error(e, "fs")));
        
        function error(e, source) {
            /*When a song has to get overwritten but overwrite is turned off,
            the EEXIST error gets supressed*/

            //Error from fs
            if (e.code == "EEXIST")
                return finish();

            //Error from ffmpeg
            if (e.message.includes("EEXIST"))
                return;
            
            console.error(`(${source}) Error at: ${video.snippet.title}\n${e}`);
            failed.push(video.snippet.title);
            streams--;
            finished++;
        }

        function writeID3() {
            if (ID3)
                NodeID3.write({
                    title,
                    artist,
                    album: dir,
                    image : imageTag ? image : undefined,
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
