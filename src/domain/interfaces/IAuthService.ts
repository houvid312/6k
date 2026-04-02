import { UserRole } from '../enums';

export interface AuthUser {
  id: string;
  name: string;
  role: UserRole;
}

export interface LoginResult {
  success: boolean;
  user?: AuthUser;
  error?: string;
}

export interface IAuthService {
  login(name: string, pin: string): Promise<LoginResult>;
  logout(): Promise<void>;
  getCurrentUser(): Promise<AuthUser | null>;
}
