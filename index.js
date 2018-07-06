#! /usr/bin/env node

let argv = process.argv;
process.stdout.write('\n');

if (['-v', '--version', '--help'].includes(argv[2]) || !argv[2]) {
    let package = require('./package.json');
    console.dir({
        "Name": package.name,
        "Version": package.version,
        "Author": package.author,
        "Syntax": "yt_mp3 <playlist_id> <dir>",
        "Change key": "yt_mp3 -key <new_key>"
    });
    process.exit(0);
}

if ('-key' == argv[2]){
    const fs = require('fs');
    if (argv[3]) {
        fs.writeFile(__dirname + '/key.json', JSON.stringify({key: argv[3]}), err => {
            if (err) throw err;
            console.log("key updated")
        });
    }
    else console.log(`Key: ${require('./key.json').key}`)
} else {
    let image = argv.includes('-noimage') ? false : true;
    let streamsAllowed = argv.includes('-s') ? argv[argv.indexOf('-s')+1] : 15;
    if (!streamsAllowed || isNaN(streamsAllowed))  console.error('No number defined after -s');

    let args = argv;

    argv.splice(0, 2);
    if (argv.includes('-noimage')) args.splice(args.indexOf('-noimage'),1);
    if (argv.includes('-s')) args.splice(args.indexOf('-s'),2);

    run(args[0], args.slice(1).join(' '), image, streamsAllowed)
}

function run(playlistID, dir, images, streamsAllowed) {
    const notifier = require('node-notifier'),
    axios = require('axios'),
    path = require('path'),
    ffmpeg = require('fluent-ffmpeg'),
    NodeID3 = require('node-id3'),
    fs = require('fs'),
    ytdl = require('ytdl-core')
    key = require('./key.json').key;

    ffmpeg.setFfmpegPath(path.join(__dirname, '/node_modules/ffmpeg-binaries/bin/ffmpeg.exe'));

    new (require('./yt_wrapper.js'))(key)
    .playlistItems(playlistID).then(async r => {

        console.log(`Downloading ${r.videos.length} songs into ${dir}.`)
    
        if (!fs.existsSync(dir))
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
                if (images) axios.get(video.thumbnails.best.url , {
                    responseType: 'arraybuffer'
                  }).then(results => {image = results.data})
                  .catch(err => {console.log(err.message); process.exit();});
    
                streams++;
                let path_ = path.join(dir, (title + '.mp3').replace(/[/\\?%*:|"<>]/g, '#'));
                ffmpeg(ytdl('http://www.youtube.com/watch?v=' + video.id, { filter: "audioonly" }))
                .toFormat('mp3')
                .pipe(fs.createWriteStream(path_))
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
                    }, path_);
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

}

module.exports = run;
