// cSpell:ignore txn, merkle, txns, deserialized
const express = require('express');
const ZMQ = require('zmq');
const sock = ZMQ.socket('req');
const passport = require('passport');
const session = require('express-session');
const redis_session = require('connect-redis')(session);

const app = express();
const config = require('./config');
const crypto = require('crypto');
const protocol = require('./protocol.js');
const request = require('request');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const uuid = require('uuid/v4');
const cheerio = require('cheerio');
const bcrypt = require('bcrypt');
const stable_stringify = require('json-stable-stringify');

const mu2 = require('mu2');
mu2.root = __dirname + '/views';

const connect_node = require('./connect_node')();
const zmq = require('./zmq.js')({
  sock
});
const util = require('./util.js')({
  protocol
});

const db = require('./db.js')({
  uuid,
  bcrypt,
  config,
  zmq,
  util,
});
const email = require('./email.js')({
  config
});
const transaction = require('./transaction.js')({
  crypto,
  stable_stringify
});
const merkle_tree = require('./merkle_tree.js')({
  crypto,
  transaction,
  stable_stringify
});
const block = require('./block.js')({
  merkle_tree,
  crypto,
  stable_stringify
});

const chain = require('./chain.js')({
  block,
  db,
});

app.use(cookieParser());
app.use(bodyParser.json()); // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({ // to support URL-encoded bodies
  extended: true
}));
app.use(session({
  store: new redis_session({
    url: config.auth.auth_db_url
  }),
  secret: config.auth.cookie_secret,
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());
app.use(express.static('views/static'))

const port = process.env.PORT || 3333;

app.listen(port, function () {
  console.log('Server is listening on port ', port);
});

const auth = require('./auth.js')({
  passport,
  db
});
const router = require('./router.js')({
  app,
  db,
  request,
  cheerio,
  mu2,
  email,
  zmq,
  util,
  connect_node,
  auth,
  config,
  chain
});