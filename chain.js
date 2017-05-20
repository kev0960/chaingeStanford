// Manages the current list of blocks
module.exports = function (dependencies) {
  // Current height of the GOOD block
  let good_block_height = -1;

  // When it receives the GOOD block from the node,
  // it checks whether it includes the transactions
  // that belongs to one of its users.
  const receive_good_block = function (block) {
    let header = 
  }
}