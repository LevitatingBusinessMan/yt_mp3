//Dear programmer, please ignore this. 
//This is old code I wrote a long time ago, and didn't feel like rewriting it just for this project.

module.exports = class API {
    constructor(key){
        this.key = key;
        this.axios = require('axios');
    }
    
    playlistItems(id) {
        const key = this.key;
        const axios = this.axios;

        return new Promise(async(resolve,reject) => {
            let obj = {};
            let videos = [];
            
            let first = true;

            Collect();

            async function Collect(pageToken) {
                let url = 'https://www.googleapis.com/youtube/v3/playlistItems'+ 
                `?key=${key}` +
                `&playlistId=${id}` +
                '&maxResults=50' +
                '&part=snippet' +
                (pageToken ? `&pageToken=${pageToken}` : '');

                let result = await axios.get(url);
                
                if (first) {
                    obj = {
                        owner: result.data.items[0].snippet.channelTitle,
                        id: result.data.items[0].snippet.playlistId,
                        thumbnails: result.data.items[0].snippet.thumbnails,
                        length: result.data.pageInfo.totalResults
                    };
                    obj.thumbnails.best = bestThumbnail(obj.thumbnails);
                    first = false;
                }

                clean(result.data);

                if (result.data.nextPageToken)
                    Collect(result.data.nextPageToken);
                
                if (!first && !result.data.nextPageToken) {
                    obj.videos = videos;
                    resolve(obj);
                }

                //Add all videos to array
                function clean(data) {
                    for (let i = 0; i < data.items.length; i++) {
                        let snip = data.items[i].snippet;
                        snip.thumbnails.best = bestThumbnail(snip.thumbnails);
                        
                        videos.push({
                            title: snip.title,
                            description: snip.description,
                            channelID: snip.channelID,
                            id: snip.resourceId.videoId,
                            index: (videos.length == 0 ? 0 : videos.length),
                            thumbnails: snip.thumbnails
                        });
                    }
                }

            }

        });

        function bestThumbnail(t) {
            if (t.maxres)
                return t.maxres

            else if (t.standard)
                return t.standard

            else if (t.high)
                return t.high

            else if (t.medium)
                return t.medium

            else if (t.default)
                return t.default
        }

    }
}
