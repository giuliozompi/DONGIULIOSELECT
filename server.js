// Timeweb PM2 entry point
// The actual Express server is compiled to dist/index.js by the build step
import('./dist/index.js').catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
