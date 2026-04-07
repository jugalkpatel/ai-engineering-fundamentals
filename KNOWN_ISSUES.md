# Known issues

Things that are broken or noisy that we have not fixed yet, with enough context that you can decide whether to investigate them.

## `@cloudflare/ai-chat` 0.3.2 React errors

The chat panel logs three React errors during normal use, especially after the second or third message in a session. They are pre existing in `@cloudflare/ai-chat` 0.3.2 (the latest published version) and reproduce identically across every lesson 7 and lesson 8 commit. Lesson 8's work did not introduce them.

The errors:

1. **`Maximum update depth exceeded`** at `PartySocket.onAgentMessage` → `dispatchSetState`. The library's WebSocket message handler enters a setState loop on certain agent response shapes.
2. **`Encountered two children with the same key, <id>`** fired hundreds of times. Two `UIMessage` objects in the messages array share the same `msg.id`. The duplicate is appended by the chat library, not by `MessageList.tsx` (which keys correctly on `msg.id`).
3. **`TypeError: Cannot read properties of undefined (reading 'state')`** at `Chat.makeRequest` inside `@cloudflare_ai-chat_react.js`. Internal library state issue on `sendMessage`.

The errors are visible in the dev console but the chat panel still functions: messages send, tool calls fire, the canvas updates. Treat them as console noise until they actually break a workflow.

If you want to investigate:

- Try deduping messages by `msg.id` in a wrapper around `useAgentChat`'s returned `messages` array before passing to `MessageList`.
- File an upstream issue against `@cloudflare/ai-chat` with a minimal reproduction (the JWT diagram prompt followed by a second add prompt is a reliable trigger).
- Check `node_modules/@cloudflare/ai-chat_react.js` around the `dispatchSetState` call site to find what triggers the loop.

## `convertToExcalidrawElements` "No element for start binding" warnings

`@excalidraw/excalidraw`'s `convertToExcalidrawElements` only resolves arrow `start.id` / `end.id` against elements in its own input batch. When the agent splits a diagram across multiple `addElements` calls, the second call's arrows reference shapes from the first call and the helper logs `No element for start binding with id rect_X found.`

`src/context/cross-call-bindings.ts` patches the runtime arrows after the helper runs so the bindings end up correct on the canvas, but the helper still logs the warning during processing. The visual result is fine; the warning is dev console noise.

If the warnings ever get noisy enough to hide other errors, you can wrap the `convertToExcalidrawElements` call in a temporary `console.warn` filter, but that hides the warning for everyone forever and is not recommended.
