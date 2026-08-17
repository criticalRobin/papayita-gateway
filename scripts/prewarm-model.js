// Build-time only: downloads the classification embedding model into the
// image so the production container never needs outbound internet access
// at runtime. Run from the Dockerfile's builder stage, after `nest build`.
(async () => {
  const { pipeline, env } = await import('@xenova/transformers');
  env.cacheDir = '/app/.cache/transformers';
  await pipeline(
    'feature-extraction',
    'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
  );
  console.log('model prewarmed');
})();
