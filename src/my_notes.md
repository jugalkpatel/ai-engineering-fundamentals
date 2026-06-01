### Why Giving a description to the tool required?

- The tool description is what LLM reads when deciding whether to use a particular tool.
- **Description should mention what tool does and suggest when it should be used(e.g "User this when user asked to you to create, draw or design a new diagram").**
- The description helps guide LLM's decision making process.

### What is the correct way to make fields optional when working with OpenAI's API in Zod schemas?

- To make fields optional with OpenAI, you need to use `.nullable()` on the field.
- While Zod has an .optional() method, OpenAI generally ignores this. Using `.nullable()` ensures that OpenAI will set the field to null if it doesn't want to provide a value.

### What is the purpose of the .describe() method in Zod schemas when building tools for LLMs?

- The `.describe()` method provides hints to the LLM about what a particular field or schema represents.
- For example, you might describe an array as "array of Excalidraw elements" or describe points as "an array of X, Y points." These descriptions help the LLM better understand the expected structure and content of each field.

### Why `execute` function in `tools.ts` just return result without doing anything with it?

```
  const tool = tool({
    description: 'Some description....'
    inputSchema: z.object({ some_input_schema: ...})
    execute: async ({ result }) {
      return result;
    }
  })
```

- By making execute function simply return result in example above, we're making sure that the result from LLM returns structured output that follows input schema. giving input schema is required in this case.
- Also if we're using OpenAI, it's guarantee than LLM will follow input schema if we provide it

### How does a chat agent store a conversation, and what are messages?

- A chat agent represents a conversation as an **ordered list of messages**.
- The two main kinds of messages are:
  1. Messages the agent responds with (the **assistant** role).
  2. Messages you give it (the **user** role).
- Messages can also carry other content, such as **tool calls** and **images**, and there are additional roles like `system` and `tool`.
- In practice the list is treated as **append-only**: each new turn is added to the end rather than editing earlier messages (though trimming the history is possible if it grows too long).

### What is the system prompt and where does it go?

- The **system prompt** is an optional message that comes first, at the very beginning of the conversation history.
- It's where you put context that stays **relevant for the entire conversation** (e.g. the agent's role, rules, and behavior).
- Note: in most APIs the system prompt uses a dedicated `system` role rather than being an ordinary user/assistant message, but conceptually it sits at the top of the message list.

### Does the agent only look at the latest message, or the whole conversation each turn?

- The agent doesn't just read the newest message — on **every turn it re-reads the entire message list from the start**.
- Nothing is "remembered" in a cheap way: each new message triggers a full re-evaluation of the whole history all over again.
- Consequences of this (why context size matters):
  1. **Slower** — the more context (messages) you have, the more the LLM has to process every time, so responses slow down.
  2. **More hallucinations** — a larger pile of context gives the model more room to get confused or drift.
  3. **More memory** — the growing history takes up more memory.
- This is the practical reason you eventually want to **trim/summarize** an append-only history once it grows too long (ties back to messages being [append-only](#how-does-a-chat-agent-store-a-conversation-and-what-are-messages)).

### What is the attention algorithm in LLMs and why does it impact performance?

- The **attention algorithm** is what unlocked LLMs — its job is to consider all the vectors (characters before and after) in the entire set of input.
- As conversations grow, the algorithm has to consider more data, which increases **processing time** and **memory usage**.
- This is why GPUs with more memory perform better for LLMs, and why longer conversations can lead to **more hallucinations** due to increased variance.
