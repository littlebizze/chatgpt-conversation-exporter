# ChatGPT Fork Tool

Do you often:

1. Have a long chatgpt conversation in your browser, where finding old messages is difficult or 
requires scrolling forever?
2. Want to do a side-chat about something without losing the focus of the current conversation?
3. Find yourself using gigantic & never-ending conversations because a new conversation doesn't know what the gigantic one knows?

If so, then this chromium browser extension (works on Google Chrome, Microsoft Edge and most other browsers) is for you!

Load any chatgpt.com conversation, click the extension, and click "Create Thread". It will create a new thread of the current conversation 
in a new tab, giving it all the information from the current one so it doesn't miss anything.


## Install

[![Download extension ZIP](https://img.shields.io/badge/Download_extension-ZIP-0f766e?style=for-the-badge)](https://github.com/littlebizze/chatgpt-conversation-exporter/releases/latest/download/chatgpt-conversation-exporter.zip)

1. Click **Download extension ZIP** above.
2. Unzip the download into a folder you will keep, such as Documents. Do not select the ZIP itself in the steps below. Remember which folder you saved it in.
3. Type `chrome://extensions` into Chrome's address bar and press Enter.
4. Turn on **Developer mode** in the top-right corner.
5. Click **Load unpacked** and select the unzipped folder in the location you chose from step #2
6. Open Chrome's Extensions menu (the puzzle-piece icon) and pin **Maryam's ChatGPT Fork Tool**.

For Microsoft Edge, use `edge://extensions` instead. If your work laptop blocks
Developer mode, ask IT to install or approve the extension.

## Use

Open a saved conversation on **chatgpt.com** and click the extension.

**Branch conversation** creates a new conversation in a background tab. It
attaches a ZIP of all branches and available files, then asks ChatGPT to read
the current branch, summarize where you left off, and wait for your next instruction.
This lets you start a related discussion while keeping the original conversation.
The new chat uses ChatGPT's current default model and settings.

New chats are named `⎇ 1 - Conversation title`, then `⎇ 2`, and so on.
ChatGPT conversation renaming is very buggy and hit or miss, so sometimes this might not work.

**Download ZIP** saves the same bundle instead. The filename has the date, time and conversation title, for example:
`20261002-09-05 Project planning.zip`. Invalid filename characters are removed.
Hours use `00–23`; hyphens replace colons for Windows.

**Cancel** stops extension actions and returns to the controls. It does not
delete chats or uploaded files, stop a ChatGPT response already in progress,
or remove a ZIP download that has already started. Check any new tab yourself.
You can close and reopen the popup to check progress. The bar counts completed
steps, not elapsed time or bytes. ChatGPT can keep reading the ZIP after the
extension finishes.

## What is in the ZIP?

- `conversation.json`: readable messages and the original conversation nodes,
  including all branches and the `current_node` that identifies the current branch.
- `conversation.schema.json`: the JSON Schema for that export format.
- The conversation's available files, with safe, unique filenames.
- `export-report.json`: a list of saved files and any download errors.

The readable message list is not a single chronological transcript of every
branch. To follow a branch, start at `conversation.current_node` and follow
its `parent` links. Attachment references remain in the original nodes; file
bytes are separate entries in the ZIP.

## How it works

The extension reads ChatGPT's internal API with your signed-in session and
builds the ZIP in browser memory. Branching uploads it through ChatGPT's normal
message box and sends this prompt:

> Attached is an export of another conversation, including its branches and files. Continue from the branch identified as current. Read that branch and inspect the relevant files. Summarize the goal, decisions, unresolved questions, and next step. Tell me if anything could not be read, then wait for my next instruction.

The extension confirms that ChatGPT saved the attachment and prompt, then sets
and checks the numbered branch title. It leaves your original tab selected.
Before renaming, the extension waits for ChatGPT's `title_generation` event in
the existing response stream (up to two minutes). It then sets the branch name
and verifies the saved title through the API. ChatGPT's sidebar can still show
the old title until it refreshes. No extra requests are sent while waiting for
the title event.

There is no separate server, analytics, or saved session token. Branching sends
the archive to ChatGPT as an attachment; Download ZIP saves it locally.
Archive bytes and session tokens stay in tab memory during the job.
The background worker stores temporary tab IDs and up to three completion
notices, including chat titles and links, for this browser session.

The extension has access only to `https://chatgpt.com/*`. It uses `scripting`
to operate the message box, `activeTab` to read the selected page, and `storage`
for temporary tab ownership. File downloads can use signed storage URLs supplied
by ChatGPT. Session tokens are sent only to `chatgpt.com`.

ChatGPT's internal API and page controls can change. Shared links and temporary
chats are not supported. Files may have expired or be unavailable. The extension
stops if a file list may exceed the API's 200-item limit. Downloaded file data
is limited to 250 MB, and ZIP creation and transfer need extra browser memory.
ChatGPT's own upload limits and ability to read files also apply. Read its summary
to check what it could ingest before continuing.

## Develop

Use Node.js 22 or newer:

```sh
npm ci
npm run check
npm test
npm run build
```

Load `dist/` as an unpacked extension. `npm run build` also refreshes
`release/chatgpt-conversation-exporter-source/`, which can be loaded and
reloaded the same way. After a change, rebuild, reload the extension on the
Extensions page, and reload the ChatGPT tab.

`npm run package` runs the checks and creates
`release/chatgpt-conversation-exporter.zip`, ready to extract and load.

The TypeScript source is split by purpose: `popup.ts` handles the controls,
`content.ts` builds bundles and manages jobs, `target.ts` operates the new chat,
`background.ts` manages tabs, and `branch-title.ts` chooses the next number.
`conversation.ts`, `schema.ts`, and `files.ts` define and build the archive.
All runtime code is bundled locally. Tests use synthetic data and need no account.

Before sharing a release, try both actions with a branched conversation and
an attachment. Check the ZIP, the branch selected in ChatGPT's summary, the
new title, and that the original tab remains selected.

## License

MIT. See [LICENSE](LICENSE). Package author: Maryam Jahanshahi.

This is an independent project and is not affiliated with OpenAI.
