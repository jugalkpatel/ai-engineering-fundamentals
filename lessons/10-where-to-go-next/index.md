# Where to Go Next

This is the last lesson and there is no new code in it. The agent we have at the end of lesson 9 is the agent. From here the work is choosing which direction to take it, and most of those directions are bigger than a workshop slot. This lesson is a tour of the ones I would actually invest in, what they buy you, and what they cost.

The shape of every section below is the same. Here is a thing the current agent doesn't do. Here is what it would take to add. Here is what to read next.

## Human in the loop and durable execution

The agent currently calls `searchWeb` whenever it feels like it. There is no review step. For a research tool that is fine. For a tool that costs money, sends an email, deploys a service, or writes to a production database, that is not fine. The pattern you want is **the model proposes, a human approves, then the tool runs**.

The simple version is what you'd sketch in the chat UI: define `searchWeb` without an execute on the worker, intercept the tool call in the browser, render an approval card, and only resolve the tool result after the user clicks Approve. The agent loop blocks in the meantime.

The hard part is what "blocks in the meantime" actually means in production. The current tool loop runs inside one HTTP request to the worker. If the user takes a coffee break before clicking Approve, the worker request times out, the agent loses its place, and the in flight state evaporates. A workshop demo can get away with this. A real product cannot.

The fix is a **durable execution layer**. Something that lets you pause a workflow at an arbitrary point, persist the state, wait minutes or hours or days for an external signal, and resume exactly where you left off. The tool loop becomes a sequence of steps the runtime can replay. Approval is just a step that waits.

On Cloudflare the answer is **Workflows**. Each step is a separate function the runtime can retry, each suspension point is durable, and `step.waitForEvent` is exactly the human in the loop primitive. You'd refactor `streamAgent` into a Workflow where each tool call is a step, and tools that need approval call `waitForEvent("approval-<id>")` before executing. The browser POSTs to a route that fires the event. We didn't build it in this course because Workflows is its own topic and the scope blows up fast.

