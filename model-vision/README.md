# model-vision

Analyze a local image or public HTTP(S) image URL with a vision model. Registers the `model_vision` tool for OCR, UI inspection, and visual Q&A.

## Install

```sh
pi install npm:@rol1n/model-vision
```

Available as a standalone package (not enabled in `@rol1n/pi-kit` by default).

## Use

```json
{
  "image": "./screenshots/error.png",
  "prompt": "Read the error message and describe the relevant UI."
}
```

Supports PNG, JPEG, WebP, GIF, and BMP up to 10 MiB. Private/local network URLs are blocked. Default model fallback chain is configured in `DEFAULT_VISION_MODELS` in `index.ts`.
