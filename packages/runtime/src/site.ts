let website = '';
let browserFallback = true;
export function configureWebsite(url: string, allowBrowserFallback = true) { website = url.replace(/\/+$/, ''); browserFallback = allowBrowserFallback; }
export function siteURL() { return website || (browserFallback && typeof location !== 'undefined' && /^https?:$/.test(location.protocol) ? location.origin : ''); }
export function siteHost() { return siteURL().replace(/^https?:\/\//, ''); }
