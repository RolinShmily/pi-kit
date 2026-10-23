# windows-wheel-fix

Restores mouse-wheel reporting for Pi under Windows ConPTY / Zellij ([earendil-works/pi#9656](https://github.com/earendil-works/pi/issues/9656)) by re-emitting mouse DECSET sequences once raw mode is active. No-op on non-Windows platforms.


## Install

```sh
pi install npm:@rol1n/windows-wheel-fix
```

Also included in `@rol1n/pi-kit`.