const nodemailer = require('nodemailer');

module.exports = function (dependencies) {
  const config = dependencies['config'];
console.log("config :: ", config);
  let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: config.nodemailer.email,
      pass: config.nodemailer.password
    }
  });

  const send_email = function (from, to, subject, text, html) {
    let message = {
      from,
      to,
      subject,
      text,
      html
    };

    transporter.sendMail(message, function (err, res) {
      if (err) {
        console.log("Failed :: ", err);
      } else {
        console.log("Success :: ", res);
      }
    });
  }

  return {
    send_email
  }

}
