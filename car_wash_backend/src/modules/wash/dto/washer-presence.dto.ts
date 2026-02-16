import { IsBoolean, IsLatitude, IsLongitude, IsOptional, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class WasherPresenceDto {
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @Type(() => Number)
  @IsLongitude()
  lng: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  online?: boolean;
}

export class NearbyWashersQueryDto {
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @Type(() => Number)
  @IsLongitude()
  lng: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  radiusKm?: number;
}
