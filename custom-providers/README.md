# custom-providers

Registers additional model providers through Pi's native model registry and `/login` interface.

## Install

```sh
pi install npm:@rol1n/pi-kit
```

Included and loaded by default in `@rol1n/pi-kit`. See [resource selection](../README.md#resource-selection) to disable this entry or load only selected extensions.

## Providers

| Provider | Configuration |
|---|---|
| Magpie LAN (`magpie-lan`) | `MAGPIE_LAN_BASE_URL` or `MAGPIE_BASE_URL` (default `http://127.0.0.1:3425/v1`); authenticate via `MAGPIE_LAN_GATEWAY_KEY`, `MAGPIE_GATEWAY_KEY`, or `/login magpie-lan` |
| BigModel | Authenticate via `/login bigmodel` |
| DashScope | Authenticate via `/login dashscope`; `DASHSCOPE_IMAGE_URL` overrides the image API base URL |
