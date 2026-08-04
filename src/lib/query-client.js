import { QueryClient } from '@tanstack/react-query';


export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			// Never auto-retry — retries against a 429 host-day bucket burned the
			// anatome.dev fair-use cap in the background.
			retry: false,
		},
	},
});