module.exports = function(dependencies) {
  const db = dependencies['db'];
  const zmq = dependencies['zmq'];
  const connect_node = dependencies['connect_node'];
  const uuid = dependencies['uuid'];
  const util = dependencies['util'];
  const protocol = dependencies['protocol'];
  const stable_stringify = require('stable-stringify');
  const transaction = dependencies['transaction']


  const data_txn_wrapper = function(email, id_key, id_val, use_proxy) {
    return new Promise(function(resolve, reject) {
      // Create an unique token to identify the result
      const token = uuid();

      // new DATA_TXN is created but it does not generate
      // new rsa key.
      let data = {
        K : 20,
        identity : id_val,
        rsa_key_size : 2048,
        dh_key_size : 1024,
        token : token,
        type : 0,
        with_key : 0
      };
      console.log("Creating Transaction with :: ", data);

      // Now add a zmq callback to execute when the new transaction
      // is created from TXN generator (./main)

      zmq.add_callback_for_token(token, function(data) {
        // Retrieve the public and private key pair from
        // the db

        db.get_keys(email).then(function(keys) {
          let pub_key = keys[0];
          let prv_key = keys[1];

          data["pub_key_pkcs8"] = pub_key;
          data["prv_key_pkcs8"] = prv_key;

          console.log(data);

          let data_txn = util.create_data_txn_from_obj(data);

          // Save the newly created data
          db.save_user_txn(email, JSON.stringify({
            "serial" : data_txn.serialize_data_txn,
            "sig" : data_txn.signature,
            "state" : "Pending",
            "secret" : {
              r_i : data_txn.r_i,
              r : data_txn.r,
              a : data_txn.a
            },
            "key" : id_key,
            "value" : id_val // TODO : remove this?
          }));

          db.save_txn_to_username(data_txn.signature, email);

          db.save_pubkey_to_user_name(data.pub_key, email);
          db.save_keys(email, data.pub_key, data.prv_key);

          // send to the blockchain server
          connect_node.send_txn(data_txn.serialize_data_txn);

          zmq.remove_token_callback(token);
          resolve (data_txn);
        });
      });
      zmq.send_data(JSON.stringify(data));
    });
  }

  const req_txn_wrapper = function(email, target_email, id_key, id_val) {
    // Request the target email for verification of the id_key with the id_val
    return new Promise(function(resolve, reject) {
      db.get_keys(email).then(function(keys) {
        pub_key = keys[0];
        prv_key = keys[1];

        // create new token
        const token = uuid();

        // find target's data_txn with the given key
        db.find_data_txn_with_key(target_email, id_key).then(function(txn) {
          // txn = {
          //      serial : {
          //          public_key,
          //          signature,
          //          payload : {
          //              G, g, g_a, g_r, K, secret, g_r_i, timestamp, type
          //          },
          //      },
          //      sig,
          //      state,
          //      block_num,

          if (txn == undefined || txn == null) {
            resolve({result: false, message: "transaction could not be found"});
          }

          if (!(block_num in txn)) {
            resolve({result: false, message: "the data record is not committed yet"});
          }

          // these should be in there
          let block_num = txn.block_num;
          let sig = txn.sig;

          let data = {
            type: 1,
            with_key:1,
            token: token,
            'data_txn' : {'txn_payload': txn.serial.payload},
            'identity' : id_val,
          };

          // register callback for zmq
          zmq.add_callback_for_token(token, function(req_txn_payload) {
            // req_txn_payload : {g_b, g_g_ab_p_r, req, b, token}

            // wrap so that it fits the req txn definition
            req_txn_payload.data_blk_num = block_num;
            req_txn_payload.data_txn_sig = sig;
            req_txn_payload.type = 1;
            req_txn_payload.timestamp = Date.now();

            const txn_payload_str = stable_stringify(req_txn_payload);
            const txn_sig = protocol.create_sign(txn_payload_str);

            const req_txn_obj = {
              public_key : pub_key,
              signature : txn_sig,
              payload : txn_payload_str,
            }

            const serialized_txn = stable_stringify(req_txn_obj);

            const db_txn_entry = {
              "serial": serialized_txn,
              "sig" : txn_sig,
              "state" : "Pending",
              "type" : 1,
              "target" : target_email, // req txn specific info
            };

            // Save this request txn to the issuer
            db.save_uer_txn(email, db_txn_entry);
            db.save_txn_to_username(txn_sig, email);

            // send to the blockchain server
            connect_node.send_txn(serialized_txn);

            zmq.remove_token_callback(token);
            resolve({result: true, message: "successfully requested id verification"});
          });

          console.log(JSON.stringify(data));
          zmq.send_data(JSON.stringify(data));
        });
      });

    });
  }

  const ans_txn_wrapper = function(email, request_txn_sig) {
    return new Promise(function (resolve, reject) {
      // First find the request transaction that
      // targets the user (email)
      db.get_req_txns_for_user (email).then(function (req_list) {
        if (!req_list) resolve();

        for (let i = 0; i < req_list.length; i ++) {
          let saved_req = JSON.parse(req_list[i]);

          if (saved_req.sig == request_txn_sig) {
            // Make the answer transaction for this request.
            // Hence we have to find what data transaction this
            // req has asked.

            let request_txn = transaction.create_transaction(saved_req.serial);
            let data_txn_sig = request_txn.get_data_txn_sig();

            db.get_user_txn(email).then(function (txn_list) {
              for (let i = 0; i < txn_list.length; i ++) {
                let saved_txn = JSON.parse(txn_list[i]);

                if (data_txn_sig == txn_list[i].sig) {
                  let data_txn = transaction.create_transaction(saved_txn.serial);

                  // Create the answer transaction with
                  // data_txn and req_txn

                  let token = uuid();
                  let data = {
                    type : 2,
                    data_txn : JSON.parse({
                      txn_payload : {
                        G : data_txn.get_G(),
                        g : data_txn.get_g(),
                      }
                    }),
                    request_txn : JSON.parse({
                      txn_payload : {
                        g_b : data_txn.get_g_b()
                      }
                    }),
                    secret : JSON.parse({
                      r_i : saved_txn.secret.r_i,
                      r : saved_txn.secret.r,
                      a : saved_txn.secret.a
                    })
                  };


                  zmq.add_callback_for_token(token, function(ans_txn_payload) {
                    // main returns response

                    ans_txn_payload['data_blk_num'] = saved_txn.block_num;
                    ans_txn_payload['data_blk_sig'] = saved_txn.sig;

                    ans_txn_payload['req_blk_num'] = saved_req.block_num;
                    ans_txn_payload['req_blk_sig'] = saved_req.sig;

                    ans_txn_payload['timestamp'] = Date.now();
                    ans_txn_payload['type'] = 2;

                    const txn_payload_str = stable_stringify(ans_txn_payload);
                    const txn_sig = protocol.create_sign(txn_payload_str);

                    const ans_txn_obj = {
                      public_key : pub_key,
                      signature : txn_sig,
                      payload : txn_payload_str,
                    }

                    const serialized_txn = stable_stringify(ans_txn_obj);

                    const db_txn_entry = {
                      "serial": serialized_txn,
                      "sig" : txn_sig,
                      "state" : "Pending",
                      "type" : 2,
                    };

                    db.save_txn_to_username(db_txn_entry);
                    zmq.remove_token_callback(token);
                    resolve(true);
                  });

                  console.log(JSON.stringify(data));
                  zmq.send_data(JSON.stringify(data));
                }
              }

            });

          }
        }
      });

    });
  }

  return {
    data_txn_wrapper,
    req_txn_wrapper,
    ans_txn_wrapper,
  };
}
