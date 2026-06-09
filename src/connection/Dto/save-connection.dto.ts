import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class SaveConnectionDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^postgres(ql)?:\/\//i, {
    message: 'connectionString deve ser uma URL PostgreSQL válida',
  })
  connectionString: string;
}
