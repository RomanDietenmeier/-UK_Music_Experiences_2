import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		adapter: adapter({ fallback: 'index.html' }),
		// Base path for subsite deployment. Set BASE_PATH=/subpath at build time
		// to deploy under https://host/subpath/. Leave unset (or empty) for root
		// deployment. SPA fallback mode requires a known base at build time —
		// relative asset paths cannot work from arbitrary URL depths.
		paths: {
			base: process.env.BASE_PATH ?? '',
			relative: true
		}
	}
};

export default config;
