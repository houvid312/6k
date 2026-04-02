import { supabase } from '../lib/supabase';
import { IAuthService, AuthUser, LoginResult } from '../domain/interfaces/IAuthService';
import { UserRole } from '../domain/enums';

export class SupabaseAuthService implements IAuthService {
  private currentUser: AuthUser | null = null;

  async login(username: string, pin: string): Promise<LoginResult> {
    const email = `${username.toLowerCase()}@6kpizza.app`;

    // 1. Sign in con Supabase Auth (crea sesión real)
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password: pin,
    });

    if (authError) {
      return { success: false, error: 'Usuario o PIN incorrecto' };
    }

    // 2. Obtener perfil del worker vinculado
    const { data: worker, error: workerError } = await supabase
      .from('workers')
      .select('id, name, username, user_role')
      .eq('username', username.toLowerCase())
      .eq('is_active', true)
      .single();

    if (workerError || !worker) {
      await supabase.auth.signOut();
      return { success: false, error: 'Trabajador no encontrado' };
    }

    this.currentUser = {
      id: worker.id,
      name: worker.name,
      role: worker.user_role as UserRole,
    };

    return { success: true, user: this.currentUser };
  }

  async logout(): Promise<void> {
    await supabase.auth.signOut();
    this.currentUser = null;
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      this.currentUser = null;
      return null;
    }

    if (this.currentUser) {
      return this.currentUser;
    }

    // Recuperar perfil del worker desde la sesión
    const { data: worker } = await supabase
      .from('workers')
      .select('id, name, username, user_role')
      .eq('auth_user_id', session.user.id)
      .single();

    if (worker) {
      this.currentUser = {
        id: worker.id,
        name: worker.name,
        role: worker.user_role as UserRole,
      };
    }

    return this.currentUser;
  }
}
