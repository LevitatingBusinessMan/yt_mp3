const ffmpeg = require("fluent-ffmpeg"),
    axios = require("axios")
    NodeID3 = require("node-id3"),
    path = require("path"),
    fs = require("fs"),
    ytdl = require("ytdl-core"),
    ProgressBar = require("reins_progress_bar"),
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

    const total = PL.items.length;
    let failed = new Array();
    const videos = new Array(...PL.items);
    let finished = 0;
    const activeStreams = new Array(parseInt(streamCount)).fill(undefined);

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
            this.artist = video.snippet.title.split(" - ")[1] ? video.snippet.title.split(" - ")[0] : "uknown";
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
                .on("error", e => this.Error(e, "ytdl"))

            this.write_stream = fs.createWriteStream(this.path, {flags: !overwrite ? "wx" : "w"})
                .on("error", e => this.Error(e, "fs"));

            this.ffmpeg_stream = ffmpeg(this.ytdl_stream)
                .on("error", e => this.Error(e, "ffmpeg"))
                .on("end", () => this.WriteID3())
                .toFormat("mp3")
                .pipe(this.write_stream);
        }

        progressHandler(chunkLength, downloaded, total) {
            if (!this.started) {
                this.PB = new ProgressBar(total);
                this.started = true;
            }

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
            activeStreams[this.index] = undefined;
            delete this;
        }

        Error(e, source) {
            finished++;
            updateLog();

            failed.push(this.title)

            this.write_stream.end();
            this.ffmpeg_stream.end();
            this.ytdl_stream.end();

            console.error(`(${source}) Error at: ${this.title}\n${e}`);

            //Delete itself
            activeStreams[this.index] = undefined;
            delete this;
        }
    }
    
    function streamCheck() {
        if (activeStreams.filter(element => element).length < streamCount)  {
           
            //Done downloading
            if (!videos.length && activeStreams.length < 1){
                if (failed.length) {
                    console.log("\nFinished download. Failed songs:");
                    console.log(failed);
                    process.exit();
                } else {
                    console.log("\n Downloaded all songs succesfully");
                    process.exit();
                }

            //New download stream
            } else if (videos.length) {

                let index = activeStreams.indexOf(undefined)
                let Stream_ = new Stream(videos.splice(0,1)[0], index);
                activeStreams[index] = Stream_;
                Stream_.Start();

            }
        }
    }

    streamCheck();
    setInterval(streamCheck, 1000);

    //Progress bars
    console.log(`Started downloading ${total} songs with ${streamCount} parallel streams`);
    const mainBar = new ProgressBar(total);
    const updateMain = console.draft("\033[1;32m"+ `Total ${" ".repeat(30-"Total".length)}${mainBar.display()} ${mainBar.percentage()}%` + "\033[0m");

    function updateLog() {
        mainBar.done = finished;
        updateMain("\033[1;32m"+ `Total ${" ".repeat(30-"Total".length)}${mainBar.display()} ${mainBar.percentage()}%` + "\033[0m");
    }

};
