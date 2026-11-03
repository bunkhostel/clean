import { UserRecord, UserRole, UserStatus, AdminAuthSession } from '../types';
import { hasPermission, migrateLegacyRole } from './rbac';

/**
 * The single bootstrap account: the first administrator needed to create everyone else.
 * Change this password immediately after the first sign-in.
 */
export const DEFAULT_ADMIN_CREDENTIALS = {
  name: 'Administrator',
  email: 'admin@bunkhostel.in',
  username: 'admin',
  password: 'admin@123',
  role: 'admin' as UserRole,
  status: 'Approved' as UserStatus,
};

/**
 * Checks if a user record or session represents the bootstrap admin account.
 */
export function isDefaultAdminAccount(
  user: { email?: string; username?: string; id?: string; name?: string } | null | undefined
): boolean {
  if (!user) return false;
  const targetEmail = DEFAULT_ADMIN_CREDENTIALS.email.toLowerCase();
  const matchesEmail = user.email?.toLowerCase() === targetEmail || user.username?.toLowerCase() === targetEmail;
  const matchesUsername = user.username?.toLowerCase() === DEFAULT_ADMIN_CREDENTIALS.username;
  const matchesId = user.id === 'USR-001';
  return Boolean(matchesEmail || matchesUsername || matchesId);
}

const USER_STORAGE_KEY = 'bunk_hostel_user_records_v3';
// Earlier builds seeded demo employees and reports; drop those stores on upgrade.
const LEGACY_STORAGE_KEYS = [
  'bunk_hostel_user_records_v2',
  'bunk_hostel_user_records',
];
if (typeof window !== 'undefined') {
  LEGACY_STORAGE_KEYS.forEach((key) => {
    try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
  });
}

const SESSION_AUTH_TOKEN_KEY = 'bunk_session_auth_token';
const SESSION_AUTH_USER_KEY = 'bunk_session_auth_user';

export const INITIAL_USER_RECORDS: UserRecord[] = [
  {
    id: 'USR-001',
    name: DEFAULT_ADMIN_CREDENTIALS.name,
    username: DEFAULT_ADMIN_CREDENTIALS.username,
    email: DEFAULT_ADMIN_CREDENTIALS.email,
    phone: '',
    password: DEFAULT_ADMIN_CREDENTIALS.password,
    role: 'admin',
    status: 'Approved',
    createdAt: new Date().toISOString().split('T')[0],
    approvedBy: 'System',
  },
];

/**
 * Loads user records from localStorage, upgrading roles written by earlier builds.
 */
const cloneSeedUsers = (): UserRecord[] => INITIAL_USER_RECORDS.map((u) => ({ ...u }));

export function getStoredUsers(): UserRecord[] {
  if (typeof window === 'undefined') return cloneSeedUsers();
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    if (!raw) {
      const seed = cloneSeedUsers();
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
    const parsed: UserRecord[] = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Corrupt user store');
    let changed = false;

    const migrated = parsed.map((u) => {
      const role = migrateLegacyRole(u.role);
      if (role !== u.role) {
        changed = true;
        return { ...u, role };
      }
      return u;
    });

    const hasDefaultAdmin = migrated.some((u) => isDefaultAdminAccount(u));
    if (!hasDefaultAdmin) {
      migrated.unshift({ ...INITIAL_USER_RECORDS[0] });
      changed = true;
    }
    if (changed) {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(migrated));
    }
    return migrated;
  } catch {
    const seed = cloneSeedUsers();
    try { localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(seed)); } catch { /* storage unavailable */ }
    return seed;
  }
}

/** Names of approved employees, used for the inspector dropdown instead of a static roster. */
export function getApprovedUserNames(): string[] {
  const names = getStoredUsers()
    .filter((u) => u.status === 'Approved' || u.status === 'Active')
    .map((u) => u.name.trim())
    .filter(Boolean);
  return Array.from(new Set(names));
}

/**
 * Saves user records to storage
 */
export function saveStoredUsers(users: UserRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(users));
  } catch (err) {
    console.error('Failed to save users:', err);
  }
}

/** Only the admin role may create, edit or delete accounts. */
export function canManageUsers(session: { role: UserRole } | null | undefined): boolean {
  return Boolean(session && hasPermission(session.role, 'manage_users'));
}

/**
 * Requirement 2: User Registration Flow
 * Saves new registration to localStorage with status 'Pending Approval'.
 */
