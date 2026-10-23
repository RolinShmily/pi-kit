# windows-wheel-fix

Restores mouse-wheel reporting for Pi under Windows ConPTY / Zellij ([earendil-works/pi#9656](https://github.com/earendil-works/pi/issues/9656)) by re-emitting mouse DECSET sequences once raw mode is active. No-op on non-Windows platforms.


## Install

```sh
pi install npm:@rol1n/pi-kit
```

Included and loaded by default in `@rol1n/pi-kit`. See [resource selection](../README.md#resource-selection) to disable this entry or load only selected extensions.