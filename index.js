const ffmpeg = require("fluent-ffmpeg"),
    ffmpeg_bin = require('ffmpeg-static');
    axios = require("axios")
    NodeID3 = require("node-id3"),
    path = require("path"),
    fs = require("fs"),
    ytdl = require("ytdl-core"),
    ProgressBar = require("reins_progress_bar"),
    os = process.platform,
    {getVideos, getPlaylistInfo} = require("yt-playlists")("AIzaSyAueEP0JLjzPSBcIxZYP6kmHFHYMFXkf5E");


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

    //Logging errors
    if (os == "linux") {
        //let errorlines = 0
        const err_wstream = fs.createWriteStream("/var/tmp/yt_mp3.stderr", {flags: "w"});
        console.error = (data) => {
            //process.stderr.moveCursor(0, streamCount+2 + errorlines)
            
            process.stderr.write(data + "\n");
            err_wstream.write(data + "\n");

            //Count lines that have been printed (assuming there's no wrap, wrap fucks this whole thing up)
            //errorlines = errorlines + (data.match(/\n/g)||[]).length + 1

            //process.stderr.moveCursor(0, -(streamCount+2) - errorlines)
        }
    }

    ffmpeg.setFfmpegPath(ffmpeg_bin.path);

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

    const total = PL.items.length;
    let failed = new Array();
    const videos = PL.items;
    let finished = 0;
    const streams = new Array(parseInt(streamCount)).fill(undefined);

    require("draftlog").into(console)
    const draftLogs = new Array(streamCount);

    /**
     * @param {object} video - Video element from Youtube's API
     */
    class Stream {
        constructor(video, index) {
            this.started = false;
            this.index = index;
            this.video = video;
            this.title = video.snippet.title.split(" - ")[1] ? video.snippet.title.split(" - ")[1] : video.snippet.title;
            this.title_ = this.title.length > 30 ? this.title.substr(0, 27) + "..." : this.title;
            this.artist = video.snippet.title.split(" - ")[1] ? video.snippet.title.split(" - ")[0] : "unknown";
            this.image = undefined;
            this.path = path.join(dir, this.title.replace(/[/\\?%*:|"<>]/g, "#") + ".mp3");
            this.size = undefined;
            this.PB = undefined;
            
            if (imageTag) {
                axios.get(video.snippet.thumbnails.best.url , {
                    responseType: "arraybuffer"
                })
                .then(results => this.image = results.data)
                .catch(e => this.error(e, "image-buffer-request"));
            }
        }

        Start() {
            this.ytdl_stream = ytdl("http://www.youtube.com/watch?v=" + this.video.snippet.resourceId.videoId, { filter: "audioonly", quality: "highestaudio" })
                .on("progress", this.progressHandler.bind(this))
                .on("error", e => this.Error(e, "ytdl"));

            this.write_stream = fs.createWriteStream(this.path, {flags: "w"})
                .on("error", e => this.Error(e, "fs"));

            this.ffmpeg_stream = ffmpeg(this.ytdl_stream)
                .on("error", e => this.Error(e, "ffmpeg"))
                .on("end", () => this.WriteID3())
                .toFormat("mp3")
                .pipe(this.write_stream);
            
            //Initiate progress bar
            this.progressHandler(0, 0, 100);
        }

        progressHandler(chunkLength, downloaded, total) {
            if (!this.started) {
                this.PB = new ProgressBar(total);
                this.started = true;
            }

            //Update to actual total
            this.PB.total = total;

            this.PB.done = downloaded;
            
            if(!draftLogs[this.index])
                draftLogs[this.index] = console.draft(`${this.title_ + " ".repeat(30-this.title_.length)} ${this.PB.display()} ${this.PB.percentage()}%`);
            else
                draftLogs[this.index](`${this.title_ + " ".repeat(30-this.title_.length)} ${this.PB.display()} ${this.PB.percentage()}%`);
        }

        WriteID3() {
            this.write_stream.end();
            
            if (ID3)
                NodeID3.write({
                    title: this.title,
                    artist: this.artist,
                    image: this.image,
                    trackNumber: this.video.snippet.position +1,
                    album: dir
                }, this.path, () => this.Finish());
            else this.Finish();
        }

        Finish() {
            finished++;
            updateLog();

            //Delete itself
            streams[this.index] = undefined;
            delete this;
        }

        Error(e, source) {
            finished++;
            updateLog();

            failed.push(this.title)

            try {
                this.write_stream.end();
                this.ffmpeg_stream.end();
                this.ytdl_stream.end();
            } catch (err) {
                
            }

            console.error(`(${source}) Error at: ${this.title}\n${e}`);
            if (os == "linux")
            console.log("Error logs at: /var/tmp/yt_mp3.stderr")

            //Delete itself
            streams[this.index] = undefined;
            delete this;
        }
    }
    
    //Progress bars
    console.log(`Started downloading ${total} songs with ${streamCount} parallel streams`);
    const mainBar = new ProgressBar(total);
    const updateMain = console.draft("\033[1;32m"+ `Total ${" ".repeat(30-"Total".length)}${mainBar.display()} ${mainBar.percentage()}%` + "\033[0m");

    function updateLog() {
        mainBar.done = finished;
        updateMain("\033[1;32m"+ `Total ${" ".repeat(30-"Total".length)}${mainBar.display()} ${mainBar.percentage()}%` + "\033[0m");
    }

    function checkStreams() {
        
        ActiveStreamsCount = streams.filter(element => element).length;

        if (!videos.length && ActiveStreamsCount < 1){
            if (failed.length) {
                console.log("\nFinished download. Failed songs:");
                console.log(failed);
                process.exit(1);
            } else {
                console.log("\n Downloaded all songs succesfully");
                process.exit(0);
            }

        }

        //Count active streams filtering out undefined elements
        if (videos.length && ActiveStreamsCount < streamCount) {

            const video = videos.shift();

            //Check if file exists
            if (!overwrite) {
                const title =
                    video.snippet.title.split(" - ")[1]
                    ? video.snippet.title.split(" - ")[1]
                    : video.snippet.title;

                const path_ = path.join(dir, title.replace(/[/\\?%*:|"<>]/g, "#") + ".mp3");

                //Remove video from list
                if (fs.existsSync(path_)) {
                    finished++
                    updateLog()
                    return;
                }

            }

            let index = streams.indexOf(undefined)
            let Stream_ = new Stream(video, index);
            streams[index] = Stream_;
            Stream_.Start();

        }

    }

    checkStreams();
    setInterval(checkStreams, 100)

};
