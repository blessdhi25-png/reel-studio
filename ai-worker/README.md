# ClipPulse AI worker

Deploy (Render): New > Web Service > this folder (`ai-worker/`), build `npm install`, start `npm start`.
Env: `AI_WORKER_TOKEN` (make one: `openssl rand -hex 32`), `REPLICATE_API_TOKEN`.

Then on the ClipPulse backend:
    AI_WORKER_URL=https://<your-service>.onrender.com/generate
    AI_WORKER_TOKEN=<same token>

Contract: POST /generate, multipart `image`, `modelEndpoint`, `templateId` -> `{ "videoUrl": "..." }`.
`modelEndpoint` is a Replicate slug (`owner/model` or `owner/model:version`).
Use a paid Render instance (or any host without a short request cap): generations take 1-3 minutes.
