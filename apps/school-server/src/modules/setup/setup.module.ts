import { Logger, Module } from '@nestjs/common';
import { SchoolConfigService } from '../../common/config/school-config.service';
import { DatabaseModule } from '../../shared/database/database.module';
import { DrizzleMetaRepository } from '../exam/repositories/drizzle-meta.repository';
import { META_REPOSITORY } from '../exam/repositories/meta.repository';
import { ACTIVATION_HTTP, ActivationService } from './activation.service';
import { DEVICE_SECRET_STORE, createDeviceSecretStore } from './device-secret.store';
import { MACHINE_ID_HASH, machineIdHash } from './machine-identity';
import { SetupController } from './setup.controller';
import { SetupService } from './setup.service';
import { WebController } from './web.controller';

/**
 * First-run setup (spec 6.3 step 8): the `/setup` page, the console/activating
 * endpoints behind it, and the two HTML pages the operator opens by hand.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [SetupController, WebController],
  providers: [
    SetupService,
    ActivationService,
    { provide: META_REPOSITORY, useClass: DrizzleMetaRepository },
    {
      provide: DEVICE_SECRET_STORE,
      useFactory: (config: SchoolConfigService) =>
        createDeviceSecretStore(config.dataDir, new Logger('DeviceSecretStore')),
      inject: [SchoolConfigService],
    },
    { provide: ACTIVATION_HTTP, useValue: globalThis.fetch.bind(globalThis) },
    { provide: MACHINE_ID_HASH, useValue: machineIdHash },
  ],
  exports: [SetupService, ActivationService, DEVICE_SECRET_STORE],
})
export class SetupModule {}
