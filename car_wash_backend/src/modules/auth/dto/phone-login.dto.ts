import { IsOptional, IsString, Matches } from 'class-validator';

export class PhoneLoginDto {
  @IsString()
  @Matches(/^\+2519\d{8}$/, {
    message: 'Phone must be Ethiopian format: +2519xxxxxxxx',
  })
  phone: string;

  @IsOptional()
  @IsString()
  deviceId?: string;
}

