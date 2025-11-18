# CP2077-Mod-Updater
A dockerized tool to keep cyberpunk mods always up to date automatically

```shell
docker run -it --restart=always ^
  -v "C:\Games\Cyberpunk 2077":/game ^
  -v "C:\cp2077-updater-data":/data ^
  -e MODS="archivexl,psiberx/cp2077-archive-xl,.
    tweakxl,psiberx/cp2077-tweak-xl,.
    cyberenginetweaks,maximegmd/CyberEngineTweaks,.
    codeware,psiberx/cp2077-codeware,.
    red4ext,wopss/RED4ext,.
    redscript,jac3km4/redscript,MODS/redscript" \
  node-cp2077-updater
```