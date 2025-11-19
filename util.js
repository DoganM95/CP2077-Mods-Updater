require("dotenv").config({ path: __dirname + "/.env" });
require("dotenv").config({ path: __dirname + "/private.env" });

const fs = require("node:fs");
const path = require("node:path");
const axios = require("axios");
const AdmZip = require("adm-zip");

const { exec } = require("child_process");
const sysutil = require("util");
const execAsync = sysutil.promisify(exec);

const GAME_DIR = process.env.GAME_DIR || "/game";
const STATE_DIR = process.env.STATE_DIR || "/state";
const TMP_DIR = process.env.TMP_DIR || "/tmp";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";

console.log("ENVIRONMENT:");
console.log("GAME_DIR    →", GAME_DIR);
console.log("STATE_DIR   →", STATE_DIR);
console.log("TMP_DIR     →", TMP_DIR);
console.log("GITHUB_TOKEN →", GITHUB_TOKEN ? "present" : "not set");
console.log();

exports.sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

exports.log = (msg) => console.log(`${new Date().toISOString()} ${msg}`);

exports.isDocker = () => {
    try {
        return require("fs").existsSync("/.dockerenv");
    } catch {
        return false;
    }
};

exports.normalizeModsList = (modsString) => {
    if (!modsString) return [];
    return modsString
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l)
        .map((line) => {
            const parts = line.split(",").map((p) => p.trim());
            if (parts.length < 3) return null;
            const rawPath = parts.slice(2).join(",").trim();
            const cleaned = rawPath
                .replace(/[\r\n\t\s]/g, "")
                .replace(/^[.\\\/]+/, "")
                .replace(/[.\\\/]+$/, "");
            const isRoot = !cleaned || cleaned === "." || cleaned === "";
            return {
                id: parts[0],
                repo: parts[1],
                relativePath: isRoot ? "" : cleaned,
            };
        })
        .filter(Boolean);
};

function getModSourceFolder(extractDir) {
    const items = fs.readdirSync(extractDir);
    if (items.length === 1) {
        const first = items[0];
        const full = path.join(extractDir, first);
        if (fs.statSync(full).isDirectory() && !first.startsWith(".") && !first.toLowerCase().includes("dist")) return full;
    }
    return extractDir; // Fallback: content is already at root of ZIP
}

// Recursive mkdir -p and copy
exports.createDirRecursive = (dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

exports.copyRecursive = (src, dest) => {
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            exports.createDirRecursive(destPath);
            exports.copyRecursive(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
};

exports.normalizeVersion = (v) => (v ? v.trim().replace(/^v/i, "") : "");

exports.isRemoteNewer = (local, remote) => {
    const lv = exports.normalizeVersion(local);
    const rv = exports.normalizeVersion(remote);
    if (!lv) return true;
    if (lv === rv) return false;
    return [lv, rv].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))[1] === rv;
};

exports.getLatestRelease = async (repo) => {
    const api = `https://api.github.com/repos/${repo}/releases/latest`;
    const headers = {
        Accept: "application/vnd.github+json",
        "User-Agent": "cp2077-updater",
    };
    if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;

    try {
        const res = await axios.get(api, { headers, timeout: 15000 });
        const json = res.data;
        const tag = json.tag_name || json.name || "";
        let zipUrl = null;
        const asset = (json.assets || []).find((a) => a.browser_download_url?.endsWith(".zip"));
        if (asset) zipUrl = asset.browser_download_url;
        else if (json.zipball_url) zipUrl = json.zipball_url;
        return { tag, zipUrl };
    } catch (err) {
        console.error("GitHub error:", err.response?.status, err.message);
        return { tag: null, zipUrl: null };
    }
};

exports.downloadFile = async (url, target) => {
    const headers = GITHUB_TOKEN ? { Authorization: `token ${GITHUB_TOKEN}` } : {};
    const res = await axios.get(url, { responseType: "arraybuffer", headers });
    fs.writeFileSync(target, res.data);
};

exports.runOnce = async () => {
    const mods = exports.normalizeModsList(process.env.MODS);
    console.log("Parsed mods:", mods);
    for (const mod of mods) {
        await exports.processTool(mod.id, mod.repo, mod.relativePath);
        await new Promise((r) => setTimeout(r, 1500));
    }
};

