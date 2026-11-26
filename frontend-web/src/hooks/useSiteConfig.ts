import { useQuery } from '@tanstack/react-query';
import { fetchSiteConfig } from '../services/site';

/** Configuration publique partagée (cache 5 min). */
export function useSiteConfig() {
  return useQuery({ queryKey: ['site-config'], queryFn: fetchSiteConfig, staleTime: 5 * 60_000 });
}