export function registerNewUser(data: {
  name: string;
  email: string;
  password: string;
  phone: string;
}): { success: boolean; error?: string; user?: UserRecord } {
  const cleanName = data.name.trim();
  const cleanEmail = data.email.trim().toLowerCase();
  const cleanPhone = data.phone.trim();
  const cleanPass = data.password.trim();

  if (!cleanName) return { success: false, error: 'Please enter your full name.' };
  if (!cleanEmail || !cleanEmail.includes('@')) return { success: false, error: 'Please enter a valid email address.' };
  if (!cleanPass || cleanPass.length < 4) return { success: false, error: 'Password must be at least 4 characters.' };
  if (!cleanPhone) return { success: false, error: 'Please enter a contact phone number.' };

  const users = getStoredUsers();
  
  // Check if email already registered
  const existing = users.find(u => u.email.toLowerCase() === cleanEmail);
  if (existing) {
    if (existing.status === 'Pending Approval') {
      return { success: false, error: 'An account with this email is already registered and pending approval.' };
    }
    return { success: false, error: 'An account with this email already exists. Please log in or contact admin.' };
  }

  const newId = `REQ-${Date.now().toString().slice(-4)}`;
  const username = cleanEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_');

  const newUser: UserRecord = {
    id: newId,
    name: cleanName,
    username,
    email: cleanEmail,
    phone: cleanPhone,
    password: cleanPass,
    role: 'housekeeping', // pending accounts start at the lowest privilege until an admin assigns a role
    status: 'Pending Approval',
    createdAt: new Date().toISOString().split('T')[0],
  };

  const updatedUsers = [newUser, ...users];
  saveStoredUsers(updatedUsers);

  return { success: true, user: newUser };
}

const ADMIN_ONLY_ERROR = 'Access denied: only an admin can manage user accounts.';

/**
 * Requirement 4: Approval & Role Assignment (admin only)
 */
export function approveUserRequest(
  actor: { role: UserRole } | null,
  userId: string,
  assignedRole: UserRole,
  approvedBy: string
): { success: boolean; error?: string; users: UserRecord[] } {
  const users = getStoredUsers();
  if (!canManageUsers(actor)) {
    return { success: false, error: ADMIN_ONLY_ERROR, users };
  }
  const updated = users.map(u => {
    if (u.id === userId) {
      return {
        ...u,
        role: assignedRole,
        status: 'Approved' as UserStatus,
        approvedAt: new Date().toISOString().split('T')[0],
        approvedBy: approvedBy || 'Admin',
      };
    }
    return u;
  });
  saveStoredUsers(updated);
  return { success: true, users: updated };
}

/**
 * Reject user registration request (admin only)
 */
export function rejectUserRequest(
  actor: { role: UserRole } | null,
  userId: string
): { success: boolean; error?: string; users: UserRecord[] } {
  const users = getStoredUsers();
  if (!canManageUsers(actor)) {
    return { success: false, error: ADMIN_ONLY_ERROR, users };
  }
  const updated = users.filter(u => u.id !== userId);
  saveStoredUsers(updated);
  return { success: true, users: updated };
}

export interface NewUserInput {
  name: string;
  username: string;
  email: string;
  phone: string;
  password: string;
  role: UserRole;
  status: UserStatus;
  approvedBy: string;
}

/** Create an account directly (admin only). */
export function createUserRecord(
  actor: { role: UserRole } | null,
  input: NewUserInput
): { success: boolean; error?: string; users: UserRecord[]; user?: UserRecord } {
  const users = getStoredUsers();
  if (!canManageUsers(actor)) {
    return { success: false, error: ADMIN_ONLY_ERROR, users };
  }
  const username = input.username.toLowerCase();
  const duplicate = users.find(
    (u) => u.username.toLowerCase() === username || (input.email && u.email.toLowerCase() === input.email.toLowerCase())
  );
  if (duplicate) {
    return { success: false, error: `Account with username/email is already assigned to ${duplicate.name}.`, users };
  }

  const newUser: UserRecord = {
    id: `USR-${String(users.length + 1).padStart(3, '0')}`,
    name: input.name,
    username,
    email: input.email || `${username}@bunkhostel.in`,
    phone: input.phone || '+91 98765 00000',
    password: input.password,
    role: input.role,
    status: input.status,
    createdAt: new Date().toISOString().split('T')[0],
    approvedAt: new Date().toISOString().split('T')[0],
    approvedBy: input.approvedBy,
  };
  const updated = [newUser, ...users];
  saveStoredUsers(updated);
  return { success: true, users: updated, user: newUser };
}

/** Update an existing account (admin only). */
export function updateUserRecord(
  actor: { role: UserRole } | null,
  userId: string,
  patch: Partial<Pick<UserRecord, 'name' | 'username' | 'email' | 'phone' | 'password' | 'role' | 'status'>>
): { success: boolean; error?: string; users: UserRecord[] } {
  const users = getStoredUsers();
  if (!canManageUsers(actor)) {
    return { success: false, error: ADMIN_ONLY_ERROR, users };
  }

  const target = users.find((u) => u.id === userId);
  if (!target) {
    return { success: false, error: 'User no longer exists.', users };
  }

  // The default admin account keeps its role, status and username.
  const isProtected = isDefaultAdminAccount(target);
  const safePatch = isProtected
    ? { ...patch, role: target.role, status: 'Approved' as UserStatus, username: target.username }
    : patch;

  const updated = users.map((u) => (u.id === userId ? { ...u, ...safePatch } : u));
  saveStoredUsers(updated);
  return { success: true, users: updated };
}

