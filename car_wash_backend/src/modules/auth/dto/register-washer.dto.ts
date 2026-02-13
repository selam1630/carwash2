import {
  IsString,
  IsObject,
  IsNumber,
  Matches,
  MinLength,
  IsOptional,
} from 'class-validator';

export class RegisterWasherDto {
  @IsString()
  @Matches(/^\+2519\d{8}$/, {
    message: 'Phone must be Ethiopian format: +2519XXXXXXXX',
  })
  phone: string;

  @IsString()
  @MinLength(1, { message: 'Full name is required' })
  fullName: string;

  @IsString()
  @MinLength(1, { message: 'National ID is required' })
  nationalId: string;

  @IsString()
  @MinLength(1, { message: 'Sponsor/Warrantor national ID is required' })
  sponsorNationalId: string;

  @IsObject()
  bankDetails: Record<string, unknown>;

  @IsNumber()
  depositeAmount: number;

  @IsOptional()
  @IsString()
  mugShot?: string;

  @IsOptional()
  @IsString()
  nationalIdPhoto?: string;

  @IsOptional()
  @IsString()
  sponsorNationalIdPhoto?: string;
}
