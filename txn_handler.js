module.exports = function(dependencies) {
  const db = dependencies['db'];
  const zmq = dependencies['zmq'];
  const connect_node = dependencies['connect_node'];
  const uuid = dependencies['uuid'];
  const util = dependencies['util'];
  const protocol = dependencies['protocol'];
  const stable_stringify = require('json-stable-stringify');
  const transaction = dependencies['transaction']


  const data_txn_wrapper = function(email, id_key, id_val, use_proxy) {
    return new Promise(function(resolve, reject) {
      // Create an unique token to identify the result
      const token = uuid();

      // new DATA_TXN is created but it does not generate
      // new rsa key.
      let data = {
        K : 20,
        identity : util.create_sha256_hash(id_val),
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
          console.log("keys :: ", keys);
          let pub_key = keys[0];
          let prv_key = keys[1];

          data["pub_key_pkcs8"] = pub_key;
          data["prv_key_pkcs8"] = prv_key;

          let data_txn = util.create_data_txn_from_obj(data);

          console.log(data_txn);

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
            "value" : id_val, // TODO : remove this?
            "type" : 0,
          }));

          db.save_txn_to_username(data_txn.signature, email);

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
            resolve({success: false, message: "transaction could not be foundi"});
            return ;
          }

          if (!txn.hasOwnProperty('block_num')) {
            resolve({success: false, message: "the data record is not committed yet"});
            return ;
          }

          // these should be in there
          let block_num = txn.block_num;
          let sig = txn.sig;

          let data = {
            type: 1,
            with_key:1,
            token: token,
            'data_txn' : {'txn_payload': txn.serial.payload},
            'identity' : util.create_sha256_hash(id_val),
          };

          // register callback for zmq
          zmq.add_callback_for_token(token, function(txn_payload) {
            // txn payload {g_b, g_g_ab_p_r, req, b}
            console.log("TXN payload : ", txn_payload);
            // req_txn_payload : {req, data_blk_num, data_txn_sig, req_blk_num, req_txn_num}
            let req_txn_payload = {
              req : txn_payload.req,
              data_blk_num : block_num,
              data_txn_sig : sig,
              g_b : txn_payload.g_b,
              g_g_ab_p_r : txn_payload.g_g_ab_p_r,
              type : 1,
              timestamp : Date.now()
            }

            // wrap so that it fits the req txn definition

            // You need to find out the private key to sign the message
            db.get_keys(email).then(function (rsa_keys) {
              let pub_key = rsa_keys[0];
              let prv_key = rsa_keys[1];

              const txn_payload_str = stable_stringify(req_txn_payload);
              console.log("Txn payload :: ", txn_payload_str);

              const txn_sig = protocol.create_sign(txn_payload_str, prv_key);

              const req_txn_obj = {
                public_key : pub_key,
                signature : txn_sig,
                payload : txn_payload_str,
              }

              const serialized_txn = stable_stringify(req_txn_obj);
              console.log("Creaeted Request TXN :: ", serialized_txn);

              const db_txn_entry = {
                "serial": serialized_txn,
                "sig" : txn_sig,
                "state" : "Pending",
                "type" : 1,
                "target" : target_email, // req txn specific info,
                "answered" : false,
                "key" : id_key, // the key that I'm requesting
                "requester": email,
              };

              // Save this request txn to the issuer
              db.save_user_txn(email, JSON.stringify(db_txn_entry));
              db.save_txn_to_username(txn_sig, email);

              // send to the blockchain server
              connect_node.send_txn(serialized_txn);

              zmq.remove_token_callback(token);
              resolve({success: true, message: "successfully requested id verification"});

            });

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
        if (!req_list) {
          resolve();
          return ;
        }

        console.log("recved sig :: ", request_txn_sig);

        for (let i = 0; i < req_list.length; i ++) {
          let saved_req = JSON.parse(req_list[i]);

          console.log("Saved req sig :: ", saved_req.sig);
          if (saved_req.sig == request_txn_sig) {

            // Make the answer transaction for this request.
            // Hence we have to find what data transaction this
            // req has asked.

            console.log("SAVED REQ :: ", saved_req);
            let request_txn = transaction.create_transaction(saved_req.serial);
            let data_txn_sig = request_txn.get_data_txn_sig();

            console.log("DATA transaction sig :: ", data_txn_sig);

            db.get_user_txn(email).then(function (txn_list) {
              for (let i = 0; i < txn_list.length; i ++) {
                let saved_txn = JSON.parse(txn_list[i]);

                console.log("SIGS :: ", saved_txn.sig);

                if (data_txn_sig == saved_txn.sig) {
                  let data_txn = transaction.create_transaction(saved_txn.serial);

                  // Create the answer transaction with
                  // data_txn and req_txn

                  let token = uuid();
                  let data = {
                    type : 2,
                    G : data_txn.get_G(),
                    g : data_txn.get_g(),
                    g_b : request_txn.get_g_b(),
                    r_i : saved_txn.secret.r_i,
                    r : saved_txn.secret.r,
                    a : saved_txn.secret.a,
                    req : request_txn.get_req(),
                    token : token
                  };

                  zmq.add_callback_for_token(token, function(txn_payload) {
                    // txn_payload = {response}

                    let ans_txn_payload = {
                      res : txn_payload.response
                    };

                    ans_txn_payload['data_blk_num'] = saved_txn.block_num;
                    ans_txn_payload['data_txn_sig'] = saved_txn.sig;

                    ans_txn_payload['req_blk_num'] = saved_req.block_num;
                    ans_txn_payload['req_txn_sig'] = saved_req.sig;

                    ans_txn_payload['timestamp'] = Date.now();
                    ans_txn_payload['type'] = 2;

                    const txn_payload_str = stable_stringify(ans_txn_payload);
                    console.log("ans_txn_payload :: ", ans_txn_payload);

                    db.get_keys(email).then(function(rsa_keys) {
                      let pub_key = rsa_keys[0];
                      let prv_key = rsa_keys[1];

                      const txn_sig = protocol.create_sign(txn_payload_str, prv_key);

                      console.log("TXN payload str :: ", txn_payload_str);

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
                        "requester" : saved_req.requester,
                        "key" : saved_req.key,
                      };

                      db.save_txn_to_username(txn_sig, email);
                      db.save_user_txn(email, JSON.stringify(db_txn_entry));

                      zmq.remove_token_callback(token);

                      connect_node.send_txn(serialized_txn);
                      resolve({success: true, message: "successfully created answer txn"});
                      return ;
                    });
                  });

                  console.log(JSON.stringify(data));
                  zmq.send_data(JSON.stringify(data));
                  break;
                }
              }

            });

          }
        }
      });

    });
  }

  const build_query_filter = function(sig, types, committed, block_num, kwarg) {
    // sig = string | types = array | committed = Boolean | block_num = Number
    // filters behave by exact match except for the type

    let filter = {};
    if (kwarg != undefined && kwarg != null) {
      filter = kwarg;
    }

    if (sig != undefined && sig != null) filter.sig = [sig];
    if (types != undefined && types != null) filter.types = types;
    if (committed != undefined && committed != null) {
      filter.committed = [committed];
      if (committed && block_bum != null) {
        filter.block_num = [block_num];
      }
    }

    return filter;
  };

  const txn_matches_filter = function(txn, filter) {
    let filter_keys = Object.keys(filter);

    // filter by linear loop over the keys
    for (let i = 0; i < filter_keys.length; i++) {
      let key = filter_keys[i];

      // check only for the keys that exist in the txn
      if (key in txn && !(filter[key].includes(txn[key]))) {
        return false;
      }
    }

    return true;
  };

  const query_txns = function(email, filter) {
    // filter must be an object that looks like a db_txn_entry

    return new Promise(function(resolve, reject) {

      db.get_user_txn(email).then(function(list) {

        let txns = [];

        if (list == undefined || list == null || list.length == 0) {
          resolve(txns);
          return;
        }

	console.log(list.length);

        for (let i = 0; i < list.length; i++) {
	  console.log(list[i]);
          let txn = util.parse_db_txn_entry(list[i]);
	  console.log("got here");
          // compare txn with the filter
          if (txn_matches_filter(txn, filter)) {
            txns.push(txn);
          }
        }
	console.log("oome");
        resolve(txns);
      });
    });
  };

  return {
    data_txn_wrapper,
    req_txn_wrapper,
    ans_txn_wrapper,
    build_query_filter,
    query_txns,
  };
}
