# tui-asr

Streaming voice dictation for Pi's terminal editor using Aliyun DashScope Paraformer.

## Install

```sh
pi install npm:@rol1n/pi-kit
```

Included and loaded by default in `@rol1n/pi-kit`. See [resource selection](../README.md#resource-selection) to disable this entry or load only selected extensions.

Uses `custom-providers` from the same kit; required provider registration is initialized automatically.

## Commands and shortcuts

| Action | Trigger |
|---|---|
| Start / stop dictation | `/asr` or `Alt+M` |
| Cancel dictation | `Alt+N` |
| Switch ASR model | `/asr model [name]` |

Requires `sox` (`rec` on POSIX, `sox -t waveaudio` on Windows) on `PATH` and DashScope credentials via `/login dashscope`, `DASHSCOPE_API_KEY`, or `ALIYUN_API_KEY`.
