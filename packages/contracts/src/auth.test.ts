import { describe, expect, it } from 'vitest';
import { LoginInputSchema, RoleSchema, SessionSchema, StoreSchema, UserSchema } from './auth.js';

const store = { id: 's1', code: 'B01', name: 'Branch 01' };

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

describe('StoreSchema', () => {
  it('accepts a store with id, code and name', () => {
    expect(StoreSchema.safeParse(store).success).toBe(true);
  });

  it('rejects a store missing its code', () => {
    expect(StoreSchema.safeParse({ id: 's1', name: 'Branch 01' }).success).toBe(false);
  });
});

describe('UserSchema', () => {
  it('accepts a user carrying an assigned store', () => {
    const result = UserSchema.safeParse({
      id: '1',
      email: 'staff@erp.local',
      name: 'Staff',
      role: 'STORE_EMPLOYEE',
      store,
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.store).toEqual(store);
  });

  it('accepts a user with no assigned store', () => {
    const result = UserSchema.safeParse({
      id: '1',
      email: 'buyer@erp.local',
      name: 'Buyer',
      role: 'PURCHASING_OFFICER',
      store: null,
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.store).toBeNull();
  });
});

describe('SessionSchema', () => {
  it('accepts a signed-out session', () => {
    expect(SessionSchema.safeParse({ user: null }).success).toBe(true);
  });

  it('round-trips a user carrying an assigned store', () => {
    const result = SessionSchema.safeParse({
      user: { id: '1', email: 'a@erp.local', name: 'A', role: 'STORE_EMPLOYEE', store },
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.user?.store).toEqual(store);
  });

  it.each(NEW_ROLES)('accepts a session for a user carrying the %s role', (role) => {
    const result = SessionSchema.safeParse({
      user: { id: '1', email: 'a@erp.local', name: 'A', role, store: null },
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
