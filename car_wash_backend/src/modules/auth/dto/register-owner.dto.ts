import { Transform } from 'class-transformer';

import { IsString, IsOptional, Matches } from 'class-validator';

export class RegisterOwnerDto {
  @IsString()
  fullName: string;

  @IsString()
  carType: string;

  @IsString()
  plateNumber: string;

  @IsOptional()
  @Matches(/^\+2519\d{8}$/, {
    message: 'Phone number must be in the format +2519XXXXXXXX',
  })
  secondaryPhone?: string;

  @IsString()
  @Transform(({ value }: { value: string }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Matches(/^\+2519\d{8}$/, {
    message: 'Phone number must be in the format +2519XXXXXXXX',
  })
  phone: string;
}
