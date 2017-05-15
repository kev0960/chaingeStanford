const express = require('express');
const zmq = require('zmq');
sock = zmq.socket('req');
const app = express();
const nodemailer = require('nodemailer');
const config = require('./config');
const rsa = require('node-rsa');
const crypto = require('crypto');
const sign = crypto.createSign('RSA-SHA256');
const protocol = require('./protocol.js');
const stable_stringify = require('stable-stringify')
const request = require('request');
const bodyParser = require('body-parser');
const uuid = require('uuid/v4');
const redis = require('redis').createClient();
const path = require('path');
const cheerio = require('cheerio');
const hashmap = require('hashmap');
const mu2 = require('mu2');

mu2.root = __dirname + '/views';

app.use(bodyParser.json()); // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({ // to support URL-encoded bodies
  extended: true
}));


const port = process.env.PORT || 3000;
const waiting_txn = new hashmap();

app.listen(port, function () {
  console.log('Server is listening on port ', port);
  sock.connect("tcp://localhost:5555");

  sock.on('message', function (reply) {
    rep = reply.toString();

    // Remove NULL terminator
    rep = rep.replace(/\0/g, '');
    token = JSON.parse(rep)['token'];
    data_txn = create_data_txn_from_str(rep);
    send_email(
      "jaebumlee94@gmail.com",
      waiting_txn.get(token + "_email"),
      "Your Data Record is successfully created!",
      "",
      `<p>Your Secret infos are as follows</p>
      <ul>
        <li>a :: ` + data_txn.a + `</li>
        <li>r :: ` + data_txn.r + `</li>
        <li>r_i :: ` + data_txn.r_i + `</li>
      </ul>
      `
    );

    waiting_txn.get(token).send(JSON.stringify(data_txn));
    waiting_txn.remove(token);
  });
});

app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname + '/index.html'));
})

// Send the verification email to the received address
app.post('/add-me', function (req, res) {
  let email = req.body.email;
  console.log('Received Email :: ', email);
  save_email_validation_token(email).then(function (result) {
    if (result == false) {
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(result));
    } else {
      // Send an email
      send_email(
        'jaebumlee94@gmail.com',
        email,
        'Thank you for registering Chainge',
        '',
        `<p>Thank you for registering Chainge</p>
        <p>Your activation link is <a href="http://localhost:3000/verify/` + result +
        `">Here</a></p>`
      );
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(result));
    }
  })
});

app.get('/verify/:token', function (req, res) {
  let token = req.params.token;
  redis.get(VERIFY_LINK + token, function (err, email) {
    if (err || !email) {
      res.sendFile(path.join(__dirname + '/page_not_found.html'));
    } else {
      // Now fetch the real name
      request.post({
          url: 'https://stanfordwho.stanford.edu/SWApp/Search.do',
          form: {
            search: email
          }
        },
        function (err, response) {
          const profile = cheerio.load(response.body);
          let name = profile("#PublicProfile").find("h2").text().trim();

          let html_stream = mu2.compileAndRender('verify.mustache', { name });
          html_stream.pipe(res);
        });
    }
  });
});

app.post('/verify/:token', function (req, res) {
  let token = req.params.token;
  let answer = req.body.answer;
  let name = req.body.name;
  redis.get(VERIFY_LINK + token, function (err, email) {
    if (answer == "Yes") {
      data = {
        K : 20,
        identity : name,
        rsa_key_size : 2048,
        dh_key_size : 1024,
        token : token
      };

      console.log("set :: ", token);
      waiting_txn.set(token, res);
      waiting_txn.set(token + "_email" , email);

      console.log("Sock sent!");
      sock.send(JSON.stringify(data));
    }
  });
})

const create_data_txn_from_str = function (str_txn_data) {
  txn_data = JSON.parse(str_txn_data);

  str_pub_key = txn_data.pub_key;
  str_prv_key = txn_data.prv_key;

  let prv_key = new rsa();
  prv_key.importKey(str_prv_key, 'pkcs1-private');

  let pub_key = new rsa();
  pub_key.importKey(str_pub_key, 'pkcs8-public');

  str_prv_key = prv_key.exportKey('pkcs8-private');
  str_pub_key = pub_key.exportKey('pkcs8-public');

  const txn_payload = {
    G: txn_data.G,
    g: txn_data.g,
    g_a: txn_data.g_a,
    g_r: txn_data.g_r,
    K: txn_data.K,
    secret: txn_data.secret,
    g_r_i: txn_data.g_r_i,
    timestamp: Date.now(),
    type: 0
  }

  const txn_payload_str = stable_stringify(txn_payload);
  const txn_sig = protocol.create_sign(txn_payload_str, str_prv_key);

  const data_txn_obj = {
    public_key: str_pub_key,
    signature: txn_sig,
    payload: txn_payload_str
  };

  const data_txn = protocol.create_data_txn_from_obj(data_txn_obj);
  const serialize_data_txn = stable_stringify(data_txn_obj);

  return {
    r: txn_data.r,
    a: txn_data.a,
    r_i: txn_data.r_i,
    serialize_data_txn
  };
}
let transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: config.nodemailer.email,
    pass: config.nodemailer.password
  }
});

const send_email = function (from, to, subject, text, html) {
  let message = {
    from,
    to,
    subject,
    text,
    html
  };

  transporter.sendMail(message, function (err, res) {
    if (err) {
      console.log("Failed :: ", err);
    } else {
      console.log("Success :: ", res);
    }
  });
}

redis.on('ready', function () {
  console.log("Redis is now connected!");
});

redis.on('error', function () {
  console.log('Redis is dead .. ' + err);
})

const USER_EMAIL = 'USER_EMAIL_';
const VERIFY_LINK = 'TOKEN_';

const save_email_validation_token = function (email) {
  let p1 = new Promise(function (resolve, reject) {
    redis.get(USER_EMAIL + email, function (err, data) {
      console.log("Got :: ", err, data);
      // Token is saved in a following format
      // USER_EMAIL_<user email> ==> (Time it is saved):(uuid token)
      if (data) {
        date = data.substring(0, data.indexOf(':'));
        token = data.substring(data.indexOf(':') + 1);

        // If registered token is old, then we issue a new token
        // (old here means 7 days ago)
        if (parseInt(date) < Date.now() - 1000 * 7 * 24 * 60 * 60) {
          const new_token = uuid();

          // Remove previous token
          redis.del(VERIFY_LINK + token);

          // Replace with the new one
          redis.set(VERIFY_LINK + new_token, email);
          redis.set(USER_EMAIL + email, Date.now().toString() + ':' + new_token,
            function (resolve, reject) {
              resolve(new_token);
            }
          );
        } else {
          resolve(false);
        }
      } else {
        const new_token = uuid();
        redis.set(VERIFY_LINK + new_token, email);
        redis.set(USER_EMAIL + email, Date.now().toString() + ':' + new_token,
          function (err, data) {
            resolve(new_token);
          }
        );
      }
    });
  });

  return p1;
}