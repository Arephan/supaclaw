import { createClient, SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

export interface OpenClawMemoryConfig {
  supabaseUrl: string;
  supabaseKey: string;
  agentId: string;
  embeddingProvider?: 'openai' | 'voyage' | 'none';
  openaiApiKey?: string;
  embeddingModel?: string; // Default: text-embedding-3-small
}

export interface Session {
  id: string;
  agent_id: string;
  user_id?: string;
  channel?: string;
  started_at: string;
  ended_at?: string;
  summary?: string;
  metadata: Record<string, unknown>;
}

export interface Message {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  created_at: string;
  token_count?: number;
  metadata: Record<string, unknown>;
}

export interface Memory {
  id: string;
  agent_id: string;
  user_id?: string;
  category?: string;
  content: string;
  importance: number;
  source_session_id?: string;
  created_at: string;
  updated_at: string;
  expires_at?: string;
  embedding?: number[];
  metadata: Record<string, unknown>;
}

export interface Entity {
  id: string;
  agent_id: string;
  entity_type: string;
  name: string;
  aliases?: string[];
  description?: string;
  properties: Record<string, unknown>;
  first_seen_at: string;
  last_seen_at: string;
  mention_count: number;
}

export interface Task {
  id: string;
  agent_id: string;
  user_id?: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'blocked' | 'done';
  priority: number;
  due_at?: string;
  completed_at?: string;
  parent_task_id?: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Learning {
  id: string;
  agent_id: string;
  category: 'error' | 'correction' | 'improvement' | 'capability_gap';
  trigger: string;
  lesson: string;
  action?: string;
  severity: 'info' | 'warning' | 'critical';
  source_session_id?: string;
  applied_count: number;
  created_at: string;
  metadata: Record<string, unknown>;
}

export class OpenClawMemory {
  private supabase: SupabaseClient;
  private agentId: string;
  private config: OpenClawMemoryConfig;
  private openai?: OpenAI;

  constructor(config: OpenClawMemoryConfig) {
    this.supabase = createClient(config.supabaseUrl, config.supabaseKey);
    this.agentId = config.agentId;
    this.config = config;
    
    // Initialize OpenAI if API key provided
    if (config.openaiApiKey) {
      this.openai = new OpenAI({ apiKey: config.openaiApiKey });
    }
  }

  /**
   * Generate embedding for text using configured provider
   */
  private async generateEmbedding(text: string): Promise<number[] | null> {
    if (!this.config.embeddingProvider || this.config.embeddingProvider === 'none') {
      return null;
    }

    if (this.config.embeddingProvider === 'openai') {
      if (!this.openai) {
        throw new Error('OpenAI API key not provided');
      }

      const model = this.config.embeddingModel || 'text-embedding-3-small';
      const response = await this.openai.embeddings.create({
        model,
        input: text,
      });

      return response.data[0].embedding;
    }

    // TODO: Add Voyage AI support
    if (this.config.embeddingProvider === 'voyage') {
      throw new Error('Voyage AI embeddings not yet implemented');
    }

    return null;
  }

  /**
   * Initialize database tables (run once)
   */
  async initialize(): Promise<void> {
    // Tables are created via migration SQL files
    // This checks if tables exist
    const { error } = await this.supabase
      .from('sessions')
      .select('id')
      .limit(1);
    
    if (error && error.code === '42P01') {
      throw new Error(
        'Tables not found. Run migrations first: npx openclaw-memory migrate'
      );
    }
  }

  // ============ SESSIONS ============

  /**
   * Start a new conversation session
   */
  async startSession(opts: {
    userId?: string;
    channel?: string;
    metadata?: Record<string, unknown>;
  } = {}): Promise<Session> {
    const { data, error } = await this.supabase
      .from('sessions')
      .insert({
        agent_id: this.agentId,
        user_id: opts.userId,
        channel: opts.channel,
        metadata: opts.metadata || {}
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * End a session with optional summary
   */
  async endSession(sessionId: string, opts: {
    summary?: string;
  } = {}): Promise<Session> {
    const { data, error } = await this.supabase
      .from('sessions')
      .update({
        ended_at: new Date().toISOString(),
        summary: opts.summary
      })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Get a session by ID
   */
  async getSession(sessionId: string): Promise<Session | null> {
    const { data, error } = await this.supabase
      .from('sessions')
      .select()
      .eq('id', sessionId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  /**
   * Get recent sessions
   */
  async getRecentSessions(opts: {
    userId?: string;
    limit?: number;
  } = {}): Promise<Session[]> {
    let query = this.supabase
      .from('sessions')
      .select()
      .eq('agent_id', this.agentId)
      .order('started_at', { ascending: false })
      .limit(opts.limit || 10);

    if (opts.userId) {
      query = query.eq('user_id', opts.userId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  // ============ MESSAGES ============

  /**
   * Add a message to a session
   */
  async addMessage(sessionId: string, message: {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    tokenCount?: number;
    metadata?: Record<string, unknown>;
  }): Promise<Message> {
    const { data, error } = await this.supabase
      .from('messages')
      .insert({
        session_id: sessionId,
        role: message.role,
        content: message.content,
        token_count: message.tokenCount,
        metadata: message.metadata || {}
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Get messages from a session
   */
  async getMessages(sessionId: string, opts: {
    limit?: number;
    offset?: number;
  } = {}): Promise<Message[]> {
    const { data, error } = await this.supabase
      .from('messages')
      .select()
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .range(opts.offset || 0, (opts.offset || 0) + (opts.limit || 100) - 1);

    if (error) throw error;
    return data || [];
  }

  // ============ MEMORIES ============

  /**
   * Store a long-term memory with semantic embedding
   */
  async remember(memory: {
    content: string;
    category?: string;
    importance?: number;
    userId?: string;
    sessionId?: string;
    expiresAt?: string;
    metadata?: Record<string, unknown>;
  }): Promise<Memory> {
    // Generate embedding if provider configured
    const embedding = await this.generateEmbedding(memory.content);

    const { data, error } = await this.supabase
      .from('memories')
      .insert({
        agent_id: this.agentId,
        user_id: memory.userId,
        category: memory.category,
        content: memory.content,
        importance: memory.importance ?? 0.5,
        source_session_id: memory.sessionId,
        expires_at: memory.expiresAt,
        embedding,
        metadata: memory.metadata || {}
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Search memories using vector similarity (semantic search)
   */
  async recall(query: string, opts: {
    userId?: string;
    category?: string;
    limit?: number;
    minImportance?: number;
    minSimilarity?: number; // Cosine similarity threshold (0-1)
  } = {}): Promise<Memory[]> {
    // Generate query embedding for semantic search
    const queryEmbedding = await this.generateEmbedding(query);

    if (queryEmbedding) {
      // Use pgvector for semantic search
      const { data, error } = await this.supabase.rpc('match_memories', {
        query_embedding: queryEmbedding,
        match_threshold: opts.minSimilarity ?? 0.7,
        match_count: opts.limit || 10,
        p_agent_id: this.agentId,
        p_user_id: opts.userId,
        p_category: opts.category,
        p_min_importance: opts.minImportance
      });

      if (error) throw error;
      return data || [];
    }

    // Fallback to text search when no embeddings available
    let q = this.supabase
      .from('memories')
      .select()
      .eq('agent_id', this.agentId)
      .order('importance', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(opts.limit || 10);

    if (opts.userId) {
      q = q.or(`user_id.eq.${opts.userId},user_id.is.null`);
    }
    if (opts.category) {
      q = q.eq('category', opts.category);
    }
    if (opts.minImportance) {
      q = q.gte('importance', opts.minImportance);
    }

    // Text search filter
    q = q.ilike('content', `%${query}%`);

    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  /**
   * Hybrid search: combines semantic similarity and keyword matching
   * Returns deduplicated results sorted by relevance score
   */
  async hybridRecall(query: string, opts: {
    userId?: string;
    category?: string;
    limit?: number;
    minImportance?: number;
    vectorWeight?: number; // Weight for semantic similarity (0-1), default 0.7
    keywordWeight?: number; // Weight for keyword match (0-1), default 0.3
  } = {}): Promise<Memory[]> {
    const vectorWeight = opts.vectorWeight ?? 0.7;
    const keywordWeight = opts.keywordWeight ?? 0.3;

    // Generate query embedding
    const queryEmbedding = await this.generateEmbedding(query);

    if (queryEmbedding) {
      // Use hybrid search RPC function
      const { data, error } = await this.supabase.rpc('hybrid_search_memories', {
        query_embedding: queryEmbedding,
        query_text: query,
        vector_weight: vectorWeight,
        keyword_weight: keywordWeight,
        match_count: opts.limit || 10,
        p_agent_id: this.agentId,
        p_user_id: opts.userId,
        p_category: opts.category,
        p_min_importance: opts.minImportance
      });

      if (error) throw error;
      return data || [];
    }

    // Fallback to regular recall if no embeddings
    return this.recall(query, opts);
  }

  /**
   * Delete a memory
   */
  async forget(memoryId: string): Promise<void> {
    const { error } = await this.supabase
      .from('memories')
      .delete()
      .eq('id', memoryId);

    if (error) throw error;
  }

  /**
   * Get all memories (paginated)
   */
  async getMemories(opts: {
    userId?: string;
    category?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<Memory[]> {
    let query = this.supabase
      .from('memories')
      .select()
      .eq('agent_id', this.agentId)
      .order('created_at', { ascending: false })
      .range(opts.offset || 0, (opts.offset || 0) + (opts.limit || 50) - 1);

    if (opts.userId) {
      query = query.eq('user_id', opts.userId);
    }
    if (opts.category) {
      query = query.eq('category', opts.category);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  /**
   * Find memories similar to an existing memory
   * Useful for context expansion and deduplication
   */
  async findSimilarMemories(memoryId: string, opts: {
    minSimilarity?: number;
    limit?: number;
  } = {}): Promise<Memory[]> {
    const { data, error } = await this.supabase.rpc('find_similar_memories', {
      memory_id: memoryId,
      match_threshold: opts.minSimilarity ?? 0.8,
      match_count: opts.limit || 5
    });

    if (error) throw error;
    return data || [];
  }

  // ============ TASKS ============

  /**
   * Create a task
   */
  async createTask(task: {
    title: string;
    description?: string;
    priority?: number;
    dueAt?: string;
    userId?: string;
    parentTaskId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<Task> {
    const { data, error } = await this.supabase
      .from('tasks')
      .insert({
        agent_id: this.agentId,
        user_id: task.userId,
        title: task.title,
        description: task.description,
        priority: task.priority ?? 0,
        due_at: task.dueAt,
        parent_task_id: task.parentTaskId,
        metadata: task.metadata || {}
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Update a task
   */
  async updateTask(taskId: string, updates: Partial<{
    title: string;
    description: string;
    status: 'pending' | 'in_progress' | 'blocked' | 'done';
    priority: number;
    dueAt: string;
    metadata: Record<string, unknown>;
  }>): Promise<Task> {
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    };

    if (updates.title) updateData.title = updates.title;
    if (updates.description) updateData.description = updates.description;
    if (updates.status) {
      updateData.status = updates.status;
      if (updates.status === 'done') {
        updateData.completed_at = new Date().toISOString();
      }
    }
    if (updates.priority !== undefined) updateData.priority = updates.priority;
    if (updates.dueAt) updateData.due_at = updates.dueAt;
    if (updates.metadata) updateData.metadata = updates.metadata;

    const { data, error } = await this.supabase
      .from('tasks')
      .update(updateData)
      .eq('id', taskId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Get tasks
   */
  async getTasks(opts: {
    status?: string;
    userId?: string;
    limit?: number;
  } = {}): Promise<Task[]> {
    let query = this.supabase
      .from('tasks')
      .select()
      .eq('agent_id', this.agentId)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(opts.limit || 50);

    if (opts.status) {
      query = query.eq('status', opts.status);
    }
    if (opts.userId) {
      query = query.eq('user_id', opts.userId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  // ============ LEARNINGS ============

  /**
   * Record a learning
   */
  async learn(learning: {
    category: 'error' | 'correction' | 'improvement' | 'capability_gap';
    trigger: string;
    lesson: string;
    action?: string;
    severity?: 'info' | 'warning' | 'critical';
    sessionId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<Learning> {
    const { data, error } = await this.supabase
      .from('learnings')
      .insert({
        agent_id: this.agentId,
        category: learning.category,
        trigger: learning.trigger,
        lesson: learning.lesson,
        action: learning.action,
        severity: learning.severity ?? 'info',
        source_session_id: learning.sessionId,
        metadata: learning.metadata || {}
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Get learnings
   */
  async getLearnings(opts: {
    category?: string;
    severity?: string;
    limit?: number;
  } = {}): Promise<Learning[]> {
    let query = this.supabase
      .from('learnings')
      .select()
      .eq('agent_id', this.agentId)
      .order('created_at', { ascending: false })
      .limit(opts.limit || 50);

    if (opts.category) {
      query = query.eq('category', opts.category);
    }
    if (opts.severity) {
      query = query.eq('severity', opts.severity);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  // ============ CONTEXT ============

  /**
   * Get relevant context for a query
   * Combines memories, recent messages, and entities
   */
  async getContext(query: string, opts: {
    userId?: string;
    sessionId?: string;
    maxMemories?: number;
    maxMessages?: number;
  } = {}): Promise<{
    memories: Memory[];
    recentMessages: Message[];
    summary: string;
  }> {
    // Get relevant memories
    const memories = await this.recall(query, {
      userId: opts.userId,
      limit: opts.maxMemories || 5
    });

    // Get recent messages from current session
    let recentMessages: Message[] = [];
    if (opts.sessionId) {
      recentMessages = await this.getMessages(opts.sessionId, {
        limit: opts.maxMessages || 20
      });
    }

    // Build context summary
    const memoryText = memories
      .map(m => `- ${m.content}`)
      .join('\n');

    const summary = memories.length > 0
      ? `Relevant memories:\n${memoryText}`
      : 'No relevant memories found.';

    return { memories, recentMessages, summary };
  }
}

export default OpenClawMemory;
