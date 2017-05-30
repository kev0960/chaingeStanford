const redis = require('redis').createClient();

module.exports = function (dependencies) {
  const uuid = dependencies['uuid'];
  const bcrypt = dependencies['bcrypt'];
  const config = dependencies['config'];

  redis.on('ready', function () {
    console.log("Redis is now connected!");
  });

  redis.on('error', function (err) {
    console.log('Redis is dead .. ' + err);
  })
  const USER_EMAIL = 'USER_EMAIL_';
  const USER_TXN = 'USER_TXN_LIST_';
  const USER_DATA = 'USER_DATA_';
  const VERIFY_LINK = 'TOKEN_';
  const PENDING_USER_TXN = 'PENDING_USER_TXN_LIST_';
  const TXN_TO_USER = 'TXN_TO_USER_';
  const PUBKEY_TO_USER = 'PUBKEY_TO_USER_'

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
    });
  }

  const save_txn_to_username = function (sig, email) {
    // Save emails using txn signature as a key.
    redis.set(TXN_TO_USER + sig, email);
  };

  // User txn is classified by the user's email
  const save_pending_user_txn = function (email, txn) {
    redis.lpush(PENDING_USER_TXN + email, txn, function (err, reply) {
      if (err) {
        console.log("something is seriously wrong with ", err);
      }
    });
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
        resolve(list);
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
   * @returns {Promise}
   * @param {String} email
   */
  const get_pending_user_txn = function (email) {
    return new Promise(function (resolve, reject) {
      redis.lrange(PENDING_USER_TXN + email, 0, -1, function (err, list) {
        resolve(list);
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
    save_pending_user_txn,
    get_pending_user_txn,
    save_txn_to_username,
    get_username_from_txn,
    get_username_from_pubkey,
    save_pubkey_to_user_name,
    change_user_txn_at
  }
}