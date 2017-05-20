const path = require('path');
module.exports = function (dependencies) {
	const app = dependencies['app'];
	const db = dependencies['db'];
	const request = dependencies['request'];
	const cheerio = dependencies['cheerio'];
	const mu2 = dependencies['mu2'];
	const sock = dependencies['sock'];
	const node_email = dependencies['email'];
	const zmq = dependencies['zmq'];
	const util = dependencies['util'];
	const connect_node = dependencies['connect_node'];

	app.get('/', function (req, res) {
		res.sendFile(path.join(__dirname + '/index.html'));
	})

	// Send the verification email to the received address
	app.post('/add-me', function (req, res) {
		let email = req.body.email;
		console.log('Received Email :: ', email);
		db.save_email_validation_token(email).then(function (result) {
			if (result == false) {
				res.setHeader('Content-Type', 'application/json');
				res.send(JSON.stringify(result));
			} else {
				// Send an email
				node_email.send_email(
					'jaebumlee94@gmail.com',
					email,
					'Thank you for registering Chainge',
					'',
					`<p>Thank you for registering Chainge</p>
        <p>Your activation link is <a href="http://localhost:3333/verify/` + result +
					`">Here</a></p>`
				);
				res.setHeader('Content-Type', 'application/json');
				res.send(JSON.stringify(result));
			}
		})
	});

	app.get('/verify/:token', function (req, res) {
		let token = req.params.token;
		db.get_token(token, function (err, email) {
			if (err || !email) {
				res.sendFile(path.join(__dirname + '/page_not_found.html'));
			} else {
				// Now fetch the real name
				request.post({
						url: 'https://stanfordwho.stanford.edu/SWApp/Search.do',
						form: {
							search: email
						}
					},
					function (err, response) {
						const profile = cheerio.load(response.body);
						let name = profile("#PublicProfile").find("h2").text().trim();

						let html_stream = mu2.compileAndRender('verify.mustache', {
							name
						});
						html_stream.pipe(res);
					});
			}
		});
	});

	app.post('/verify/:token', function (req, res) {
		let token = req.params.token;
		let answer = req.body.answer;
		let name = req.body.name;
		db.get_token(token, function (err, email) {
			if (answer == "Yes") {
				data = {
					K: 20,
					identity: name,
					rsa_key_size: 2048,
					dh_key_size: 1024,
					token: token,
          type : 0
				};

				console.log("set :: ", token);

				// Add a callback to execute when the specific response from
				// TXN generator comes back
				zmq.add_callback_for_token(token, function (data) {
					data_txn = util.create_data_txn_from_obj(data);
					node_email.send_email(
						"jaebumlee94@gmail.com",
            email,
						"Your Data Record is successfully created!",
						"",
						`<p>Your Secret infos are as follows</p>
      			 <ul>
        		 <li>a :: ` + data_txn.a + `</li>
        		 <li>r :: ` + data_txn.r + `</li>
       			 <li>r_i :: ` + data_txn.r_i + `</li>
      			 </ul>`
					);

					res.send(JSON.stringify(data_txn));

					// Send created data txn to the nodes
					connect_node.send_txn(data_txn.serialize_data_txn);
					console.log("Serialized :: ", data_txn.serialize_data_txn);

					// Save created user's data txn
					db.save_user_txn(email, data_txn.serialize_data_txn);
					zmq.remove_token_callback (token);
				});

				console.log("Sock sent!");
				zmq.send_data(JSON.stringify(data));
			}
		});
	});

	return {
		app
	}
}