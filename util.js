const rsa = require('node-rsa');
const stable_stringify = require('stable-stringify')

module.exports = function (dependencies) {
  const protocol = dependencies['protocol'];
  const parse_db_txn_entry = function (db_entry) {
    // db txn entry : JSON.stringify({serial, sig, state})
    // serial : JSON.stringify({public_key, payload, signature});
    // payload : JSON.stringify({txn paylod stuff});

    let entry = JSON.parse(db_entry);
    let serial = JSON.parse(entry.serial);
    let payload = JSON.parse(serial.payload);

    serial.payload = payload;
    entry.serial = serial;

    return entry;
  };

  /**
   * Finds the data transaction of the user with the given email
   * that has the given key.
   */
  const find_data_txn_with_key = function (email, id_key) {
    return new Promise(function (resolve, reject) {
      db.get_user_txn(email).then(function(txn_list) {
        // propagate an empty list if nothing is found or there was an erro
        if (txn_list == undefined || txn_list == null || txn_list.length == 0) {
          resolve([]);
          return;
        }

        // Loop through all txns in the good block
        for (let i = 0; i < txn_list.length; i++) {
          let db_entry = parse_db_txn_entry(txn_list[i]);
          let txn_payload = db_entry.serial.payload;

          if (txn_payload.type != 0) {
            continue;
          }

          // If the txn is not confirmed
          if (!(block_num in txn_list[i])) {
            continue;
          }

          // if the type == 0, then it must have its key and value stored
          if (db_entry.key == id_key) {
            resolve(db_entry);
            return;
          }
        }

        resolve([]);
      });
    });
  };

  const create_data_txn_from_obj = function (txn_data) {
    let str_pub_key = txn_data.pub_key;
    let str_prv_key = txn_data.prv_key;

    if (txn_data["pub_key_pkcs8"]) {
      str_pub_key = txn_data["pub_key_pkcs8"];
      str_prv_key = txn_data["prv_key_pkcs8"];
    }
    else {
      let prv_key = new rsa();
      prv_key.importKey(str_prv_key, 'pkcs1-private');

      let pub_key = new rsa();
      pub_key.importKey(str_pub_key, 'pkcs8-public');

      str_prv_key = prv_key.exportKey('pkcs8-private');
      str_pub_key = pub_key.exportKey('pkcs8-public');
    }

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

    const serialize_data_txn = stable_stringify(data_txn_obj);

    return {
      r: txn_data.r,
      a: txn_data.a,
      r_i: txn_data.r_i,
      serialize_data_txn,
      pub_key: str_pub_key,
      prv_key: str_prv_key,
      signature : data_txn_obj.signature
    };
  }

  return {
    create_data_txn_from_obj,
    find_data_txn_with_key,
    parse_db_txn_entry,
  }
};
