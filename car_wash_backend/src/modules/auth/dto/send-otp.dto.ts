import { IsString, Matches } from 'class-validator';

export class SendOtpDto {
  @IsString()
  @Matches(/^\+2519\d{8}$/, { message: 'Phone must be Ethiopian format: +2519xxxxxxxx' })
  phone: string;
}