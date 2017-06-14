const request = require('request');
module.exports = function (dependencies) {
  let peer_list = [
    "http://10.30.33.68:3000"
  ]
  /**
   * Send the newly generated transaction to the nodes
   * @param {String} data; send serialized txn
   */
  const send_txn = function (data) {
    for (let i = 0; i < peer_list.length; i++) {
      request({
          method: 'post',
          body: {
            txn: data
          },
          json: true,
          url: peer_list[i] + '/txn/new-txn'
        },
        function (err, res, body) {
          if (err) {
            console.log("Error sending transaction :: ", err);
          }
          console.log("Resp :: ", body);
        }
      );
    }
  };

  const find_txn_at = function (block_num, txn_sig) {
    return new Promise(function(resolve, reject) {
      let resolved = false;
      let current = 0;
      let last_sent = Date.now();

      // Send a POST request to the peer_list sequentially
      // but waits 2 seconds in between. If the response is
      // received, stop sending request.

      let send_req = function () {
        if (resolved) return;

        setTimeout(send_req, 2000 - (Date.now() - last_sent));
        last_sent = Date.now();

        console.log("Asking :: ", peer_list[current]);
        request({
          url : peer_list[current] + '/chain/find_txn_at',
          qs : {
            block_num,
            txn_sig
          }
        }, function (err, res, body) {
          if (resolved) return;
          if (!err) {
            resolved = true;
            resolve (body.value);
            return ;
          }
        });
        current ++;
      }
    });
  }

  return {
    send_txn,
    find_txn_at
  }
}
