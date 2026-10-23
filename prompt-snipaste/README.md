# prompt-snipaste

A generic composer for Pi prompt templates: select snippets to prepend or append to the next user message, with live preview and a session transcript card. It ships no private template library and requires no particular prompt names.

## Install

```sh
pi install npm:@rol1n/pi-kit
```

Included and loaded by default in `@rol1n/pi-kit`. See [resource selection](../README.md#resource-selection) to disable this entry or load only selected extensions.

## Use

Open with `/snipaste` or `Alt+S`. Navigate with arrow keys, toggle with `Space`, preview with `Tab`, confirm with `Enter`, and cancel with `Escape`. A confirmed selection applies once, to the next user message.

## Prompt sources and filtering

Pi owns discovery and filtering. The selector reads only prompt commands exposed by `pi.getCommands()`, including templates from personal configuration, trusted projects, and other packages. It does not scan package directories, read settings itself, or fall back to disabled templates.

- Ordinary Markdown and standard Pi templates work without any snippet-specific metadata.
- Add or change prompts through Pi's normal prompt directories or settings, then run `/reload`.
- Package `prompts` filters are respected. With no enabled templates, the menu displays a notice and injects nothing.
- Same-named files from different sources have independent identities based on their full source paths.
- The kit's root [`prompts/`](../prompts/) directory is a separate resource. Disabling it does not disable the selector; disabling the selector does not disable native template commands.

The selector composes template bodies as text; it does **not** invoke slash commands or expand positional argument placeholders such as `$1`. Use Pi's normal `/template args` invocation when argument expansion is needed.

## Optional frontmatter

```markdown
---
name: Review checklist
description: Add review criteria to the next message
placement: append
order: 100
---
Check correctness, error handling, and missing validation.
```

All fields are optional. `name` overrides the menu label, `description` describes the template, `placement` defaults to `append`, and `order` defaults to `100`. Prepend snippets come first, followed by append snippets; each group is sorted by numeric order and name.
