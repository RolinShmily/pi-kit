# image-generate

Generate images through OpenRouter or DashScope and save them to `.pi/generated-images/` in the current project. Registers the `image_generate` tool and `/image-generate` model selector.

## Install

```sh
pi install npm:@rol1n/pi-kit
```

Included and loaded by default in `@rol1n/pi-kit`. See [resource selection](../README.md#resource-selection) to disable this entry or load only selected extensions.

Uses `custom-providers` from the same kit; required provider registration is initialized automatically.

## Use

Run `/image-generate model` to open the interactive model picker, or `/image-generate model qwen-image-3.0-pro` to switch directly.

```json
{
  "prompt": "A clean technical diagram of a terminal workflow",
  "aspectRatio": "16:9",
  "model": "google/gemini-3.1-flash-image"
}
```

Authenticate via `/login openrouter` or `/login dashscope` (or `OPENROUTER_API_KEY` / `DASHSCOPE_API_KEY`).
