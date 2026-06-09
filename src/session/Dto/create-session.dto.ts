import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateSessionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;
}
