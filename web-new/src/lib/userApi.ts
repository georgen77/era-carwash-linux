// User management API - calls local Express /api/manage-users

const API_BASE = '';

async function callManageUsers(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_BASE}/api/manage-users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

export function getAdminToken(): string {
  return localStorage.getItem('carwash_token') || '';
}

export function getUserRole(): string {
  return localStorage.getItem('carwash_role') || 'user';
}

export function isAdminUser(): boolean {
  return localStorage.getItem('carwash_user') === 'georgen77';
}

export async function loginNewSystem(username: string, password: string) {
  return callManageUsers({ action: 'login', username, password });
}

export async function verify2FA(userId: string, code: string) {
  return callManageUsers({ action: 'verify_2fa', userId, code });
}

export async function resend2FA(userId: string) {
  return callManageUsers({ action: 'resend_2fa', userId });
}

export async function listUsers() {
  return callManageUsers({ action: 'list_users', adminToken: getAdminToken() });
}

export async function createUser(userData: Record<string, unknown>) {
  return callManageUsers({ action: 'create_user', adminToken: getAdminToken(), ...userData });
}

export async function updateUser(userId: string, updates: Record<string, unknown>) {
  return callManageUsers({ action: 'update_user', adminToken: getAdminToken(), userId, updates });
}

export async function deleteUser(userId: string) {
  return callManageUsers({ action: 'delete_user', adminToken: getAdminToken(), userId });
}

export async function listCredentials(userId: string) {
  return callManageUsers({ action: 'list_credentials', adminToken: getAdminToken(), userId });
}

export async function deleteCredential(credentialId: string) {
  return callManageUsers({ action: 'delete_credential', adminToken: getAdminToken(), credentialId });
}

// WebAuthn helpers
export async function registerBiometric(userId: string, deviceName?: string) {
  const { challenge } = await callManageUsers({ action: 'webauthn_register_challenge', userId }) as { challenge: string };
  
  const credentialOptions: PublicKeyCredentialCreationOptions = {
    challenge: Uint8Array.from(atob(challenge), c => c.charCodeAt(0)),
    rp: { name: 'ERA Автомийки', id: window.location.hostname },
    user: {
      id: Uint8Array.from(userId, c => c.charCodeAt(0)),
      name: userId,
      displayName: 'ERA User',
    },
    pubKeyCredParams: [
      { alg: -7, type: 'public-key' },
      { alg: -257, type: 'public-key' },
    ],
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'required',
    },
    timeout: 60000,
  };

  const credential = await navigator.credentials.create({ publicKey: credentialOptions }) as PublicKeyCredential;
  if (!credential) throw new Error('Biometric registration failed');

  const response = credential.response as AuthenticatorAttestationResponse;
  const credentialId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
  const credentialIdBase64url = credential.id;
  const publicKey = btoa(String.fromCharCode(...new Uint8Array(response.getPublicKey?.() || new ArrayBuffer(0))));

  const result = await callManageUsers({
    action: 'webauthn_register',
    userId,
    credentialId,
    credentialIdBase64url,
    publicKey,
    deviceName: deviceName || getDeviceName(),
  });

  storeCredentialId(credentialId);
  if (credentialIdBase64url && credentialIdBase64url !== credentialId) {
    storeCredentialId(credentialIdBase64url);
  }

  return result;
}

function base64urlToBase64(str: string): string {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4;
  return pad ? s + '='.repeat(4 - pad) : s;
}

export async function authenticateWithBiometric(): Promise<{ success: boolean; token?: string; username?: string; role?: string; fullName?: string; userId?: string; error?: string }> {
  try {
    const storedIds = getStoredCredentialIds();
    
    const publicKeyOptions: PublicKeyCredentialRequestOptions = {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      userVerification: 'required',
      timeout: 60000,
    };

    if (storedIds.length > 0) {
      const validCredentials: PublicKeyCredentialDescriptor[] = [];
      for (const id of storedIds) {
        try {
          const normalized = base64urlToBase64(id);
          validCredentials.push({
            type: 'public-key' as const,
            id: Uint8Array.from(atob(normalized), c => c.charCodeAt(0)),
          });
        } catch { /* skip invalid ids */ }
      }
      if (validCredentials.length > 0) {
        publicKeyOptions.allowCredentials = validCredentials;
      }
    }

    const credential = await navigator.credentials.get({ publicKey: publicKeyOptions }) as PublicKeyCredential;

    if (!credential) return { success: false, error: 'Biometric auth cancelled' };

    const credentialIdRaw = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
    const credentialIdBase64url = credential.id;
    
    return callManageUsers({ action: 'webauthn_authenticate', credentialId: credentialIdRaw, credentialIdAlt: credentialIdBase64url }) as Promise<{ success: boolean; token?: string; username?: string; role?: string; fullName?: string; userId?: string; error?: string }>;
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

function getStoredCredentialIds(): string[] {
  try {
    const stored = localStorage.getItem('webauthn_credential_ids');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function storeCredentialId(credentialId: string) {
  const ids = getStoredCredentialIds();
  if (!ids.includes(credentialId)) {
    ids.push(credentialId);
    localStorage.setItem('webauthn_credential_ids', JSON.stringify(ids));
  }
}

export function getDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Mac/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows PC';
  return 'Пристрій';
}

export function isBiometricSupported(): boolean {
  return !!(window.PublicKeyCredential && navigator.credentials?.create);
}
