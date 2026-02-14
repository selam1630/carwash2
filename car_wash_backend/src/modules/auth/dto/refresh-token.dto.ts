import { IsString, IsOptional } from 'class-validator';

export class RefreshTokenDto {
  @IsString()
  refreshToken: string;

  @IsOptional()
  @IsString()
  deviceId?: string;
}
