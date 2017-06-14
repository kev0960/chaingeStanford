const redis = require('redis').createClient();
var INITIALIZED = false;
var DEV = true;


module.exports = function (dependencies) {
  const uuid = dependencies['uuid'];
  const bcrypt = dependencies['bcrypt'];
  const config = dependencies['config'];
  const zmq = dependencies['zmq'];
  const util = dependencies['util'];
  const connect_node = dependencies['connect_node'];

  redis.on('ready', function () {
    console.log("Redis is now connected!");
    if (!INITIALIZED && DEV) {
      console.log("Creating default user for testing...");

      let email = "swjang@stanford.edu";
      save_email_validation_token(email).then(function(token) {
        let name = "Se Won Jang";
        let pw = "123";

        token = "1234";

        let data = {
          K : 20,
          identity : util.create_sha256_hash(name),
          rsa_key_size: 2048,
          dh_key_size: 1024,
          token : token,
          type : 0,
          with_key:1,
        };

        zmq.add_callback_for_token(token, function(data) {
          let data_txn = util.create_data_txn_from_obj(data);

          save_user_txn(email, JSON.stringify({
            "serial": data_txn.serialize_data_txn,
            "sig" : data_txn.signature,
            "state" : "Pending",
            "secret" : {
              r_i : data_txn.r_i,
              r : data_txn.r,
              a : data_txn.a
            },
            "key" : "name",
            "value" : name,
            "type" : 0,
          }));

          save_user_password(email, pw);
          save_txn_to_username(data_txn.signature, email);
          save_pubkey_to_user_name(data_txn.pub_key, email);
          save_keys(email, data_txn.pub_key, data_txn.prv_key);
          zmq.remove_token_callback(token);
          connect_node.send_txn(data_txn.serialize_data_txn);
          console.log("Default user inserted into the db");

          INITIALIZED = true;
        });
        console.log(JSON.stringify(data));
        zmq.send_data(JSON.stringify(data))

      });
    }
  });

  redis.on('error', function (err) {
    console.log('Redis is dead .. ' + err);
  });


  /*
   * ONBOARD SERVER DB STRUCTURE (VERSION 1)
   *
   * get_user_txn
   *    Return the list of the transactions that USER has created
   *
   * get_username_from_txn
   *    Get the name of the user who created the transaction (by sig)
   *
   * get_req_txns_for_user
   *    Get the list of req txns that REQUESTS TO USER
   *
   * get_ans_txns_for_user
   *    Get the list of ans txns that ANSWERS TO USER's REQUEST
   *
   * */
  const USER_EMAIL = 'USER_EMAIL_';
  const USER_TXN = 'USER_TXN_LIST_';
  const USER_DATA = 'USER_DATA_';
  const VERIFY_LINK = 'TOKEN_';
  const PENDING_USER_TXN = 'PENDING_USER_TXN_LIST_';
  const TXN_TO_USER = 'TXN_TO_USER_';
  const PUBKEY_TO_USER = 'PUBKEY_TO_USER_';
  const KEYS_PREFIX = "KEYS_FOR_USER_";
  const REQ_TXN_FOR_USER = 'REQ_TXN_FOR_USER_'; // user email to req txn
  const REQ_TXN_TO_ANS_TXN = "REQ_TXN_TO_ANS_TXN_"; // use for txn_sig to txn storage
  const ANS_TXN_TO_REQ_TXN = "ANS_TXN_TO_REQ_TXN_";
  const LINK_GEN_INFO_PREFIX = 'LINK_GEN_INFO_';
  const LINK_GEN_TEMP_REQ_TXN_PREFIX = 'LINK_GEN_REQ_';
  const LINK_GEN_STAT_PREFIX = 'LINK_GEN_STAT_';

  const save_email_validation_token = function (email) {
    let p1 = new Promise(function (resolve, reject) {
      redis.get(USER_EMAIL + email, function (err, data) {
        console.log("Got :: ", err, data);
        // Token is saved in a following format
        // USER_EMAIL_<user email> ==> (Time it is saved):(uuid token)
        if (data) {
          let date = data.substring(0, data.indexOf(':'));
          let token = data.substring(data.indexOf(':') + 1);

          // If registered token is old, then we issue a new token
          // (old here means 7 days ago)
          if (parseInt(date) < Date.now() - 1000 * 7 * 24 * 60 * 60) {
            const new_token = uuid();

            // Remove previous token
            redis.del(VERIFY_LINK + token);

            // Replace with the new one
            redis.set(VERIFY_LINK + new_token, email);
            redis.set(USER_EMAIL + email, Date.now().toString() + ':' + new_token,
              function (err, data) {
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

  const get_token = function (token, cb) {
    redis.get(VERIFY_LINK + token, cb);
  }

  // User txn is classified by the user's email
  const save_user_txn = function (email, txn) {
    redis.lpush(USER_TXN + email, txn, function (err, reply) {
      if (err) {
        console.log("something is seriously wrong with ", err);
      }
    });
  };

  const change_user_txn_at = function (email, txn, at) {
    redis.lset(USER_TXN + email, at, txn, function (err) {
      if (err) console.log("Error :: ", err);
    }); }

  const save_txn_to_username = function (sig, email) {
    // Save emails using txn signature as a key.
    redis.set(TXN_TO_USER + sig, email);
  };

  // Save public key - username pair
  const save_pubkey_to_user_name = function (public_key, user_name) {
    redis.set(PUBKEY_TO_USER + public_key, user_name);
  }

  const save_user_password = function (email, password) {
    // Save hashed password to the db.
    bcrypt.hash(password, config.auth.salt_rounds, function (err, hash) {
      redis.set(USER_DATA + email, hash, function (err, reply) {
        if (err) {
          console.log('something is wrong with ', err);
        }
      });
    });
  }

  const check_user_password = function (email, password) {
    return new Promise(function (resolve, reject) {
      redis.get(USER_DATA + email, function (err, hashed_password) {
        if (err || !hashed_password) {
          resolve(false);
          return;
        }

        bcrypt.compare(password, hashed_password, function (err, res) {
          if (err) reject(err);
          resolve(res);
        });
      });
    });
  };

  /**
   * @returns {Promise}
   * @param {String} email
   * Note that returned list of strings are stringified version of
   * {serial, sig, state}
   */
  const get_user_txn = function (email) {
    return new Promise(function (resolve, reject) {
      redis.lrange(USER_TXN + email, 0, -1, function (err, list) {
        if (err) {
          resolve(undefined);
        } else {
          resolve(list);
        }
      });
    });
  };

  const get_username_from_txn = function (sig) {
    return new Promise(function (resolve, reject) {
      redis.get(TXN_TO_USER + sig, function (err, username) {
        resolve(username);
      });
    });
  };

  const get_username_from_pubkey = function (public_key) {
    return new Promise(function (resolve, reject) {
      redis.get(PUBKEY_TO_USER + public_key, function (err, username) {
        resolve (username);
      })
    });
  }

  /**
    @param {Array} keys - list of length 2 of pub, prv key in order
   **/
  const save_keys = function (email, pub, prv) {
    return new Promise(function (resolve, reject) {
      console.log("Rpush :: ", email, pub, prv);
      redis.rpush([KEYS_PREFIX + email, pub, prv], function(err, reply) {
        if (err) {
          console.log(err);
          resolve(false);
        } else {
          if (reply != 2) {
            resolve(false);
          }

          resolve(true)
        }
      });
    });
  }

  const get_keys = function (email) {
    return new Promise(function (resolve, reject) {
      redis.lrange(KEYS_PREFIX + email, 0, -1, function (err, reply) {
        if (err) {
          resolve(null);
        }

        resolve(reply)
      });
    });
  }

  const change_req_txn_at = function(email, txn, at) {
    redis.lset(REQ_TXN_FOR_USER + email, at, txn, function (err) {
    if (err) console.log("Error :: ", err);
    });
  };

  const save_req_txn_for_user = function(email, txn) {
    // txn must be a req txn json object
    if (txn.type != 1) {
      console.log("trying to save a different txn as a req txn");
    }

    txn = JSON.stringify(txn);

    redis.lpush(REQ_TXN_FOR_USER + email, txn, function (err, reply) {
      if (err) {
        console.log("something is seriously wrong with ", err);
      }
    });
  };

  const get_req_txns_for_user = function(email) {
    return new Promise(function (resolve, reject) {
      redis.lrange(REQ_TXN_FOR_USER + email, 0, -1, function (err, list) {
        if (err) {
          resolve(undefined);
        } else {
          resolve(list);
        }
      });
    });
  };

  const save_ans_txn_for_req_txn = function(req_txn_sig, ans_txn) {
    redis.set(REQ_TXN_TO_ANS_TXN + req_txn_sig, JSON.stringify(ans_txn_sig));
  };

  const save_req_txn_for_ans_txn = function(ans_txn_sig, req_txn_sig) {
    redis.set(ANS_TXN_TO_REQ_TXN + ans_txn_sig, JSON.stringify(req_txn_sig));
  };

  const get_ans_txn_for_req_txn = function(req_txn_sig) {
    return new Promise(function (resolve, reject) {
      redis.get(REQ_TXN_TO_ANS_TXN + req_txn_sig, function (err, ans_txn_sig) {
        if (err || !ans_txn_sig) {
          resolve(null);
          return;
        }

        resolve(JSON.parse(ans_txn_sig));
      })
    });
  };

  const get_req_txn_for_ans_txn = function(ans_txn_sig) {
    return new Promise(function (resolve, reject) {
      redis.get(ANS_TXN_TO_REQ_TXN + ans_txn_sig, function (err, req_txn_sig) {
        if (err || !req_txn_sig) {
          resolve(null);
          return;
        }

        resolve(JSON.parse(req_txn_sig));
      })
    });

  }

  /**
   * Finds the data transaction of the user with the given email
   * that has the given key.
   */
  const find_data_txn_with_key = function (email, id_key) {
    return new Promise(function (resolve, reject) {
      get_user_txn(email).then(function(txn_list) {
        // propagate an empty list if nothing is found or there was an erro
        if (txn_list == undefined || txn_list == null || txn_list.length == 0) {
          resolve([]);
          return;
        }

        // Loop through all txns in the good block
        for (let i = 0; i < txn_list.length; i++) {
          let db_entry = util.parse_db_txn_entry(txn_list[i]);
          let txn_payload = db_entry.serial.payload;

          if (txn_payload.type != 0) {
            continue;
          }

          // If the txn is not confirmed
          if (!db_entry.hasOwnProperty('block_num')) {
            continue;
          }

          console.log("db entry : ", db_entry.key, " vs ", id_key);
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

  const save_pending_req_txn_for_link_generator = function(email, id_key, id_val, txn_sig){
      let p1 = new Promise(function(resolve, reject){
          redis.hset(LINK_GEN_TEMP_REQ_TXN_PREFIX + txn_sig, id_key, id_val, function(err, reply){
              resolve(reply);
          });
      });

      let p2 = new Promise(function(resolve, reject){
          redis.hset(LINK_GEN_TEMP_REQ_TXN_PREFIX + txn_sig, 'email', email, function(err, reply){
              resolve(reply);
          });
      });

      return Promise.all([p1, p2]);
  };

  const get_pending_req_txn_for_link_generator = function(txn_sig){
      return new Promise(function(resolve, reject){
          redis.hgetall(LINK_GEN_TEMP_REQ_TXN_PREFIX + txn_sig, function(err, reply){
              resolve(reply);
          });
      });
  };

  const save_user_data_for_link_generator = function(email, id_key, id_val) {
      return new Promise(function(resolve, reject){
          redis.hset(LINK_GEN_INFO_PREFIX + email, id_key, id_val, function(err, reply){
              resolve(reply);
          });
      });
  };

  const get_user_data_for_link_generator = function(email){
      return new Promise(function(resolve, reject){
          redis.hgetall(LINK_GEN_INFO_PREFIX + email, function(err,reply){
              resolve(reply);
          });
      });
  };

  const link_created_for_user = function(email) {
      return new Promise(function(resolve, reject){
          redis.hget(LINK_GEN_STAT_PREFIX + email, 'link_generated', function(err, reply){
              var count = reply;
              if (count === null){
                  count = 1;
              } else {
                  count++;
              }
              redis.hset(LINK_GEN_STAT_PREFIX, 'link_generated', count, function(err, reply){
                  resolve(reply);
              });
          });
      });
  };

  const link_viewed = function(email) {
      return new Promise(function(resolve, reject){
          redis.hget(LINK_GEN_STAT_PREFIX + email, 'link_viewed', function(err, reply){
              var count = reply;
              if (count === null){
                  count = 1;
              } else {
                  count++;
              }
              redis.hset(LINK_GEN_STAT_PREFIX + email, 'link_viewed', count, function(err, reply){
                  resolve(reply);
              });
          });
      });
  };

  return {
    save_email_validation_token,
    get_token,
    save_user_txn,
    get_user_txn,
    save_user_password,
    check_user_password,
    save_txn_to_username,
    get_username_from_txn,
    get_username_from_pubkey,
    save_pubkey_to_user_name,
    change_user_txn_at,
    save_keys,
    get_keys,
    save_req_txn_for_user,
    get_req_txns_for_user,
    save_ans_txn_for_req_txn,
    save_req_txn_for_ans_txn,
    get_ans_txn_for_req_txn,
    get_req_txn_for_ans_txn,
    find_data_txn_with_key,
    save_user_data_for_link_generator,
    get_user_data_for_link_generator,
    link_created_for_user,
    link_viewed,
    save_pending_req_txn_for_link_generator,
    get_pending_req_txn_for_link_generator,
    change_req_txn_at,
  }
}
