/**
 * SSE Events Controller
 * Provides real-time event streaming with heartbeat and Last-Event-ID support
 */

import { Controller, Get, Req, Res, Query, UseGuards, Optional } from '@nestjs/common';
import { Request, Response } from 'express';
import { EventEmitterService } from './event-emitter.service';
import { SSEConnectionPoolService } from './connection-pool.service';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../guards/workspace-access.guard';
import { WorkspaceContextService } from '../../middleware/workspace-context';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';

@Controller('events')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
export class EventsController {
  private workspaceContext?: WorkspaceContextService;

  constructor(
    private eventEmitter: EventEmitterService,
    private connectionPool: SSEConnectionPoolService,
    @Optional() workspaceContext: WorkspaceContextService | undefined,
    private configService: ConfigService
  ) {
    this.workspaceContext = workspaceContext;
  }

  @Get('stream')
  async streamEvents(
    @Req() req: Request,
    @Res() res: Response,
    @Query('workspaceId') workspaceId?: string,
    @Query('userId') userId?: string,
    @Query('lastEventId') lastEventId?: string
  ) {
    // Get workspace and user context
    // Fallback to query params, then workspaceContext, then JWT user
    const contextWorkspaceId = workspaceId || 
      (this.workspaceContext ? this.workspaceContext.getWorkspaceId() : undefined) ||
      ((req as any).user?.workspaceId) ||
      'default-workspace';
    const contextUserId = userId || 
      (this.workspaceContext ? this.workspaceContext.getUserId() : undefined) ||
      ((req as any).user?.sub) ||
      'default-user';
    const instanceId = this.configService.get<string>('INSTANCE_ID', 'api-1');
    const connectionId = uuidv4();

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Add connection to pool
    this.connectionPool.addConnection(
      instanceId,
      connectionId,
      contextWorkspaceId,
      contextUserId,
      res
    );

    // Send initial connection event
    this.sendEvent(res, 'connected', {
      connectionId,
      workspaceId: contextWorkspaceId,
      userId: contextUserId,
      timestamp: new Date().toISOString()
    });

    // Handle Last-Event-ID for reconnection
    if (lastEventId) {
      try {
        const missedEvents = await this.eventEmitter.getMissedEvents(
          contextWorkspaceId,
          lastEventId
        );
        
        for (const event of missedEvents) {
          this.sendEvent(res, event.type, event.data, event.id);
        }
      } catch (error) {
        console.error('Failed to get missed events:', error);
      }
    }

    // Set up heartbeat
    const heartbeatInterval = setInterval(async () => {
      try {
        await this.connectionPool.sendHeartbeat();
      } catch (error) {
        console.error('Failed to send heartbeat:', error);
      }
    }, 30000); // 30 seconds

    // Set up workspace-specific event listener
    const eventListener = (event: any) => {
      this.sendEvent(res, event.type, event.data, event.id);
    };

    this.eventEmitter.subscribe(contextWorkspaceId, eventListener);

    // Handle client disconnect
    req.on('close', () => {
      clearInterval(heartbeatInterval);
      this.eventEmitter.unsubscribe(contextWorkspaceId, eventListener);
      this.connectionPool.removeConnection(instanceId, connectionId);
    });

    req.on('error', (error) => {
      console.error('SSE connection error:', error);
      clearInterval(heartbeatInterval);
      this.eventEmitter.unsubscribe(contextWorkspaceId, eventListener);
      this.connectionPool.removeConnection(instanceId, connectionId);
    });

    // Keep connection alive
    req.on('aborted', () => {
      clearInterval(heartbeatInterval);
      this.eventEmitter.unsubscribe(contextWorkspaceId, eventListener);
      this.connectionPool.removeConnection(instanceId, connectionId);
    });
  }

  private sendEvent(
    res: Response,
    type: string,
    data: any,
    id?: string
  ): void {
    const eventData = {
      id: id || this.generateEventId(),
      type,
      data,
      timestamp: new Date().toISOString()
    };

    res.write(`id: ${eventData.id}\n`);
    res.write(`event: ${type}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  @Get('stats')
  async getConnectionStats() {
    try {
      const stats = this.connectionPool.getPoolStats();
      
      return {
        ok: true,
        data: stats
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'STATS_FETCH_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  @Get('client-code')
  async getClientCode(
    @Query('workspaceId') workspaceId: string,
    @Query('userId') userId: string
  ) {
    try {
      const baseUrl = this.configService.get<string>('API_BASE_URL', 'http://localhost:3000');
      const clientCode = this.generateClientCode(baseUrl, workspaceId, userId);
      
      return {
        ok: true,
        data: {
          clientCode,
          instructions: 'Include this JavaScript code in your frontend to connect to SSE events'
        }
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'CLIENT_CODE_GENERATION_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  private generateClientCode(baseUrl: string, workspaceId: string, userId: string): string {
    return `
// AI Visibility Platform SSE Client
const sseClient = new EventSource('${baseUrl}/v1/events/stream?workspaceId=${workspaceId}&userId=${userId}');

sseClient.onopen = () => {
  console.log('Connected to AI Visibility Platform');
};

sseClient.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data);
    console.log('SSE Event:', event.type, data);
    
    // Handle different event types
    switch (event.type) {
      case 'scan.progress':
        // Update scan progress UI
        updateScanProgress(data);
        break;
      case 'copilot.action':
        // Handle copilot actions
        handleCopilotAction(data);
        break;
      case 'sync.status':
        // Update sync status
        updateSyncStatus(data);
        break;
      case 'heartbeat':
        // Update last heartbeat timestamp
        updateLastHeartbeat(data);
        break;
    }
  } catch (error) {
    console.error('Failed to parse SSE message:', error);
  }
};

sseClient.onerror = (error) => {
  console.error('SSE connection error:', error);
};

// Helper functions (implement these in your app)
function updateScanProgress(data) {
  // Update progress bar, status, etc.
  console.log('Scan progress:', data.progress + '%');
}

function handleCopilotAction(data) {
  // Show copilot action notifications
  console.log('Copilot action:', data.action);
}

function updateSyncStatus(data) {
  // Update sync status indicators
  console.log('Sync status:', data.status);
}

function updateLastHeartbeat(data) {
  // Update connection health indicator
  console.log('Heartbeat received:', data.timestamp);
}
`;
  }

  private generateEventId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

