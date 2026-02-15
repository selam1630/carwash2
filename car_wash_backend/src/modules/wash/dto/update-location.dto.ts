import { IsLatitude, IsLongitude, IsOptional, IsNumber } from 'class-validator';

export class UpdateLocationDto {
  @IsLatitude()
  lat: number;

  @IsLongitude()
  lng: number;

  @IsOptional()
  @IsNumber()
  heading?: number;

  @IsOptional()
  @IsNumber()
  speed?: number;
}
