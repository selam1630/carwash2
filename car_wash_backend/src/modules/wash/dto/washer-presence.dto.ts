import { IsBoolean, IsLatitude, IsLongitude, IsOptional, IsNumber, Min } from 'class-validator';

export class WasherPresenceDto {
  @IsLatitude()
  lat: number;

  @IsLongitude()
  lng: number;

  @IsOptional()
  @IsBoolean()
  online?: boolean;
}

export class NearbyWashersQueryDto {
  @IsLatitude()
  lat: number;

  @IsLongitude()
  lng: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  radiusKm?: number;
}
