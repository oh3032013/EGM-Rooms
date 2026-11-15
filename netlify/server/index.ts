import { createMultiplayerServer } from '../../src/server/createMultiplayerServer.ts';

// Netlify Server automatically serves static files in `dist` via CDN
// and forwards API (/api/*) and WebSocket (/ws) traffic to this exported http.Server.
const { server } = createMultiplayerServer({ serveStaticDist: false });

export default server;
