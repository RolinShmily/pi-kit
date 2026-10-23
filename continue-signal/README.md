# continue-signal

Resume an idle Pi agent with a visible continuation signal.

## Install

```sh
pi install npm:@rol1n/continue-signal
```

Also included in `@rol1n/pi-kit`.

## Commands and shortcuts

| Action | Trigger |
|---|---|
| Resume unfinished work | `/continue` or `Alt+C` |
| Resume with custom instruction | `/continue Review the remaining test failures` |

An explicit command argument takes priority; otherwise the current editor draft is consumed, falling back to a default resume prompt.
