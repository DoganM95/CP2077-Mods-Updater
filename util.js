require("dotenv").config({ path: __dirname + "/.env" });
require("dotenv").config({ path: __dirname + "/private.env" });
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const axios = require("axios");
const AdmZip = require("adm-zip");
const Seven = require("node-7z");

const GAME_DIR = process.env.GAME_DIR?.replaceAll("\\", "/") || "/game";
const STATE_DIR = process.env.STATE_DIR?.replaceAll("\\", "/") || "/state";
const TMP_DIR = process.env.TMP_DIR?.replaceAll("\\", "/") || "/tmp";
const ZIPS_DIR = process.env.ZIPS_DIR?.replaceAll("\\", "/") || "/zips";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";

console.log("ENVIRONMENT:");
console.log("GAME_DIR:", GAME_DIR);
console.log("STATE_DIR:", STATE_DIR);
console.log("TMP_DIR:", TMP_DIR);
console.log("GITHUB_TOKEN:", GITHUB_TOKEN ? "present" : "not set");
console.log();

exports.sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
exports.log = (msg) => console.log(`${new Date().toISOString()} ${msg}`);

exports.normalizeModsList = (modsString) => {
    if (!modsString) return [];
    return modsString
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"))
        .map((line) => {
            const parts = line.split(",").map((p) => p.trim());
            if (parts.length < 2) return null;
            const repo = parts[0];
            const relativePathRaw = parts[1];
            let regexStr = parts[2];
            if (repo === "jac3km4/redscript") {
                regexStr = regexStr || "^redscript.*\\.zip$";
            } else {
                regexStr = regexStr || ".*\\.(zip|rar|7z|tar\\.gz|gz|tgz)$";
            }
            let assetRegex;
            try {
                assetRegex = new RegExp(regexStr, "i");
            } catch (e) {
                console.warn(`Invalid regex "${regexStr}" for ${repo} → using .*\.(zip|rar|7z|tar\.gz|gz|tgz)$`);
                assetRegex = /\.(zip|rar|7z|tar\.gz|gz|tgz)$/i;
            }
            const relativePath = relativePathRaw
                .replace(/[\r\n\t\s]/g, "")
                .replace(/^[.\\\/]+/, "")
                .replace(/[.\\\/]+$/, "");
            return { repo, relativePath: relativePath || "", assetRegex };
        })
        .filter(Boolean);
};

function getModSourceFolder(extractDir) {
    return extractDir;
}

exports.copyRecursive = (extractedFolder, dest) => {
    const entries = fs.readdirSync(extractedFolder, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.name === "__MACOSX" || (entry.name.startsWith(".") && !entry.name.endsWith(".cet"))) continue;
        const srcPath = path.join(extractedFolder, entry.name);
        const destPath = path.join(dest, entry.name);
        try {
            if (entry.isDirectory()) {
                exports.createDirRecursive(destPath);
                exports.copyRecursive(srcPath, destPath);
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        } catch (err) {
            if (err.code !== "EEXIST") console.warn(`Copy failed (skipped): ${srcPath} → ${destPath}`);
        }
    }
};

exports.createDirRecursive = (dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

exports.normalizeVersion = (v) => (v ? v.trim().replace(/^v/i, "") : "");
exports.isRemoteNewer = (local, remote) => {
    const lv = exports.normalizeVersion(local);
    const rv = exports.normalizeVersion(remote);
    if (!lv) return true;
    if (lv === rv) return false;
    return [lv, rv].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))[1] === rv;
};

exports.getLatestRelease = async (repo, assetRegex) => {
    const api = `https://api.github.com/repos/${repo}/releases/latest`;
    const headers = {
        Accept: "application/vnd.github+json",
        "User-Agent": "cp2077-updater",
    };
    if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
    try {
        const res = await axios.get(api, { headers, timeout: 15000 });
        const json = res.data;
        const tag = (json.tag_name || json.name || "").trim().replace(/^v/i, "");
        if (!tag) return { tag: null, zipUrls: [] };
        const matching = (json.assets || [])
            .filter((a) => {
                if (!a.browser_download_url) return false;
                const filename = a.name || path.basename(a.browser_download_url);
                return assetRegex.test(filename);
            })
            .map((a) => a.browser_download_url);
        if (matching.length > 0) return { tag, zipUrls: matching };
        if (repo === "jac3km4/redscript") {
            exports.log("redscript: No binary asset found matching regex! Check release page.");
            return { tag: null, zipUrls: [] };
        }
        exports.log(`No asset matched regex for ${repo}, trying zipball as last resort...`);
        return { tag, zipUrls: [json.zipball_url] };
    } catch (err) {
        console.error(`GitHub error ${repo}:`, err.response?.status || err.message);
        return { tag: null, zipUrls: [] };
    }
};

