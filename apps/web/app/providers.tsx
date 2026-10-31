'use client';
import NextLink from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { NavigationProvider, type NavigationAdapter } from '@ziwei/runtime/navigation';
import { ServicesProvider } from '@ziwei/runtime/services';
import { configureWebsite } from '@ziwei/runtime/site';
import { browserServices } from '../lib/browser-services';

const adapter: NavigationAdapter = { Link: NextLink, useRouter, usePathname, useSearchParams };
const websiteURL = process.env.NEXT_PUBLIC_SITE_URL || '';
const services = browserServices(websiteURL);
configureWebsite(websiteURL);
export default function Providers({ children }: { children: React.ReactNode }) {
  return <ServicesProvider services={services}><NavigationProvider adapter={adapter}>{children}</NavigationProvider></ServicesProvider>;
}
