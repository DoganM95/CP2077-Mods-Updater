require("dotenv").config({ path: __dirname + "/.env" });
require("dotenv").config({ path: __dirname + "/private.env" });
const fs = require("node:fs");
const path = require("node:path");
const axios = require("axios");
const AdmZip = require("adm-zip");

exports.log = (msg) => console.log(`${new Date().toISOString()} ${msg}`);

exports.runOnce = async () => {
    const mods = exports.normalizeModsList(process.env.MODS);
    for (const mod of mods) {
        await exports.processTool(mod.id, mod.repo, mod.relativePath);
        await new Promise((r) => setTimeout(r, 1500));
    }
};

exports.normalizeVersion = (v) => {
    if (!v) return "";
    return v.trim().replace(/^v/i, "");
};

exports.normalizeModsList = (modsString) => {
    const modStrings = modsString.split("\n");
    const modsArray = modStrings.map((line) => {
        return {
            id: line.split(",")[0],
            repo: line.split(",")[1],
            relativePath: line.split(",")[2],
        };
    });
    return modsArray;
};

exports.isRemoteNewer = (localV, remoteV) => {
    const lv = exports.normalizeVersion(localV);
    const rv = exports.normalizeVersion(remoteV);
    if (!lv) return true;
    if (lv === rv) return false;
    const sorted = [lv, rv].sort((a, b) => {
        try {
            return a.localeCompare(b, undefined, { numeric: true });
        } catch {
            return a < b ? -1 : 1;
        }
    });
    return sorted[1] === rv;
};

exports.getLatestRelease = async (repo) => {
    const api = `https://api.github.com/repos/${repo}/releases/latest`;
    const headers = {
        Accept: "application/vnd.github+json",
        "User-Agent": "nodejs-updater",
    };
    if (process.env.GITHUB_TOKEN) headers["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
    let json = null;
    try {
        const res = await axios.get(api, { headers, timeout: 15000 });
        json = res.data;
    } catch (err) {
        console.error("GitHub request failed:", err.response?.status, err.message);
        return { tag: null, zipUrl: null };
    }
    const tag = json.tag_name || json.name || "";
    let zipUrl = null;
    const zipAsset = (json.assets || []).find((a) => a.browser_download_url?.endsWith(".zip"));
    if (zipAsset) zipUrl = zipAsset.browser_download_url;
    else if (json.zipball_url) zipUrl = json.zipball_url;
    return { tag, zipUrl };
};

exports.downloadFile = async (url, target) => {
    const headers = {};
    if (process.env.GITHUB_TOKEN) headers["Authorization"] = `token ${process.env.GITHUB_TOKEN}`;
    const res = await axios.get(url, { responseType: "arraybuffer", headers });
    fs.writeFileSync(target, res.data);
};

exports.unzipToTemp = async (zipFile, tempDir) => {
    const zip = new AdmZip(zipFile);
    zip.extractAllTo(tempDir, true);
};

// mkdir -p command
exports.createDirRecursive = (dirPath) => {
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
};

// cp -a command (copy files recursively)
exports.copyRecursive = (src, dest) => {
    const entries = fs.readdirSync(src, { withFileTypes: true });
    entries.forEach((entry) => {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            exports.createDirRecursive(destPath);
            exports.copyRecursive(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    });
};

// You can now use this function to replace your shell command:
exports.mergeInto = async (src, dest) => {
    exports.createDirRecursive(dest);
    exports.copyRecursive(src, dest);
};

// Process a single tool, e.g. ArchiveXL
exports.processTool = async (id, repo, relativePath) => {
    exports.log("-----");
    const installPath = relativePath.startsWith("/") ? relativePath : path.join(process.env.GAME_DIR, relativePath);
    const versionFile = path.join(process.env.STATE_DIR, `${id}.version`);
    let localVersion = "";
    if (fs.existsSync(versionFile)) localVersion = fs.readFileSync(versionFile, "utf8").trim();
    exports.log(`Checking ${id} (${repo}) ... current local: ${localVersion || "NONE"}`);
    let tag, zipUrl;
    try {
        const latest = await exports.getLatestRelease(repo);
        tag = latest.tag;
        zipUrl = latest.zipUrl;
    } catch {
        exports.log(`WARN: Could not fetch release for ${repo}`);
        return;
    }
    if (!tag || !zipUrl) {
        exports.log(`WARN: No valid tag or zip for ${repo}`);
        return;
    }
    if (!exports.isRemoteNewer(localVersion, tag)) {
        exports.log(`No update for ${id}`);
        return;
    }
    exports.log(`Update found for ${id}: ${localVersion || "<none>"} -> ${tag}`);
    const tmpZip = path.join(process.env.TMP_DIR, `${id}_${Date.now()}.zip`);
    const tmpExtract = path.join(process.env.TMP_DIR, `${id}_${Date.now()}_unzipped`);
    fs.mkdirSync(tmpExtract, { recursive: true });
    try {
        exports.log(`Downloading ${repo} -> ${tmpZip}`);
        await exports.downloadFile(zipUrl, tmpZip);
        exports.log(`Extracting ${id}`);
        await exports.unzipToTemp(tmpZip, tmpExtract);
        const entries = fs.readdirSync(tmpExtract); // Determine if zip created a single top-level dir
        let srcDir = tmpExtract;
        if (entries.length === 1) {
            const d = path.join(tmpExtract, entries[0]);
            if (fs.statSync(d).isDirectory()) srcDir = d;
        }
        exports.log(`Merging into ${installPath}`);
        await exports.mergeInto(srcDir, installPath);
        fs.writeFileSync(versionFile, tag);
        exports.log(`Updated ${id} -> version ${tag}`);
    } catch (err) {
        exports.log(`ERROR processing ${id}: ${err}`);
    } finally {
        try {
            fs.rmSync(tmpZip, { force: true });
        } catch {}
        try {
            fs.rmSync(tmpExtract, { recursive: true, force: true });
        } catch {}
    }
};
