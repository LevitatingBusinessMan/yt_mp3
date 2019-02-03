//TODO:
//Take a look at file and folder naming
//The console log here should maybe be an event manager for API use. The bin file will log to console
//Do stream count benchmarks


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

    let total = PL.items.length;
    let failed = new Array();
    let videos = new Array(...PL.items);
    let active = 0;
    let finished = 0;

    /**
     * @param {object} video - Video element from Youtube's API
     */
    class Stream {
        constructor(video) {
            this.state = "unstarted";
            this.video = video;
            this.title = video.snippet.title.split(" - ")[1] ? video.snippet.title.split(" - ")[1] : video.snippet.title;
            this.artist = video.snippet.title.split(" - ")[1] ? video.snippet.title.split(" - ")[0] : "uknown";
            this.image = undefined;
            this.path = path.join(dir, this.title.replace(/[/\\?%*:|"<>]/g, "#") + ".mp3");
            
            if (imageTag) {
                let image;
                axios.get(video.snippet.thumbnails.best.url , {
                    responseType: "arraybuffer"
                }).then(results => {image = results.data;})
                .catch(e => this.error(e, "image-buffer-request"));
                if (image)
                    this.image = image;
            }
        }

        Start() {
            active++;

            if (this.state !== "unstarted")
                return console.error(`Streams already started! (${this.title})`)

            this.ytdl_stream = ytdl("http://www.youtube.com/watch?v=" + this.video.snippet.resourceId.videoId, { filter: "audioonly", quality: "highestaudio" })
                .on("error", e => this.Error(e, "ytdl"))

            this.write_stream = fs.createWriteStream(this.path, {flags: !overwrite ? "wx" : "w"})
                .on("error", e => this.Error(e, "fs"));

            this.ffmpeg_stream = ffmpeg(this.ytdl_stream)
                .on("error", e => this.Error(e, "ffmpeg"))
                .on("end", () => this.WriteID3())
                .toFormat("mp3")
                .pipe(this.write_stream);

            this.state = "busy";
        }

        WriteID3() {
            this.write_stream.end();

            if (ID3)
                NodeID3.write({
                    title: this.title,
                    artist: this.artist,
                    image : this.image,
                    trackNumber: this.video.snippet.position +1,
                    album: dir
                }, this.path, () => this.Finish());
            else this.Finish();
        }

        Finish() {
            active--;
            finished++;

            this.state = "done";
            console.log(`${this.title} - ${Math.floor((finished/total)*100)}%`);
        }

        Error(e, source) {
            active--;
            finished++;

            failed.push(this.title)

            this.state = "error'd"
            this.write_stream.end();
            this.ffmpeg_stream.end();
            this.ytdl_stream.end();

            console.error(`(${source}) Error at: ${this.title}\n${e}`);
        }
    }


    setInterval(() => {

        if (active < streamCount)  {
           
            if (!videos.length && active < 0){
                if (failed.length) {
                    console.log("\nFinished download. Failed songs:");
                    console.log(failed);
                    process.exit();
                } else {
                    console.log("\n Downloaded all songs succesfully");
                    process.exit();
                }
            } else {

                let Stream_ = new Stream(videos.splice(0,1)[0]);
                Stream_.Start();

            }
        }
    }, 1000)

    console.log(`Started downloading ${total} songs`);

};