exports.processTool = async (id, repo, relativePath) => {
    exports.log(`----- Processing ${id} (${repo})`);
    const installPath = relativePath ? path.resolve(path.join(GAME_DIR, relativePath)) : path.resolve(GAME_DIR);
    exports.log(`→ Installing to: ${installPath}`);
    const versionFile = path.join(STATE_DIR, `${id}.version`);
    const localVersion = fs.existsSync(versionFile) ? fs.readFileSync(versionFile, "utf8").trim() : "";
    const { tag, zipUrl } = await exports.getLatestRelease(repo);
    if (!tag || !zipUrl) {
        exports.log(`No release found for ${id}`);
        return;
    }
    if (!exports.isRemoteNewer(localVersion, tag)) {
        exports.log(`Already up to date: ${id} @ ${localVersion}`);
        return;
    }
    const tmpZip = path.join(TMP_DIR, `${id}_${Date.now()}.zip`);
    const tmpExtract = path.join(TMP_DIR, `ext_${id}_${Date.now()}`);
    fs.mkdirSync(tmpExtract, { recursive: true });
    try {
        await exports.downloadFile(zipUrl, tmpZip);
        new AdmZip(tmpZip).extractAllTo(tmpExtract, true);
        exports.log(`Extracted ZIP`);
        const sourceFolder = getModSourceFolder(tmpExtract);
        exports.log(`Merging folder: ${sourceFolder} → ${installPath}`);
        exports.copyRecursive(sourceFolder, installPath);
        fs.writeFileSync(versionFile, tag);
        exports.log(`SUCCESS: ${id} → ${tag}`);
    } catch (err) {
        exports.log(`FAILED ${id}: ${err.message}`);
        console.error(err);
    } finally {
        fs.rmSync(tmpZip, { force: true, recursive: true });
        fs.rmSync(tmpExtract, { force: true, recursive: true });
    }
};

exports.isWindowsProcessRunning = async (processName = "checkMate.exe") => {
    try {
        const { stdout } = await execAsync(`tasklist /FI "IMAGENAME eq ${processName}" /FO CSV`);
        const lines = stdout.trim().split("\n");
        if (lines.length > 1) {
            const runningProcess = lines.slice(1).some((line) => line.toLowerCase().includes(processName.toLowerCase()));
            return runningProcess;
        }
        return false;
    } catch (err) {
        if (err.code === 1 && err.stdout === "") return false;
        console.error("Error checking process:", err);
        throw err;
    }
};

// Checks if a process is running by trying to exclusively rename its .exe
exports.isProcessRunningByRename = (exePath) => {
    if (!fs.existsSync(exePath)) throw new Error(`Executable not found: ${exePath}`);
    const tempPath = exePath + ".lock_test_by_updater";
    try {
        fs.renameSync(exePath, tempPath); // Try rename
        fs.renameSync(tempPath, exePath); // Revert original name
        return false; // Process is NOT running
    } catch (err) {
        if (err.code === "EBUSY" || err.code === "EPERM" || err.code === "EACCES") return true; // Process IS running (file locked)
        throw err; // Any other error (disk full, no permission, etc.) — re-throw
    }
};

// Acquires an exclusive lock by renaming the executable to prevent the app from starting while you work on its files
exports.acquireProcessLock = (exePath) => {
    const tempPath = exePath + ".locked_by_updater";
    try {
        fs.renameSync(exePath, tempPath);
        return tempPath; // Lock acquired — caller now owns the file
    } catch (err) {
        if (err.code === "EBUSY" || err.code === "EPERM" || err.code === "EACCES") {
            return null; // Already running → cannot lock
        }
        throw err;
    }
};

// Releases the lock — restores original executable name
exports.releaseProcessLock = (originalPath, tempPath) => {
    if (!tempPath || !fs.existsSync(tempPath)) return true;
    try {
        fs.renameSync(tempPath, originalPath);
        return true;
    } catch (err) {
        console.warn("Warning: Failed to restore executable name:", err.message);
        return false;
    }
};

exports.fileExists = (path) => {
    try {
        fs.accessSync(path, fs.constants.F_OK);
        return true;
    } catch {
        return false;
    }
};
