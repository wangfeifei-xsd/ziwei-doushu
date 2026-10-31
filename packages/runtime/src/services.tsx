'use client';
import { createContext, useContext, type ReactNode } from 'react';
import type { BirthFormState } from '@ziwei/domain/birth';
import type { BirthProfile } from '@ziwei/domain/ziwei/profiles';
import type { AIConfig, ModelSettings } from '@ziwei/domain/ai/config';
import type { ProfileExportV1, ImportSummary } from '@ziwei/domain/profiles-transfer';

export interface ProfileRepository {
  list(signal?: AbortSignal): Promise<BirthProfile[]>;
  get(id: string, signal?: AbortSignal): Promise<BirthProfile | null>;
  save(form: BirthFormState): Promise<BirthProfile>;
  update(id: string, form: BirthFormState): Promise<BirthProfile>;
  remove(id: string): Promise<boolean>;
}
export type ModelDraft = AIConfig & { remember?: boolean; password?: string };
export type AIEvent = { type: 'delta'; text: string } | { type: 'done' } | { type: 'error'; message: string };
export type FileActionResult = 'saved' | 'shared' | 'cancelled';
export interface AppServices {
  platform: 'web' | 'native' | 'preview';
  websiteURL: string;
  profiles: ProfileRepository;
  transfer?: { exportData(): Promise<ProfileExportV1>; importData(data: ProfileExportV1): Promise<ImportSummary> };
  ai: { stream(request: { kind: 'interpret' | 'heming'; body: unknown }, signal: AbortSignal): AsyncIterable<AIEvent> };
  model: {
    get(signal?: AbortSignal): Promise<ModelSettings>;
    save(draft: ModelDraft): Promise<ModelSettings>;
    test(draft: ModelDraft, signal: AbortSignal): Promise<{ latencyMs: number }>;
    clear(): Promise<ModelSettings>;
    unlock?(password: string): Promise<ModelSettings>;
    lock?(): Promise<ModelSettings>;
  };
  files: {
    importJSON(): Promise<string | null>;
    exportJSON(name: string, data: string): Promise<FileActionResult>;
    exportImage(name: string, bytes: Uint8Array): Promise<FileActionResult>;
    copyText(text: string): Promise<void>;
    openExternal(url: string): Promise<void>;
  };
}
const Context = createContext<AppServices | null>(null);
export function ServicesProvider({ services, children }: { services: AppServices; children: ReactNode }) {
  return <Context.Provider value={services}>{children}</Context.Provider>;
}
export function useServices(): AppServices {
  const services = useContext(Context);
  if (!services) throw new Error('应用服务尚未初始化');
  return services;
}
