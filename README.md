# Claude Comments

Leave pinned comments on any local `*.test` site at any screen size. Each comment becomes a task that Claude Code can work through with `/action-comments`.

## Parts

- `extension/` is a Chrome extension. It adds a comment toolbar to every `*.test` page, plus a responsive viewer that shows the site at device widths.
- `server.js` is a local API and dashboard at http://localhost:4848. It has no dependencies.
- `cli.js` is what Claude uses to list and resolve comments. It works without the server running.
- `skill/action-comments/SKILL.md` is the `/action-comments` skill for Claude Code. Copy it to `~/.claude/skills/action-comments/SKILL.md` to install it.
- `data/` holds `comments.json` and the screenshots.

## Setup

1. Start the server, either once (`node server.js`) or permanently with `./install-service.sh`, which uses launchd.
2. Load the extension: open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick the `extension/` folder.
3. Visit any `.test` site and look for the toolbar in the bottom-right corner.

## Commenting

- Click **Comment** (or press ⌥C, or click the extension icon) to turn on comment mode. Hover to highlight an element, then click it, type your note and press ⌘↵.
- Each comment saves:
  - the page URL
  - the viewport width and height, with its breakpoint
  - the element's selector, classes, ancestors, text and HTML
  - a screenshot with the pin on it
- **Screen sizes:** click **Responsive** to open the page in the viewer. It has presets for Mobile 375, Mobile L 430, Tablet 768, Laptop 1280, Desktop 1440 and Wide 1920. You can also type a custom width, or swap width and height to rotate. You can comment inside the viewer, and the comment records the frame's real width. Resizing a normal browser window works too.
- **Storage:** the dashboard's Resolved tab shows how much space screenshots take up. **Clear** deletes the screenshots of resolved comments and keeps the comments and their notes.
- Pins left at a different device size (mobile, tablet or desktop) show faded. Click a pin to see its details, Claude's resolution note, and the resolve, reopen and delete buttons.

## Actioning

Click **Action** in the page toolbar, or **Action N comments** in the dashboard with a site selected. The server starts a headless Claude Code session (`claude -p "/action-comments <site>"`) in the site's project folder, found through Herd/Valet links and parked folders. The dashboard shows what Claude is doing as it works, with a **Stop** button and the final summary. Pins on the page turn blue while Claude works on them and green once they're resolved.

Pick the model for these runs with the **Default / Opus / Sonnet / Haiku** pills next to the Action button. Default uses your Claude Code default model. Sonnet uses far less of your plan and handles most fixes. The header also shows your plan usage, for the five-hour session and the week. Claude Code reports these numbers during runs. The dashboard also fetches them when it opens (at most every 15 minutes) and when you click ↻, by sending a tiny Haiku request. They cover your whole account, including interactive sessions.

By default the headless session can read and edit files and run a limited set of commands (`node`, `npm run`, `npx`, `wp`, read-only `git`, `curl` and file-viewing commands). To change that, create `data/config.json`, for example:

```json
{ "permissionMode": "bypassPermissions", "allowedTools": [] }
```

The API only accepts requests from the dashboard and the extension, so other web pages can't start a run.

You can also run it yourself in Claude Code from the project directory:

```
/action-comments
```

While Claude works, the dashboard's **Open** view updates live. It groups comments into what Claude is working on now, what needs your input and what's queued, with a progress bar for the day. When Claude marks a comment **Needs info**, type your answer on the card (or in the pin's popover on the page) and click **Send to Claude**. The comment goes back in the queue with your reply attached, ready for the next run.

The site is matched from the directory name, so `~/Developer/foo` maps to `foo.test`. You can also pass a site or specific ids: `/action-comments foo.test 3fa9c1d2`.
