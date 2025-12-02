/**
 * Database service using raw PostgreSQL queries
 */

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private pool: Pool;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      console.warn('⚠️  DATABASE_URL not set - database operations will fail');
      // Create a dummy pool that won't be used
      this.pool = new Pool({
        connectionString: 'postgresql://localhost:5432/dummy',
        ssl: false,
      });
    } else {
      this.pool = new Pool({
        connectionString,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      });
    }
  }

  async onModuleInit() {
    // Test connection only if DATABASE_URL is set
    if (!process.env.DATABASE_URL) {
      console.warn('⚠️  Skipping database connection test - DATABASE_URL not set');
      return;
    }
    
    try {
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      console.log('✅ Database connection successful');
    } catch (error) {
      console.error('❌ Database connection failed:', error instanceof Error ? error.message : String(error));
      // Don't throw - allow app to start with graceful degradation
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  // Raw query method
  async $queryRaw<T = any>(query: string, params: any[] = []): Promise<T[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(query, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  // Raw execute method (for DELETE, UPDATE, INSERT without RETURNING)
  async $executeRaw(query: string, params: any[] = []): Promise<number> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(query, params);
      return result.rowCount || 0;
    } finally {
      client.release();
    }
  }

  // Raw execute method for unsafe SQL (DDL statements, multi-statement SQL)
  async $executeRawUnsafe(query: string): Promise<number> {
    const client = await this.pool.connect();
    try {
      // Split by semicolon and execute each statement
      const statements = query.split(';').filter(s => s.trim().length > 0);
      let totalRows = 0;
      for (const statement of statements) {
        const trimmed = statement.trim();
        if (trimmed) {
          const result = await client.query(trimmed);
          totalRows += result.rowCount || 0;
        }
      }
      return totalRows;
    } finally {
      client.release();
    }
  }

  // Mock Prisma methods for compatibility
  get user() {
    return {
      findUnique: async (args: any) => {
        // Support both id and email lookups
        if (args.where.id) {
          const result = await this.$queryRaw('SELECT * FROM "users" WHERE id = $1', [args.where.id]);
          return result[0] || null;
        }
        if (args.where.email) {
          const result = await this.$queryRaw('SELECT * FROM "users" WHERE email = $1', [args.where.email]);
          return result[0] || null;
        }
        return null;
      },
      findMany: async (args: any) => {
        const where = args.where || {};
        let query = 'SELECT * FROM "users" WHERE 1=1';
        const params: any[] = [];
        let paramIndex = 1;
        
        if (where.email) {
          query += ` AND email = $${paramIndex++}`;
          params.push(where.email);
        }
        if (where.id) {
          query += ` AND id = $${paramIndex++}`;
          params.push(where.id);
        }
        
        return await this.$queryRaw(query, params);
      }
    };
  }

  get workspaceMember() {
    return {
      findMany: async (args: any) => {
        const where = args.where || {};
        let query = 'SELECT * FROM "WorkspaceMember" WHERE 1=1';
        const params: any[] = [];
        let paramIndex = 1;
        
        if (where.userId) {
          query += ` AND "userId" = $${paramIndex++}`;
          params.push(where.userId);
        }
        if (where.workspaceId) {
          query += ` AND "workspaceId" = $${paramIndex++}`;
          params.push(where.workspaceId);
        }
        
        const result = await this.$queryRaw(query, params);
        return result;
      },
      count: async (args: any) => {
        const where = args.where || {};
        let query = 'SELECT COUNT(*) as count FROM "WorkspaceMember" WHERE 1=1';
        const params: any[] = [];
        let paramIndex = 1;
        
        if (where.workspaceId) {
          query += ` AND "workspaceId" = $${paramIndex++}`;
          params.push(where.workspaceId);
        }
        
        const result = await this.$queryRaw(query, params);
        return parseInt(result[0]?.count || '0', 10);
      },
      findFirst: async (args: any) => {
        const where = args.where || {};
        let query = 'SELECT * FROM "WorkspaceMember" WHERE 1=1';
        const params: any[] = [];
        let paramIndex = 1;
        
        if (where.userId) {
          query += ` AND "userId" = $${paramIndex++}`;
          params.push(where.userId);
        }
        if (where.workspaceId) {
          query += ` AND "workspaceId" = $${paramIndex++}`;
          params.push(where.workspaceId);
        }
        if (where.id) {
          query += ` AND id = $${paramIndex++}`;
          params.push(where.id);
        }
        
        query += ' LIMIT 1';
        const result = await this.$queryRaw(query, params);
        return result[0] || null;
      },
      create: async (args: any) => {
        const data = args.data || {};
        const query = `
          INSERT INTO "WorkspaceMember" ("id", "workspaceId", "userId", "role", "joinedAt")
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `;
        const id = data.id || `member_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const params = [
          id,
          data.workspaceId,
          data.userId,
          data.role || 'MEMBER',
          data.joinedAt || new Date()
        ];
        const result = await this.$queryRaw(query, params);
        return result[0];
      },
      update: async (args: any) => {
        const where = args.where || {};
        const data = args.data || {};
        const updates: string[] = [];
        const params: any[] = [];
        let paramIndex = 1;
        
        if (data.role) {
          updates.push(`"role" = $${paramIndex++}`);
          params.push(data.role);
        }
        
        if (updates.length === 0) {
          const existing = await this.workspaceMember.findFirst({ where });
          return existing;
        }
        
        if (where.id) {
          params.push(where.id);
          const query = `
            UPDATE "WorkspaceMember"
            SET ${updates.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING *
          `;
          const result = await this.$queryRaw(query, params);
          return result[0] || null;
        }
        return null;
      },
      delete: async (args: any) => {
        const where = args.where || {};
        if (where.id) {
          const query = 'DELETE FROM "WorkspaceMember" WHERE id = $1 RETURNING *';
          const result = await this.$queryRaw(query, [where.id]);
          return result[0] || null;
        }
        return null;
      }
    };
  }

  get workspaceInvitation() {
    return {
      findMany: async (args: any) => {
        const where = args.where || {};
        let query = 'SELECT * FROM "WorkspaceInvitation" WHERE 1=1';
        const params: any[] = [];
        let paramIndex = 1;
        
        if (where.workspaceId) {
          query += ` AND "workspaceId" = $${paramIndex++}`;
          params.push(where.workspaceId);
        }
        if (where.status) {
          query += ` AND status = $${paramIndex++}`;
          params.push(where.status);
        }
        if (where.expiresAt?.lt) {
          query += ` AND "expiresAt" < $${paramIndex++}`;
          params.push(where.expiresAt.lt);
        }
        
        if (args.orderBy) {
          const orderBy = args.orderBy;
          const field = Object.keys(orderBy)[0];
          const direction = orderBy[field] === 'desc' ? 'DESC' : 'ASC';
          query += ` ORDER BY "${field}" ${direction}`;
        }
        
        const result = await this.$queryRaw(query, params);
        return result;
      },
      findFirst: async (args: any) => {
        const where = args.where || {};
        let query = 'SELECT * FROM "WorkspaceInvitation" WHERE 1=1';
        const params: any[] = [];
        let paramIndex = 1;
        
        if (where.id) {
          query += ` AND id = $${paramIndex++}`;
          params.push(where.id);
        }
        if (where.token) {
          query += ` AND token = $${paramIndex++}`;
          params.push(where.token);
        }
        if (where.email) {
          query += ` AND email = $${paramIndex++}`;
          params.push(where.email);
        }
        if (where.workspaceId) {
          query += ` AND "workspaceId" = $${paramIndex++}`;
          params.push(where.workspaceId);
        }
        
        query += ' LIMIT 1';
        const result = await this.$queryRaw(query, params);
        return result[0] || null;
      },
      findUnique: async (args: any) => {
        return this.workspaceInvitation.findFirst(args);
      },
      create: async (args: any) => {
        const data = args.data || {};
        const query = `
          INSERT INTO "WorkspaceInvitation" ("id", "workspaceId", "email", "role", "token", "expiresAt", "status", "invitedBy", "createdAt")
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING *
        `;
        const id = data.id || `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const params = [
          id,
          data.workspaceId,
          data.email,
          data.role || 'MEMBER',
          data.token,
          data.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
          data.status || 'PENDING',
          data.invitedBy,
          data.createdAt || new Date()
        ];
        const result = await this.$queryRaw(query, params);
        return result[0];
      },
      update: async (args: any) => {
        const where = args.where || {};
        const data = args.data || {};
        const updates: string[] = [];
        const params: any[] = [];
        let paramIndex = 1;
        
        if (data.status) {
          updates.push(`status = $${paramIndex++}`);
          params.push(data.status);
        }
        
        if (updates.length === 0) {
          const existing = await this.workspaceInvitation.findFirst({ where });
          return existing;
        }
        
        if (where.id) {
          params.push(where.id);
          const query = `
            UPDATE "WorkspaceInvitation"
            SET ${updates.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING *
          `;
          const result = await this.$queryRaw(query, params);
          return result[0] || null;
        }
        return null;
      },
      updateMany: async (args: any) => {
        const where = args.where || {};
        const data = args.data || {};
        const updates: string[] = [];
        const params: any[] = [];
        let paramIndex = 1;
        
        if (data.status) {
          updates.push(`status = $${paramIndex++}`);
          params.push(data.status);
        }
        
        let whereClause = 'WHERE 1=1';
        if (where.id?.in) {
          whereClause += ` AND id = ANY($${paramIndex++}::text[])`;
          params.push(where.id.in);
        }
        
        if (updates.length === 0) {
          return { count: 0 };
        }
        
        const query = `
          UPDATE "WorkspaceInvitation"
          SET ${updates.join(', ')}
          ${whereClause}
        `;
        const client = await this.pool.connect();
        try {
          const result = await client.query(query, params);
          return { count: result.rowCount || 0 };
        } finally {
          client.release();
        }
      }
    };
  }

  get auditLog() {
    return {
      create: async (args: any) => {
        const data = args.data || {};
        const query = `
          INSERT INTO "AuditLog" ("id", "workspaceId", "actorUserId", "action", "payload", "createdAt")
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `;
        const id = data.id || `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const params = [
          id,
          data.workspaceId,
          data.actorUserId,
          data.action,
          JSON.stringify(data.payload || {}),
          data.createdAt || new Date()
        ];
        const result = await this.$queryRaw(query, params);
        return result[0];
      },
      findMany: async (args: any) => {
        const where = args.where || {};
        let query = 'SELECT * FROM "AuditLog" WHERE 1=1';
        const params: any[] = [];
        let paramIndex = 1;
        
        if (where.workspaceId) {
          query += ` AND "workspaceId" = $${paramIndex++}`;
          params.push(where.workspaceId);
        }
        
        const result = await this.$queryRaw(query, params);
        return result;
      }
    };
  }

  get workspace() {
    return {
      findUnique: async (args: any) => {
        const where = args.where || {};
        if (where.id) {
          const query = 'SELECT * FROM "Workspace" WHERE id = $1';
          const result = await this.$queryRaw(query, [where.id]);
          return result[0] || null;
        }
        return null;
      },
      findFirst: async (args: any) => {
        return this.workspace.findUnique(args);
      }
    };
  }

  get workspaceSettings() {
    return {
      findUnique: async (args: any) => {
        const where = args.where || {};
        if (where.workspaceId) {
          const query = 'SELECT * FROM "WorkspaceSettings" WHERE "workspaceId" = $1';
          const result = await this.$queryRaw(query, [where.workspaceId]);
          return result[0] || null;
        }
        return null;
      }
    };
  }

  get metricDaily() {
    return {
      findMany: async (args: any) => {
        const result = await this.$queryRaw('SELECT * FROM "MetricDaily" WHERE "workspaceId" = $1', [args.where.workspaceId]);
        return result;
      }
    };
  }

  get citation() {
    return {
      findMany: async (args: any) => {
        const result = await this.$queryRaw('SELECT * FROM "Citation" WHERE "answerId" IN (SELECT id FROM "Answer" WHERE "promptRunId" IN (SELECT id FROM "PromptRun" WHERE "workspaceId" = $1))', [args.where.answer.promptRun.workspaceId]);
        return result;
      }
    };
  }

  get promptRun() {
    return {
      findMany: async (args: any) => {
        const where = args.where || {};
        let query = 'SELECT * FROM "PromptRun" WHERE 1=1';
        const params: any[] = [];
        let paramIndex = 1;
        
        if (where.workspaceId) {
          query += ` AND "workspaceId" = $${paramIndex++}`;
          params.push(where.workspaceId);
        }
        if (where.startedAt?.gte) {
          query += ` AND "startedAt" >= $${paramIndex++}`;
          params.push(where.startedAt.gte);
        }
        
        if (args.take) {
          query += ` LIMIT $${paramIndex++}`;
          params.push(args.take);
        }
        
        const result = await this.$queryRaw(query, params);
        return result;
      },
      count: async (args: any) => {
        const where = args.where || {};
        let query = 'SELECT COUNT(*) as count FROM "PromptRun" WHERE 1=1';
        const params: any[] = [];
        let paramIndex = 1;
        
        if (where.workspaceId) {
          query += ` AND "workspaceId" = $${paramIndex++}`;
          params.push(where.workspaceId);
        }
        if (where.startedAt?.gte) {
          query += ` AND "startedAt" >= $${paramIndex++}`;
          params.push(where.startedAt.gte);
        }
        
        const result = await this.$queryRaw(query, params);
        return parseInt(result[0]?.count || '0', 10);
      }
    };
  }

  get prompt() {
    return {
      findMany: async (args: any) => {
        const where = args.where || {};
        let query = 'SELECT * FROM "Prompt" WHERE 1=1';
        const params: any[] = [];
        let paramIndex = 1;
        
        if (where.workspaceId) {
          query += ` AND "workspaceId" = $${paramIndex++}`;
          params.push(where.workspaceId);
        }
        
        const result = await this.$queryRaw(query, params);
        return result;
      }
    };
  }

  get answer() {
    return {
      findMany: async (args: any) => {
        const where = args.where || {};
        let query = 'SELECT * FROM "Answer" WHERE 1=1';
        const params: any[] = [];
        let paramIndex = 1;
        
        if (where.promptRun?.workspaceId) {
          query += ` AND "promptRunId" IN (SELECT id FROM "PromptRun" WHERE "workspaceId" = $${paramIndex++})`;
          params.push(where.promptRun.workspaceId);
        }
        
        if (args.take) {
          query += ` LIMIT $${paramIndex++}`;
          params.push(args.take);
        }
        
        const result = await this.$queryRaw(query, params);
        return result;
      }
    };
  }

  get mention() {
    return {
      findMany: async (args: any) => {
        const where = args.where || {};
        let query = 'SELECT * FROM "Mention" WHERE 1=1';
        const params: any[] = [];
        let paramIndex = 1;
        
        if (where.answer?.promptRun?.workspaceId) {
          query += ` AND "answerId" IN (SELECT id FROM "Answer" WHERE "promptRunId" IN (SELECT id FROM "PromptRun" WHERE "workspaceId" = $${paramIndex++}))`;
          params.push(where.answer.promptRun.workspaceId);
        }
        
        if (args.take) {
          query += ` LIMIT $${paramIndex++}`;
          params.push(args.take);
        }
        
        const result = await this.$queryRaw(query, params);
        return result;
      }
    };
  }

  get engine() {
    return {
      findMany: async (args: any) => {
        const where = args.where || {};
        let query = 'SELECT * FROM "Engine" WHERE 1=1';
        const params: any[] = [];
        let paramIndex = 1;
        
        if (where.workspaceId) {
          query += ` AND "workspaceId" = $${paramIndex++}`;
          params.push(where.workspaceId);
        }
        
        const result = await this.$queryRaw(query, params);
        return result;
      }
    };
  }

  get connection() {
    return {
      findMany: async (args: any) => {
        const where = args.where || {};
        let query = 'SELECT * FROM "Connection" WHERE 1=1';
        const params: any[] = [];
        let paramIndex = 1;
        
        if (where.workspaceId) {
          query += ` AND "workspaceId" = $${paramIndex++}`;
          params.push(where.workspaceId);
        }
        
        const result = await this.$queryRaw(query, params);
        return result;
      }
    };
  }

  get alert() {
    return {
      findMany: async (args: any) => {
        const where = args.where || {};
        let query = 'SELECT * FROM "Alert" WHERE 1=1';
        const params: any[] = [];
        let paramIndex = 1;
        
        if (where.workspaceId) {
          query += ` AND "workspaceId" = $${paramIndex++}`;
          params.push(where.workspaceId);
        }
        
        const result = await this.$queryRaw(query, params);
        return result;
      }
    };
  }

  get report() {
    return {
      findMany: async (args: any) => {
        const where = args.where || {};
        let query = 'SELECT * FROM "Report" WHERE 1=1';
        const params: any[] = [];
        let paramIndex = 1;
        
        if (where.workspaceId) {
          query += ` AND "workspaceId" = $${paramIndex++}`;
          params.push(where.workspaceId);
        }
        
        const result = await this.$queryRaw(query, params);
        return result;
      }
    };
  }
}
