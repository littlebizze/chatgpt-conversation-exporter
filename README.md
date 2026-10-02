# Maryam's ChatGPT Fork Tool

## Install

For Google Chrome 120 or newer, or Microsoft Edge 120 or newer:

1. Extract `chatgpt-conversation-exporter.zip` into a folder you will keep.
2. Open `chrome://extensions` or `edge://extensions`.
3. Turn on **Developer mode**, select **Load unpacked**, and choose that folder.
4. Pin **Maryam's ChatGPT Fork Tool** from the Extensions menu.

If you have the source code, build it with the commands below and load `dist/`.
On a managed work laptop, ask IT to use its approved installation method.

## Use

Open a saved conversation on **chatgpt.com** and click the extension.

**Branch conversation** creates a new conversation in a background tab. It
attaches a ZIP of all branches and available files, then asks ChatGPT to read
the current branch, summarize where you left off, and wait for your next instruction.
This lets you start a related discussion while keeping the original conversation.
The new chat uses ChatGPT's current default model and settings.

New chats are named `⎇ 1 - Conversation title`, then `⎇ 2`, and so on.
The extension checks existing and archived chats for the highest number with
that exact base title. Branching an existing branch uses the same base title.
Two browsers can still choose the same number if they branch at the same time.
Chats that move in the history list during the search can also affect numbering.
Chats moved into Projects may not be counted by ChatGPT's conversation list API.

**Download ZIP** saves the same bundle instead. The filename uses your local
clock and the conversation title, for example:
`20261002-09-05 Project planning.zip`. Invalid filename characters are removed.
Hours use `00–23`; hyphens replace colons for Windows.

Keep both ChatGPT tabs open until branching finishes. The extension finishes
once ChatGPT has saved the prompt and ZIP, started work, and accepted the new
chat title. It does not wait for the full response. Do not reload them or
change the new chat while it runs. The progress view stays on the running job
if you switch tabs. Otherwise, the popup follows the active tab.

**Cancel** stops extension actions and returns to the controls. It does not
delete chats or uploaded files, stop a ChatGPT response already in progress,
or remove a ZIP download that has already started. Check any new tab yourself.
You can close and reopen the popup to check progress. The bar counts completed
steps, not elapsed time or bytes. ChatGPT can keep reading the ZIP after the
extension finishes.

Completion notices appear below the controls, newest first, with up to three
kept until you dismiss them or restart the browser. Click a branch title to
select its open tab, or open it again if that tab is closed.

If a file cannot be retrieved, branching stops. Use **Download ZIP** to save
what is available and check the failure report. If a new tab already exists
after an error, check it before trying again to avoid creating a duplicate.

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
The new tab watches locally for the first response to finish, for up to
30 minutes. It then checks the title twice, one minute apart, and restores
the branch title if ChatGPT changed it. Keep that tab open during this step.
These checks stop on a rate-limit response.

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
