/**
 * RunPrompt worker
 * Executes individual prompt runs with providers
 */

import { Worker, Job } from 'bullmq';
import { Pool } from 'pg';
import { createProvider } from '@ai-visibility/providers';
import { EngineKey } from '@ai-visibility/shared';
import { extractMentions, extractCitations, classifySentiment } from '@ai-visibility/parser';
import { HallucinationDetectorService } from '@ai-visibility/geo';
// @ts-ignore - Workspace package resolution
import { prisma } from '@ai-visibility/db';
import { RunPromptPayload } from '../queues';
import { createHash } from 'crypto';

export interface ClusterScanPayload {
  workspaceId: string;
  clusterId: string;
  engineKeys: EngineKey[];
  idempotencyKey: string;
  userId: string;
  maxPromptsPerCluster?: number;
}

export class RunPromptWorker {
  private worker: Worker;
  private dbPool: Pool;
  private hallucinationDetector: HallucinationDetectorService;

  constructor(connection: any) {
    this.dbPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
    
    // Initialize hallucination detector (optional - will gracefully fail if dependencies missing)
    // Note: Jobs service is not NestJS, so we can't use DI. Hallucination detection will be skipped.
    this.hallucinationDetector = null as any; // Disabled for now - requires NestJS DI
    
    this.worker = new Worker(
      'runPrompt',
      this.processJob.bind(this),
      {
        connection,
        concurrency: 5,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      }
    );

    this.setupEventHandlers();
  }

  private async processJob(job: Job<RunPromptPayload | ClusterScanPayload>): Promise<void> {
    console.log(`[RunPromptWorker] Received job ${job.id} of type ${'clusterId' in job.data ? 'clusterScan' : 'individualPrompt'}`);
    
    // Check if this is a cluster scan or individual prompt
    if ('clusterId' in job.data) {
      return this.processClusterScan(job as Job<ClusterScanPayload>);
    } else {
      return this.processIndividualPrompt(job as Job<RunPromptPayload>);
    }
  }

