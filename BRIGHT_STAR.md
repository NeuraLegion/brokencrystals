# 🌟 Bright Star — Run Memory

<!-- BRIGHT_STAR_DATA — generated; do not edit -->
```json
{
  "version": 1,
  "generatedAt": "2026-08-27T19:03:52.355Z",
  "techStack": {
    "languages": [
      "JavaScript",
      "TypeScript"
    ],
    "frameworks": [
      "NestJS"
    ],
    "databases": [
      "PostgreSQL"
    ]
  },
  "startup": {
    "command": "docker compose -f compose.local.yml up -d --build",
    "port": 3000,
    "prerequisites": [],
    "envVars": {},
    "healthCheckPath": "/api/config"
  },
  "setup": {
    "completed": true,
    "credentials": {
      "username": "bright_test",
      "password": "BrightTest123!",
      "email": "bright@test.com"
    }
  },
  "auth": {
    "hasAuth": true,
    "authObjectId": "12deWAeCN9PUisAT3c5rqF",
    "registration": {
      "baseUrl": "http://localhost:3000",
      "endpoint": "/api/users/basic",
      "method": "POST",
      "body": "{\"email\":\"bright@test.com\",\"password\":\"BrightTest123!\",\"firstName\":\"Bright\",\"lastName\":\"Test\",\"company\":\"Bright\",\"cardNumber\":\"4111111111111111\",\"phoneNumber\":\"1234567890\",\"op\":\"basic\"}",
      "contentType": "json"
    }
  },
  "hints": {
    "startup": [
      "Repo is Broken Crystals: NestJS/Fastify server plus React client. Recommended local startup in README is `docker compose --file=compose.local.yml up -d` and app should publish http://localhost:3000 with health-ish endpoint /api/config.",
      "App source Dockerfile uses node:18-alpine, builds server and client, and container runs `npm run start:prod`. Main server listens on 0.0.0.0:3000 and gRPC on 0.0.0.0:5000.",
      "Successful reproducible startup: `docker compose -f compose.local.yml up -d --build`. Host base URL is http://localhost:3000 and `/api/config` returns HTTP 200 once up."
    ]
  }
}
```
<!-- BRIGHT_STAR_DATA -->
