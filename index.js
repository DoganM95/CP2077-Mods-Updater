require("dotenv").config({ path: __dirname + "/.env" });
require("dotenv").config({ path: __dirname + "/private.env" });
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { exec: _exec } = require("node:child_process");
const axios = require("axios");
const util = require("./util");

const GAME_DIR = process.env.GAME_DIR || "/game";
const STATE_DIR = process.env.STATE_DIR || "/data/cp2077_updater";
const TMP_DIR = process.env.TMP_DIR || "/tmp/cp2077_updater";
const POLL_INTERVAL = process.env.POLL_INTERVAL || Number(process.env.POLL_INTERVAL || 3600);
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";

// TODO: add detection whether game is running or not by looking for its executable in processes

if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

(async () => {
    if (!fs.existsSync(GAME_DIR)) {
        util.log(`ERROR: GAME_DIR ${GAME_DIR} does not exist. Mount the game folder at /game in Docker.`);
        process.exit(2);
    }

    if (process.env.RUN_ONCE == "true") {
        await util.runOnce();
        process.exit(0);
    }

    util.log(`Starting CP2077 Node.js updater. Poll interval = ${POLL_INTERVAL}s`);

    while (true) {
        await util.runOnce();
        util.log(`Cycle complete. Sleeping ${POLL_INTERVAL}s`);
        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
    }
})();
