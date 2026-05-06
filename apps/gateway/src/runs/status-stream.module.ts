/**
 * [F3a-09] status-stream.module.ts
 *
 * NestJS module that registers StatusStreamGateway and wires the
 * EventEmitterModule dependency used to capture StatusChangeEvents
 * from HierarchyStatusService (F2a-10).
 */

import { Module }               from '@nestjs/common'
import { StatusStreamGateway }  from './status-stream.gateway'

@Module({
  providers: [StatusStreamGateway],
  exports:   [StatusStreamGateway],
})
export class StatusStreamModule {}
