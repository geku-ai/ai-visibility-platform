/**
 * Extraction Cache Service
 * Caches LLM response extractions to avoid reprocessing
 * Target: 60-80% cache hit rate
 */

import Redis from 'ioredis';
import { createHash } from 'crypto';
import { createRedisClient } from './redis/create-client';

export interface ExtractionCacheResult<T> {
  hit: boolean;
  data?: T;
  cacheKey: string;
}

export interface ExtractionMetadata {
  extractionModel: string;
  extractionTimestamp: string;
  confidence: number;
  source: 'cache' | 'fresh';
}

export class ExtractionCacheService {
  private redis: Redis;
  private readonly TTL = 86400; // 24 hours
  private readonly CACHE_PREFIX = 'extraction:';

  constructor(redis?: Redis) {
    // Use provided Redis instance or create new one using existing helper
    if (redis) {
      this.redis = redis;
    } else {
      this.redis = createRedisClient('ExtractionCacheService');
    }
  }

  /**
   * Generate cache key from response content
   */
  private generateCacheKey(responseText: string, promptId: string, engineKey: string): string {
    const hash = createHash('sha256')
      .update(`${responseText}:${promptId}:${engineKey}`)
      .digest('hex')
      .substring(0, 16);
    return `${this.CACHE_PREFIX}${hash}`;
  }

  /**
   * Get cached extraction result
   */
  async getCachedExtraction<T>(
    responseText: string,
    promptId: string,
    engineKey: string
  ): Promise<ExtractionCacheResult<T>> {
    try {
      const cacheKey = this.generateCacheKey(responseText, promptId, engineKey);
      const cached = await this.redis.get(cacheKey);

      if (cached) {
        const data = JSON.parse(cached);
        return {
          hit: true,
          data: data.result,
          cacheKey,
        };
      }

      return {
        hit: false,
        cacheKey,
      };
    } catch (error) {
      console.error('[ExtractionCache] Error getting cached extraction:', error);
      return {
        hit: false,
        cacheKey: '',
      };
    }
  }

  /**
   * Store extraction result in cache
   */
  async storeExtraction<T>(
    responseText: string,
    promptId: string,
    engineKey: string,
    result: T,
    metadata?: Partial<ExtractionMetadata>
  ): Promise<void> {
    try {
      const cacheKey = this.generateCacheKey(responseText, promptId, engineKey);
      const cacheData = {
        result,
        metadata: {
          extractionModel: metadata?.extractionModel || 'unknown',
          extractionTimestamp: metadata?.extractionTimestamp || new Date().toISOString(),
          confidence: metadata?.confidence || 1.0,
          source: 'fresh' as const,
        },
      };

      await this.redis.setex(cacheKey, this.TTL, JSON.stringify(cacheData));
    } catch (error) {
      console.error('[ExtractionCache] Error storing extraction:', error);
      // Don't throw - caching is best effort
    }
  }

  /**
   * Invalidate cache for specific response
   */
  async invalidateCache(responseText: string, promptId: string, engineKey: string): Promise<void> {
    try {
      const cacheKey = this.generateCacheKey(responseText, promptId, engineKey);
      await this.redis.del(cacheKey);
    } catch (error) {
      console.error('[ExtractionCache] Error invalidating cache:', error);
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{ hitRate: number; totalKeys: number }> {
    try {
      const keys = await this.redis.keys(`${this.CACHE_PREFIX}*`);
      // Note: In production, use SCAN instead of KEYS for better performance
      return {
        hitRate: 0, // Would need to track hits/misses separately
        totalKeys: keys.length,
      };
    } catch (error) {
      console.error('[ExtractionCache] Error getting cache stats:', error);
      return { hitRate: 0, totalKeys: 0 };
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    await this.redis.quit();
  }
}

