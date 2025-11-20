# Intro

A tool to keep cyberpunk game tools/mods that are available as github releases always up to date.
If you are sick of having to download and unzip the tools every time an update happens, this is for you.

# Setup

- Generate a [classic token on github](https://github.com/settings/tokens) with no checkbox checked
- Determine your cyberpunk game's root directory as path, will be needed later in configuration
- Find your desired mods/tools as github repositories, e.g. <https://github.com/psiberx/cp2077-tweak-xl>
- Create a list of those, with the following schema per line  

  ```shell
      githubDeveloperName/repositoryName,folderToUse
  ```

- Example mods list

  ```shell
      MODS="
      jac3km4/redscript,.,redscript.*-windows\.zip$
      wopss/RED4ext,.,^red4ext_[^_]+?\.zip$
      maximegmd/CyberEngineTweaks,.,^cet_.*\.zip$
      psiberx/cp2077-codeware,.,^Codeware-.*\.zip$
      psiberx/cp2077-archive-xl,.,^ArchiveXL-.*\.zip$
      psiberx/cp2077-tweak-xl,.,^TweakXL-.*\.zip$
      "
  ```

  - The contents of the mod zip will be merged into the root of the game directory
  - Specifying a subdirectory will make sure it is extracted in that sub-dir,  
    e.g. folderToUse being `MODS/redscript`will extract the zip contents into `...\Cyberpunk 2077\MODS\redscript\`

## Docker

You can run this tool as a docker container as follows.
It is recommended to let the updater run on an empty test directory first, e.g. `C:\Test` to see if it installs everything just as expected, before using it on the game directory.

### Notes

- `-e GITHUB_TOKEN=gh_abc123` defines the github token created above (mandatory)
- `-e MODS="..."` is the list of mods/tools defined earlier (ensure it's formatted as in the example)
- `-e POLL_INTERVAL=600` defines the time between each iteration in seconds
- `-e RUN_ONCE=true` defines whether to run the tool only once or as a process
- `-v "...:/game"` defines the absolute path of the game directory
- `-v "...:/state"`is where installed version informations are stored
- `-v "...:/tmp"` is where downloaded zips of the mods are stored temporarily
- `-v "...:/zips"` is where local mod zips are stored, that should be installed (optional omit if not needed)

### Run Once

The container removes itself after its single iteration is complete.  

```powershell
    docker run -d `
      -e GITHUB_TOKEN=ghp_abc123 `
      -e MODS="
        jac3km4/redscript,.,redscript.*-windows\.zip$
        wopss/RED4ext,.,^red4ext_[^_]+?\.zip$
        maximegmd/CyberEngineTweaks,.,^cet_.*\.zip$
        psiberx/cp2077-codeware,.,^Codeware-.*\.zip$
        psiberx/cp2077-archive-xl,.,^ArchiveXL-.*\.zip$
        psiberx/cp2077-tweak-xl,.,^TweakXL-.*\.zip$
      " `
      -e RUN_ONCE=true `
      --name cyberpunk-mods-updater `
      --pull always `
      --restart no `
      -v "C:\Games\Cyberpunk 2077\:/game" `
      -v "C:\Games\Cyberpunk 2077\updater\state\:/state" `
      -v "C:\Games\Cyberpunk 2077\updater\tmp\:/tmp" `
      -v "C:\Games\Cyberpunk 2077\mod-zips\:/zips" `
      ghcr.io/doganm95/cyberpunk-mods-updater:latest
```

### Run periodically

The container runs as a daemon in the background and periodically updates tools with new versions.

```powershell
    docker run -d `
      -e GITHUB_TOKEN=ghp_abc123 `
      -e MODS="
        jac3km4/redscript,.,redscript.*-windows\.zip$
        wopss/RED4ext,.,^red4ext_[^_]+?\.zip$
        maximegmd/CyberEngineTweaks,.,^cet_.*\.zip$
        psiberx/cp2077-codeware,.,^Codeware-.*\.zip$
        psiberx/cp2077-archive-xl,.,^ArchiveXL-.*\.zip$
        psiberx/cp2077-tweak-xl,.,^TweakXL-.*\.zip$
      " `
      -e POLL_INTERVAL=600 `
      --name cyberpunk-mods-updater `
      --pull always `
      --restart unless-stopped `
      -v "C:\Program Files (x86)\Steam\steamapps\common\Cyberpunk 2077\:/game" `
      -v "C:\Program Files (x86)\Steam\steamapps\common\Cyberpunk 2077\updater\state\:/state" `
      -v "C:\Program Files (x86)\Steam\steamapps\common\Cyberpunk 2077\updater\tmp\:/tmp" `
      -v "C:\Program Files (x86)\Steam\steamapps\common\Cyberpunk 2077\mod-zips\:/zips" `
      ghcr.io/doganm95/cyberpunk-mods-updater:latest
```