Other options worth knowing about:
- **Temporal** ([temporal.io](https://temporal.io)): the most mature durable execution system. Heavier infra footprint than Workflows but the same primitives, and a bigger ecosystem.
- **Inngest** ([inngest.com](https://inngest.com)): durable functions with a more developer focused API and a hosted control plane. Easier to get running than Temporal.
- **Trigger.dev** ([trigger.dev](https://trigger.dev)): similar shape, oriented toward background jobs and async workflows.

Reading:
- [Cloudflare Workflows docs](https://developers.cloudflare.com/workflows/)
- [12 Factor Agents, factor 6: Launch/Pause/Resume with simple APIs](https://github.com/humanlayer/12-factor-agents/blob/main/content/factor-06-launch-pause-resume.md)
- [HumanLayer](https://humanlayer.dev) — a hosted approval layer purpose built for HITL on agent tool calls

## Beyond the basic tool loop

Everything in this course is one architecture: a single model in a `while` loop that picks a tool, runs it, and reads the result. That is the right starting point and it is what most agents in production actually look like. But the loop has limits, and once you start hitting them the next step is usually to break the loop into pieces.

A few patterns worth knowing.

**Planning then acting.** Before executing anything, ask the model to write a short plan. Then run the plan. The plan becomes a contract you can inspect, edit, or reject before any tool fires. Cheap to add, often dramatic on complex tasks. The downside is latency: every request now pays for two model calls instead of one. Variants worth reading: Anthropic's "extended thinking" pattern, the [ReAct paper](https://react-lm.github.io), and the [Plan-and-Execute](https://blog.langchain.com/planning-agents/) writeups.

**Observer then react.** Run two models in parallel. One does the work. The other watches the trace and intervenes when the first one goes off the rails. Useful when you need a safety check that is expensive to encode as a hard rule, and when the cost of a wrong action is high. Closely related to "judge in the loop" patterns from the eval world.

**Handoffs and swarms.** Instead of one agent with twelve tools, use several specialized agents that hand control to each other. A router agent decides who handles the request, the specialist runs to completion, control returns. The handoff itself is a tool call. OpenAI's [Swarm](https://github.com/openai/swarm) is the canonical reference implementation. Anthropic's [multi-agent research system](https://www.anthropic.com/engineering/built-multi-agent-research-system) is a well documented production version. The win is scope: each subagent has a smaller surface area and a tighter eval. The cost is coordination complexity and tokens, since every handoff replays context.

**Workflows for known repeated paths.** Some user requests follow a fixed sequence every time. "Generate a sequence diagram for OAuth" always means: search knowledge, then plan layout, then add elements, then verify overlaps. When you know the path, don't make the model rediscover it on every call. Encode it as a workflow (literal Cloudflare Workflow, or just a hard coded sequence) and let the model fill in the parameters. Faster, cheaper, more reliable, easier to eval. The reasoning model only gets invoked for the cases that don't match a known path. This is the single biggest production lever for cost and latency once you have traffic.

Reading:
- [Anthropic: Building effective agents](https://www.anthropic.com/research/building-effective-agents) — the canonical writeup of these patterns.
- [12 Factor Agents](https://github.com/humanlayer/12-factor-agents) — an opinionated set of constraints for production agents.

## The data flywheel

Right now the eval dataset is hand written. Twenty-something cases that I sat down and typed because they felt representative. That is the right way to start. It is not the right way to keep going.

The flywheel is this. Every real user interaction is a potential eval case. Capture the input, capture the output, capture the user's reaction to the output, and you have a constant stream of new test cases that reflect how your product actually gets used.

Concretely:

1. **Log everything.** For every assistant turn, store the user input, the messages that went into the model, the tool calls, the final tool outputs, and the final visible result. Plus token counts and latency. This is just structured logging. Do it before you do anything else. You want this even if you never build the rest of the flywheel.

2. **Add a feedback affordance.** In our chat UI that would be a thumbs up / thumbs down on each assistant message. Maybe a free text "what was wrong" field on thumbs down. Write the feedback into the same log so it joins up with the request that produced it. The cost is one button. The value compounds.

3. **Promote interesting traces to the dataset.** Every thumbs down is a candidate eval case. Every thumbs up that involved an unusual prompt is a candidate too. A human reviews the queue and decides: add to golden, add to a regression set, or ignore. The result is an eval dataset that grows in the directions your users actually push, not the directions you guessed they would push.

4. **Run evals against the new dataset on every change.** Now your improvement loop from lesson 8 is no longer measuring whether the agent gets better at the cases you imagined. It is measuring whether it gets better at the cases your users sent you yesterday.

The thing that makes this work is that step 1 is cheap and unlocks every later step. The thing that makes it fail is treating it as a project to build later instead of a habit to start on day one. Start logging. Today.

Reading:
- [Hamel Husain on evaluating LLM applications](https://hamel.dev/blog/posts/evals/) — has a lot to say about the flywheel pattern in practice.
- [Eugene Yan on building eval driven systems](https://eugeneyan.com/writing/evals/)
- [Braintrust](https://www.braintrust.dev) docs on capturing production traces and turning them into eval data. The same tool you used for offline scoring in lesson 8 will accept logs from production.

## Online vs offline evals

We only ran offline evals in this course. A fixed dataset, a deterministic harness, a number that comes out the other side. You change the agent, you re-run the harness, you compare the numbers.

The other half is **online evals**: scoring real production traffic as it happens, after the user has already seen the result.

Use offline evals to:
- Validate a change before shipping it. The harness is your safety net. If `BoundLabels` drops 15 points on the change you're about to merge, you find out before users do.
- Compare candidates head to head. Two prompts, two models, two tool definitions. Run both against the same dataset, look at the deltas.
- Catch regressions. Run the harness in CI on every PR.

Use online evals to:
- Catch the things your dataset doesn't cover. Production traffic is messier than your golden set. The flywheel above is partly a way of moving online surprises into the offline harness.
- Measure things that only make sense on real users. Did the user re-prompt? Did they delete what the agent drew? Did they thumbs down? These are signals you cannot generate offline because they need a human reaction.
- Watch for drift. Models change. APIs change. Your system prompt slowly accumulates rules. Online scoring on production traffic catches the day the score quietly slides.

The two are not in competition. Offline is fast, deterministic, cheap, and runs before deploy. Online is slow, noisy, expensive, and runs after deploy. You want both, and the flywheel is the conveyor belt between them: online surprises become offline test cases.

A practical setup looks like this. Offline harness runs in CI on every PR with a 30 case golden set. Production logs every assistant turn with a thumbs reaction. A weekly job pulls thumbs downs into a triage queue. A human reviews and promotes the interesting ones into a "regression" dataset that joins golden in the offline harness. When the regression set stops finding new failures, your offline coverage has caught up with reality.

Reading:
- [Braintrust online evals](https://www.braintrust.dev/docs/guides/online-evals)
- [LangSmith: online vs offline evaluation](https://docs.smith.langchain.com/evaluation/concepts)
- [Eugene Yan: task specific eval](https://eugeneyan.com/writing/llm-evaluators/)

## What I would actually build first

If you only have time for one of these after the workshop, build the data flywheel. Even just step 1: structured logging on every assistant turn, plus a thumbs up / thumbs down. Everything else in this lesson gets easier when you have data. Architecture changes need a baseline to compare against, durable execution needs traces to debug, online evals need traces to score. Logs are the substrate. Get them in place and the rest of the work has somewhere to land.

The agent we built in this course is a starting point. The thing that turns a starting point into a product is the loop you keep running on it after the workshop ends. That is the loop from lesson 8, just with a bigger dataset coming from real users instead of one I typed.

That is the whole course. Thanks for coming.
