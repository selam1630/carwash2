import { IsLatitude, IsLongitude } from 'class-validator';

export class CreateWashRequestDto {
  @IsLatitude()
  pickupLat: number;

  @IsLongitude()
  pickupLng: number;
}
