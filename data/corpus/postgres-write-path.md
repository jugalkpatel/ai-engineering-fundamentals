# PostgreSQL Write Path

What happens inside Postgres between `INSERT INTO ...` and the data being durable on disk. Useful for drawing database internals diagrams or explaining durability and crash recovery.

## Components

- **Backend process** — Postgres forks one OS process per client connection. The backend parses, plans, and executes SQL on behalf of that client.
- **Shared buffers** — the in-memory page cache shared across all backends. Default size is small (128MB), production setups run 25–40% of system RAM. All reads and writes go through shared buffers.
- **WAL (Write-Ahead Log)** — an append-only log of every change. Lives in `pg_wal/` as a sequence of 16MB segment files. Every modification is written here *before* the corresponding shared buffers page can be considered modified.
- **WAL buffers** — small in-memory staging area for WAL records before they are flushed to disk.
- **Background writer** — a dedicated process that periodically writes dirty (modified) pages from shared buffers to the underlying data files in `base/`.
- **Checkpointer** — a dedicated process that runs a checkpoint at intervals: flushes all dirty shared buffers to disk and writes a checkpoint record into the WAL. After a checkpoint, WAL segments older than the checkpoint can be recycled.
- **Data files** — the actual table and index files under `base/<dbid>/<relid>`.

## The write sequence

1. **Client sends `INSERT`.** The backend receives the query.

2. **Backend parses, plans, executes.** Execution finds the right table page (or allocates a new one) and pulls it into shared buffers if it isn't already there.

3. **Backend modifies the page in shared buffers.** The page is now "dirty." Crucially, the change is *not yet* in the data file on disk and *not yet* in WAL.

4. **Backend writes a WAL record.** The change is described in WAL format and appended to WAL buffers, then flushed to the WAL on disk. For a `COMMIT`, the backend waits for `fsync` to confirm the WAL is on stable storage before acknowledging the client (unless `synchronous_commit = off`).

5. **Client gets the OK.** At this point the change is durable: the data file hasn't been updated, but the WAL has, and crash recovery can replay the WAL to reconstruct the dirty page.

6. **Background writer flushes the dirty page later.** Whenever the background writer runs, it picks dirty pages from shared buffers and writes them to data files. This is independent of when the original transaction committed.

7. **Checkpoint happens periodically.** All currently dirty pages are flushed to data files, a checkpoint record is written into the WAL, and old WAL segments become eligible for recycling.

## Why this order matters

The "write-ahead" in WAL means: WAL is fsynced to disk *before* the data file ever sees the change. If the machine crashes after step 5 but before step 6, recovery replays the WAL records starting from the last checkpoint and reapplies the changes to the data files. Durability is guaranteed by the WAL fsync at commit, not by the data file write.
