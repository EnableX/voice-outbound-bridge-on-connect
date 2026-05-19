const fs = require('fs');
const http = require('http');
const https = require('https');
const { EventEmitter } = require('events');
const express = require('express');
const bodyParser = require('body-parser');
const { createDecipher } = require('crypto');
require('dotenv').config();
const _ = require('lodash');
const logger = require('./logger');
const { makeOutboundCall, hangupCall } = require('./voiceapi');

const app = express();
const eventEmitter = new EventEmitter();

let server;
let callVoiceId;
const sseMsg = [];
const servicePort = process.env.SERVICE_PORT || 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static('client'));

function shutdown() {
  server.close(() => {
    logger.error('Shutting down the server');
    process.exit(0);
  });
  setTimeout(() => { process.exit(1); }, 10000);
}

function onListening() {
  console.log(`Listening on Port ${servicePort}`);
}

function onError(error) {
  if (error.syscall !== 'listen') throw error;
  switch (error.code) {
    case 'EACCES':
      logger.error(`Port ${servicePort} requires elevated privileges`);
      process.exit(1);
      break;
    case 'EADDRINUSE':
      logger.error(`Port ${servicePort} is already in use`);
      process.exit(1);
      break;
    default:
      throw error;
  }
}

function createAppServer() {
  if (process.env.LISTEN_SSL !== 'false') {
    const options = {
      key: fs.readFileSync(process.env.CERTIFICATE_SSL_KEY).toString(),
      cert: fs.readFileSync(process.env.CERTIFICATE_SSL_CERT).toString(),
    };
    if (process.env.CERTIFICATE_SSL_CACERTS) {
      options.ca = [fs.readFileSync(process.env.CERTIFICATE_SSL_CACERTS).toString()];
    }
    server = https.createServer(options, app);
  } else {
    server = http.createServer(app);
  }
  app.set('port', servicePort);
  server.listen(servicePort);
  server.on('error', onError);
  server.on('listening', onListening);
}

if (process.env.ENABLEX_APP_ID && process.env.ENABLEX_APP_KEY) {
  createAppServer();
} else {
  logger.error('Please set env variables - ENABLEX_APP_ID, ENABLEX_APP_KEY');
}

process.on('SIGINT', () => {
  console.log('Caught interrupt signal');
  shutdown();
});

// POST /outbound-call/ — initiates a bridged outbound call from the UI form
app.post('/outbound-call/', (req, res) => {
  const { from, to, bridge_to } = req.body;

  if (!from || !to || !bridge_to) {
    return res.status(400).json({ error: 'from, to, and bridge_to are required' });
  }

  makeOutboundCall({ from, to, bridge_to }, (response) => {
    const msg = JSON.parse(response);
    if (msg.voice_id) {
      callVoiceId = msg.voice_id;
      console.log(`Call initiated. Voice ID: ${callVoiceId}`);
      return res.status(200).json({ voice_id: callVoiceId, status: 'initiated' });
    }
    logger.error(`Failed to initiate call: ${response}`);
    return res.status(500).json({ error: 'Failed to initiate call', detail: msg });
  });
});

// GET /event-stream — SSE endpoint streaming call events to the browser
app.get('/event-stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const id = (new Date()).toLocaleTimeString();
  const interval = setInterval(() => {
    if (!_.isEmpty(sseMsg[0])) {
      res.write(`id: ${id}\n`);
      res.write(`data: ${sseMsg.shift()}\n\n`);
    }
  }, 100);

  req.on('close', () => clearInterval(interval));
});

// POST /event — webhook called by EnableX on call state changes
app.post('/event', (req, res) => {
  let jsonObj;
  if (req.headers['x-algoritm'] !== undefined) {
    const key = createDecipher(req.headers['x-algoritm'], process.env.ENABLEX_APP_ID);
    let decryptedData = key.update(req.body.encrypted_data, req.headers['x-format'], req.headers['x-encoding']);
    decryptedData += key.final(req.headers['x-encoding']);
    jsonObj = JSON.parse(decryptedData);
  } else {
    jsonObj = req.body;
  }
  console.log('Webhook event:', JSON.stringify(jsonObj));
  res.sendStatus(200);
  sseMsg.push('__WEBHOOK__:' + JSON.stringify(jsonObj));
  eventEmitter.emit('voicestateevent', jsonObj);
});

function timeOutHandler(voiceId) {
  console.log(`[${voiceId}] Disconnecting call`);
  hangupCall(voiceId, () => {});
}

function voiceEventHandler(voiceEvent) {
  console.log('Voice event:', JSON.stringify(voiceEvent));

  if (voiceEvent.state === 'connected') {
    const msg = `Call connected — bridging to ${voiceEvent.voice_id}`;
    console.log(msg);
    sseMsg.push(msg);
  } else if (voiceEvent.state === 'disconnected') {
    const msg = 'Call disconnected';
    console.log(msg);
    sseMsg.push(msg);
  }

  if (voiceEvent.playstate === 'playfinished') {
    console.log(`[${callVoiceId}] Play finished — disconnecting in 5s`);
    setTimeout(timeOutHandler, 5000, voiceEvent.voice_id);
  }
}

eventEmitter.on('voicestateevent', voiceEventHandler);
