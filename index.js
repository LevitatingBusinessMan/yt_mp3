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
    yt_playlists = require("yt-playlist-scraper"),
    require("draftlog").into(console);

//Hooks
const hooks = {
    finish: [],
    song_done: []
}

//Filtered strings (these get removed from titles)
const filter = [
    "(lyrics)",
    "(official audio)",
    "(official video)",
    "[lyrics]",
    "(official lyric video)",
    "(lyric video)",
    "[lyric video]"
]

/**
 * 
 * @param {string} ID - ID of youtube playlist
 * @param {integer} streamCount - Number of streams allowed
 * @param {boolean} ID3 - If ID3 tags should be applied to mp3 files
 * @param {boolean} image - If an image should be included in the ID3 tags
 * @param {boolean} overwrite - If existing files should be overwritten
 */
module.exports = async (options) => {

    let {ID, streams: streamCount, ID3, image, overwrite, album, output, m3u} = options;
  
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

    ffmpeg.setFfmpegPath(ffmpeg_bin.path);

    console.log("Fetching videos...")

    //Retrieve playlists videos
    const playlistData = await yt_playlists(ID)
    .catch(() => {
        console.error("Error retrieving playlist data");
        process.exit()
    });

    //If no album name is set, use the playlists title
    const plName = playlistData.title
    let outputDir = output || plName

    //Remove slashes
    raw_outputDir = outputDir
    outputDir = outputDir.replace(/[\\/]/, "#");

    //If the user specifies a non-existent dir, use that dir
    //If the user specifies an existing dir, make a dir with inside with the playlist name
    if (fs.existsSync(outputDir) && plName != raw_outputDir) outputDir = path.join(outputDir, plName)
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir)

    console.log(`Creating playlist at ${outputDir}`)

    let failed = new Array();
    let videos = playlistData.videos;
    let finished = 0;
    let streams = new Array(parseInt(streamCount)).fill(undefined);

    //Check if mp3 already exists
    const skippedByOverwrite = [];
    if (!overwrite) {
        console.log("Checking for existing files...")

        videos = videos.map(async video => {

            const {filename} = parse_video_title(video)
            const path_ = path.join(outputDir, filename);

            if (!fs.existsSync(path_)) return video;

            //If there is a ID3 tag with the title we assume the file to be valid
            const valid = await (new Promise((resolve) => {
                NodeID3.read(path_, (err, tags) => {
                    if (err) throw err;
                    resolve(tags.title ? true : false)
                })
            }))


            if (!valid) {
                skippedByOverwrite.push(path_)
                return video
            }
            
            return null
        })

        videos = (await Promise.all(videos)).filter(vid => vid)

        if (playlistData.videos.length - videos.length > 0)
            console.log(`${playlistData.videos.length - videos.length} existing files found`)
        else console.log("No existing files found")

        //Stupid ass helper function for async filtering
        async function filter(arr, callback) {
            const fail = Symbol()
            return (await Promise.all(arr.map(async item => (await callback(item)) ? item : fail))).filter(i=>i!==fail)
        }

    }

    const total = videos.length;

    if (m3u) {

        file = `${outputDir}/${plName.replace(/[/\\?%*:|"<>]/g, "#")}.m3u`

        const wrStream = await (new Promise((resolve) => 
            fs.createWriteStream(file, {flags: "w"})
            .on("ready", function () {resolve(this)})
        ))

        wrStream.write(skippedByOverwrite.join("\n"))

        createHook("finish", () => console.log(`Saved playlist in ${file}`));
        createHook("song_done", stream => {
            wrStream.write(stream.filename + "\n");
        });

    }

    let errorstrings = "";
    let exit_code = 0;
    let error_count = 0;
    let errors_draft = console.draft("Errors: 0");
    createHook("error", (source, video, error) => {
        error_count++;
        errors_draft(`Errors: ${error_count}`);
        error = `(${source}) Error at: ${video.title}\n${error}\n`;
        errorstrings += error;
    })

    const draftLogs = new Array(streamCount);

    class Stream {
        constructor(video, index) {
            this.started = false;
            this.index = index;
            this.trackNumber = video.index;
            this.video = video;

            const {artist, title, filename} = parse_video_title(video);
            this.artist = artist;
            this.title = title;
            this.filename = filename;

            this.displaytitle = this.title.length > 30 ? this.title.substr(0, 27) + "..." : this.title;
            this.image = undefined;
            this.filename = (this.artist != "unknown" ? `${this.artist} - ${this.title}` : this.title).replace(/[/\\?%*:|"<>]/g, "#") + ".mp3"
            this.path = path.join(outputDir, this.filename);
            this.size = undefined;
            this.PB = undefined;

            switch (album) {
                case "playlist":
                    this.album = plName
                    break
                case "channel":
                    this.album = this.video.channel.title
                    break
                case "none":
                default:
                    this.album = undefined
            }

            if (image) {
                axios.get(video.thumbnails.best.url , {
                    responseType: "arraybuffer"
                })
                .then(results => this.image = results.data)
                .catch(e => this.Error(e, "image-buffer-request"));
            }
        }

        Start() {
            this.ytdl_stream = ytdl("http://www.youtube.com/watch?v=" + this.video.id, { filter: "audioonly", quality: "highestaudio" })
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
                draftLogs[this.index] = console.draft(`${this.displaytitle + " ".repeat(30-this.displaytitle.length)} ${this.PB.display()} ${this.PB.percentage()}%`);
            else
                draftLogs[this.index](`${this.displaytitle + " ".repeat(30-this.displaytitle.length)} ${this.PB.display()} ${this.PB.percentage()}%`);
        }

        WriteID3() {
            this.write_stream.end();
            
            if (ID3)
                NodeID3.write({
                    title: this.title,
                    artist: this.artist,
                    image: this.image,
                    trackNumber: this.trackNumber,
                    album: this.album
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

            hooks.error.forEach(fn => fn(source, this, e))

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
            
            if (errorstrings.length) {
                exit_code = 1
                console.error(errorstrings)
            }

            console.log("Done downloading songs")
            process.exit(exit_code)

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

function parse_video_title(video) {
    let title = video.title.includes(" - ") ? video.title.split(" - ")[1] : video.title
    const artist = video.title.includes(" - ") ? video.title.split(" - ")[0] : video.channel.title
    filter.forEach(string => {
        let string_escaped = string.replace(/[\(\[\)\]]/g, "\\$&");
        const regex = new RegExp(string_escaped, "gi");
        title = title.replace(regex, "").replace(/\s\s+/, "");
    })
    const filename = `${artist} - ${title}`.replace(/[/\\?%*:|"<>]/g, "#") + ".mp3"
    return {
        title,
        artist,
        filename
    }
}
