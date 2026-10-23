# ask-u-questions

Interactive single-choice, multiple-choice, and free-text questions for Pi. Registers the `ask_user_question` tool and serializes dialogs through a shared UI lock.

## Install

```sh
pi install npm:@rol1n/pi-kit
```

Included and loaded by default in `@rol1n/pi-kit`. See [resource selection](../README.md#resource-selection) to disable this entry or load only selected extensions.

## Use

```json
{
  "question": "Which output format should I use?",
  "options": [
    { "label": "Markdown (Recommended)", "value": "markdown" },
    { "label": "JSON", "value": "json" }
  ],
  "multiSelect": false
}
```

Omit `options` or pass `[]` for free-text input. Set `multiSelect: true` only when multiple choices are expected. `details` adds supporting context, and an `Other` option is provided automatically for choice questions.
