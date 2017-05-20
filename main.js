const express = require('express');
const ZMQ = require('zmq');
sock = ZMQ.socket('req');
const app = express();
const config = require('./config');
const crypto = require('crypto');
const sign = crypto.createSign('RSA-SHA256');
const protocol = require('./protocol.js');
const request = require('request');
const bodyParser = require('body-parser');
const uuid = require('uuid/v4');
const cheerio = require('cheerio');

const mu2 = require('mu2');
mu2.root = __dirname + '/views';

const db = require('./db.js')({ uuid });
const email = require('./email.js')({ config });
const util = require('./util.js')({ protocol });
const zmq = require('./zmq.js')({ sock });

app.use(bodyParser.json()); // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({ // to support URL-encoded bodies
  extended: true
}));


const port = process.env.PORT || 3000;

app.listen(port, function () {
  console.log('Server is listening on port ', port);
});

const router = require('./router.js')({
  app, db, request, cheerio, mu2,
  sock, email, zmq, util});
