require("dotenv").config({ path: __dirname + "/.env" });
require("dotenv").config({ path: __dirname + "/private.env" });
const fs = require("node:fs");
const util = require("./util");

const GAME_DIR = process.env.GAME_DIR?.replaceAll("\\", "/") || "/game";
const STATE_DIR = process.env.STATE_DIR?.replaceAll("\\", "/") || "/state";
const TMP_DIR = process.env.TMP_DIR?.replaceAll("\\", "/") || "/tmp";
const ZIPS_DIR = process.env.ZIPS_DIR?.replaceAll("\\", "/") || "/zips";
const POLL_INTERVAL = Number(process.env.POLL_INTERVAL || 3600);

if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const gameProcessPath = "/bin/x64/Cyberpunk2077.exe";
const gameProcessName = "Cyberpunk2077.exe";
const fullGameExecutablePath = GAME_DIR + gameProcessPath;

(async () => {
    if (!fs.existsSync(ZIPS_DIR)) fs.mkdirSync(ZIPS_DIR, { recursive: true });
    if (!fs.existsSync(GAME_DIR)) {
        util.log(`ERROR: GAME_DIR ${GAME_DIR} does not exist. Mount the game folder at /game in Docker.`);
        process.exit(2);
    }
    util.log(`Starting CP2077 Node.js updater. ${process.env.RUN_ONCE == "true" ? "" : "Poll interval = " + POLL_INTERVAL + "s"}`);
    while (true) {
        await util.runOnce();
        if (process.env.RUN_ONCE == "true") {
            util.log(`Updates complete, exiting.`);
            process.exit(0);
        }
        util.log(`Cycle complete. Sleeping ${POLL_INTERVAL}s`);
        await util.sleep(POLL_INTERVAL * 1000);
    }
})();
