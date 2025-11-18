require("dotenv").config({ path: __dirname + "/.env" });
require("dotenv").config({ path: __dirname + "/private.env" });
const fs = require("node:fs");
const util = require("./util");

// const processName = "Cyberpunk2077.exe";
const processName = "firefox.exe";

const GAME_DIR = process.env.GAME_DIR || "/game";
const STATE_DIR = process.env.STATE_DIR || "/state";
const TMP_DIR = process.env.TMP_DIR || "/tmp";
const POLL_INTERVAL = Number(process.env.POLL_INTERVAL || 3600);

// TODO: add detection whether game is running or not by looking for its executable in processes

if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

(async () => {
    if (!util.isDocker()) {
        util.isWindowsProcessRunning(processName).then((running) => {
            console.log(`${processName} running on host:`, running);
        });
    }
    if (!fs.existsSync(GAME_DIR)) {
        util.log(`ERROR: GAME_DIR ${GAME_DIR} does not exist. Mount the game folder at /game in Docker.`);
        process.exit(2);
    }
    util.log(`Starting CP2077 Node.js updater. ${process.env.RUN_ONCE == "true" ? "" : "Poll interval = " + POLL_INTERVAL + "s"}`);
    while (true) {
        await util.runOnce();
        util.log(`Cycle complete. Sleeping ${POLL_INTERVAL}s`);
        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
        if (process.env.RUN_ONCE == "true") process.exit(0);
    }
})();
