import { app } from './app.js';
import { config } from './config/env.js';
import { closeDatabasePool } from './db/pool.js';
const server = app.listen(config.port, config.host, () => {
    console.info(`Backend listening on http://${config.host}:${config.port}`);
});
let isShuttingDown = false;
async function shutdown(signal) {
    if (isShuttingDown) {
        return;
    }
    isShuttingDown = true;
    console.info(`Received ${signal}; shutting down.`);
    server.close(async (error) => {
        if (error) {
            console.error(JSON.stringify({ event: 'http_shutdown_failed' }));
            process.exitCode = 1;
        }
        try {
            await closeDatabasePool();
        }
        catch {
            console.error(JSON.stringify({ event: 'database_pool_shutdown_failed' }));
            process.exitCode = 1;
        }
    });
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
