# ChatGPT Conversation Exporter

Do you have a long ChatGPT conversation in your browser, where finding old messages is difficult or
requires scrolling forever?

Do you often want to take the current conversation, and start a new one to discuss something tangentially
related, without losing the focus of the current conversation?

This app is a Chromium browser extension (works on Google Chrome, Microsoft Edge and most other browsers) which
allows you to export every conversation branch and its files in one ZIP.

## Install

For Chrome or Microsoft Edge:

1. Extract `chatgpt-conversation-exporter.zip` into a folder you will keep.
2. Open `chrome://extensions` or `edge://extensions`.
3. Turn on **Developer mode**, select **Load unpacked**, and choose that folder.
4. Pin **ChatGPT Conversation Exporter** from the browser's Extensions menu.

If you have the source code, build it first with the commands below, then load
`dist/`. On a managed work laptop, IT may need to install the extension for you.

## Use

Open a saved conversation on **chatgpt.com**, click the extension, then click
**Export**. It saves all branches and available files in one ZIP.

The filename uses your local date and time plus the conversation title:
`20261002-09-05 Project planning.zip`. Characters that are invalid in filenames
are removed from the title. Long titles are shortened. Hours use `00–23`, and
hyphens replace colons so the filename works on Windows too.

Keep the ChatGPT tab open until the download starts. Keep the popup open to see
progress and errors. The progress bar counts the conversation, the file list,
each file, and the ZIP. Large exports can take time. You can close and reopen
the popup to check progress; keep the ChatGPT tab open. ZIP exports include
`export-report.json`, which lists successful downloads and failures. The ZIP also includes `conversation.json`, even if the conversation has no files.

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

The TypeScript source is split by purpose: `popup.ts` handles the button,
`content.ts` runs exports in the tab, `api.ts` handles requests,
`conversation.ts` formats the conversation, and `files.ts` builds file archives.
All runtime code is bundled locally. Tests use synthetic conversations and files;
they do not need a ChatGPT account.

Before distributing a release, try Export in a signed-in browser with
a branched conversation and an attachment. Open the ZIP and check `conversation.json`, the downloaded files, and
`export-report.json`. IT can review the manifest and source, then choose
an installation method that fits its browser management setup.

## License

MIT. See [LICENSE](LICENSE). Package author: Maryam Jahanshahi.

This is an independent project and is not affiliated with OpenAI.
