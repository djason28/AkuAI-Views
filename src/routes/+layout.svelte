<script>
	import '$lib/styles/global.css';
	import '$lib/styles/chat.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
	
	// Force dark background on layout load
	if (typeof document !== 'undefined') {
		document.documentElement.style.setProperty('background', 'linear-gradient(135deg, #0f1419 0%, #1a202c 50%, #2d3748 100%)', 'important');
		document.body.style.setProperty('background', 'linear-gradient(135deg, #0f1419 0%, #1a202c 50%, #2d3748 100%)', 'important');
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<style>
		html, body {
			background: linear-gradient(135deg, #0f1419 0%, #1a202c 50%, #2d3748 100%) !important;
		}
	</style>
</svelte:head>

<div style="background: linear-gradient(135deg, #0f1419 0%, #1a202c 50%, #2d3748 100%); min-height: 100vh;">
	{@render children?.()}
</div>
