// Register UI javascript functionality here

console.log("including main.js");

let txn_types = ['data_txn', 'req_txn', 'ans_txn'];
let modal_ids= ['#addModal', '#verifyModal', '#answerModal', '#txnsModal'];

/* Register Ajax calls per txn creation form ... */
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

	               // reload the page afterwards so that the dashboard is refreshed
	               //location.reload();
	           }
	         });

	    toggle_progress(txn_type)
	});

}

/* Register modal related callbacks */
for (let i = 0; i < modal_ids.length; i++) {
	let modal_id = modal_ids[i];

	$(modal_id).on('hidden.bs.modal', function () {
    	location.reload();
	})
}

/* For coloring data txns in dashboard */
var sig_texts = $('#sig');
for (let i = 0; i < sig_texts.length; i++) {
	let sig = sig_texts[i].value;
	let block_num = $('#block_for_'+sig)[0].value;
	let panel = $('#panel_heading_'+sig)[0];

	if (block_num == 'Pending') {
		panel.addClass('pending');
	} 
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