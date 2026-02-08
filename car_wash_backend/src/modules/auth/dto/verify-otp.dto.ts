import { IsString, Matches, Length } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  @Matches(/^\+2519\d{8}$/, {
    message: 'Phone must be Ethiopian format: +2519xxxxxxxx',
  })
  phone: string;

  @IsString() 
  @Length(6, 6, { message: 'OTP must be exactly 6 characters' })
  otp: string;
}

