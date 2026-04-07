# Cloudflare Workers Request Lifecycle

This describes what happens when an HTTP request hits a Cloudflare Worker, from the moment the TCP connection lands at an edge POP to the response heading back to the client.

## The path

1. **Client → Edge POP.** DNS resolves the hostname to an anycast IP, so the client's request lands at the geographically closest Cloudflare data center. TLS terminates at the edge.

2. **Edge proxy → Worker isolate.** The edge proxy (an internal service called FL, "Front Line") looks at the host and route, finds the Worker bound to that route, and dispatches the request to a V8 isolate running that Worker's bundled JS. There is no container, no cold start in the traditional sense — the isolate is already warm or spins up in single-digit milliseconds.

3. **Worker fetch handler runs.** The Worker's `fetch(request, env, ctx)` runs on a single isolate, single-threaded. It can call `await fetch(...)` to make subrequests, read/write KV, query D1, send messages to a Queue, or invoke a Durable Object stub.

4. **Optional: Durable Object hop.** If the Worker calls `env.MY_DO.get(id).fetch(request)`, the request crosses to a different machine — the one that holds that DO's storage. Durable Objects are single-instance, single-threaded, and pinned to one location globally for any given id. The Worker's request travels across Cloudflare's backbone network to that DO, the DO runs its handler, and the response comes back.

5. **Optional: KV / R2 read.** KV reads are eventually consistent and served from the closest cache. R2 reads hit Cloudflare's object storage. Both are subrequests from the Worker's perspective, billed as such.

6. **Response → client.** The Worker returns a `Response`. The edge proxy streams it back to the client over the same TLS connection.

## Key components to draw

- **Client** (browser, mobile app)
- **Edge POP** with TLS termination and the FL proxy
- **Worker isolate** (one box per Worker)
- **Durable Object** (separate box, often labeled with which region holds it)
- **KV / R2 / D1** (data stores, drawn beside the Worker)
- **Origin server** (only if the Worker proxies to one)

## Conventions

Workers run inside a single edge POP. Subrequests fan out from there. The DO hop is the only thing that *might* cross POPs. Show the edge boundary as a wrapper group around the Worker, edge proxy, and any cached resources. KV/R2/D1 sit outside that group but still inside the Cloudflare boundary.
