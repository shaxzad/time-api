import { Module } from '@nestjs/common';

import { CoreModule } from '../core/core.module';
import { AuthModule } from '../auth/auth.module';
import { ProjectColorController } from './project-color.controller';
import { ProjectColorService } from './project-color.service';

@Module({
    imports: [CoreModule, AuthModule],
    controllers: [ProjectColorController],
    providers: [ProjectColorService],
    exports: [ProjectColorService],
})
export class ProjectColorModule {}
