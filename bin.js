#! /usr/bin/env node

const path = require("path");
const program = require("commander");
const fs = require("fs");

program
    .version(require("./package.json").version, "-v, --version")
    .usage("[options] <ID>")
    .arguments("<ID>")
    .option("-s, --streams <amount>","amount of download streams", 10)
    .option("-o, --output <dir>","Specify folder to place playlist in")
    .option("-a, --album <name>","Specify album name. Options: none, playlist, channel")
    .option("--no-image","disable ablum covers (thumbnails)")
    .option("--no-ID3","disable ID3 tags")
    .option("--no-m3u","don't create m3u file")
    .option("--no-overwrite","disable overwriting existing files")
    .action(function (id) {
        this.ID = id;
    })
    .parse(process.argv);

require("./index.js")(program);
