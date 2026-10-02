# ChatGPT Conversation Exporter

Save a ChatGPT conversation as JSON, download its files, or put both in one ZIP.

## Install

For Chrome or Microsoft Edge:

1. Extract `chatgpt-conversation-exporter.zip` into a folder you will keep.
2. Open `chrome://extensions` or `edge://extensions`.
3. Turn on **Developer mode**, select **Load unpacked**, and choose that folder.
4. Pin **ChatGPT Conversation Exporter** from the browser's Extensions menu.

If you have the source code, build it first with the commands below, then load
`dist/`. On a managed work laptop, IT may need to install the extension for you.

## Use

Open a saved conversation on **chatgpt.com**, then click the extension:

- **Download full conversation & files** saves every branch and the files in one ZIP.
- **Export current branch** saves the branch selected by ChatGPT as JSON.
- **Export all branches** saves the complete conversation tree as JSON.
- **Download conversation files** saves the available files in a ZIP.

Keep the ChatGPT tab open until the download starts. Keep the popup open to see
progress and errors. Large exports can take time. ZIP exports include
`export-report.json`, which lists successful downloads and failures. The full
export also includes `conversation.json`, even if the conversation has no files.

## How it works

The extension uses your signed-in ChatGPT session to read the conversation and
its file list. It builds the download in your browser. It does not send exports
to a separate server, store your session token, or use analytics.

The JSON contains readable user and assistant text plus the original conversation
nodes. The nodes preserve branch links, attachment references, and content that
is not plain text. All-branch exports retain the API's mapping; the readable
message list is not a chronological transcript of every branch. Files are saved
separately from those references.

Only `https://chatgpt.com` conversation pages are supported. Files can come from
signed storage URLs supplied by ChatGPT. Session tokens are sent only to
`chatgpt.com`. The extension requests `activeTab` and `scripting` so it can run
when you click it; it has no background worker or permanent host permissions.
See [Chrome's activeTab documentation](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)
for the browser permission model.

ChatGPT's internal API can change without notice. Shared links and temporary
chats are not supported. Unavailable or expired files can fail to download.
The file API is limited to 200 items per request; the extension stops if the list
may be incomplete. File archives are limited to 250 MB of downloaded data and
need additional browser memory to build the ZIP. Exported JSON can contain
conversation metadata and sensitive content, so share it with care.

## Develop

Use Node.js 22 or newer:

```sh
npm ci
npm run check
npm test
npm run build
```

Load `dist/` as an unpacked extension. After a change, rebuild, reload the
extension on the Extensions page, and reload the ChatGPT tab.

`npm run package` runs the checks and creates
`release/chatgpt-conversation-exporter.zip`. The archive contains the extension
and license files. It does not contain the source tree or development tools.

The TypeScript source is split by purpose: `popup.ts` handles the buttons,
`content.ts` runs exports in the tab, `api.ts` handles requests,
`conversation.ts` selects branches, and `files.ts` builds file archives.
All runtime code is bundled locally. Tests use synthetic conversations and files;
they do not need a ChatGPT account.

Before distributing a release, try all four actions in a signed-in browser with
a branched conversation and an attachment. Check the downloaded JSON and ZIP,
including the failure report. IT can review the manifest and source, then choose
an installation method that fits its browser management setup.

## License

MIT. See [LICENSE](LICENSE). Package author: Maryam Jahanshahi.

This is an independent project and is not affiliated with OpenAI.
