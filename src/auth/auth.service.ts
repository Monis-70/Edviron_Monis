import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private jwtService: JwtService) {}

  async login(user: any) {
    const payload = { id: user.id, email: user.email };
    const token = this.jwtService.sign(payload); // Generates JWT
    return { accessToken: token };
  }
}
