const path = require('path');
module.exports = function (dependencies) {
	const app = dependencies['app'];
	const db = dependencies['db'];
	const request = dependencies['request'];
	const cheerio = dependencies['cheerio'];
	const mu2 = dependencies['mu2'];
	const node_email = dependencies['email'];
	const zmq = dependencies['zmq'];
	const util = dependencies['util'];
	const connect_node = dependencies['connect_node'];
	const auth = dependencies['auth'];
	const chain = dependencies['chain'];
    const txn_handler = dependencies['txn_handler'];

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
		let password = req.body.password;

		db.get_token(token, function (err, email) {
			if (answer == "Yes") {
				let data = {
					K: 20,
					identity: name,
					rsa_key_size: 2048,
					dh_key_size: 1024,
					token: token,
					type: 0
				};

				console.log("set :: ", token);

				// Add a callback to execute when the specific response from
				// TXN generator comes back
				zmq.add_callback_for_token(token, function (data) {
					let data_txn = util.create_data_txn_from_obj(data);
					console.log(data)

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
						 <li>key pairs :: ` + JSON.stringify({pb : data.pub_key, pv : data.prv_key}) + `</li>
      			 </ul>`
					);

					res.send(JSON.stringify(data_txn));

					// Send created data txn to the nodes
					connect_node.send_txn(data_txn.serialize_data_txn);
					console.log("Serialized :: ", data_txn.serialize_data_txn);

					// Save created user's data txn
					db.save_user_txn(email, JSON.stringify({
						"serial": data_txn.serialize_data_txn,
						"sig": data_txn.signature,
						"state": "Pending"
					}));
					db.save_user_password(email, password);
					db.save_txn_to_username(data_txn.signature, email);
					db.save_pubkey_to_user_name(data.pub_key, email);
                    db.save_keys(email, data.pub_key, data.prv_key);
					zmq.remove_token_callback(token);
				});

				console.log("Sock sent!");
				zmq.send_data(JSON.stringify(data));
			}
		});
	});

	app.get('/login', auth.already_logged_in(), function (req, res) {
		res.sendFile(path.join(__dirname + '/views/login.html'));
	});

	app.get('/loginFailed', auth.already_logged_in(), function (req, res) {
		res.sendFile(path.join(__dirname + '/views/loginFailed.html'));
	});

	app.post('/login', auth.login('/loginFailed'),
		function (req, res) {
			res.redirect('/profile');
		}
	);

	app.post('/block/good-block', function (req, res) {
			// Received a good block
			// it must notify it to the chain
			console.log("POST REQUEST RECEIVED :: ", req.body.block);
			chain.receive_good_block(req.body.block);

			res.setHeader('Content-Type', 'application/json');
    	res.send(JSON.stringify({ result: "good" }));
		}
	);

    /**
     * Define POST request behavior on route /new_txn
     * It receives the POST params from the user, and cfeates / broadcasts the txn
     */
    app.post('/new_txn', auth.is_logged_in(), function (req, res) {
        let txn_type = parseInt(req.body.txn_type);
        let email = req.user;

        console.log(email);
        console.log(txn_type);

        switch(txn_type) {

            // Data TXN
            case 0:
                // Extract info 
                let data_key = req.body.key;
                let data_val = req.body.value;
                let use_proxy = req.body.proxy;

                // txn_handler takes care of all zmq / connect_node operations
                //txn_handler.data_txn_wrapper(email, data_key, data_val, use_proxy).then(function () {
                //    
                //});
                res.setHeader('Content-Type', 'application/json');
                res.send(JSON.stringify({ result: "good" }));
                break;

            // Req TXN
            case 1:
                break;

            // Ans TXN
            case 2:
                break;
        }
    });

	app.get('/profile', auth.is_logged_in(), function (req, res) {
		let username = req.user;

		db.get_user_txn(username).then(function (list) {
			let txn_list = [];
			for (let i = 0; i < list.length; i++) {
				txn_list.push(JSON.parse(list[i]));
			}

            let num_rows = Math.ceil(txn_list.length / 4.0);
			let rows = [];

            // Populate empty row objects
            for (let i = 0; i < num_rows; i++) {
                rows.push({
                    row_num : (i+1),
                    cols : [],
                });
            }

			for (let i = 0; i < txn_list.length; i++) {
                let row_idx = Math.floor(i / 4.0);
				rows[row_idx].cols.push({
					content: txn_list[i].serial,
					state: txn_list[i].state
				});
			}

            db.get_keys(username).then(function(keys) {
                let html_stream = mu2.compileAndRender('dashboard.mustache', {
                    "email":username,
                    "pub_key":keys[0],
                    "prv_key":keys[1],
				    "rows": rows,
			    });

			    html_stream.pipe(res);
            });

		});
	});

	return {
		app
	}
}