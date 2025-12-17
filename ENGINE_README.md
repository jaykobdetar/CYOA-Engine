# CYOA Engine

A minimal choose-your-own-adventure story player. No server required.

## Quick Start

1. Open `engine.html` in Chrome or Edge
2. Click "📁 Open Folder" and select your story folder
3. Read and make choices

## Story Folder Structure

```
my-story/
├── 1.txt
├── 2a.txt
├── 2b.txt
├── 3aa.txt
├── 3ab.txt
├── 3ba.txt
├── 3bb.txt
└── assets/
    ├── cave.png
    ├── monster.jpg
    └── intro.mp4
```

## Page Naming

- **Number** = page/step in the story (1, 2, 3...)
- **Letters** = accumulated choices (a, ab, aba...)

Example playthrough:
```
1.txt    → pick 'b'
2b.txt   → pick 'a'
3ba.txt  → pick 'b'
4bab.txt → no choices → THE END
```

## Page Format

Write your text, then add choices at the bottom:

```
You enter a dark cave. Water drips from the ceiling.
A passage leads left, another leads right.

a) Take the left passage
b) Take the right passage
```

- Pages with `a)` and `b)` lines show choice buttons
- Pages without choices show a "Continue" button
- If the next page file doesn't exist, the story ends

## Images & Videos

Place assets in an `assets/` subfolder. Reference them with `{filename}`:

```
You see a strange creature.

{monster.jpg}

It doesn't look friendly.

a) Run
b) Fight
```

### Supported Formats

- **Images:** .png, .jpg, .jpeg, .gif, .webp, .svg
- **Videos:** .mp4, .webm, .mov

### Size Modifiers

```
{image}          → full size
{image:small}    → max 200px tall
{image:medium}   → max 400px tall
```

## Controls

| Control | Function |
|---------|----------|
| Open Folder | Select a story folder to play |
| Jump to | Enter a page code (e.g., `3ab`) to skip ahead |
| Go | Jump to the entered page |
| ↻ Refresh | Reload current page from disk |
| Start Over | Restart from page 1 |

## Save System

- Progress auto-saves to browser localStorage
- Resuming a story prompts to continue where you left off
- Save code (e.g., `4ab`) shown in footer - write it down for manual saves
- Progress clears when you reach an ending

## Browser Support

Requires **Chrome**, **Edge**, or another Chromium-based browser (uses File System Access API).

Firefox and Safari are not supported.

## Security

Story content is sanitized before rendering to prevent XSS attacks. However, you should still **only open story folders from sources you trust**. 

If hosting publicly, be aware that user-submitted stories could potentially contain malicious content despite sanitization.
