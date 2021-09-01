import Redis from "ioredis";

const client = process.env.NODE_ENV==='production' ? new Redis.Cluster([
  { 
    //host: 'vdiff-ui-test.9vczw1.clustercfg.use1.cache.amazonaws.com',
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT) || 6379
  }
]) : new Redis();

client.on('connect', function() {
    console.log('connected');
}).on('error', function (error) {
    console.log(error);
});

export default client;
