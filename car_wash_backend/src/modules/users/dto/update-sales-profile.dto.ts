import { IsString, IsObject, IsOptional, MinLength } from 'class-validator';

export class UpdateSalesProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  nationalId?: string;

  @IsOptional()
  @IsObject()
  bankDetails?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MinLength(1)
  sponsorNationalId?: string;
}
