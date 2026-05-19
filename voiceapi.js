const { request } = require('https');
const btoa = require('btoa');
require('dotenv').config();
const logger = require('./logger');

const httpOptions = {
  host: 'api-qa.enablex.io',
  port: 443,
  headers: {
    Authorization: `Basic ${btoa(`${process.env.ENABLEX_APP_ID}:${process.env.ENABLEX_APP_KEY}`)}`,
    'Content-Type': 'application/json',
  },
};

const connectEnablexServer = (data, callback) => {
  logger.info(`REQ URI:- ${httpOptions.method} ${httpOptions.host}:${httpOptions.port}${httpOptions.path}`);
  logger.info(`REQ PARAM:- ${data}`);

  const req = request(httpOptions, (res) => {
    let body = '';
    res.on('data', (chunk) => { body += chunk; });
    res.on('end', () => { callback(body); });
    res.on('error', (e) => { logger.error(`Request error: ${e.message}`); });
  });

  req.end(data || '');
};

function makeOutboundCall(reqDetails, callback) {
  httpOptions.path = '/voice/v1/call';
  httpOptions.method = 'POST';

  const postData = JSON.stringify({
    name: 'OutboundBridgeApp',
    owner_ref: reqDetails.from,
    from: reqDetails.from,
    to: reqDetails.to,
    auto_record: false,
    action_on_connect: {
      connect: {
        from: reqDetails.from,
        to: reqDetails.bridge_to,
      },
    },
    event_url: `${process.env.PUBLIC_WEBHOOK_URL}/event`,
  });

  connectEnablexServer(postData, (response) => {
    logger.info(`RESPONSE:- ${response}`);
    callback(response);
  });
}

function hangupCall(callVoiceId, callback) {
  httpOptions.path = `/voice/v1/call/${callVoiceId}`;
  httpOptions.method = 'DELETE';
  connectEnablexServer('', (response) => {
    logger.info(`RESPONSE:- ${response}`);
    callback(response);
  });
}

module.exports = { makeOutboundCall, hangupCall };
