import { IsString, IsNumber, IsObject } from 'class-validator';

export class UpdateWasherProfileDto {
  @IsString()
  fullName: string;

  @IsString()
  nationalId: string;

  @IsString()
  sponsorNationalId: string;

  @IsObject()
  bankDetails: Record<string, any>;

  @IsNumber()
  depositAmount: number;
}
