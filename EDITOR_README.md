# CYOA Editor

A visual editor for creating choose-your-own-adventure stories. No installation required.

## Quick Start

1. Open `editor.html` in any modern browser
2. Write your story in the center panel
3. Add choices and branch your narrative
4. Upload images/videos in the assets panel
5. Click "Export ZIP" to download your story

## Interface

```
┌─────────────────────────────────────────────────────────────┐
│  Story name   [Drafts ▼]  [Save] [New] [Delete] [Export]   │
├──────────┬────────────────────────────────┬─────────────────┤
│  PAGES   │         EDITOR                 │     ASSETS      │
│          │                                │                 │
│ 1.txt    │  Story text...                 │  + Add Asset    │
│ 2a.txt   │                                │                 │
│ 2b.txt   │  ☑ Has choices                 │  {cave.png}     │
│ 3aa.txt  │  ☐ Is ending                   │  {monster.jpg}  │
│ 3ab.txt  │                                │                 │
│          │  a) [choice text]              │                 │
│ + Add    │  b) [choice text]              │                 │
└──────────┴────────────────────────────────┴─────────────────┘
```

## Pages Panel (Left)

Lists all pages in your story.

- Click a page to edit it
- **+ Add** creates a new page
- Page types shown:
  - **A/B** = has choices
  - **AUTO** = no choices (shows Continue button)
  - **END** = marked as ending

## Editor Panel (Center)

Write your story content here.

### Options

- **Has choices** - Check to add a/b choices. Automatically creates child pages.
- **Is ending** - Check to mark as a story ending

### Adding Assets

Type `{filename}` to embed an image or video:
```
You enter the cave.

{cave.png}

It's dark inside.
```

## Assets Panel (Right)

Manage images and videos for your story.

- **+ Add Asset** - Upload files (.png, .jpg, .gif, .mp4, .webm, etc.)
- **Click** an asset name to insert it at your cursor
- **Drag** an asset to the text area to insert it
- **×** button deletes an asset

## Header Controls

| Button | Function |
|--------|----------|
| Story name | Name for your story (used in export) |
| Drafts dropdown | Select a previously saved draft |
| Save | Save current work to browser storage |
| New | Start a fresh story |
| Delete | Delete the current draft from storage |
| Export ZIP | Download story as a folder ready to play |

## Drafts

Your work saves to browser localStorage:

- **Save** - Saves under the current story name
- **Multiple drafts** - Each name is a separate draft
- **Persistent** - Survives browser restarts
- **Draft dropdown** - Switch between saved drafts

## Export

Click "Export ZIP" to download your story:

```
my-story.zip
└── my-story/
    ├── 1.txt
    ├── 2a.txt
    ├── 2b.txt
    └── assets/
        ├── cave.png
        └── monster.jpg
```

Extract alongside `engine.html` to play.

## Page Naming Convention

The editor uses a branching path system:

- **1.txt** - Starting page
- **2a.txt** - Page after choosing 'a' on page 1
- **2b.txt** - Page after choosing 'b' on page 1
- **3aa.txt** - Page after choosing 'a' on 2a
- **3ab.txt** - Page after choosing 'b' on 2a

And so on. The number increments, letters accumulate.

## Tips

- Start with an outline of your story branches
- Use "Is ending" to mark conclusion pages
- Preview your story by exporting and opening in the engine
- Save drafts frequently
- Descriptive story names help organize multiple projects
