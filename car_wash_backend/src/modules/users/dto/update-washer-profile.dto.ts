import { IsString, IsNumber, IsObject, IsOptional } from 'class-validator';

export class UpdateWasherProfileDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  nationalId?: string;

  @IsOptional()
  @IsString()
  sponsorNationalId?: string;

  @IsOptional()
  @IsObject()
  bankDetails?: Record<string, unknown>;

  @IsOptional()
  @IsNumber()
  depositAmount?: number;
}
