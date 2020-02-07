#! /usr/bin/env node

const path = require("path");
const program = require("commander");
const fs = require("fs");

program
    .version(require("./package.json").version, "-v, --version")
    .usage("[options] <ID>")
    .arguments("<ID>")
    .option("--key <key>", "set API key")
    .option("-s, --streams <amount>","amount of download streams", 15)
    .option("-a, --album <name>","specify album name (default is playlist name)")
    .option("--no-image","disable ablum covers (thumbnails)")
    .option("--no-ID3","disable ID3 tags")
    .option("--no-overwrite","disable overwriting existing files")
    .option("--playlist <type>", "Create playlist for certain media players. Currently supported: cmus")
    .action(function (id) {
        this.ID = id;
    })
    .parse(process.argv);

//Set API key
if (program.key) {
    fs.writeFileSync("./credentials", program.key);
    console.log("API key saved!");
    process.exit(0);
}

if (!fs.existsSync("./credentials")) {
    console.log("Please set a key first!");
    process.exit(1);
} 

//Read API key
const key = fs.readFileSync("./credentials").toString();

if (!key) {
    console.log("Missing API key! Please set an api key with the --key flag")
}
    
require("./index.js")(program, key);
