const hashmap = require('hashmap');

module.exports = function (dependencies) {
  const sock = dependencies['sock'];
  const waiting_txn = new hashmap();

  const add_callback_for_token = function (token, cb) {
    waiting_txn.set(token, cb);
  }

  const remove_token_callback = function (token, cb) {
    waiting_txn.remove(token);
  }

  // Initiate inter-process communication.
  sock.connect('tcp://localhost:5555');
  sock.on('message', function (reply) {
    rep = reply.toString();

    // Remove NULL terminating character
    rep = rep.replace(/\0/g, '');

    data = JSON.parse(rep);
    token = data['token'];

    // Execute associated callback function
    waiting_txn.get(token)(data);
  });

  const send_data = function (data) {
    sock.send(data);
  }
  return {
    remove_token_callback,
    add_callback_for_token,
    send_data
  }
}
