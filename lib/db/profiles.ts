import 'server-only';
import { createHash } from 'node:crypto';
import { H2Database } from './h2';
import { parseProfileForm, type BirthProfile } from '@/lib/ziwei/profiles';
import type { BirthFormState } from '@/components/BirthForm';

const state = globalThis as typeof globalThis & { ziweiH2?: H2Database };

function database() {
  if (!state.ziweiH2 || state.ziweiH2.closed) state.ziweiH2 = new H2Database();
  return state.ziweiH2;
}

export function listProfiles() {
  return database().request<BirthProfile[]>('list');
}

export function getProfile(id: string) {
  return database().request<BirthProfile | null>('get', id);
}

export function saveProfile(input: BirthFormState) {
  const form = JSON.stringify(parseProfileForm(input));
  const id = createHash('sha256').update(form).digest('hex');
  return database().request<BirthProfile>('save', id, form);
}

export function deleteProfile(id: string) {
  return database().request<boolean>('delete', id);
}

export function updateProfile(id: string, input: BirthFormState) {
  const form = JSON.stringify(parseProfileForm(input));
  const targetId = createHash('sha256').update(form).digest('hex');
  return database().request<BirthProfile | 'duplicate' | null>('update', id, form, targetId);
}
