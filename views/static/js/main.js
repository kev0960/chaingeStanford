// Register UI javascript functionality here

console.log("including main.js");

let txn_types = ['data_txn', 'req_txn', 'ans_txn'];

for (let i = 0; i <  txn_types.length; i++) {
	let txn_type = txn_types[i];
	let form_id = '#'+txn_type+"_form";

	$(form_id).submit(function(e) {
		e.preventDefault(); // avoid to execute the actual submit of the form.
		console.log('data_txn_form clicked');

	    var url = "/new_txn"; // the script where you handle the form input.

	    $.ajax({
	           type: "POST",
	           url: url,
	           data: $(form_id).serialize(), // serializes the form's elements.
	           success: function(data)
	           {
	               alert(data); 
	               toggle_progress(txn_type);
	           }
	         });

	    toggle_progress(txn_type)
	});

}

const toggle_progress = function(txn_type) {
	let modal_id = '#'+txn_type;
	let progress_id = '#'+txn_type+'_progress';

	if ($(modal_id).hasClass('hidden')) {
		$(modal_id).removeClass('hidden');
		$(progress_id).addClass('hidden');
	} else {
		$(modal_id).addClass('hidden');
		$(progress_id).removeClass('hidden');
	}
}

const show_result = function(txn_type, result) {
	let div_id = '#'+txn_type+"_result";
	$(div_id).text(result);
}