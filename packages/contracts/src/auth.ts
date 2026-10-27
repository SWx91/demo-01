import { oc } from '@orpc/contract';
import * as z from 'zod';

export const RoleSchema = z.enum([
  'ADMIN',
  'STAFF',
  'ADMINISTRATOR',
  'PURCHASING_OFFICER',
  'STORE_EMPLOYEE',
  'MANAGER',
]);
export type Role = z.infer<typeof RoleSchema>;

/** A store (branch) a user can be assigned to. */
export const StoreSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
});
export type Store = z.infer<typeof StoreSchema>;

/** The signed-in user as the API exposes it (never includes the password hash). */
export const UserSchema = z.object({
  id: z.string(),
  email: z.email(),
  name: z.string(),
  role: RoleSchema,
  /** The store this user is assigned to, derived from identity. Null when unassigned. */
  store: StoreSchema.nullable().default(null),
});
export type User = z.infer<typeof UserSchema>;

export const LoginInputSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

export const SessionSchema = z.object({
  user: UserSchema.nullable(),
});
export type Session = z.infer<typeof SessionSchema>;

export const authContract = {
  login: oc
    .route({
      method: 'POST',
      path: '/auth/login',
      summary: 'Sign in with email and password',
      tags: ['Auth'],
    })
    .input(LoginInputSchema)
    .output(UserSchema),
  logout: oc.route({ method: 'POST', path: '/auth/logout', summary: 'Sign out', tags: ['Auth'] }),
  me: oc
    .route({
      method: 'GET',
      path: '/auth/me',
      summary: 'The signed-in user, or null',
      tags: ['Auth'],
    })
    .output(SessionSchema),
};
