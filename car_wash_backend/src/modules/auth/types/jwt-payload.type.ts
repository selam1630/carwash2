import { UserRole } from '../../users/entities/user.entity';

export interface JwtPayload {
  id: string;
  role: UserRole;
}
