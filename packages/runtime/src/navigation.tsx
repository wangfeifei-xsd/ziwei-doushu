'use client';
import { createContext, useContext, type AnchorHTMLAttributes, type ComponentType, type ReactNode } from 'react';

export type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };
export interface NavigationAdapter {
  Link: ComponentType<LinkProps>;
  useRouter(): { push(path: string): void; replace(path: string): void; back(): void };
  usePathname(): string;
  useSearchParams(): URLSearchParams | Readonly<URLSearchParams>;
}
const Context = createContext<NavigationAdapter | null>(null);
export function NavigationProvider({ adapter, children }: { adapter: NavigationAdapter; children: ReactNode }) {
  return <Context.Provider value={adapter}>{children}</Context.Provider>;
}
export default function AppLink(props: LinkProps) {
  const adapter = useContext(Context);
  if (!adapter) return <a {...props} />;
  const Link = adapter.Link;
  return <Link {...props} />;
}
function navigation() {
  const value = useContext(Context);
  if (!value) throw new Error('导航宿主尚未初始化');
  return value;
}
export function useRouter() { return navigation().useRouter(); }
export function usePathname() { return navigation().usePathname(); }
export function useSearchParams() { return navigation().useSearchParams(); }
