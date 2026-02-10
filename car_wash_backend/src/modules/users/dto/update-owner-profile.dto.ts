import { IsString, IsOptional, Matches } from 'class-validator';

export class UpdateOwnerProfileDto {
  @IsString()
  fullName: string;

  @IsString()
  carType: string;

  @IsString()
  plateNumber: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+2519\d{8}$/, {
    message: 'Phone must be Ethiopian format: +2519xxxxxxxx',
  })
  secondaryPhone?: string;
}
