import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginWebviewDto {
  @IsString()
  code: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  password: string;
}
