# tui-asr

Streaming voice dictation for Pi's terminal editor using Aliyun DashScope Paraformer.

## Install

```sh
pi install npm:@rol1n/tui-asr
```

Also included in `@rol1n/pi-kit`. Installing this package automatically installs `@rol1n/custom-providers`.

## Commands and shortcuts

| Action | Trigger |
|---|---|
| Start / stop dictation | `/asr` or `Alt+M` |
| Cancel dictation | `Alt+N` |
| Switch ASR model | `/asr model [name]` |

Requires `sox` (`rec` on POSIX, `sox -t waveaudio` on Windows) on `PATH` and DashScope credentials via `/login dashscope`, `DASHSCOPE_API_KEY`, or `ALIYUN_API_KEY`.
