module.exports = function(dependencies) {
  const db = dependencies['db'];
  const zmq = dependencies['zmq'];
  const connect_node = dependencies['connect_node'];
  const uuid = dependencies['uuid'];
  const util = dependencies['util'];
  const protocol = dependencies['protocol'];
  const stable_stringify = require('stable-stringify');

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
        util.find_data_txn_with_key(target_email, id_key).then(function(txn) {
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
            resolve(false);
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
            req_txn_payload.timestampe = Date.now();

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

            db.save_txn_to_username(db_txn_entry);

            zmq.remove_token_callback(token);

            resolve(true);
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


    });
  }

  return {
    data_txn_wrapper,
    req_txn_wrapper,
    ans_txn_wrapper,
  };
}
