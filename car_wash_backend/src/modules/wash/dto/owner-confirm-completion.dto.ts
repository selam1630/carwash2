import { IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class OwnerConfirmCompletionDto {
  @Type(() => Boolean)
  @IsBoolean()
  approved: boolean;
}

