# screenshot

Insert the file path of the most recently modified Windows/WSL system screenshot into Pi's editor via `/screenshot`.

Searches standard and localized `Pictures/Screenshots` and OneDrive screenshot directories under `USERPROFILE` on Windows or `/mnt/c/Users` on WSL.


## Install

```sh
pi install npm:@rol1n/screenshot
```

Available as a standalone package (not enabled in `@rol1n/pi-kit` by default).