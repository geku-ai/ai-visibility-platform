/**
 * Cost Estimation Module
 */

import { Module } from '@nestjs/common';
import { CostController } from './cost.controller';
import { GEOModule } from '../geo/geo.module';

@Module({
  imports: [GEOModule], // Imports GEOModule to access CostEstimatorService
  controllers: [CostController],
})
export class CostModule {}

