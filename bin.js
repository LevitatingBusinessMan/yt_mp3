#! /usr/bin/env node

var program = require("commander");
 
let ID;
program
    .version(require("./package.json").version, "-v, --version")
    .usage("[options] <ID>")
    .arguments("<ID>")
    .option("-s, --streams <amount>","amount of streams", /\d*/)
    .option("-a, --album <name>","specify album name (default is playlist name)")
    .option("--no-image","disable ablum covers (thumbnails)")
    .option("--no-ID3","disable ID3 tags")
    .option("--no-overwrite","disable overwriting existing files")
    .action((id) => {
        ID = id;
    })
    .parse(process.argv);

/* console.log("ID: " + ID);
console.log("streams: " + program.streams);
console.log("ID3: " + program.ID3);
console.log("album: " + program.album);
console.log("image: " + program.image);
console.log("overwrite: " + program.overwrite);
console.log("\n\n"); */

const path = require("path");
require(path.join(__dirname, "./index.js"))(ID, program.streams ? program.streams : 15, program.ID3, program.album, program.image, program.overwrite);