/** Delete an account (admin only). Default admin is protected. */
export function deleteUserRecord(
  actor: { role: UserRole } | null,
  userId: string
): { success: boolean; error?: string; users: UserRecord[] } {
  const users = getStoredUsers();
  if (!canManageUsers(actor)) {
    return { success: false, error: ADMIN_ONLY_ERROR, users };
  }
  const target = users.find((u) => u.id === userId);
  if (!target) {
    return { success: false, error: 'User no longer exists.', users };
  }
  if (isDefaultAdminAccount(target)) {
    return { success: false, error: 'Default Admin account is protected and cannot be deleted.', users };
  }
  const updated = users.filter((u) => u.id !== userId);
  saveStoredUsers(updated);
  return { success: true, users: updated };
}

/**
 * Strict Session Storage Auth Check:
 * Enforces LOGIN EVERY TIME by reading ONLY from sessionStorage.
 */
export function getActiveAdminSession(): AdminAuthSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const token = sessionStorage.getItem(SESSION_AUTH_TOKEN_KEY);
    const userRaw = sessionStorage.getItem(SESSION_AUTH_USER_KEY);
    if (!token || !userRaw) return null;
    const session = JSON.parse(userRaw) as AdminAuthSession;

    // A session is only valid while its account still exists and can still sign in.
    const account = getStoredUsers().find(
      (u) => u.email?.toLowerCase() === session.email?.toLowerCase() || u.username === session.username
    );
    if (!account || (account.status !== 'Approved' && account.status !== 'Active')) {
      destroyAdminSession();
      return null;
    }

    session.role = migrateLegacyRole(account.role);
    session.name = account.name;
    session.username = account.username;
    session.email = account.email;
    return session;
  } catch {
    return null;
  }
}

/**
 * Sets session authentication token in sessionStorage
 */
export function setAdminSession(session: AdminAuthSession): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(SESSION_AUTH_TOKEN_KEY, session.token);
    sessionStorage.setItem(SESSION_AUTH_USER_KEY, JSON.stringify(session));
  } catch (err) {
    console.error('Failed to set admin session:', err);
  }
}

/**
 * Destroys session instantly (Logout)
 */
export function destroyAdminSession(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(SESSION_AUTH_TOKEN_KEY);
    sessionStorage.removeItem(SESSION_AUTH_USER_KEY);
  } catch (err) {
    console.error('Failed to destroy session:', err);
  }
}

export const clearAdminSession = destroyAdminSession;

/**
 * Requirement 1 & 5: Validates credentials for every employee role.
 * Role authorization is handled by the route guards, not here.
 */
export function authenticateUser(
  identifier: string,
  password: string
): { success: boolean; session?: AdminAuthSession; error?: string; status?: UserStatus } {
  const cleanId = identifier.trim().toLowerCase();
  const cleanPass = password.trim();

  if (!cleanId || !cleanPass) {
    return { success: false, error: 'Please enter both your email/username and password.' };
  }

  // Check default admin shortcut
  if (
    (cleanId === DEFAULT_ADMIN_CREDENTIALS.email.toLowerCase() ||
     cleanId === DEFAULT_ADMIN_CREDENTIALS.username.toLowerCase()) &&
    cleanPass === DEFAULT_ADMIN_CREDENTIALS.password
  ) {
    const token = `AUTH_TOKEN_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const session: AdminAuthSession = {
      token,
      username: DEFAULT_ADMIN_CREDENTIALS.username,
      name: DEFAULT_ADMIN_CREDENTIALS.name,
      email: DEFAULT_ADMIN_CREDENTIALS.email,
      role: DEFAULT_ADMIN_CREDENTIALS.role,
      loginTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setAdminSession(session);
    return { success: true, session };
  }

  // Check stored database users
  const users = getStoredUsers();
  const found = users.find(
    u => u.email?.toLowerCase() === cleanId || u.username?.toLowerCase() === cleanId
  );

  if (!found) {
    return { success: false, error: 'No account found with this email/username. Please register first.' };
  }

  if (found.password !== cleanPass) {
    return { success: false, error: 'Incorrect password. Please verify and try again.' };
  }

  // Status checks
  if (found.status === 'Pending Approval') {
    return {
      success: false,
      status: 'Pending Approval',
      error: 'Registration successful. Please wait for an admin to approve your account before logging in.',
    };
  }

  if (found.status === 'Rejected') {
    return {
      success: false,
      status: 'Rejected',
      error: 'Your registration was rejected by an administrator. Please contact support.',
    };
  }

  if (found.status === 'Inactive') {
    return {
      success: false,
      status: 'Inactive',
      error: 'This account has been deactivated. Please contact an Admin.',
    };
  }

  // Generate session token
  const token = `AUTH_TOKEN_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const session: AdminAuthSession = {
    token,
    username: found.username,
    name: found.name,
    email: found.email,
    role: migrateLegacyRole(found.role),
    loginTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };

  // Update last login
  found.lastLogin = new Date().toISOString().replace('T', ' ').substring(0, 16);
  saveStoredUsers(users);

  setAdminSession(session);
  return { success: true, session };
}
