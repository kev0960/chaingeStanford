module.exports = function(dependencies) {
    const db = dependencies['db'];
    const zmq = dependencies['zmq'];
    const connect_node = dependencies['connect_node'];

    const data_txn_wrapper = function(email, id_key, id_val, use_proxy) {
        return new Promise(function(resolve, reject) {
        
        });
    }

    const req_txn_wrapper = function(email, target_email, id_key, id_val) {

    }

    const ans_txn_wrapper = function(email) {

    }

    return {
        data_txn_wrapper,
        req_txn_wrapper,
        ans_txn_wrapper,
    };
}