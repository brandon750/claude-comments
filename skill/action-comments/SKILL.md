---
name: action-comments
description: Work through the visual review comments left on a local .test site with the Claude Comments Chrome extension. Reads each open comment (text, screenshot, viewport width, target element), makes the fix in the code, and marks it resolved. Use when the user asks to action, resolve, fix or go through their site comments or review feedback.
argument-hint: "[site.test] [comment ids...]"
---

# Action site comments

Comments are stored by the Claude Comments tool in `~/Developer/claude-comments`. Use its CLI. It reads and writes the data file directly, so the server does not need to be running.

```bash
node ~/Developer/claude-comments/cli.js list                        # open + in-progress comments for the site matching the current directory
node ~/Developer/claude-comments/cli.js list --site foo.test        # explicit site
node ~/Developer/claude-comments/cli.js show <id>                   # full details, including the element's full HTML
node ~/Developer/claude-comments/cli.js start <id>                  # mark as being worked on (shows live in the dashboard)
node ~/Developer/claude-comments/cli.js resolve <id> --note "..."   # mark done, with a short note on what changed
node ~/Developer/claude-comments/cli.js needs-info <id> --note "..." # can't action it without input; note says what's needed
node ~/Developer/claude-comments/cli.js sites                       # all sites with counts
```

## Steps

1. **Load the comments.** Run `node ~/Developer/claude-comments/cli.js list`, adding `--site` if the user named a site in `$ARGUMENTS`. It matches the current directory to a site via Herd/Valet links (e.g. `cbh` → this folder) or the parked folder name. If it can't match, the CLI prints the known sites. Pick the one that matches the project, or ask the user. If the user listed specific comment ids, only work on those.

2. **Track them.** Make one task or todo per comment (`#number: short summary`) so progress is visible.

3. **For each comment, one at a time:**
   - **Mark it started** with `node ~/Developer/claude-comments/cli.js start <id>` before doing anything else, so the user can see in the dashboard which comment you're on. Only one comment should be in progress at a time.
   - **Read the conversation.** If the comment has a `Conversation` section, you asked about it before and the reviewer answered in the dashboard. Their latest reply is the answer, so act on it rather than asking again.
   - **Only read the screenshot if you need it.** Screenshots use a lot of tokens, so start from the comment text and the element details (selector, classes, ancestors, text, HTML). Read the screenshot with the Read tool only when those aren't enough: the comment refers to something visual you can't work out from the markup ("this looks off", "too much space here", "doesn't line up"), you can't find the element, or you're not sure you've found the right one. The pin (a pink speech bubble with a chrome rim) marks where the user clicked. The screenshot shows the viewport at the width the comment was left at.
   - **Check the viewport.** `Viewport` gives the width and the Tailwind breakpoint it falls in (`base` <640, `sm` ≥640, `md` ≥768, `lg` ≥1024, `xl` ≥1280, `2xl` ≥1536). A comment left at 375px is about mobile. Scope the fix to that breakpoint, using responsive prefixes or media queries, so other sizes don't change, unless the comment clearly applies everywhere.
   - **Find the source.** Search the codebase using the element's classes, its ancestors (section and block wrapper classes usually name the template or block), its text content, and the body classes (page template, page id). Text content may come from the CMS, not code. If the change is content rather than code, use `needs-info` and say so.
   - **Make the change.** Follow the project's existing conventions and CLAUDE.md.
   - **Resolve it** with `node ~/Developer/claude-comments/cli.js resolve <id> --note "<one or two sentences: what changed and in which file>"`. The note appears in the browser when the user clicks the pin.
   - If the comment is ambiguous, or you can't find the source, use `needs-info` with a specific question. Don't guess. The reviewer answers it in the dashboard, and the comment comes back to the queue with their reply.

4. **Verify** if you can, for example with a build step or by checking the page at that width. Don't mark a comment resolved if you're not confident the change addresses it.

5. **Summarise** for the user: a short list of each comment number, what was done, and any comments left as needs-info. Remind them to reload the page (or the responsive viewer) to check the fixes. Resolved pins are hidden unless they toggle "Resolved".
