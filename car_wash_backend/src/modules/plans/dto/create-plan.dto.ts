import { IsString, IsNumber, IsInt, Min } from 'class-validator';

export class CreatePlanDto {
  @IsString()
  name: string;

  @IsInt()
  @Min(1)
  washesPerMonth: number;

  @IsNumber()
  @Min(0)
  price: number;
}
