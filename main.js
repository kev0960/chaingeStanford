const express = require('express');
const zmq = require('zeromq');
sock = zmq.socket('req');
const app = express();

const port = process.env.PORT || 3000;
app.listen(port, function() {
  console.log('Server is listening on port ', port);
  /*
  sock.bindSync('tcp://127.0.0.1:5555');

  setInterval(function() {
    console.log('sending work');
    sock.send('some work');
  }, 500);
  */
});