  /**
   * Process cluster-based scanning
   */
  private async processClusterScan(job: Job<ClusterScanPayload>): Promise<void> {
    const { workspaceId, clusterId, engineKeys, idempotencyKey, userId, maxPromptsPerCluster = 10 } = job.data;
    
    console.log(`Processing cluster scan: ${clusterId} with engines: ${engineKeys.join(', ')}`);
    
    try {
      // Get cluster prompts
      const clusterResult = await this.dbPool.query(
        'SELECT * FROM "prompt_clusters" WHERE id = $1 AND "workspaceId" = $2',
        [clusterId, workspaceId]
      );
      const cluster = clusterResult.rows[0];
      
      if (!cluster) {
        throw new Error(`Cluster not found: ${clusterId}`);
      }

      // Select top prompts from cluster
      const prompts = cluster.prompts.slice(0, maxPromptsPerCluster);
      
      // Create individual prompt runs for each prompt-engine combination
      const promptRuns = [];
      
      for (const promptText of prompts) {
        for (const engineKey of engineKeys) {
          const promptRunIdempotencyKey = `${idempotencyKey}:${promptText}:${engineKey}`;
          
          // Check if prompt run already exists
          const existingRun = await this.dbPool.query(
            'SELECT id FROM "prompt_runs" WHERE "idempotencyKey" = $1',
            [promptRunIdempotencyKey]
          );
          
          if (existingRun.rows.length > 0) {
            console.log(`Prompt run already exists: ${promptRunIdempotencyKey}`);
            continue;
          }

          // Create or get prompt
          const promptId = await this.getOrCreatePrompt(workspaceId, promptText, cluster.intent);
          
          // Create prompt run
          const promptRun = await this.dbPool.query(
            `INSERT INTO "prompt_runs" 
             ("workspaceId", "promptId", "engineId", "idempotencyKey", "status", "startedAt")
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [workspaceId, promptId, clusterId, promptRunIdempotencyKey, 'PENDING', new Date()]
          );

          promptRuns.push(promptRun.rows[0]);
        }
      }

      console.log(`Created ${promptRuns.length} prompt runs for cluster ${clusterId}`);
      
    } catch (error) {
      console.error(`Cluster scan failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Process individual prompt
   */
  private async processIndividualPrompt(job: Job<RunPromptPayload>): Promise<void> {
    const { workspaceId, promptId, engineKey, idempotencyKey, userId, demoRunId } = job.data;
    
    console.log(`[RunPromptWorker] Starting job ${job.id} - promptId: ${promptId}, engineKey: ${engineKey}, idempotencyKey: ${idempotencyKey}, demoRunId: ${demoRunId || 'none'}`);
    
    try {
      // Check idempotency
      const existingRunResult = await this.dbPool.query(
        'SELECT id FROM "prompt_runs" WHERE "idempotencyKey" = $1',
        [idempotencyKey]
      );
      
      if (existingRunResult.rows.length > 0) {
        console.log(`Prompt run already exists: ${idempotencyKey}`);
        return;
      }

      // Get prompt and engine
      const promptResult = await this.dbPool.query(
        'SELECT * FROM "prompts" WHERE id = $1',
        [promptId]
      );
      const prompt = promptResult.rows[0];
      
      if (!prompt) {
        throw new Error(`Prompt not found: ${promptId}`);
      }

      const engineResult = await this.dbPool.query(
        'SELECT * FROM "engines" WHERE "workspaceId" = $1 AND key = $2 AND enabled = true',
        [workspaceId, engineKey]
      );
      const engine = engineResult.rows[0];
      
      if (!engine) {
        throw new Error(`Engine not found or disabled: ${engineKey}`);
      }

      // Check budget
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const todayRuns = await prisma.promptRun.findMany({
        where: {
          workspaceId,
          engineId: engine.id,
          startedAt: { gte: today },
        },
      });
      
      const todayCost = todayRuns.reduce((sum, run) => sum + run.costCents, 0);
      
      if (todayCost >= engine.dailyBudgetCents) {
        throw new Error(`Daily budget exceeded for engine ${engineKey}`);
      }

      // Create prompt run
      const promptRun = await prisma.promptRun.create({
        data: {
          workspaceId,
          promptId,
          engineId: engine.id,
          idempotencyKey,
          status: 'PENDING',
          startedAt: new Date(),
        },
      });

      // Get provider
      // AIO uses SERPAPI_KEY instead of AIO_API_KEY
      let apiKeyEnvVar = `${engineKey}_API_KEY`;
      if (engineKey === 'AIO') {
        apiKeyEnvVar = 'SERPAPI_KEY';
      }
      const apiKey = process.env[apiKeyEnvVar];
      
      if (!apiKey) {
        const errorMsg = `Missing API key for engine ${engineKey}. Please set ${apiKeyEnvVar} environment variable in the jobs service.`;
        console.error(`[RunPromptWorker] ${errorMsg}`);
        throw new Error(errorMsg);
      }

      // Validate API key format (basic check - not empty, has reasonable length)
      if (apiKey.trim().length < 10) {
        const errorMsg = `Invalid API key format for engine ${engineKey}. The ${apiKeyEnvVar} appears to be too short or invalid.`;
        console.error(`[RunPromptWorker] ${errorMsg}`);
        throw new Error(errorMsg);
      }

      const provider = createProvider(engineKey as EngineKey, {
        apiKey,
      });

      // Execute prompt
      const startTime = Date.now();
      let result;
      try {
        result = await provider.ask(prompt.text);
      } catch (providerError) {
        const errorMessage = providerError instanceof Error ? providerError.message : String(providerError);
        
        // Check if this is an authentication error
        const isAuthError = providerError instanceof Error && 
          ((providerError as any).isAuthError || 
           errorMessage.includes('401') || 
           errorMessage.includes('authentication') ||
           errorMessage.includes('Authorization Required'));
        
        if (isAuthError) {
          const authErrorMsg = `Provider ${engineKey} authentication failed. The API key may be invalid, expired, or revoked. Please verify your ${apiKeyEnvVar} environment variable. Original error: ${errorMessage}`;
          console.error(`[RunPromptWorker] ${authErrorMsg}`);
          throw new Error(authErrorMsg);
        }
        
        // Re-throw other errors with context
        const contextualError = new Error(`Provider ${engineKey} failed to execute prompt: ${errorMessage}`);
        console.error(`[RunPromptWorker] Provider execution failed:`, {
          engineKey,
          promptId,
          error: errorMessage,
          isAuthError,
        });
        throw contextualError;
      }
      const executionTime = Date.now() - startTime;

      // Get brand/domain from demo run OR workspace (for instant summary)
      let brandsToSearch: string[] = [];
      
      // First try demo run (for legacy demo jobs)
      if (demoRunId) {
        try {
          const demoRunResult = await this.dbPool.query(
            'SELECT "brand", "domain" FROM "demo_runs" WHERE id = $1',
            [demoRunId]
          );
          if (demoRunResult.rows.length > 0) {
            const demoRun = demoRunResult.rows[0];
            // Add brand and domain (without protocol) to search list
            if (demoRun.brand) {
              brandsToSearch.push(demoRun.brand);
            }
            if (demoRun.domain) {
              // Extract domain without protocol (e.g., "airbnb.com" from "https://airbnb.com")
              const domain = demoRun.domain.replace(/^https?:\/\//, '').replace(/^www\./, '');
              brandsToSearch.push(domain);
              // Also add the brand name if domain contains it (e.g., "airbnb" from "airbnb.com")
              const domainParts = domain.split('.');
              if (domainParts.length > 0) {
                brandsToSearch.push(domainParts[0]);
              }
            }
          }
        } catch (error) {
          console.warn(`Failed to get demo run info for mention extraction: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      
      // If no brands found from demo run, try workspace (for instant summary)
      if (brandsToSearch.length === 0) {
        try {
          const workspaceResult = await this.dbPool.query(
            'SELECT "brandName", "primaryDomain" FROM "workspaces" WHERE id = $1',
            [workspaceId]
          );
          if (workspaceResult.rows.length > 0) {
            const workspace = workspaceResult.rows[0];
            // Add brand name if available
            if (workspace.brandName) {
              brandsToSearch.push(workspace.brandName);
            }
            // Add domain if available
            if (workspace.primaryDomain) {
              // Extract domain without protocol (e.g., "booking.com" from "https://booking.com")
              const domain = workspace.primaryDomain.replace(/^https?:\/\//, '').replace(/^www\./, '');
              brandsToSearch.push(domain);
              // Also add the brand name if domain contains it (e.g., "booking" from "booking.com")
              const domainParts = domain.split('.');
              if (domainParts.length > 0) {
                brandsToSearch.push(domainParts[0]);
              }
            }
          }
        } catch (error) {
          console.warn(`Failed to get workspace info for mention extraction: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      
      // Log brands being searched for debugging
      if (brandsToSearch.length > 0) {
        console.log(`[RunPromptWorker] Searching for mentions of brands: ${brandsToSearch.join(', ')}`);
      } else {
        console.warn(`[RunPromptWorker] No brands found for mention extraction (workspaceId: ${workspaceId}, demoRunId: ${demoRunId || 'none'})`);
      }

      // Parse results - pass brands to extractMentions so it can find them
      const mentions = extractMentions(result.answerText, brandsToSearch, {});
      const citations = extractCitations(result.answerText, {});
      const sentiment = classifySentiment(result.answerText);

      // Create answer
      const answer = await prisma.answer.create({
        data: {
          promptRunId: promptRun.id,
          rawText: result.answerText,
          jsonPayload: result.meta,
        },
      });

      // Create mentions
      for (const mention of mentions) {
        await prisma.mention.create({
          data: {
            answerId: answer.id,
            brand: mention.brand,
            position: mention.position,
            sentiment: mention.sentiment,
            snippet: mention.snippet,
          },
        });
      }

      // Create citations
      for (const citation of citations) {
        await prisma.citation.create({
          data: {
            answerId: answer.id,
            url: citation.url,
            domain: citation.domain,
            rank: citation.rank,
            confidence: citation.confidence,
          },
        });
      }

      // Detect hallucinations
      try {
        await this.detectHallucinations(workspaceId, result.answerText, engineKey, promptId);
      } catch (hallucinationError) {
        console.warn(`Hallucination detection failed: ${hallucinationError.message}`);
        // Don't fail the job if hallucination detection fails
      }

      // Update prompt run
      await prisma.promptRun.update({
        where: { id: promptRun.id },
        data: {
          status: 'SUCCESS',
          finishedAt: new Date(),
          costCents: result.costCents || 0,
          // Note: avgLatencyMs is stored on Engine, not PromptRun
        },
      });

      // Update engine
      await prisma.engine.update({
        where: { id: engine.id },
        data: {
          lastRunAt: new Date(),
          avgLatencyMs: executionTime,
        },
      });

      console.log(`Prompt run completed: ${promptRun.id}`);

      if (demoRunId) {
        await this.markDemoRunJobSuccess(demoRunId);
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      // Determine error category for better diagnostics
      const isAuthError = errorMessage.includes('authentication') || 
                         errorMessage.includes('401') || 
                         errorMessage.includes('Authorization Required') ||
                         errorMessage.includes('API key');
      const isRateLimit = errorMessage.includes('rate limit') || 
                         errorMessage.includes('429') ||
                         errorMessage.includes('quota');
      const isNetworkError = errorMessage.includes('network') || 
                            errorMessage.includes('timeout') ||
                            errorMessage.includes('ECONNREFUSED');
      
      console.error(`[RunPromptWorker] Prompt run failed for ${idempotencyKey}:`, {
        error: errorMessage,
        stack: errorStack,
        workspaceId,
        promptId,
        engineKey,
        demoRunId,
        errorCategory: isAuthError ? 'AUTHENTICATION' : isRateLimit ? 'RATE_LIMIT' : isNetworkError ? 'NETWORK' : 'OTHER',
        diagnostic: isAuthError 
          ? `⚠️ API key issue detected for ${engineKey}. Check your ${engineKey === 'AIO' ? 'SERPAPI_KEY' : `${engineKey}_API_KEY`} environment variable.`
          : isRateLimit
          ? `⚠️ Rate limit hit for ${engineKey}. Consider adding more API keys or reducing request frequency.`
          : isNetworkError
          ? `⚠️ Network issue with ${engineKey}. Check connectivity and provider status.`
          : `⚠️ Provider ${engineKey} failed. Review error message for details.`,
      });
      
      // Update prompt run with error
      try {
        await prisma.promptRun.update({
          where: { idempotencyKey },
          data: {
            status: 'FAILED',
            finishedAt: new Date(),
            errorMsg: errorMessage,
          },
        });
      } catch (updateError) {
        const message = updateError instanceof Error ? updateError.message : String(updateError);
        console.warn(`[RunPromptWorker] Unable to persist prompt run failure for ${idempotencyKey}: ${message}`);
      }

      if (demoRunId) {
        await this.markDemoRunJobFailure(demoRunId);
      }

      throw error;
    }
  }

  private async markDemoRunJobSuccess(demoRunId: string): Promise<void> {
    try {
      await this.dbPool.query(
        `UPDATE "demo_runs"
         SET "analysisJobsCompleted" = COALESCE("analysisJobsCompleted", 0) + 1,
             "progress" = LEAST(
               100,
               CASE
                 WHEN COALESCE("analysisJobsTotal", 0) = 0 THEN GREATEST("progress", 95)
                 ELSE GREATEST(
                   "progress",
                   80 + COALESCE(ROUND(((COALESCE("analysisJobsCompleted", 0) + 1)::numeric / NULLIF("analysisJobsTotal", 0)) * 20)::int, 0)
                 )
               END
             ),
             "status" = CASE
               WHEN COALESCE("analysisJobsTotal", 0) > 0
                    AND (COALESCE("analysisJobsCompleted", 0) + 1 + COALESCE("analysisJobsFailed", 0)) >= "analysisJobsTotal"
                 THEN 'analysis_complete'
               ELSE "status"
             END,
             "updatedAt" = NOW()
         WHERE "id" = $1`,
        [demoRunId]
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`Failed to update demo run success metrics for ${demoRunId}: ${message}`);
    }
  }

  private async markDemoRunJobFailure(demoRunId: string): Promise<void> {
    try {
      await this.dbPool.query(
        `UPDATE "demo_runs"
         SET "analysisJobsFailed" = COALESCE("analysisJobsFailed", 0) + 1,
             "progress" = LEAST(
               100,
               CASE
                 WHEN COALESCE("analysisJobsTotal", 0) = 0 THEN GREATEST("progress", 95)
                 ELSE GREATEST(
                   "progress",
                   80 + COALESCE(ROUND(((COALESCE("analysisJobsCompleted", 0) + COALESCE("analysisJobsFailed", 0) + 1)::numeric / NULLIF("analysisJobsTotal", 0)) * 20)::int, 0)
                 )
               END
             ),
             "status" = CASE
               WHEN COALESCE("analysisJobsTotal", 0) > 0
                    AND (COALESCE("analysisJobsCompleted", 0) + COALESCE("analysisJobsFailed", 0) + 1) >= "analysisJobsTotal"
                 THEN CASE
                   WHEN COALESCE("analysisJobsCompleted", 0) = 0 THEN 'analysis_failed'
                   ELSE 'analysis_complete'
                 END
               ELSE "status"
             END,
             "updatedAt" = NOW()
         WHERE "id" = $1`,
        [demoRunId]
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`Failed to update demo run failure metrics for ${demoRunId}: ${message}`);
    }
  }

  private setupEventHandlers(): void {
    this.worker.on('completed', (job) => {
      console.log(`Job ${job.id} completed`);
    });

    this.worker.on('failed', (job, err) => {
      const jobData = job?.data as RunPromptPayload | undefined;
      console.error(`[RunPromptWorker] Job ${job?.id} failed:`, {
        jobId: job?.id,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        jobData: jobData ? {
          workspaceId: jobData.workspaceId,
          promptId: jobData.promptId,
          engineKey: jobData.engineKey,
          idempotencyKey: jobData.idempotencyKey,
          demoRunId: jobData.demoRunId,
        } : undefined,
      });
    });

    this.worker.on('error', (err) => {
      console.error('Worker error:', err);
    });
  }

  /**
   * Detect hallucinations in AI response
   */
  private async detectHallucinations(
    workspaceId: string,
    aiResponse: string,
    engineKey: string,
    promptId: string
  ): Promise<void> {
    try {
      // Get workspace profile
      const profileResult = await this.dbPool.query(
        'SELECT * FROM "workspace_profiles" WHERE "workspaceId" = $1',
        [workspaceId]
      );
      
      if (profileResult.rows.length === 0) {
        console.log(`No workspace profile found for ${workspaceId}, skipping hallucination detection`);
        return;
      }
      
      const profile = profileResult.rows[0];
      
      // Skip hallucination detection if detector is not available (jobs service doesn't have NestJS DI)
      if (!this.hallucinationDetector) {
        console.warn('Hallucination detection skipped - detector not available in jobs service');
        return;
      }
      
      // Detect hallucinations
      const alerts = await this.hallucinationDetector.detectHallucinations(
        workspaceId,
        aiResponse,
        engineKey,
        promptId,
        profile,
        {
          minConfidence: 0.7,
          severityThreshold: 'medium'
        }
      );
      
      // Store alerts in database
      for (const alert of alerts) {
        await this.dbPool.query(
          `INSERT INTO "hallucination_alerts" 
           ("workspaceId", "engineKey", "promptId", "factType", "aiStatement", 
            "correctFact", "severity", "status", "confidence", "context", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            alert.workspaceId,
            alert.engineKey,
            alert.promptId,
            alert.factType,
            alert.aiStatement,
            alert.correctFact,
            alert.severity,
            alert.status,
            alert.confidence,
            alert.context,
            alert.createdAt,
            alert.updatedAt
          ]
        );
      }
      
      if (alerts.length > 0) {
        console.log(`Detected ${alerts.length} hallucinations for prompt ${promptId}`);
      }
      
    } catch (error) {
      console.error(`Hallucination detection failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get or create prompt
   */
  private async getOrCreatePrompt(workspaceId: string, text: string, intent: string): Promise<string> {
    // Check if prompt already exists
    const existingPrompt = await this.dbPool.query(
      'SELECT id FROM "prompts" WHERE "workspaceId" = $1 AND text = $2',
      [workspaceId, text]
    );
    
    if (existingPrompt.rows.length > 0) {
      return existingPrompt.rows[0].id;
    }
    
    // Create new prompt
    const newPrompt = await this.dbPool.query(
      `INSERT INTO "prompts" ("workspaceId", text, intent, active, tags)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [workspaceId, text, intent, true, []]
    );
    
    return newPrompt.rows[0].id;
  }

  async close(): Promise<void> {
    await this.worker.close();
  }
}
