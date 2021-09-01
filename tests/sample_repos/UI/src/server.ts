import express from 'express';
import http from 'http';
import cors from 'cors';
import router from './router';

const port = process.env.PORT || 3080;
const app = express();
app.use(cors())
const server = http.createServer(app);

app.use(router);
app.use((error, req, res, next) => {
  if (!error.statusCode) error.statusCode = 500;
 
  return res
    .status(error.statusCode)
    .json({ error: error.toString() });
});

server.listen(port, '0.0.0.0' as any);