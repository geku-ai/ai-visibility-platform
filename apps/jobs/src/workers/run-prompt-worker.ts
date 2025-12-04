/**
 * RunPrompt worker
 * Executes individual prompt runs with providers
 */

import { Worker, Job } from 'bullmq';
import { Pool } from 'pg';
import { createProvider } from '@ai-visibility/providers';
import { EngineKey, ExtractionCacheService, ComplexityRouterService, ExtractionComplexity, LLMStructuredExtractionService, Sentiment } from '@ai-visibility/shared';
import { extractMentions, extractAllBrandMentions, extractCitations, classifySentiment, Mention } from '@ai-visibility/parser';
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
  private extractionCache: ExtractionCacheService;
  private complexityRouter: ComplexityRouterService;
  private llmExtractionService: LLMStructuredExtractionService;

  constructor(connection: any) {
    this.dbPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
    
    // Initialize extraction cache
    this.extractionCache = new ExtractionCacheService();
    
    // Initialize complexity router
    this.complexityRouter = new ComplexityRouterService();
    
    // Initialize LLM structured extraction service
    this.llmExtractionService = new LLMStructuredExtractionService();
    
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
        // Retry logic: workspace might not be committed yet when job starts
        let workspaceRetries = 3;
        let workspaceFound = false;
        
        while (workspaceRetries > 0 && !workspaceFound) {
          try {
            const workspaceResult = await this.dbPool.query(
              'SELECT "brandName", "primaryDomain" FROM "workspaces" WHERE id = $1',
              [workspaceId]
            );
            if (workspaceResult.rows.length > 0) {
              const workspace = workspaceResult.rows[0];
              workspaceFound = true;
              
              // Add brand name if available
              if (workspace.brandName) {
                brandsToSearch.push(workspace.brandName);
                // Also add capitalized version for better matching
                const capitalized = workspace.brandName.charAt(0).toUpperCase() + workspace.brandName.slice(1).toLowerCase();
                if (capitalized !== workspace.brandName.toLowerCase()) {
                  brandsToSearch.push(capitalized);
                }
              }
              // Add domain if available
              if (workspace.primaryDomain) {
                // Extract domain without protocol (e.g., "booking.com" from "https://booking.com")
                const domain = workspace.primaryDomain.replace(/^https?:\/\//, '').replace(/^www\./, '');
                brandsToSearch.push(domain);
                // Also add capitalized version
                const domainCapitalized = domain.charAt(0).toUpperCase() + domain.slice(1);
                if (domainCapitalized !== domain.toLowerCase()) {
                  brandsToSearch.push(domainCapitalized);
                }
                // Also add the brand name if domain contains it (e.g., "booking" from "booking.com")
                const domainParts = domain.split('.');
                if (domainParts.length > 0) {
                  const baseDomain = domainParts[0];
                  brandsToSearch.push(baseDomain);
                  // Add capitalized version
                  const baseCapitalized = baseDomain.charAt(0).toUpperCase() + baseDomain.slice(1);
                  if (baseCapitalized !== baseDomain.toLowerCase()) {
                    brandsToSearch.push(baseCapitalized);
                  }
                }
              }
              
              console.log(`[RunPromptWorker] Retrieved ${brandsToSearch.length} brand(s) from workspace: ${brandsToSearch.join(', ')}`);
            } else {
              workspaceRetries--;
              if (workspaceRetries > 0) {
                console.warn(`[RunPromptWorker] Workspace ${workspaceId} not found, retrying in 500ms... (${workspaceRetries} retries left)`);
                await new Promise(resolve => setTimeout(resolve, 500));
              }
            }
          } catch (error) {
            workspaceRetries--;
            if (workspaceRetries > 0) {
              console.warn(`[RunPromptWorker] Failed to get workspace info, retrying in 500ms... (${workspaceRetries} retries left): ${error instanceof Error ? error.message : String(error)}`);
              await new Promise(resolve => setTimeout(resolve, 500));
            } else {
              console.warn(`[RunPromptWorker] Failed to get workspace info for mention extraction after retries: ${error instanceof Error ? error.message : String(error)}`);
            }
          }
        }
      }
      
      // Check cache first (Option 1: Quick win for cost savings)
      const cachedResult = await this.extractionCache.getCachedExtraction<{
        mentions: Mention[];
        citations: any[];
        sentiment: any;
      }>(result.answerText, promptId, engineKey);
      
      let allMentions: Mention[];
      let citations: any[];
      let sentiment: any;
      
      if (cachedResult.hit && cachedResult.data) {
        // Use cached extraction results
        console.log(`[RunPromptWorker] Cache HIT for extraction (key: ${cachedResult.cacheKey})`);
        allMentions = cachedResult.data.mentions || [];
        citations = cachedResult.data.citations || [];
        sentiment = cachedResult.data.sentiment || { sentiment: 'NEU' };
      } else {
        // Cache miss - perform extraction
        console.log(`[RunPromptWorker] Cache MISS - performing extraction (key: ${cachedResult.cacheKey})`);
        
        // Analyze complexity to determine extraction strategy
        const complexityAnalysis = this.complexityRouter.analyzeComplexity(result.answerText, prompt.text);
        console.log(`[RunPromptWorker] Complexity: ${complexityAnalysis.complexity} (confidence: ${complexityAnalysis.confidence.toFixed(2)}, cost: $${complexityAnalysis.estimatedCost.toFixed(4)})`);
        console.log(`[RunPromptWorker] Reasoning: ${complexityAnalysis.reasoning}`);
        
        // Log brands being searched for debugging
        if (brandsToSearch.length > 0) {
          console.log(`[RunPromptWorker] Searching for mentions of brands: ${brandsToSearch.join(', ')}`);
        } else {
          console.warn(`[RunPromptWorker] No brands found for mention extraction (workspaceId: ${workspaceId}, demoRunId: ${demoRunId || 'none'})`);
        }

        // Route to appropriate extraction method based on complexity
        let extractionModel = 'rule-based';
        if (complexityAnalysis.complexity === ExtractionComplexity.SIMPLE) {
          // Simple: Use free rule-based extraction
          console.log(`[RunPromptWorker] Using rule-based extraction (FREE)`);
          
          // Parse results - pass brands to extractMentions so it can find them
          const mentions = extractMentions(result.answerText, brandsToSearch, {
            minConfidence: 0.4, // Lower threshold to catch more mentions
          });
          
          // Also extract ALL potential brand mentions from the text
          const allBrandMentions = extractAllBrandMentions(result.answerText, brandsToSearch, {
            minLength: 3,
            contextWindow: 120,
          });
          
          // Combine mentions, deduplicate by brand name and position
          const mentionMap = new Map<string, Mention>();
          for (const mention of mentions) {
            const key = `${mention.brand.toLowerCase()}_${mention.position || 0}`;
            mentionMap.set(key, mention);
          }
          for (const mention of allBrandMentions) {
            const key = `${mention.brand.toLowerCase()}_${mention.position || 0}`;
            if (!mentionMap.has(key)) {
              mentionMap.set(key, mention);
            }
          }
          allMentions = Array.from(mentionMap.values());
          
          // Extract citations and sentiment
          citations = extractCitations(result.answerText, {});
          sentiment = classifySentiment(result.answerText);
        } else {
          // Medium/Complex: Use LLM structured extraction
          const model = complexityAnalysis.complexity === ExtractionComplexity.COMPLEX ? 'gpt-4o' : 'gpt-4o-mini';
          console.log(`[RunPromptWorker] Using LLM structured extraction (${model}, cost: $${complexityAnalysis.estimatedCost.toFixed(4)})`);
          
          // Try LLM extraction with multiple providers (Anthropic → OpenAI → Gemini → rule-based)
          // Model names: Use latest stable versions, configurable via env vars
          // Anthropic: Claude 3.7 Sonnet (complex) / Claude 3.7 Haiku (medium) - fallback to 3.5 if 3.7 unavailable
          // OpenAI: GPT-4o (complex) / GPT-4o-mini (medium)
          // Gemini: Gemini 2.0 Pro (latest) - fallback to 1.5 Pro if 2.0 unavailable
          let structuredExtraction: any = null;
          let extractionAttempted = false;
          
          // Determine Anthropic model with fallbacks
          // Use model names without dates for stability (Anthropic supports both)
          const getAnthropicModel = (): string => {
            if (model === 'gpt-4o') {
              // Complex: Try Claude 3.5 Sonnet (stable name), fallback to 3.0 Sonnet
              return process.env.ANTHROPIC_SONNET_MODEL || 'claude-3-5-sonnet';
            } else {
              // Medium: Use Claude 3 Haiku (stable name)
              return process.env.ANTHROPIC_HAIKU_MODEL || 'claude-3-haiku';
            }
          };
          
          // Determine Gemini model with fallbacks
          const getGeminiModel = (): string => {
            return process.env.GEMINI_MODEL || 'gemini-1.5-pro'; // Using 1.5 Pro as 2.0 IDs not confirmed
          };
          
          const providers = [
            { 
              key: 'ANTHROPIC', 
              envKey: 'ANTHROPIC_API_KEY', 
              model: getAnthropicModel(), 
              name: 'Anthropic',
              fallbackModels: model === 'gpt-4o' 
                ? ['claude-3-5-sonnet-20241022', 'claude-3-sonnet-20240229', 'claude-3-sonnet'] 
                : ['claude-3-haiku-20240307', 'claude-3-haiku']
            },
            { key: 'OPENAI', envKey: 'OPENAI_API_KEY', model: model, name: 'OpenAI' },
            { 
              key: 'GEMINI', 
              envKey: 'GEMINI_API_KEY', 
              model: getGeminiModel(), 
              name: 'Gemini',
              fallbackModels: ['gemini-1.5-pro', 'gemini-1.5-flash']
            },
          ];
          
          for (const providerConfig of providers) {
            const apiKey = process.env[providerConfig.envKey];
            
            if (!apiKey || apiKey.trim().length < 10) {
              console.log(`[RunPromptWorker] ${providerConfig.name} not available (missing or invalid API key)`);
              continue;
            }
            
            // Try primary model, then fallback models if available
            const modelsToTry = [providerConfig.model, ...(providerConfig.fallbackModels || [])];
            
            for (const modelToTry of modelsToTry) {
              try {
                console.log(`[RunPromptWorker] Attempting LLM extraction with ${providerConfig.name} (${modelToTry})`);
                extractionAttempted = true;
                
                const extractionProvider = createProvider(providerConfig.key as EngineKey, { apiKey });
                extractionModel = modelToTry;
                
                // Perform LLM structured extraction
                // LLM providers use query(), search providers use ask()
                structuredExtraction = await this.llmExtractionService.extract(
                  result.answerText,
                  prompt.text,
                  async (extractionPrompt: string) => {
                    // Check if provider has query() method (LLM providers) or ask() method (search providers)
                    if (typeof (extractionProvider as any).query === 'function') {
                      // LLM provider - use query() and normalize response
                      const llmResponse = await (extractionProvider as any).query(extractionPrompt, {
                        model: extractionModel,
                        temperature: 0.3,
                      });
                      // Normalize LLM response to match ask() format
                      return { answerText: llmResponse.content || llmResponse.answer || '' };
                    } else if (typeof extractionProvider.ask === 'function') {
                      // Search provider - use ask()
                      const extractionResult = await extractionProvider.ask(extractionPrompt);
                      return { answerText: extractionResult.answerText };
                    } else {
                      throw new Error(`Provider ${providerConfig.name} has neither ask() nor query() method`);
                    }
                  },
                  {
                    model: extractionModel as any,
                    brandsToSearch,
                    minConfidence: 0.5,
                    includeInsights: true,
                  }
                );
                
                // Validate extraction result - must have at least mentions array WITH CONTENT
                // Only consider it successful if we have mentions OR competitors (not empty)
                if (structuredExtraction && Array.isArray(structuredExtraction.mentions)) {
                  const mentionCount = structuredExtraction.mentions.length;
                  const competitorCount = structuredExtraction.competitors?.length || 0;
                  
                  // CRITICAL: Only consider successful if we actually extracted something
                  if (mentionCount > 0 || competitorCount > 0) {
                    console.log(`[RunPromptWorker] ✅ Successfully extracted with ${providerConfig.name} (${modelToTry}): ${mentionCount} mentions, ${competitorCount} competitors`);
                    break; // Success - exit both loops
                  } else {
                    // Empty extraction - treat as failure
                    console.warn(`[RunPromptWorker] ⚠️ ${providerConfig.name} (${modelToTry}) returned empty extraction (0 mentions, 0 competitors), trying fallback...`);
                    structuredExtraction = null; // Reset to null so we try next model
                    if (modelsToTry.indexOf(modelToTry) < modelsToTry.length - 1) {
                      continue; // Try next fallback model
                    } else {
                      break; // No more fallback models, try next provider
                    }
                  }
                } else {
                  // Invalid extraction result - treat as failure and try next model/provider
                  console.warn(`[RunPromptWorker] ⚠️ ${providerConfig.name} (${modelToTry}) returned invalid extraction result, trying fallback...`);
                  structuredExtraction = null; // Reset to null so we try next model
                  if (modelsToTry.indexOf(modelToTry) < modelsToTry.length - 1) {
                    continue; // Try next fallback model
                  } else {
                    break; // No more fallback models, try next provider
                  }
                }
                
              } catch (modelError) {
                const errorMsg = modelError instanceof Error ? modelError.message : String(modelError);
                const is404 = errorMsg.includes('404') || errorMsg.includes('not found') || errorMsg.includes('not_found');
                
                if (is404 && modelsToTry.indexOf(modelToTry) < modelsToTry.length - 1) {
                  // 404 error and more fallback models available - try next model
                  console.log(`[RunPromptWorker] Model ${modelToTry} not found (404), trying fallback...`);
                  continue;
                } else {
                  // Other error or last model - log and try next provider
                  console.warn(`[RunPromptWorker] ❌ ${providerConfig.name} (${modelToTry}) extraction failed: ${errorMsg}`);
                  break; // Exit model loop, try next provider
                }
              }
            }
            
            // If we got here and have a successful extraction WITH CONTENT, exit provider loop
            // Double-check that extraction has actual content (not just empty arrays)
            if (structuredExtraction && 
                Array.isArray(structuredExtraction.mentions) && 
                (structuredExtraction.mentions.length > 0 || (structuredExtraction.competitors?.length || 0) > 0)) {
              break;
            } else {
              // Reset to null if empty, so we fall back to rule-based
              structuredExtraction = null;
            }
          }
          
          // If all LLM providers failed, fall back to rule-based
          if (!structuredExtraction) {
            if (extractionAttempted) {
              console.warn(`[RunPromptWorker] All LLM providers failed, falling back to rule-based extraction`);
            } else {
              console.warn(`[RunPromptWorker] No LLM providers available, using rule-based extraction`);
            }
            
            // Fallback to rule-based extraction
            const mentions = extractMentions(result.answerText, brandsToSearch, {
              minConfidence: 0.4,
            });
            const allBrandMentions = extractAllBrandMentions(result.answerText, brandsToSearch, {
              minLength: 3,
              contextWindow: 120,
            });
            const mentionMap = new Map<string, Mention>();
            for (const mention of mentions) {
              const key = `${mention.brand.toLowerCase()}_${mention.position || 0}`;
              mentionMap.set(key, mention);
            }
            for (const mention of allBrandMentions) {
              const key = `${mention.brand.toLowerCase()}_${mention.position || 0}`;
              if (!mentionMap.has(key)) {
                mentionMap.set(key, mention);
              }
            }
            allMentions = Array.from(mentionMap.values());
            citations = extractCitations(result.answerText, {});
            sentiment = classifySentiment(result.answerText);
            extractionModel = 'rule-based-fallback';
          } else {
            // LLM extraction succeeded - convert to Mention[] format
            try {
              // Validate extraction has valid structure
              if (!structuredExtraction || !Array.isArray(structuredExtraction.mentions)) {
                throw new Error('Invalid extraction result structure');
              }
            
              // Convert structured extraction to Mention[] format
              const mapSentiment = (sentiment: string): Sentiment => {
                if (sentiment === 'positive') return Sentiment.POS;
                if (sentiment === 'negative') return Sentiment.NEG;
                return Sentiment.NEU;
              };
              
              allMentions = (structuredExtraction.mentions || []).map((m) => ({
                brand: m.brand,
                position: m.position,
                confidence: m.confidence,
                snippet: m.snippet || m.context?.substring(0, 200) || '',
                sentiment: mapSentiment(m.sentiment || 'neutral'),
              } as Mention));
              
              // Add competitor mentions
              if (Array.isArray(structuredExtraction.competitors)) {
                for (const competitor of structuredExtraction.competitors) {
                  if (competitor.contexts && Array.isArray(competitor.contexts)) {
                    for (const context of competitor.contexts) {
                      allMentions.push({
                        brand: competitor.brand,
                        position: undefined,
                        confidence: competitor.confidence || 0.5,
                        snippet: context.substring(0, 200) || '',
                        sentiment: Sentiment.NEU, // Default to neutral for competitors
                      } as Mention);
                    }
                  }
                }
              }
              
              // Extract citations and sentiment (still use rule-based for these)
              citations = extractCitations(result.answerText, {});
              sentiment = classifySentiment(result.answerText);
              
              const competitorCount = structuredExtraction.competitors?.length || 0;
              const insightCount = structuredExtraction.insights?.length || 0;
              console.log(`[RunPromptWorker] LLM extraction found ${allMentions.length} mentions, ${competitorCount} competitors, ${insightCount} insights`);
              
              // If LLM extraction found no mentions but brands exist in text, fall back to rule-based
              if (allMentions.length === 0 && brandsToSearch.length > 0) {
                const brandInText = brandsToSearch.some(brand => 
                  result.answerText.toLowerCase().includes(brand.toLowerCase())
                );
                if (brandInText) {
                  console.warn(`[RunPromptWorker] LLM extraction found 0 mentions but brands exist in text, falling back to rule-based extraction`);
                  throw new Error('LLM extraction returned empty results despite brands in text');
                }
              }
            } catch (conversionError) {
              console.error(`[RunPromptWorker] Failed to convert LLM extraction results, falling back to rule-based:`, conversionError);
              // Fallback to rule-based extraction
              const mentions = extractMentions(result.answerText, brandsToSearch, {
                minConfidence: 0.4,
              });
              const allBrandMentions = extractAllBrandMentions(result.answerText, brandsToSearch, {
                minLength: 3,
                contextWindow: 120,
              });
              const mentionMap = new Map<string, Mention>();
              for (const mention of mentions) {
                const key = `${mention.brand.toLowerCase()}_${mention.position || 0}`;
                mentionMap.set(key, mention);
              }
              for (const mention of allBrandMentions) {
                const key = `${mention.brand.toLowerCase()}_${mention.position || 0}`;
                if (!mentionMap.has(key)) {
                  mentionMap.set(key, mention);
                }
              }
              allMentions = Array.from(mentionMap.values());
              citations = extractCitations(result.answerText, {});
              sentiment = classifySentiment(result.answerText);
              extractionModel = 'rule-based-fallback';
            }
          }
        }
        
        // Log mention extraction results for debugging
        if (allMentions.length > 0) {
          const foundBrands = [...new Set(allMentions.map(m => m.brand))];
          const mainBrandMentions = allMentions.filter(m => brandsToSearch.some(b => b.toLowerCase() === m.brand.toLowerCase()));
          const competitorMentions = allMentions.filter(m => !brandsToSearch.some(b => b.toLowerCase() === m.brand.toLowerCase()));
          console.log(`[RunPromptWorker] Found ${allMentions.length} total mention(s) (${mainBrandMentions.length} main brand, ${competitorMentions.length} competitors)`);
          console.log(`[RunPromptWorker] Mentioned brands in response: ${foundBrands.join(', ')}`);
          if (competitorMentions.length > 0) {
            const competitorBrands = [...new Set(competitorMentions.map(m => m.brand))];
            console.log(`[RunPromptWorker] Competitor brands found: ${competitorBrands.join(', ')}`);
          }
          console.log(`[RunPromptWorker] Brand confidence scores: ${allMentions.map(m => `${m.brand}:${m.confidence.toFixed(2)}`).join(', ')}`);
        } else if (brandsToSearch.length > 0) {
          console.warn(`[RunPromptWorker] No mentions found in response (length: ${result.answerText.length} chars) for brands: ${brandsToSearch.join(', ')}`);
          // Log a sample of the response for debugging (first 500 chars to see more context)
          const sample = result.answerText.substring(0, 500).replace(/\n/g, ' ');
          console.warn(`[RunPromptWorker] Response sample: ${sample}...`);
          // Also check if any brand name appears in the response (case-insensitive)
          const responseLower = result.answerText.toLowerCase();
          const foundInText = brandsToSearch.filter(brand => responseLower.includes(brand.toLowerCase()));
          if (foundInText.length > 0) {
            console.warn(`[RunPromptWorker] Brand names found in text (but not extracted as mentions): ${foundInText.join(', ')}`);
            console.warn(`[RunPromptWorker] This suggests the confidence threshold (0.4) might be too high or the matching logic needs improvement`);
          } else {
            console.warn(`[RunPromptWorker] None of the brand names appear in the response text at all`);
          }
        }
        
        // Store in cache for future use
        await this.extractionCache.storeExtraction(
          result.answerText,
          promptId,
          engineKey,
          {
            mentions: allMentions,
            citations,
            sentiment,
          },
          {
            extractionModel: extractionModel,
            extractionTimestamp: new Date().toISOString(),
            confidence: complexityAnalysis.complexity === ExtractionComplexity.SIMPLE ? 0.8 : 0.9,
          }
        );
      }

      // Create answer
      const answer = await prisma.answer.create({
        data: {
          promptRunId: promptRun.id,
          rawText: result.answerText,
          jsonPayload: result.meta,
        },
      });

      // Create mentions (use allMentions which includes competitors)
      let mentionsCreated = 0;
      for (const mention of allMentions) {
        try {
          await prisma.mention.create({
            data: {
              answerId: answer.id,
              brand: mention.brand,
              position: mention.position,
              sentiment: mention.sentiment,
              snippet: mention.snippet || '', // Ensure snippet is not null
            },
          });
          mentionsCreated++;
        } catch (error) {
          console.error(`[RunPromptWorker] Failed to create mention for brand "${mention.brand}": ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      
      if (mentionsCreated > 0) {
        console.log(`[RunPromptWorker] Created ${mentionsCreated} mention(s) in database for answer ${answer.id}`);
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
