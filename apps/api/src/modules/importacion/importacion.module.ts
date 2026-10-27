import { StorageModule } from './storage.module';
import { Module } from '@nestjs/common';
import { ProcesosModule } from '../procesos/procesos.module';
import { ImportacionController } from './importacion.controller';
import { ImportacionService } from './importacion.service';

@Module({
  imports: [ProcesosModule, StorageModule],
  controllers: [ImportacionController],
  providers: [ImportacionService],
})
export class ImportacionModule {}
