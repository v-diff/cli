## Overview
This repo contains the logic for the vdiff diff service.  This service is responsible for receiving posts with the paired requests and exposing them to the frontend.

### Running locally
To run a local version of the service
1. Install [redis](https://redis.io/download) and follow instructions
2. Start redis
```
redis-server
```
3. Start server
```
npm install
npm run dev
```

Some mock data can be send to the server by running
```
npx ts-node test/simulateService
```