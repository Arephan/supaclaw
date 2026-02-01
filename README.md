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
  agentId: 'my-agent',
  // Optional: Enable semantic search with OpenAI embeddings
  embeddingProvider: 'openai',
  openaiApiKey: process.env.OPENAI_API_KEY
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

// Later: recall relevant memories (semantic search if embeddings enabled)
const memories = await memory.recall('programming language preferences', {
  minSimilarity: 0.7,  // Cosine similarity threshold
  limit: 10
});
// Returns: [{ content: 'User prefers TypeScript...', importance: 0.9, similarity: 0.85, ... }]

// Or use hybrid search (combines semantic + keyword matching)
const hybrid = await memory.hybridRecall('coding tips', {
  vectorWeight: 0.7,    // Weight for semantic similarity
  keywordWeight: 0.3,   // Weight for keyword matching
  limit: 10
});

// Find memories similar to an existing one
const similar = await memory.findSimilarMemories(memoryId, {
  minSimilarity: 0.8,
  limit: 5
});

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

## Search Modes

OpenClaw Memory supports three search strategies:

### 📝 Keyword Search (Default)
Traditional text matching - fast, no API keys needed.

```typescript
const results = await memory.recall('TypeScript', { limit: 10 });
```

### 🧠 Semantic Search
Uses OpenAI embeddings for meaning-based search. Understands that "coding tips" and "programming best practices" are related.

```typescript
const results = await memory.recall('machine learning', {
  minSimilarity: 0.75,  // Cosine similarity threshold (0-1)
  limit: 10
});
```

**Requirements:**
- `embeddingProvider: 'openai'` in config
- `OPENAI_API_KEY` environment variable
- Run migration `002_vector_search.sql`

### ⚡ Hybrid Search (Best Results)
Combines semantic understanding with keyword matching.

```typescript
const results = await memory.hybridRecall('AI agents', {
  vectorWeight: 0.7,    // 70% semantic similarity
  keywordWeight: 0.3,   // 30% keyword matching
  limit: 10
});
```

**When to use each:**
- **Keyword** - Fast lookups, exact term matching
- **Semantic** - Conceptual search, understanding context
- **Hybrid** - Best overall results, balances both strategies

## CLI Usage

```bash
# Initialize config
npx openclaw-memory init

# Run migrations
npx openclaw-memory migrate

# Test connection
npx openclaw-memory test

# Check database status
npx openclaw-memory status

# Search memories (keyword mode)
npx openclaw-memory search "TypeScript"

# Semantic search (requires OPENAI_API_KEY)
npx openclaw-memory search "coding best practices" --mode semantic

# Hybrid search
npx openclaw-memory search "AI patterns" --mode hybrid --limit 15

# List sessions
npx openclaw-memory sessions --limit 20 --active

# Export memories
npx openclaw-memory export memories.md

# Import memories
npx openclaw-memory import MEMORY.md
```

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

**Config options:**
- `supabaseUrl` - Supabase project URL
- `supabaseKey` - Supabase anon or service key
- `agentId` - Unique identifier for this agent
- `embeddingProvider` - Optional: 'openai', 'voyage', or 'none'
- `openaiApiKey` - Required if using OpenAI embeddings
- `embeddingModel` - Optional: OpenAI model name (default: 'text-embedding-3-small')

### `memory.initialize()`
Create database tables if they don't exist.

### `memory.startSession(opts)`
Start a new conversation session.

### `memory.addMessage(sessionId, message)`
Log a message to a session.

### `memory.endSession(sessionId, opts?)`
End a session, optionally with a summary.

### `memory.remember(memory)`
Store a long-term memory. Automatically generates embeddings if provider configured.

### `memory.recall(query, opts?)`
Search for relevant memories using semantic similarity (if embeddings enabled) or keyword matching.

**Options:**
- `userId` - Filter by user
- `category` - Filter by category
- `limit` - Maximum results (default: 10)
- `minImportance` - Minimum importance score
- `minSimilarity` - Minimum cosine similarity (0-1, default: 0.7)

### `memory.hybridRecall(query, opts?)`
Hybrid search combining vector similarity and keyword matching.

**Options:**
- All options from `recall()` plus:
- `vectorWeight` - Weight for semantic similarity (default: 0.7)
- `keywordWeight` - Weight for keyword matching (default: 0.3)

### `memory.findSimilarMemories(memoryId, opts?)`
Find memories similar to an existing memory.

**Options:**
- `minSimilarity` - Minimum similarity threshold (default: 0.8)
- `limit` - Maximum results (default: 5)

### `memory.forget(memoryId)`
Delete a memory.

### `memory.getContext(query, opts?)`
Get relevant context for the current query (memories + recent messages).

## Integration with OpenClaw/Clawdbot

This package is designed to integrate with [Clawdbot](https://github.com/clawdbot/clawdbot):

```typescript
// In your agent's AGENTS.md equivalent
// Instead of reading MEMORY.md, use:
const context = await memory.getContext(userMessage);
```

## Roadmap

- [x] ✅ CLI for memory management
- [x] ✅ Markdown import/export
- [x] ✅ Semantic search (OpenAI embeddings)
- [x] ✅ Hybrid search (vector + keyword)
- [x] ✅ Vector similarity functions
- [ ] Automatic session summarization (Claude API)
- [ ] Entity extraction from conversations
- [ ] Memory importance decay over time
- [ ] Voyage AI embedding provider
- [ ] Local embeddings (transformers.js)
- [ ] Clawdbot skill integration
- [ ] Multi-agent memory sharing

## Contributing

PRs welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT
