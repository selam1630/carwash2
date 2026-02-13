import { IsString, IsNumber, IsInt, Min, IsBoolean, IsOptional } from 'class-validator';

export class UpdatePlanDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  washesPerMonth?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
