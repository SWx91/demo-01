import { describe, expect, it } from 'vitest';
import { LoginInputSchema, RoleSchema, SessionSchema } from './auth.js';

describe('LoginInputSchema', () => {
  it('accepts an email and password', () => {
    const result = LoginInputSchema.safeParse({ email: 'admin@erp.local', password: 'password' });

    expect(result.success).toBe(true);
  });

  it('rejects an invalid email', () => {
    const result = LoginInputSchema.safeParse({ email: 'admin', password: 'password' });

    expect(result.success).toBe(false);
  });

  it('rejects an empty password', () => {
    const result = LoginInputSchema.safeParse({ email: 'admin@erp.local', password: '' });

    expect(result.success).toBe(false);
  });
});

describe('RoleSchema', () => {
  it.each(RoleSchema.options)('accepts the %s role', (role) => {
    const result = RoleSchema.safeParse(role);

    expect(result.success).toBe(true);
  });

  it('rejects an unknown role', () => {
    expect(RoleSchema.safeParse('OWNER').success).toBe(false);
  });
});

const NEW_ROLES = RoleSchema.options.filter((role) => role !== 'ADMIN' && role !== 'STAFF');

describe('SessionSchema', () => {
  it('accepts a signed-out session', () => {
    expect(SessionSchema.safeParse({ user: null }).success).toBe(true);
  });

  it.each(NEW_ROLES)('accepts a session for a user carrying the %s role', (role) => {
    const result = SessionSchema.safeParse({
      user: { id: '1', email: 'a@erp.local', name: 'A', role },
    });

    expect(result.success).toBe(true);
  });

  it('rejects an unknown role', () => {
    const result = SessionSchema.safeParse({
      user: { id: '1', email: 'a@erp.local', name: 'A', role: 'OWNER' },
    });

    expect(result.success).toBe(false);
  });
});
