# 🧠 OpenClaw Memory

**Persistent memory for AI agents using Supabase.**

Stop losing context. Stop re-reading massive markdown files. Give your agent a real memory.

[![npm version](https://badge.fury.io/js/openclaw-memory.svg)](https://www.npmjs.com/package/openclaw-memory)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## The Problem

AI agents using file-based memory (MEMORY.md, daily logs) face:
- **Context window bloat** - Files grow unbounded, eating your token budget
- **Forgetting** - Context resets wipe session memory  
- **No search** - Linear scan through text to find relevant info
- **Unstructured** - Can't query "what did we discuss about X?"

## The Solution

OpenClaw Memory uses **Supabase (Postgres)** to give your agent:
- ✅ **Session tracking** - Every conversation logged with metadata
- ✅ **Semantic search** - Find relevant memories via vector similarity (pgvector)
- ✅ **Smart context** - Only load what's relevant, not everything
- ✅ **Multi-agent** - Share memories across agents
- ✅ **Structured data** - SQL queries, relationships, types

## Quick Start

```bash
npm install openclaw-memory
```

```typescript
import { OpenClawMemory } from 'openclaw-memory';

const memory = new OpenClawMemory({
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_KEY,
  agentId: 'my-agent'
});

// Initialize tables (first run only)
await memory.initialize();

// Start a conversation session
const session = await memory.startSession({ 
  userId: 'user-123', 
  channel: 'telegram' 
});

// Log messages
await memory.addMessage(session.id, { 
  role: 'user', 
  content: 'Remember that I prefer TypeScript over JavaScript' 
});

// Create a persistent memory
await memory.remember({
  content: 'User prefers TypeScript over JavaScript',
  category: 'preference',
  importance: 0.9
});

// Later: recall relevant memories
const memories = await memory.recall('programming language preferences');
// Returns: [{ content: 'User prefers TypeScript...', importance: 0.9, ... }]

// End session with auto-summary
await memory.endSession(session.id);
```

## Database Schema

### Sessions
```sql
sessions (id, agent_id, user_id, channel, started_at, ended_at, summary, metadata)
```

### Messages
```sql
messages (id, session_id, role, content, created_at, token_count, metadata)
```

### Memories
```sql
memories (id, agent_id, user_id, category, content, importance, embedding, expires_at, ...)
```

### Entities
```sql
entities (id, agent_id, entity_type, name, aliases, properties, embedding, ...)
```

### Tasks
```sql
tasks (id, agent_id, title, status, priority, due_at, ...)
```

### Learnings
```sql
learnings (id, agent_id, category, trigger, lesson, action, severity, ...)
```

See [SCHEMA.md](./SCHEMA.md) for full details.

## Setup Supabase

1. Create a [Supabase](https://supabase.com) project
2. Enable the `vector` extension:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
3. Run the migrations:
   ```bash
   npx openclaw-memory migrate
   ```
4. Set environment variables:
   ```bash
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_KEY=your-anon-key
   ```

## API Reference

### `new OpenClawMemory(config)`
Create a memory instance.

### `memory.initialize()`
Create database tables if they don't exist.

### `memory.startSession(opts)`
Start a new conversation session.

### `memory.addMessage(sessionId, message)`
Log a message to a session.

### `memory.endSession(sessionId, opts?)`
End a session, optionally with a summary.

### `memory.remember(memory)`
Store a long-term memory with optional embedding.

### `memory.recall(query, opts?)`
Semantic search for relevant memories.

### `memory.forget(memoryId)`
Delete a memory.

### `memory.getContext(query, opts?)`
Get relevant context for the current query (memories + entities + recent messages).

## Integration with OpenClaw/Clawdbot

This package is designed to integrate with [Clawdbot](https://github.com/clawdbot/clawdbot):

```typescript
// In your agent's AGENTS.md equivalent
// Instead of reading MEMORY.md, use:
const context = await memory.getContext(userMessage);
```

## Roadmap

- [ ] Automatic session summarization (Claude API)
- [ ] Entity extraction from conversations
- [ ] Memory importance decay over time
- [ ] Markdown import/export
- [ ] CLI for memory management
- [ ] Clawdbot skill integration

## Contributing

PRs welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT
