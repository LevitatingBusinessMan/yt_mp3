// example node index.js PLc1l1_YXYDH4BoWto9Mds2aaL_bn1lAG_ REINS EDM MIX

let images;
if (process.argv.includes('-noimage')) {
    process.argv.splice(process.argv.indexOf('-noimage'), 1);
    mages = false;
} else images = true;

let playlistID = process.argv[2];
let dir = process.argv.splice(3).join(' ');
let streamsAllowed = 15;

let key = require('./key.js')
const notifier = require('node-notifier');
const ffmpeg = require('fluent-ffmpeg');
const NodeID3 = require('node-id3')
const fs = require('fs');
const ytdl = require('ytdl-core');
const yt = new (require('./yt_wrapper.js'))(key);

yt.playlistItems(playlistID).then(async r => {

    fs.mkdirSync(dir);

    let videos = r.videos.slice();
    let startTime = new Date();
    let streams = 0;
    let finished = 0;
    process.stdout.write(`${Math.round(finished/r.videos.length*100)}% - ${0}m${0}s`);

    let generalInterval = setInterval(() => {
        if(!videos.length && !streams){
            notifier.notify(
                {
                  title: 'YT downloader',
                  message: `Done downloading ${r.videos.length} songs!`,
                  icon: './icon.png', // Absolute path (doesn't work on balloons)
                  sound: true, // Only Notification Center or Windows Toasters
                  wait: false // Wait with callback, until user action is taken against notification
                }
            );
            setTimeout(process.exit, 100);
        }

        // add stream
        if (streams < streamsAllowed && videos.length){
            let video = videos.splice(0,1)[0];            

            let title = video.title.split(' - ')[1] ? video.title.split(' - ')[1] : video.title;
            let artist = video.title.split(' - ')[0] ? video.title.split(' - ')[0] : 'uknown';

            let image;
            if (images) yt.axios.get(video.thumbnails.best.url , {
                responseType: 'arraybuffer'
              }).then(results => {image = results.data});

            streams++;
            let path = `./${dir}/${(title + '.mp3').replace(/[/\\?%*:|"<>]/g, '-')}`;    
            ffmpeg(ytdl('http://www.youtube.com/watch?v=' + video.id, { filter: "audioonly" }))
            .toFormat('mp3')
            .pipe(fs.createWriteStream(path))
            .on('error', console.log)
            .on('finish', () => {
                finished++;
                streams--;
                NodeID3.write({
                    title,
                    artist,
                    image,
                    album: dir,
                    trackNumber: video.index + 1
                }, path);
            });
        }
    }, 200);

    let progressIndicator = setInterval(() => {
        let d = new Date();
        let minutes = new Date(d - startTime).getMinutes();
        let seconds = new Date(d - startTime).getSeconds();
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        process.stdout.write(`${Math.round(finished/r.videos.length*100)}% - ${minutes}m${seconds}s`);
    },1000);

});
