# CP2077-Mod-Updater

A dockerized tool to keep cyberpunk mods always up to date automatically

# Setup

- Generate a [classic token on github](https://github.com/settings/tokens) with no checkbox checked
- Copy your cyberpunk game's root directory as path
- Find your desired mods/tools as github repositories, e.g. <https://github.com/psiberx/cp2077-tweak-xl>
- Create a list of those, with schema `toolName,develoeprName/repositoryName,folderToUse`, e.g.

   ```shell
    MODS="archivexl,psiberx/cp2077-archive-xl,.
    tweakxl,psiberx/cp2077-tweak-xl,.
    cyberenginetweaks,maximegmd/CyberEngineTweaks,.
    codeware,psiberx/cp2077-codeware,.
    red4ext,wopss/RED4ext,.
    redscript,jac3km4/redscript,MODS/redscript"
    ```

  - The contents of the mod zip will be merged into the root of the game directory
  - Specifying a subdirectory will make sure it is extracted in that sub-dir,  
    e.g. folderToUse being `MODS/redscript`will extract the zip contents into `...\Cyberpunk 2077\MODS\redscript\`

## Docker

You can run this tool as a docker container like this

```powershell
docker run -d `
  -e GITHUB_TOKEN=gh_abc123 `
  -e MODS="archivexl,psiberx/cp2077-archive-xl,.
    tweakxl,psiberx/cp2077-tweak-xl,.
    cyberenginetweaks,maximegmd/CyberEngineTweaks,.
    codeware,psiberx/cp2077-codeware,.
    red4ext,wopss/RED4ext,.
    redscript,jac3km4/redscript,MODS/redscript" `
  -e POLL_INTERVAL=600 `
  -e RUN_ONCE=true `
  --restart unless-stopped `
  -v "C:\Games\Cyberpunk 2077\:/game" `
  -v "C:\Games\Cyberpunk 2077\updater\state\:/state" `
  -v "C:\Games\Cyberpunk 2077\updater\tmp\:/tmp" `
  node-cp2077-updater
```

### Notes

- `-e GITHUB_TOKEN=gh_abc123` defines the github token created above (necessary)
- `-e MODS="..."` is the list of mods/tools defined earlier (endure it's formatted as in the example)
- `-e POLL_INTERVAL=600` defines the time between each check in seconds
- `-e RUN_ONCE=true` defines whether to run the tool only once or as a process
- `-v "...:/game"` defines the absolute path of the game directory
- `-v "...:/state"`is where installed version informations are stored
- `-v "...:/tmp"` is where downloaded zips of the mods are stored temporarily