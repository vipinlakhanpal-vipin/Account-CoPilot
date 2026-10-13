# Aria — a copy-in assistant for any Next.js app

A chat window with a robot icon, tables, voice input, read-aloud, tap-able clarifying questions, and file buttons.
It has **no dependency on the app that hosts it**: you give it tools and it does the rest.

## What is in this folder
| File | Side | Purpose |
|---|---|---|
| `AriaChat.tsx` | browser | The icon button and the chat window |
| `aria.css` | browser | Its styles (colours default to the host app's `--bg`, `--surface`, `--text` … tokens) |
| `agent.ts` | server | The reasoning loop: Claude + your tools, plus the built-in `ask_user` question tool |
| `types.ts` | both | Shared types |

## Use it in another app (about 10 minutes)
1. Copy this whole folder to `packages/aria` in the other app. Make sure `@anthropic-ai/sdk` and `react-dom` are installed and `ANTHROPIC_API_KEY` is set.
2. Import the styles once, in the root layout: `import "@/packages/aria/aria.css";`
3. Add the server route, for example `app/api/aria/route.ts`:

```ts
import { runAgent } from "@/packages/aria/agent";
import type { ToolDef } from "@/packages/aria/types";

const TOOLS: ToolDef[] = [
  { name: "search_orders", description: "Find orders by customer or status.",
    input_schema: { type: "object", properties: { customer: { type: "string" }, status: { type: "string" } } } },
];

export async function POST(req: Request) {
  // 1. check the user is signed in (and whatever limits you apply)
  const { messages } = await req.json();
  const out = await runAgent({
    history: messages,
    system: "You are Aria, the assistant for <your app>. Answer only from the tools. Show lists as markdown tables.",
    tools: TOOLS,
    run: async (name, input) => {
      if (name === "search_orders") return { result: await findOrders(input) };
      // return { result, action: { kind: "xlsx", label: "Download Excel", body: {...} } } to give the user a file button
      return { result: { error: "Unknown tool" } };
    },
  });
  return Response.json({ text: out.text, actions: out.actions, choices: out.choices });
}
```

4. Put the chat where you want it, for example next to your other header icons:

```tsx
import AriaChat from "@/packages/aria/AriaChat";

<AriaChat
  endpoint="/api/aria"
  examples={[["Orders", "How many orders are open?"]]}
  onAction={async (a) => { /* what a file button does, e.g. POST a.body to your export route */ }}
  send={(url, init) => fetch(url, init)}     // swap for a function that adds auth or asks for a PIN
  footerNote={<small>Each question uses the AI API.</small>}
/>
```

## Notes
- **Asking before building a file:** put the rule in your `system` text ("always call ask_user to confirm the region and size before creating an Excel"). The window shows the options as buttons.
- **Voice** uses the browser's built-in speech recognition (Chrome, Edge, Safari). No extra service.
- **Money:** every question calls the Anthropic API; add your own guard (PIN, rate limit) in the route.
- **Keeping apps in sync:** this folder is meant to be copied. If you improve it in one app, copy it back to the others.
