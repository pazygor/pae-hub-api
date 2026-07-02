import { SetMetadata } from '@nestjs/common';
import { AppRole } from '../../domain/enums';

export const ROLES_KEY = 'roles';

/** Restringe a rota aos papéis informados (admin | terminal | entity). */
export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);

/** Marca a rota como pública (dispensa JWT). */
export const Public = () => SetMetadata('isPublic', true);
