const ffmpeg = require("fluent-ffmpeg"),
    ffmpeg_bin = require('ffmpeg-static');
    axios = require("axios")
    NodeID3 = require("node-id3"),
    path = require("path"),
    fs = require("fs"),
    ytdl = require("ytdl-core"),
    ProgressBar = require("reins_progress_bar"),
    os = process.platform,
    readline = require("readline"),
    yt_playlists = require("yt-playlists");

//Hooks
const hooks = {
    finish: [],
    song_done: []
}

/**
 * 
 * @param {string} ID - ID of youtube playlist
 * @param {integer} streamCount - Number of streams allowed
 * @param {boolean} ID3 - If ID3 tags should be applied to mp3 files
 * @param {string} album - Name of album and directory
 * @param {boolean} imageTag - If an image should be included in the ID3 tags
 * @param {boolean} overwrite - If existing files should be overwritten
 */
module.exports = async (program, key) => {

    const {getVideos, getPlaylistInfo} = yt_playlists(key);

    let {ID, streams: streamCount, ID3, album, imageTag, overwrite, playlist} = program;
  
    if (!ID) {
        console.log("No playlist ID supplied");
        process.exit(1);
    }

    let autostart = true;

    //Parse yt url
    if (ID.includes("list="))
        ID = ID.split("list=")[1]

    //Make sure streamcount is an int
    streamCount = parseInt(streamCount)

    //Logging errors
    if (os == "linux") {
        //let errorlines = 0
        const err_wstream = fs.createWriteStream("/tmp/yt_mp3.stderr", {flags: "w"});
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

    let failed = new Array();
    let videos = PL.items;
    let finished = 0;
    let streams = new Array(parseInt(streamCount)).fill(undefined);

    //Check if mp3 already exists
    const skippedByOverwrite = [];
    if (!overwrite) {
        console.log("Checking for existing files...")

        videos = videos.filter(video => {

            const title = video.snippet.title

            const path_ = path.join(process.cwd(), dir, title.replace(/[/\\?%*:|"<>]/g, "#") + ".mp3");

            if (fs.existsSync(path_)) {
                skippedByOverwrite.push(path_)
                return false
            } else return true

        })

        if (PL.items.length - videos.length > 0)
            console.log(`${PL.items.length - videos.length} existing files found`)
        else console.log("No existing files found")

    }

    const total = videos.length;

    if (playlist)
        switch (playlist) {
            case "cmus":
                if (os != "linux") {
                    console.log("cmus playlist only supported on linux!");
                    process.exit(1);
                }
                let path_ = `${process.env.HOME}/.config/cmus/playlists/${dir}`;
                
                const rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout
                });                
                
                const question = `\n\x1b[93mWhere to store the cmus playlist?\nIf you press enter I'll install to: ${path_}\n?) \x1b[0m`;
                const answer = await (new Promise((resolve) => rl.question(question, resolve)))

                rl.close()

                //newline
                console.log();

                //Just pressed enter
                if (answer.length > 2) path_ = answer;

                const wrStream = await (new Promise((resolve) => 
                    fs.createWriteStream(path_, {flags: "w"})
                    .on("ready", function () {resolve(this)})
                ))

                wrStream.write(skippedByOverwrite.join("\n"))

                createHook("finish", () => console.log(`Made playlist at ${path_}`));
                createHook("song_done", stream => {
                    wrStream.write(stream.path + "\n");
                });

                break;
            default:
                console.log("Playlist type not supperted");
                process.exit(1)
        }

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
            this.path = path.join(process.cwd(), dir, video.snippet.title.replace(/[/\\?%*:|"<>]/g, "#") + ".mp3");
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

            hooks.song_done.forEach(fn => fn(this))

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
            console.log("Error logs at: /tmp/yt_mp3.stderr")

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

            hooks.finish.forEach(fn => fn())

            if (failed.length) {
                console.log("\nFinished download. Failed songs:");
                console.log(failed);
                process.exit(1);
            } else {
                console.log("\nDownloaded all songs succesfully");
                process.exit(0);
            }

        }

        //Count active streams filtering out undefined elements
        if (videos.length && ActiveStreamsCount < streamCount) {

            const video = videos.shift();

            let index = streams.indexOf(undefined)
            let Stream_ = new Stream(video, index);
            streams[index] = Stream_;
            Stream_.Start();

        }

    }

    checkStreams();
    setInterval(checkStreams, 100)

};

function createHook(name, fn) {
    if (!hooks[name])
        hooks[name] = [fn]
    else hooks[name].push(fn);
}