exports.downloadFile = async (url, target) => {
    const headers = GITHUB_TOKEN ? { Authorization: `token ${GITHUB_TOKEN}` } : {};
    const res = await axios.get(url, { responseType: "arraybuffer", headers, timeout: 90000 });
    fs.writeFileSync(target, res.data);
};

exports.processTool = async (mod) => {
    const { repo, relativePath, assetRegex } = mod;
    exports.log("-----");
    exports.log(`Processing ${repo}`);
    const installPath = relativePath ? path.resolve(path.join(GAME_DIR, relativePath)) : path.resolve(GAME_DIR);
    exports.log(`Installing to: ${installPath}`);
    const safeRepoName = repo.replace(/\//g, "_");
    const versionFile = path.join(STATE_DIR, `${safeRepoName}.version`);
    const localVersion = fs.existsSync(versionFile) ? fs.readFileSync(versionFile, "utf8").trim() : "";
    const { tag, zipUrls } = await exports.getLatestRelease(repo, assetRegex);
    if (!tag || zipUrls.length === 0) {
        exports.log(`No suitable release found for ${repo}`);
        return;
    }
    if (!exports.isRemoteNewer(localVersion, tag)) {
        exports.log(`Already up to date: ${repo} @ v${localVersion}`);
        return;
    }
    const tmpBase = path.join(TMP_DIR, `ext_${safeRepoName}_${Date.now()}`);
    fs.mkdirSync(tmpBase, { recursive: true });
    try {
        for (let i = 0; i < zipUrls.length; i++) {
            const url = zipUrls[i];
            const filename = path.basename(url.split("?")[0]);
            const tmpArchive = path.join(TMP_DIR, `${safeRepoName}_${i}_${Date.now()}.${path.extname(filename) || "zip"}`);
            const tmpExtract = path.join(tmpBase, `sub_${i}`);
            fs.mkdirSync(tmpExtract, { recursive: true });
            exports.log(`Downloading [${i + 1}/${zipUrls.length}] ${filename}`);
            await exports.downloadFile(url, tmpArchive);
            exports.log(`Extracting ${filename}`);
            await extractArchive(tmpArchive, tmpExtract);
            const source = getModSourceFolder(tmpExtract);
            exports.log(`Merging from → ${path.relative(process.cwd(), source)}`);
            exports.copyRecursive(source, installPath);
            fs.rmSync(tmpArchive, { force: true, recursive: true });
            fs.rmSync(tmpExtract, { force: true, recursive: true });
        }
        fs.writeFileSync(versionFile, tag);
        exports.log(`SUCCESS ${repo} → v${tag} (${zipUrls.length} asset(s))`);
    } catch (err) {
        exports.log(`FAILED ${repo}: ${err.message}`);
        console.error(err);
    } finally {
        fs.rmSync(tmpBase, { force: true, recursive: true });
    }
};

exports.extractArchive = async (src, dest) => {
    const absSrc = path.resolve(src);
    const absDest = path.resolve(dest);
    const ext = path.extname(src).toLowerCase();

    fs.mkdirSync(absDest, { recursive: true });

    if (ext === ".zip") {
        new AdmZip(absSrc).extractAllTo(absDest, true);
        return;
    }

    if (ext === ".7z" || ext === ".tar.gz" || ext === ".tgz" || ext === ".gz") {
        return new Promise((resolve, reject) => {
            const extractor = Seven.extractFull(absSrc, absDest, { $progress: false });
            extractor.on("end", resolve);
            extractor.on("error", reject);
        });
    }

    if (ext === ".rar") {
        return new Promise((resolve, reject) => {
            // redirect all unrar output to /dev/null
            const child = spawn("unrar", ["x", "-o+", absSrc, absDest], {
                stdio: ["ignore", "ignore", "pipe"], // ignore stdin/stdout, keep stderr for errors
            });

            let errData = "";
            child.stderr.on("data", (chunk) => {
                errData += chunk.toString();
            });

            child.on("close", (code) => {
                if (code === 0) resolve();
                else reject(new Error(`unrar exited with code ${code}\n${errData}`));
            });
        });
    }

    throw new Error(`Unsupported archive type: ${ext}`);
};

const processLocalZips = async () => {
    if (!fs.existsSync(ZIPS_DIR)) {
        exports.log(`ZIPS_DIR ${ZIPS_DIR} does not exist → skipping local archives`);
        return;
    }
    exports.log("-------------");
    let candidates = fs
        .readdirSync(ZIPS_DIR)
        .filter((f) => /\.(zip|rar|7z|tar\.gz|gz|tgz)$/i.test(f))
        .map((f) => ({ archiveName: f, relativePath: "" }));
    if (process.env.LOCAL_ZIPS) {
        const lines = process.env.LOCAL_ZIPS.split(/\r?\n/)
            .map((l) => l.trim())
            .filter((l) => l && !l.startsWith("#"));
        candidates = [];
        for (const line of lines) {
            const parts = line.split(",").map((p) => p.trim());
            const pattern = parts[0];
            const relPath = (parts[1] || "")
                .replace(/[\r\n\t\s]/g, "")
                .replace(/^[.\\\/]+/, "")
                .replace(/[.\\\/]+$/, "");
            if (!pattern) continue;
            let regex;
            try {
                regex = new RegExp(pattern, "i");
            } catch (e) {
                exports.log(`Invalid regex in LOCAL_ZIPS: "${pattern}" → skipping`);
                continue;
            }
            const matching = fs
                .readdirSync(ZIPS_DIR)
                .filter((f) => /\.(zip|rar|7z|tar\.gz|gz|tgz)$/i.test(f) && regex.test(f))
                .map((f) => ({ archiveName: f, relativePath: relPath }));
            candidates.push(...matching);
        }
        if (candidates.length === 0) {
            exports.log("No local archives matched LOCAL_ZIPS patterns");
            return;
        }
    }
    if (candidates.length === 0) {
        exports.log("No local archives found in /zips");
        return;
    }
    exports.log(`Found ${candidates.length} local archive(s) to process`);
    for (const { archiveName, relativePath } of candidates) {
        exports.log("-----");
        const archivePath = path.join(ZIPS_DIR, archiveName);
        const installPath = relativePath ? path.resolve(path.join(GAME_DIR, relativePath)) : path.resolve(GAME_DIR);
        const remoteVersion = archiveName.replace(/\.(zip|rar|7z|tar\.gz|gz|tgz)$/i, "").replace(/^v/i, "");
        const versionFile = path.join(STATE_DIR, `${archiveName}.version`);
        const localVersion = fs.existsSync(versionFile) ? fs.readFileSync(versionFile, "utf8").trim() : "";
        if (localVersion === remoteVersion) {
            exports.log(`Local archive up to date: ${archiveName} @ ${remoteVersion}`);
            continue;
        }
        const tmpExtract = path.join(TMP_DIR, `local_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`);
        fs.mkdirSync(tmpExtract, { recursive: true });
        try {
            exports.log(`Installing local: ${archiveName} → ${relativePath || "(root)"}`);
            await exports.extractArchive(archivePath, tmpExtract);
            const source = getModSourceFolder(tmpExtract);
            exports.copyRecursive(source, installPath);
            fs.writeFileSync(versionFile, remoteVersion);
            exports.log(`SUCCESS local archive: ${archiveName} → ${remoteVersion}`);
        } catch (err) {
            exports.log(`${err.message.includes("Unsupported") ? "SKIPPED" : "FAILED"} local archive ${archiveName}: ${err.message}`);
        } finally {
            fs.rmSync(tmpExtract, { recursive: true, force: true });
        }
        await exports.sleep(1000);
    }
};

exports.runOnce = async () => {
    const mods = exports.normalizeModsList(process.env.MODS);
    console.log("Parsed mods:");
    mods.forEach((m) => console.log(`  • ${m.repo} → ${m.relativePath || "(root)"} | regex: ${m.assetRegex.source}`));
    console.log();
    for (const mod of mods) {
        await exports.processTool(mod);
        await exports.sleep(1500);
    }
    await processLocalZips();
    exports.log("-------------");
    exports.log("All mods processed!");
};
