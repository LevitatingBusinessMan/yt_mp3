//TODO: 
//test with deleted video
//Errors
//Localizations?
//Double songs with playlists under 50 songs

const https = require('https'),
url = require('url');

module.exports = KEY => {
    var KEY = KEY;
    return {getVideos, getPlaylistInfo};

    async function getVideos(ID) {

        let request = {
            protocol: 'https',
            hostname: 'www.googleapis.com',
            pathname: '/youtube/v3/playlistItems',
            query: {
                key: KEY,
                playlistId: ID,
                maxResults: 50,
                part: "snippet"
            }
        };

        class Listing extends Array {
            constructor(items, nextPageToken) {
                //Set best thumbnail
                items.map(v => v.snippet.thumbnails.best = bestThumbnail(v.snippet.thumbnails));

                super(...items)
                this.nextPageToken = nextPageToken;
            }
        
            fetchMore() {
                request.query.pageToken	= this.nextPageToken;

                return new Promise((resolve, reject) => {
                    https.get(url.format(request), res => {
                        let data = '';
                        res.on('data', d => data += d.toString())
                        res.on('end', () => {
                            data = JSON.parse(data);
                            data.items.map(v => v.snippet.thumbnails.best = bestThumbnail(v.snippet.thumbnails));
                            data.items.forEach(i => this.push(i));
                            this.nextPageToken = data.nextPageToken;
                            resolve(this);
                        })
                    })
                })
            }
        
            fetchAll() {
                return new Promise((resolve, reject) =>
                (function collect() {
                    this.fetchMore().then(() => {
                        if (this.nextPageToken)
                            collect.bind(this)();
                        else resolve()
                    })
                }).bind(this)())
            }
        }

        return new Promise((resolve, reject) => 
            https.get(url.format(request), res => {
                let data = '';
                res.on('data', d => data += d.toString())
                res.on('end', () => {
                    data = JSON.parse(data);
                    if (!data.items.length)
                        resolve({
                            owner: undefined,
                            id: undefined,
                            thumbnail: undefined,
                            length: 0,
                            etag: data.etag,
                            items: []
                        })
                    else
                        resolve({
                            owner: data.items[0].snippet.channelTitle,
                            id: data.items[0].snippet.playlistId,
                            thumbnail: bestThumbnail(data.items[0].snippet.thumbnails),
                            length: data.pageInfo.totalResults,
                            etag: data.etag,
                            items: new Listing(data.items, data.nextPageToken)
                        })
                })
            })
        )
    }

    function getPlaylistInfo(ID) {
        let request = {
            protocol: 'https',
            hostname: 'www.googleapis.com',
            pathname: '/youtube/v3/playlists',
            query: {
                key: KEY,
                id: ID,
                maxResults: 50,
                part: "snippet"
            }
        };

        return new Promise((resolve, reject) => 
            https.get(url.format(request), res => {
                let data = '';
                res.on('data', d => data += d.toString())
                res.on('end', () => {
                    data = JSON.parse(data);
                    resolve(data.items[0])
                })
            })
        )
    }
}

function bestThumbnail(t) {
    if (t.maxres)
        return t.maxres;

    else if (t.standard)
        return t.standard;

    else if (t.high)
        return t.high;

    else if (t.medium)
        return t.medium;

    else if (t.default)
        return t.default;
}

