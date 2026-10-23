# prompt-snipaste

Select prompt snippets to prepend or append to the next user message, with live preview and a session transcript card. Bundles 7 built-in prompt snippets under `prompts/`.

## Install

```sh
pi install npm:@rol1n/prompt-snipaste
```

Also included in `@rol1n/pi-kit`.

## Use

Open with `/snipaste` or `Alt+S`. Navigate with arrow keys, toggle with `Space`, preview with `Tab`, confirm with `Enter`, and cancel with `Escape`.

## Frontmatter

```markdown
---
name: Review checklist
description: Add review criteria to the next message
placement: append
order: 100
---
Check correctness, error handling, and missing validation.
```
