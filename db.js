const redis = require('redis').createClient();

module.exports = function (dependencies) {
  const uuid = dependencies['uuid'];

  redis.on('ready', function () {
    console.log("Redis is now connected!");
  });

  redis.on('error', function () {
    console.log('Redis is dead .. ' + err);
  })
  const USER_EMAIL = 'USER_EMAIL_';
  const USER_TXN = 'USER_TXN_LIST_';
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

  const get_token = function (token, cb) {
    redis.get(VERIFY_LINK + token, cb);
  }

  // User txn is classified by the user's email
  const save_user_txn = function (email, txn) {
    redis.lpush(email, txn, function (err, reply) {
      if (err) {
        console.log("something is seriously wrong with ", err);
      }
    });
  };

  /**
   * @returns {Promise}
   * @param {String} email
   */
  const get_user_txn = function (email) {
    return new Promise(function (resolve, reject) {
      redis.lrange(email, 0, -1, function (err, list) {
        resolve(list);
      });
    });
  };

  return {
    save_email_validation_token,
    get_token,
    save_user_txn,
    get_user_txn
  }
}