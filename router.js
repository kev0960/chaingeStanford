const path = require('path');
module.exports = function (dependencies) {
  const app = dependencies['app'];
  const db = dependencies['db'];
  const request = dependencies['request'];
  const cheerio = dependencies['cheerio'];
  const mu2 = dependencies['mu2'];
  const node_email = dependencies['email'];
  const zmq = dependencies['zmq'];
  const util = dependencies['util'];
  const connect_node = dependencies['connect_node'];
  const auth = dependencies['auth'];
  const chain = dependencies['chain'];
  const txn_handler = dependencies['txn_handler'];

  app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname + '/index.html'));
  });

  // Send the verification email to the received address
  app.post('/add-me', function (req, res) {
    let email = req.body.email;
    console.log('Received Email :: ', email);
    db.save_email_validation_token(email).then(function (result) {
      if (result == false) {
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify(result));
      } else {
        // Send an email
        node_email.send_email(
          'jaebumlee94@gmail.com',
          email,
          'Thank you for registering Chainge',
          '',
          `<p>Thank you for registering Chainge</p>
                    <p>Your activation link is <a href="http://localhost:3333/verify/` + result +
          `">Here</a></p>`
        );
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify(result));
      }
    })
  });

  app.get('/verify/:token', function (req, res) {
    let token = req.params.token;
    db.get_token(token, function (err, email) {
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

            let html_stream = mu2.compileAndRender('verify.mustache', {
              name
            });
            html_stream.pipe(res);
          });
      }
    });
  });

  app.post('/verify/:token', function (req, res) {
    let token = req.params.token;
    let answer = req.body.answer;
    let name = req.body.name;
    let password = req.body.password;

    db.get_token(token, function (err, email) {
      if (answer == "Yes") {
        let data = {
          K: 20,
          identity: name,
          rsa_key_size: 2048,
          dh_key_size: 1024,
          token: token,
          type: 0,
          with_key : 1
        };

        console.log("set :: ", token);


        // Add a callback to execute when the specific response from
        // TXN generator comes back
        zmq.add_callback_for_token(token, function (data) {
          let data_txn = util.create_data_txn_from_obj(data);
          console.log(data)

          node_email.send_email(
            "jaebumlee94@gmail.com",
            email,
            "Your Data Record is successfully created!",
            "",
            `<p>Your Secret infos are as follows</p>
                 <ul>

                 <li>a :: ` + data_txn.a + `</li>
                 <li>r :: ` + data_txn.r + `</li>
                 <li>r_i :: ` + data_txn.r_i + `</li>
                         <li>key pairs :: ` + JSON.stringify({pb : data.pub_key, pv : data.prv_key}) + `</li>
                 </ul>`
          );

          res.send(JSON.stringify(data_txn));

          // Send created data txn to the nodes
          connect_node.send_txn(data_txn.serialize_data_txn);
          console.log("Serialized :: ", data_txn.serialize_data_txn);

          // Save created user's data txn
          db.save_user_txn(email, JSON.stringify({
            "serial": data_txn.serialize_data_txn,
            "sig": data_txn.signature,
            "state": "Pending",
            "secret" : {

              r_i : data_txn.r_i,
              r : data_txn.r,
              a : data_txn.a
            },
            "key" : "email",
            "value" : email
          }));

          db.save_user_password(email, password);
          db.save_txn_to_username(data_txn.signature, email);
          db.save_pubkey_to_user_name(data.pub_key, email);
          db.save_keys(email, data.pub_key, data.prv_key);
          zmq.remove_token_callback(token);
        });

        console.log("Sock sent!");
        zmq.send_data(JSON.stringify(data));
      }
    });
  });

  app.get('/login', auth.already_logged_in(), function (req, res) {
    res.sendFile(path.join(__dirname + '/views/login.html'));
  });

  app.get('/loginFailed', auth.already_logged_in(), function (req, res) {
    res.sendFile(path.join(__dirname + '/views/loginFailed.html'));
  });

  app.post('/login', auth.login('/loginFailed'),
    function (req, res) {
      res.redirect('/profile');
    }
  );

  app.post('/block/good-block', function (req, res) {
    // Received a good block
    //
    // it must notify it to the chain
    console.log("POST REQUEST RECEIVED :: ", req.body.block);
    chain.receive_good_block(req.body.block);

    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify({ result: "good" }));
  }
  );

  /**
   * Define POST request behavior on route /new_txn
   * It receives the POST params from the user, and cfeates / broadcasts the txn
   */
  app.post('/new_txn', auth.is_logged_in(), function (req, res) {
    let txn_type = parseInt(req.body.txn_type);
    let email = req.user;

    console.log(email);
    console.log(txn_type);

    switch(txn_type) {

        // Data TXN
      case 0:
        // Extract info
        var data_key = req.body.key;
        var data_val = req.body.value;
        let use_proxy = req.body.proxy;
        // txn_handler takes care of all zmq / connect_node operations
        txn_handler.data_txn_wrapper(email, data_key, data_val, use_proxy).then(function (data_txn) {
          let result = {
            success : true,
            data_txn : data_txn,
          };

          if (data_txn == null) {
            result = {
              success : false,
            };
          }

          res.setHeader('Content-Type', 'application/json');
          res.send(JSON.stringify(result));
        });
        break;

        // Req TXN
      case 1:

        let target_email = req.body.target_email;
        data_key = req.body.key;
        data_val = req.body.value;

        txn_handler.req_txn_wrapper(email, target_email, data_key, data_val).then(function(result) {
          res.setHeader('Content-Type', 'application/json');
          res.send(JSON.stringify(result));
        });
        break;

        // Ans TXN
      case 2:
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify({ result: "good" }));

        break;
    }
  });

  app.post('/link_generator_req_txn', function(req, res){
      let user_email = req.user;
      data_key = req.body.key;
      data_val = req.body.value;

      txn_handler.req_txn_wrapper('swjang@stanford.edu', user_email, data_key, data_val).then(function(result) {
          res.setHeader('Content-Type', 'application/json');
          res.send(JSON.stringify(result));
      });
  });

  app.get('/pending_txns', auth.is_logged_in(), function (req, res) {
    let username = req.user; // the login stanford email

    let dummy_list = [];
    dummy_list.push({
      email : "jbb@stanford.edu",
      key : "name",
    });

    dummy_list.push({
      email : "abcd@stanford.edu",
      key : "email",
    });

    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(dummy_list));

  });

  app.get('/profile', auth.is_logged_in(), function (req, res) {
    let username = req.user;

    db.get_user_txn(username).then(function (list) {
      let txn_list = [];
      for (let i = 0; i < list.length; i++) {
        let txn = JSON.parse(list[i]);
        txn_list.push(txn);
      }

      let num_rows = Math.ceil(txn_list.length / 4.0);
      let rows = [];

      // Populate empty row objects
      for (let i = 0; i < num_rows; i++) {
        rows.push({
          row_num : (i+1),
          cols : [],
        });
      }

      for (let i = 0; i < txn_list.length; i++) {
        let row_idx = Math.floor(i / 4.0);
        let txn = txn_list[i];

        // prepare block_num for rendering
        let block_num = null;

        if ('block_num' in txn) {
          block_num = txn.block_num;
        } else {
          block_num = 'Pending'
        }

        console.log("txn :: ", txn);

        let entry = {
          'key' : txn.key,
          'value': txn.value,
          'sig' : txn.sig,
          'block_num' : block_num,
          'r_i' : txn.secret.r_i,
          'r' : txn.secret.r,
          'a' : txn.secret.a,
        };

        rows[row_idx].cols.push(entry);
      }

      db.get_keys(username).then(function(keys) {
        let html_stream = mu2.compileAndRender('dashboard.mustache', {
          "email":username,
          "pub_key":keys[0],
          "prv_key":keys[1],
          "rows": rows,
        });

        html_stream.pipe(res);
      });

    });
  });

  app.get('/history', auth.is_logged_in(), function (req, res) {
    // shoot a list of this user's history (requests, answers)

    let email = req.user;

    // define query parameters
    let sig = null;
    let types = [1,2]; // we only want req and ans txns issued by me
    let committed = null; // can be either committed or not committed
    let block_num = null;

    let filter = txn_handler.build_query_filter(sig, types, committed, block_num, null);

    // Query my txns (issued by me) by the filter
    txn_handler.query_txns(email, filter).then(function(txns) {

        let displayables = [];

        for (let i = 0; i < txns.length; i++) {
            let txn = txns[i];
            let displayable = null;

            if (txn.type == 1) {
                displayable = util.format_req_txn_for_display(txn);
            } else {
                displayable = util.format_ans_txn_for_display(txn);
            }

            displayables.push(displayable);
        }

        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify(displayables));
    });


  });

  return {
    app
  }
}
